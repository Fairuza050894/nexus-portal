import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { resolveHost, type AuthConfig, type AuthFormField } from '@nexus/core';
import { parseCookieString } from './index.js';

export interface BootstrapAuthOptions {
  targetUrl: string;
  auth?: AuthConfig;
  allowlist?: string[];
  artifactDir: string;
  env?: NodeJS.ProcessEnv;
  headless?: boolean;
  timeoutMs?: number;
  onLog?: (message: string) => void;
}

export interface BootstrapAuthResult {
  used: boolean;
  cookieHeader?: string;
  storageStatePath?: string;
  finalUrl?: string;
  cookies?: Array<{ name: string; value: string; domain?: string; path?: string }>;
  warnings?: string[];
  error?: string;
}

function delay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

interface VaultCredentials {
  username?: string;
  password?: string;
  token?: string;
  fields?: Record<string, string>;
  raw?: string;
}

function resolveVaultCreds(
  reference: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): VaultCredentials | undefined {
  if (!reference) return undefined;
  const envKey = reference.startsWith('vault:')
    ? `QA_VAULT_${reference
        .slice('vault:'.length)
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')}`
    : /^[A-Z][A-Z0-9_]{2,}$/.test(reference)
      ? reference
      : undefined;
  if (!envKey) return undefined;
  const raw = env[envKey];
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const username = typeof parsed.username === 'string' ? parsed.username : undefined;
      const password = typeof parsed.password === 'string' ? parsed.password : undefined;
      const token =
        typeof parsed.token === 'string'
          ? parsed.token
          : typeof parsed.authorization === 'string'
            ? parsed.authorization
            : undefined;
      const fields: Record<string, string> = {};
      if (parsed.fields && typeof parsed.fields === 'object') {
        for (const [k, v] of Object.entries(parsed.fields as Record<string, unknown>)) {
          if (typeof v === 'string') fields[k] = v;
        }
      }
      return { username, password, token, fields, raw };
    }
  } catch {
    // raw text
  }
  return { raw };
}

async function isLoginSuccessful(
  page: Page,
  context: BrowserContext,
  successUrlPattern?: string,
): Promise<boolean> {
  if (page.isClosed()) return false;
  try {
    const currentUrl = page.url();

    // 1. Success pattern regex / substring match
    if (successUrlPattern && new RegExp(successUrlPattern, 'i').test(currentUrl)) {
      return true;
    }

    const lowerUrl = currentUrl.toLowerCase();
    const isLoginPath =
      lowerUrl.includes('/login') ||
      lowerUrl.includes('/auth') ||
      lowerUrl.includes('/signin') ||
      lowerUrl.includes('/masuk');

    // 2. Session cookie check
    const cookies = await context.cookies().catch(() => []);
    const hasSessionCookie = cookies.some((c) =>
      /session|token|auth|jwt|laravel_session|connect\.sid|PHPSESSID|JSESSIONID|XSRF-TOKEN/i.test(
        c.name,
      ),
    );

    // 3. DOM indicators for dashboard / internal authenticated page
    const hasDashboardMarker = await page
      .evaluate(() => {
        const text = document.body ? document.body.innerText : '';
        const hasKeyword =
          /\b(dashboard|logout|keluar|sign out|profil|profile|selamat datang|welcome)\b/i.test(
            text,
          );
        const hasElement = Boolean(
          document.querySelector(
            '#app, .navbar, .main-content, header, nav, [data-testid="dashboard"]',
          ),
        );
        return hasKeyword || hasElement;
      })
      .catch(() => false);

    // Criteria 1: URL is not a login URL and has session cookie
    if (!isLoginPath && hasSessionCookie) {
      return true;
    }

    // Criteria 2 & 3: Dashboard marker present and session cookie or non-login URL
    if (hasDashboardMarker && (hasSessionCookie || !isLoginPath)) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export async function bootstrapAuthenticatedSession(
  options: BootstrapAuthOptions,
): Promise<BootstrapAuthResult> {
  const { targetUrl, auth, artifactDir } = options;
  if (!auth) {
    return { used: false };
  }

  const warnings: string[] = [];
  const host = resolveHost(targetUrl) || 'localhost';
  const storageStatePath = join(artifactDir, 'storage-state.json');

  // Case 1: Pure static cookies provided without interactive / form / ref
  const hasInteractive = Boolean(auth.interactive || auth.roles?.includes('guided-login'));
  const hasFormFields = Boolean(auth.formFields && auth.formFields.length > 0);
  const hasRef = Boolean(auth.ref);

  if (auth.cookies && !hasInteractive && !hasFormFields && !hasRef) {
    const parsedCookies = parseCookieString(auth.cookies, host);
    mkdirSync(artifactDir, { recursive: true });
    const storageState = {
      cookies: parsedCookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: -1,
        httpOnly: false,
        secure: false,
        sameSite: 'Lax' as const,
      })),
      origins: [],
    };
    writeFileSync(storageStatePath, JSON.stringify(storageState, null, 2), 'utf8');

    return {
      used: true,
      cookieHeader: auth.cookies.startsWith('Cookie:') ? auth.cookies : auth.cookies,
      storageStatePath,
      finalUrl: targetUrl,
      cookies: parsedCookies,
    };
  }

  // Credential validation: if auth.ref is specified but credentials missing/empty in process.env
  if (hasRef && !hasInteractive) {
    const creds = resolveVaultCreds(auth.ref, options.env);
    const username = creds?.username?.trim();
    const password = creds?.password?.trim();

    if (!username && !password && !creds?.token) {
      const errMsg =
        '[AUTH] Kredensial vault tidak ditemukan di process.env. Periksa file .env Anda.';
      options.onLog?.(errMsg);
      warnings.push(errMsg);

      // Automatically fallback to interactive mode to prevent browser crash
      const fallbackResult = await bootstrapAuthenticatedSession({
        ...options,
        auth: { ...auth, interactive: true },
      });
      return {
        ...fallbackResult,
        warnings: [...warnings, ...(fallbackResult.warnings ?? [])],
      };
    }
  }

  // Case 2: Interactive Guided Login
  if (hasInteractive) {
    options.onLog?.('Guided Login: Launching Chromium browser (headless: false)...');
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;

    try {
      browser = await chromium.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
      });
      context = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await context.newPage();

      let isClosed = false;
      page.on('close', () => {
        isClosed = true;
      });
      browser.on('disconnected', () => {
        isClosed = true;
      });

      const loginTarget = auth.loginUrl
        ? auth.loginUrl.startsWith('http')
          ? auth.loginUrl
          : new URL(auth.loginUrl, targetUrl).href
        : targetUrl;

      await page.goto(loginTarget, { timeout: options.timeoutMs ?? 60_000 }).catch((err) => {
        options.onLog?.(`Interactive login goto alert: ${(err as Error).message}`);
      });

      // Inject notification banner
      await page
        .evaluate(() => {
          if (document.getElementById('__nexus_login_banner__')) return;
          const banner = document.createElement('div');
          banner.id = '__nexus_login_banner__';
          banner.innerHTML =
            '<div style="position:fixed;top:0;left:0;right:0;background:#0f172a;color:#f8fafc;padding:10px 16px;z-index:99999999;font-family:sans-serif;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,0.5);display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #3b82f6;">' +
            '<span><strong>Nexus QA Guided Login:</strong> Silakan login dengan akun Anda. Begitu selesai, pengujian otomatis akan langsung berjalan.</span>' +
            '<button id="__nexus_resume_btn__" style="background:#2563eb;color:#fff;border:none;padding:6px 16px;border-radius:4px;cursor:pointer;font-weight:700;font-size:12px;">Selesai Login</button>' +
            '</div>';
          document.body.prepend(banner);
          document.getElementById('__nexus_resume_btn__')?.addEventListener('click', () => {
            window.sessionStorage.setItem('__nexus_resumed__', 'true');
          });
        })
        .catch(() => undefined);

      // Wait for user to complete login (max 120s)
      const maxWaitMs = options.timeoutMs ?? 120_000;
      const startTime = Date.now();
      let loggedIn = false;

      while (Date.now() - startTime < maxWaitMs) {
        if (isClosed || page.isClosed()) break;

        const buttonClicked = await page
          .evaluate(() => window.sessionStorage.getItem('__nexus_resumed__') === 'true')
          .catch(() => false);

        if (buttonClicked) {
          loggedIn = true;
          break;
        }

        loggedIn = await isLoginSuccessful(page, context, auth.successUrlPattern);
        if (loggedIn) {
          break;
        }

        await delay(1000);
      }

      if (!loggedIn && !isClosed) {
        warnings.push('Guided login timed out after 120s; proceeding with captured session');
      }

      const cookies = await context.cookies().catch(() => []);
      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
      mkdirSync(artifactDir, { recursive: true });
      await context.storageState({ path: storageStatePath }).catch(() => undefined);
      const finalUrl = isClosed ? targetUrl : page.url();

      await context.close().catch(() => undefined);
      await browser.close().catch(() => undefined);

      return {
        used: cookies.length > 0,
        cookieHeader: cookieHeader.length > 0 ? cookieHeader : undefined,
        storageStatePath,
        finalUrl,
        cookies,
        warnings,
      };
    } catch (err) {
      void context?.close().catch(() => undefined);
      void browser?.close().catch(() => undefined);
      return {
        used: false,
        error: `Interactive login failed: ${(err as Error).message}`,
        warnings,
      };
    }
  }

  // Case 3: Automated Form Login via auth.ref and/or auth.formFields
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  try {
    const creds = resolveVaultCreds(auth.ref, options.env);
    const username = creds?.username?.trim();
    const password = creds?.password?.trim();
    const vaultFields = creds?.fields ?? {};

    const isHeadless = options.headless ?? true;
    browser = await chromium.launch({
      headless: isHeadless,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
    });
    context = await browser.newContext({ ignoreHTTPSErrors: true });

    // Pre-seed cookies if provided
    if (auth.cookies) {
      const initialCookies = parseCookieString(auth.cookies, host);
      if (initialCookies.length > 0) {
        await context.addCookies(initialCookies);
      }
    }

    const page = await context.newPage();
    let isClosed = false;
    page.on('close', () => {
      isClosed = true;
    });
    browser.on('disconnected', () => {
      isClosed = true;
    });

    let loginTarget = targetUrl;
    if (auth.loginUrl) {
      loginTarget = auth.loginUrl.startsWith('http')
        ? auth.loginUrl
        : new URL(auth.loginUrl, targetUrl).href;
    }

    options.onLog?.(`Automated Form Login: Navigating to ${loginTarget}...`);
    await page.goto(loginTarget, {
      timeout: options.timeoutMs ?? 60_000,
      waitUntil: 'domcontentloaded',
    });

    // a. Fill username
    if (username) {
      const usernameSelectors = auth.usernameSelector
        ? [auth.usernameSelector]
        : [
            'input[name*="user" i]',
            'input[name*="email" i]',
            'input[name*="login" i]',
            'input[type="email"]',
            'input[type="text"]:first-of-type',
          ];
      let filled = false;
      for (const sel of usernameSelectors) {
        try {
          const loc = page.locator(sel).first();
          if ((await loc.count()) > 0 && (await loc.isVisible())) {
            await loc.fill(username);
            filled = true;
            break;
          }
        } catch {
          // try next
        }
      }
      if (!filled) {
        warnings.push(`Could not locate username input field on ${loginTarget}`);
      }
    }

    // b. Fill password
    if (password) {
      const passwordSelectors = auth.passwordSelector
        ? [auth.passwordSelector]
        : ['input[name*="password" i]', 'input[name*="passwd" i]', 'input[type="password"]'];
      let filled = false;
      for (const sel of passwordSelectors) {
        try {
          const loc = page.locator(sel).first();
          if ((await loc.count()) > 0 && (await loc.isVisible())) {
            await loc.fill(password);
            filled = true;
            break;
          }
        } catch {
          // try next
        }
      }
      if (!filled) {
        warnings.push(`Could not locate password input field on ${loginTarget}`);
      }
    }

    // c. Extra form fields
    const fieldsToProcess: AuthFormField[] = [...(auth.formFields ?? [])];
    for (const [k, v] of Object.entries(vaultFields)) {
      if (!fieldsToProcess.some((f) => f.target === k)) {
        fieldsToProcess.push({ target: k, action: 'fill', value: v });
      }
    }

    for (const field of fieldsToProcess) {
      const { target, action, value } = field;
      try {
        if (action === 'select') {
          const selectSelectors = [
            target,
            `select[name="${target}"]`,
            `select[id="${target}"]`,
            `select[name*="${target}" i]`,
            `select[id*="${target}" i]`,
            'select',
          ];
          let handled = false;
          for (const sel of selectSelectors) {
            const selLocator = page.locator(sel).first();
            if ((await selLocator.count()) > 0 && (await selLocator.isVisible())) {
              try {
                await selLocator.selectOption({ label: value });
                handled = true;
                break;
              } catch {
                try {
                  await selLocator.selectOption(value);
                  handled = true;
                  break;
                } catch {
                  const optLocs = await selLocator.locator('option').all();
                  for (const o of optLocs) {
                    const optText = ((await o.textContent()) || '').trim().toLowerCase();
                    const optVal = (await o.getAttribute('value')) || '';
                    const valLower = value.toLowerCase();
                    if (
                      optText === valLower ||
                      optVal.toLowerCase() === valLower ||
                      optText.includes(valLower) ||
                      (valLower === 'internal' &&
                        (optVal === 'IN' || optText.includes('pancaran'))) ||
                      (valLower === 'eksternal' &&
                        (optVal === 'EX' || optText.includes('external')))
                    ) {
                      await selLocator.selectOption(optVal);
                      handled = true;
                      break;
                    }
                  }
                  if (handled) break;
                }
              }
            }
          }

          // Custom dropdown UI fallback
          if (!handled) {
            const trigger = page.locator(target).first();
            if ((await trigger.count()) > 0 && (await trigger.isVisible())) {
              await trigger.click();
              await page.waitForTimeout(300);
              const opt = page.getByRole('option', { name: value }).first();
              if ((await opt.count()) > 0) {
                await opt.click();
                handled = true;
              } else {
                const textOpt = page.locator('li, div, span').filter({ hasText: value }).first();
                if ((await textOpt.count()) > 0) {
                  await textOpt.click();
                  handled = true;
                }
              }
            }
          }

          if (!handled) {
            warnings.push(`Could not select option "${value}" on target ${target}`);
          }
        } else if (action === 'fill') {
          const fillSelectors = [
            target,
            `input[name="${target}"]`,
            `input[id="${target}"]`,
            `textarea[name="${target}"]`,
          ];
          let filled = false;
          for (const sel of fillSelectors) {
            const loc = page.locator(sel).first();
            if ((await loc.count()) > 0 && (await loc.isVisible())) {
              await loc.fill(value);
              filled = true;
              break;
            }
          }
          if (!filled) {
            warnings.push(`Could not fill field ${target}`);
          }
        } else if (action === 'click') {
          const loc = page.locator(target).first();
          if ((await loc.count()) > 0 && (await loc.isVisible())) {
            await loc.click();
          }
        } else if (action === 'check') {
          const loc = page.locator(target).first();
          if ((await loc.count()) > 0 && (await loc.isVisible())) {
            if (value === 'false') await loc.uncheck();
            else await loc.check();
          }
        }
      } catch (err) {
        warnings.push(`Failed action "${action}" on "${target}": ${(err as Error).message}`);
      }
    }

    // d. Click submit button
    const submitSelectors = auth.submitSelector
      ? [auth.submitSelector]
      : [
          'button[type="submit"]',
          'input[type="submit"]',
          'button:has-text("Login")',
          'button:has-text("Masuk")',
          'button:has-text("Sign in")',
          'button:has-text("Log in")',
          'button.btn-primary',
        ];

    for (const sel of submitSelectors) {
      try {
        const btn = page.locator(sel).first();
        if ((await btn.count()) > 0 && (await btn.isVisible())) {
          await Promise.all([
            page
              .waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15_000 })
              .catch(() => undefined),
            btn.click(),
          ]);
          break;
        }
      } catch {
        // try next
      }
    }

    // Wait for networkidle and verify login success
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);

    const postSubmitTimeoutMs = options.timeoutMs ?? 60_000;
    const submitStart = Date.now();
    let loginOk = false;

    while (Date.now() - submitStart < postSubmitTimeoutMs) {
      if (isClosed || page.isClosed()) break;
      loginOk = await isLoginSuccessful(page, context, auth.successUrlPattern);
      if (loginOk) break;
      await delay(1000);
    }

    if (!loginOk && !isClosed) {
      warnings.push(
        `Post-submit verification did not confirm login within ${Math.round(postSubmitTimeoutMs / 1000)}s`,
      );
    }

    const cookies = await context.cookies().catch(() => []);
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    mkdirSync(artifactDir, { recursive: true });
    await context.storageState({ path: storageStatePath }).catch(() => undefined);
    const finalUrl = isClosed ? targetUrl : page.url();

    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);

    return {
      used: cookies.length > 0,
      cookieHeader: cookieHeader.length > 0 ? cookieHeader : undefined,
      storageStatePath,
      finalUrl,
      cookies,
      warnings,
    };
  } catch (err) {
    void context?.close().catch(() => undefined);
    void browser?.close().catch(() => undefined);
    return {
      used: false,
      error: `Form login failed: ${(err as Error).message}`,
      warnings,
    };
  }
}
