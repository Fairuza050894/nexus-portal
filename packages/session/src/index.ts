import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, firefox, webkit, type Browser, type BrowserContext, type Page, type Response } from 'playwright';
import axe from 'axe-core';
import { isHostAllowed, resolveHost } from '@nexus/core';

export interface SessionPageTarget {
  url: string;
  path: string;
}

export interface AxeViolation {
  id: string;
  impact: string | null;
  description: string;
  help: string;
  helpUrl: string;
  nodes: Array<{ target: string[]; failureSummary?: string }>;
}

export interface SessionPageResult {
  url: string;
  path: string;
  title: string;
  status?: number;
  forms: number;
  error?: string;
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: Array<{ url: string; reason: string }>;
  serverErrors: Array<{ url: string; status: number }>;
  a11y: {
    violations: AxeViolation[];
    critical: number;
    serious: number;
    total: number;
    error?: string;
  };
  vitals: {
    lcpMs?: number;
    cls?: number;
    ttfbMs?: number;
  };
  security: {
    headers: Record<string, string>;
    missingHeaders: string[];
    insecureCookies: string[];
    mixedContent: string[];
    server?: string;
  };
  screenshot?: string;
  durationMs: number;
}

export interface SessionResult {
  pages: SessionPageResult[];
  browserVersion: string;
  warnings: string[];
  durationMs: number;
}

export interface SessionOptions {
  pages: SessionPageTarget[];
  allowlist: string[];
  artifactDir: string;
  authHeaders?: Record<string, string>;
  authHost?: string;
  headless?: boolean;
  navigationTimeoutMs?: number;
  maxPages?: number;
  browserType?: 'chromium' | 'firefox' | 'webkit';
  viewport?: { width: number; height: number; isMobile?: boolean };
  interactiveLogin?: boolean;
  loginTimeoutMs?: number;
  cookies?: Array<{ name: string; value: string; domain?: string; path?: string }>;
  onLog?: (message: string) => void;
}

export function parseCookieString(
  cookieStr: string,
  domain: string,
): Array<{ name: string; value: string; domain: string; path: string }> {
  const cookies: Array<{ name: string; value: string; domain: string; path: string }> = [];
  const parts = cookieStr.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const name = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (name && value) {
      cookies.push({ name, value, domain, path: '/' });
    }
  }
  return cookies;
}

export const STANDARD_VIEWPORTS = {
  desktop: { width: 1366, height: 768, isMobile: false },
  tablet: { width: 820, height: 1180, isMobile: false },
  mobile: { width: 390, height: 844, isMobile: true },
} as const;

interface RawAxeResult {
  violations?: Array<{
    id?: unknown;
    impact?: unknown;
    description?: unknown;
    help?: unknown;
    helpUrl?: unknown;
    nodes?: Array<{ target?: unknown; failureSummary?: unknown }>;
  }>;
}

const SECURITY_HEADERS = [
  'content-security-policy',
  'strict-transport-security',
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
];

const A11Y_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

function screenshotName(path: string): string {
  const normalized = path.replace(/^\/+/, '').replace(/[^a-zA-Z0-9_-]+/g, '_');
  return `${normalized || 'root'}.png`;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function parseAxe(result: unknown): AxeViolation[] {
  const raw = result as RawAxeResult;
  if (!raw || !Array.isArray(raw.violations)) return [];
  return raw.violations.flatMap((violation) => {
    if (typeof violation.id !== 'string' || typeof violation.description !== 'string') return [];
    return [
      {
        id: violation.id,
        impact: typeof violation.impact === 'string' ? violation.impact : null,
        description: violation.description,
        help: typeof violation.help === 'string' ? violation.help : violation.id,
        helpUrl: typeof violation.helpUrl === 'string' ? violation.helpUrl : '',
        nodes: (violation.nodes ?? []).map((node) => ({
          target: asStringArray(node.target),
          failureSummary: typeof node.failureSummary === 'string' ? node.failureSummary : undefined,
        })),
      },
    ];
  });
}

async function injectVitalsObserver(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const target = window as unknown as {
      __qaVitals?: { lcp: number; cls: number };
    };
    target.__qaVitals = { lcp: 0, cls: 0 };
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          target.__qaVitals!.lcp = entry.startTime;
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {
      // browser does not support LCP
    }
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & {
            value?: number;
            hadRecentInput?: boolean;
          };
          if (!shift.hadRecentInput) {
            target.__qaVitals!.cls += shift.value ?? 0;
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      // browser does not support CLS
    }
  });
}

async function readVitals(page: Page): Promise<SessionPageResult['vitals']> {
  return page.evaluate(() => {
    const target = window as unknown as { __qaVitals?: { lcp: number; cls: number } };
    const navigation = performance.getEntriesByType('navigation')[0] as
      PerformanceNavigationTiming | undefined;
    return {
      ...(target.__qaVitals?.lcp ? { lcpMs: Math.round(target.__qaVitals.lcp) } : {}),
      ...(target.__qaVitals?.cls !== undefined
        ? { cls: Math.round(target.__qaVitals.cls * 1000) / 1000 }
        : {}),
      ...(navigation
        ? { ttfbMs: Math.max(0, Math.round(navigation.responseStart - navigation.requestStart)) }
        : {}),
    };
  });
}

async function collectSecurity(
  context: BrowserContext,
  url: string,
  response: Response | null,
  mixedContent: string[],
): Promise<SessionPageResult['security']> {
  const headers: Record<string, string> = {};
  if (response) {
    for (const [name, value] of Object.entries(await response.allHeaders())) {
      headers[name.toLowerCase()] = value;
    }
  }
  const missingHeaders = SECURITY_HEADERS.filter((name) => !headers[name]);
  const cookies = await context.cookies(url);
  const insecureCookies = cookies
    .filter((cookie) => !cookie.secure || !cookie.httpOnly)
    .map((cookie) => cookie.name);
  return {
    headers,
    missingHeaders,
    insecureCookies: [...new Set(insecureCookies)],
    mixedContent: [...new Set(mixedContent)],
    ...(headers.server ? { server: headers.server } : {}),
  };
}

async function probePage(
  context: BrowserContext,
  target: SessionPageTarget,
  options: SessionOptions,
): Promise<SessionPageResult> {
  const startedAt = Date.now();
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: SessionPageResult['failedRequests'] = [];
  const serverErrors: SessionPageResult['serverErrors'] = [];
  const mixedContent: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    failedRequests.push({
      url: request.url(),
      reason: request.failure()?.errorText ?? 'request failed',
    });
  });
  page.on('response', (response) => {
    if (response.status() >= 500) {
      serverErrors.push({ url: response.url(), status: response.status() });
    }
  });
  page.on('request', (request) => {
    if (target.url.startsWith('https://') && request.url().startsWith('http://')) {
      mixedContent.push(request.url());
    }
  });

  let response: Response | null = null;
  let status: number | undefined;
  let title = '';
  let error: string | undefined;
  try {
    response = await page.goto(target.url, {
      waitUntil: 'domcontentloaded',
      timeout: options.navigationTimeoutMs ?? 20_000,
    });
    status = response?.status();
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    title = await page.title();
  } catch (navigationError) {
    error = (navigationError as Error).message;
  }

  let vitals: SessionPageResult['vitals'] = {};
  let violations: AxeViolation[] = [];
  let a11yError: string | undefined;
  let forms = 0;
  const security = await collectSecurity(context, target.url, response, mixedContent);

  if (!error) {
    forms = await page.evaluate(() => document.forms.length).catch(() => 0);
    vitals = await readVitals(page).catch(() => ({}));
    try {
      await page.addScriptTag({ content: axe.source });
      const axeResult = await page.evaluate(async (tags) => {
        const api = (
          window as unknown as {
            axe: {
              run: (context: Document, options: unknown) => Promise<unknown>;
            };
          }
        ).axe;
        return api.run(document, { runOnly: { type: 'tag', values: tags } });
      }, A11Y_TAGS);
      violations = parseAxe(axeResult);
    } catch (error) {
      violations = [];
      a11yError = (error as Error).message;
    }
  }

  let screenshot: string | undefined;
  try {
    mkdirSync(options.artifactDir, { recursive: true });
    screenshot = join(options.artifactDir, screenshotName(target.path));
    await page.screenshot({ path: screenshot, fullPage: true });
  } catch {
    screenshot = undefined;
  }

  const critical = violations.filter((violation) => violation.impact === 'critical').length;
  const serious = violations.filter((violation) => violation.impact === 'serious').length;
  await page.close();

  return {
    url: target.url,
    path: target.path,
    title,
    forms,
    ...(status !== undefined ? { status } : {}),
    ...(error ? { error } : {}),
    consoleErrors,
    pageErrors,
    failedRequests,
    serverErrors,
    a11y: {
      violations,
      critical,
      serious,
      total: violations.length,
      ...(a11yError ? { error: a11yError } : {}),
    },
    vitals,
    security,
    ...(screenshot ? { screenshot } : {}),
    durationMs: Date.now() - startedAt,
  };
}

export async function runInstrumentedSession(options: SessionOptions): Promise<SessionResult> {
  const startedAt = Date.now();
  const warnings: string[] = [];
  const targets = options.pages
    .filter((target) => {
      const host = resolveHost(target.url);
      if (!host || !isHostAllowed(host, options.allowlist)) {
        warnings.push(`skipped non-allowlisted session target: ${target.url}`);
        return false;
      }
      return true;
    })
    .slice(0, options.maxPages ?? options.pages.length);

  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  try {
    const bType = options.browserType ?? 'chromium';
    const launcher = bType === 'firefox' ? firefox : bType === 'webkit' ? webkit : chromium;
    const isHeadless = options.headless ?? (options.interactiveLogin ? false : true);
    browser = await launcher.launch({ headless: isHeadless });
    context = await browser.newContext({
      viewport: options.viewport ?? { width: 1366, height: 768 },
      isMobile: options.viewport?.isMobile ?? false,
      ignoreHTTPSErrors: false,
    });
    await injectVitalsObserver(context);

    if (options.cookies && options.cookies.length > 0) {
      await context.addCookies(options.cookies);
    }

    if (options.authHeaders && options.authHost) {
      await context.route('**/*', async (route) => {
        const request = route.request();
        const host = resolveHost(request.url());
        if (!host || !isHostAllowed(host, options.allowlist)) {
          if (request.isNavigationRequest()) {
            await route.abort('blockedbyclient');
            return;
          }
        }
        if (host === options.authHost) {
          await route.continue({
            headers: { ...request.headers(), ...options.authHeaders },
          });
          return;
        }
        await route.continue();
      });
    } else {
      await context.route('**/*', async (route) => {
        const request = route.request();
        const host = resolveHost(request.url());
        if (!host || !isHostAllowed(host, options.allowlist)) {
          if (request.isNavigationRequest()) {
            await route.abort('blockedbyclient');
            return;
          }
        }
        await route.continue();
      });
    }

    if (options.interactiveLogin && targets.length > 0) {
      options.onLog?.('Guided Login: Browser opened. Waiting for manual authentication...');
      const loginPage = await context.newPage();
      try {
        await loginPage.goto(targets[0].url, { timeout: options.navigationTimeoutMs ?? 30_000 });

        // Wait up to 10s for the login page / form to settle
        await loginPage.waitForSelector('input[type="password"]', { timeout: 10_000 }).catch(() => undefined);

        // Inject helper banner
        await loginPage.evaluate(() => {
          if (document.getElementById('__nexus_login_banner__')) return;
          const banner = document.createElement('div');
          banner.id = '__nexus_login_banner__';
          banner.innerHTML =
            '<div style="position:fixed;top:0;left:0;right:0;background:#0f172a;color:#f8fafc;padding:10px 16px;z-index:99999999;font-family:sans-serif;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,0.5);display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #3b82f6;">' +
            '<span><strong>Nexus QA Guided Login:</strong> Silakan login dengan akun Anda. Begitu Anda masuk ke dashboard, pengujian otomatis akan langsung berjalan.</span>' +
            '<button id="__nexus_resume_btn__" style="background:#2563eb;color:#fff;border:none;padding:6px 16px;border-radius:4px;cursor:pointer;font-weight:700;font-size:12px;">Sudah Login, Lanjutkan!</button>' +
            '</div>';
          document.body.prepend(banner);
          document.body.style.paddingTop = '50px';
          const btn = document.getElementById('__nexus_resume_btn__');
          if (btn) btn.onclick = () => { window.sessionStorage.setItem('__nexus_resume__', '1'); };
        }).catch(() => undefined);

        options.onLog?.('Browser window ready. Please enter your credentials and log in...');

        // Await either button click, password field detachment, or URL navigation away from login
        const timeoutLimit = options.loginTimeoutMs ?? 120_000;
        const pollStart = Date.now();

        while (Date.now() - pollStart < timeoutLimit) {
          const isDone = await loginPage.evaluate(() => {
            if (window.sessionStorage.getItem('__nexus_resume__') === '1') return true;
            const hasPass = Boolean(document.querySelector('input[type="password"]'));
            const isLoginUrl = window.location.pathname.includes('/login');
            return !hasPass && !isLoginUrl;
          }).catch(() => false);

          if (isDone) {
            options.onLog?.('Login success detected! Extracting authenticated session...');
            break;
          }
          await new Promise((r) => setTimeout(r, 1000));
        }

        // Harvest internal links from the authenticated dashboard
        const internalPaths = await loginPage.$$eval('a[href]', (anchors) =>
          anchors
            .map((a) => (a as HTMLAnchorElement).pathname)
            .filter((p) => p && !p.startsWith('#') && !p.includes('logout') && !p.includes('login')),
        ).catch(() => []);

        for (const p of [...new Set(internalPaths)].slice(0, 5)) {
          const origin = new URL(targets[0].url).origin;
          const fullUrl = `${origin}${p.startsWith('/') ? '' : '/'}${p}`;
          if (!targets.some((t) => t.path === p)) {
            targets.push({ url: fullUrl, path: p });
          }
        }

        options.onLog?.('Authenticated session captured! Commencing automated testing...');
      } catch (err) {
        options.onLog?.(`Guided login notice: ${(err as Error).message}`);
      } finally {
        await loginPage.close().catch(() => undefined);
      }
    }


    const pages: SessionPageResult[] = [];
    for (const target of targets) {
      pages.push(await probePage(context, target, options));
    }

    return {
      pages,
      browserVersion: browser.version(),
      warnings,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
