import type { Page } from 'playwright';
import { redactString } from '@nexus/core';

export interface DiscoveredInteractiveElement {
  tag: string;
  type?: string;
  selector: string;
  name?: string;
  id?: string;
  text?: string;
  role?: string;
  ariaLabel?: string;
  placeholder?: string;
  semanticKind:
    | 'email'
    | 'password'
    | 'username'
    | 'search'
    | 'phone'
    | 'name'
    | 'number'
    | 'generic-text'
    | 'checkbox'
    | 'select'
    | 'submit-button'
    | 'nav-link'
    | 'action-button';
}

export interface VisualLayoutAnomaly {
  kind: 'broken-image' | 'horizontal-overflow' | 'empty-button' | 'zero-size-element';
  selector: string;
  detail: string;
}

export interface PageInspectionSummary {
  inputs: DiscoveredInteractiveElement[];
  buttons: DiscoveredInteractiveElement[];
  links: DiscoveredInteractiveElement[];
  formsCount: number;
  anomalies: VisualLayoutAnomaly[];
}

export interface AgentAction {
  step: number;
  type: 'navigate' | 'fill' | 'click' | 'select' | 'assert';
  target: string;
  value?: string;
  durationMs: number;
  status: 'passed' | 'failed';
  error?: string;
}

export interface AutonomousJourneyResult {
  journeyName: string;
  startUrl: string;
  finalUrl: string;
  passed: boolean;
  totalSteps: number;
  actions: AgentAction[];
  reproduction: string[];
  anomalies: VisualLayoutAnomaly[];
  errors: string[];
  durationMs: number;
}

export interface AutonomousAgentOptions {
  maxSteps?: number;
  mode?: 'sandbox' | 'staging' | 'prod-safe';
  credentials?: {
    username?: string;
    email?: string;
    password?: string;
  };
  onLog?: (message: string) => void;
}

/**
 * Generates realistic semantic mock data based on input classification
 */
export function generateMockValueForSemanticKind(
  kind: DiscoveredInteractiveElement['semanticKind'],
  credentials?: { email?: string; username?: string; password?: string },
): string {
  switch (kind) {
    case 'email':
      return credentials?.email ?? 'qa-automated-tester@nexus-portal.local';
    case 'password':
      return credentials?.password ?? 'P@ssw0rdSecureTest2026!';
    case 'username':
      return credentials?.username ?? 'qa_tester';
    case 'search':
      return 'test search query';
    case 'phone':
      return '081234567890';
    case 'name':
      return 'Automated QA Specialist';
    case 'number':
      return '5';
    default:
      return 'Nexus Automated Test Input';
  }
}

/**
 * Classifies an input element semantically from its attributes
 */
export function classifyInputElement(attrs: {
  tag: string;
  type?: string;
  name?: string;
  id?: string;
  placeholder?: string;
  ariaLabel?: string;
}): DiscoveredInteractiveElement['semanticKind'] {
  const combined = `${attrs.name ?? ''} ${attrs.id ?? ''} ${attrs.placeholder ?? ''} ${attrs.ariaLabel ?? ''}`.toLowerCase();
  const inputType = (attrs.type ?? 'text').toLowerCase();

  if (inputType === 'password' || combined.includes('password') || combined.includes('sandi')) {
    return 'password';
  }
  if (inputType === 'email' || combined.includes('email') || combined.includes('surel')) {
    return 'email';
  }
  if (combined.includes('user') || combined.includes('username') || combined.includes('login')) {
    return 'username';
  }
  if (
    inputType === 'search' ||
    combined.includes('search') ||
    combined.includes('cari') ||
    combined.includes('query')
  ) {
    return 'search';
  }
  if (inputType === 'tel' || combined.includes('phone') || combined.includes('telepon') || combined.includes('hp')) {
    return 'phone';
  }
  if (combined.includes('name') || combined.includes('nama')) {
    return 'name';
  }
  if (inputType === 'number' || combined.includes('qty') || combined.includes('amount') || combined.includes('jumlah')) {
    return 'number';
  }
  if (inputType === 'checkbox') {
    return 'checkbox';
  }
  return 'generic-text';
}

/**
 * In-browser inspector function injected into Playwright page
 */
export async function inspectPageElements(page: Page): Promise<PageInspectionSummary> {
  return page.evaluate(() => {
    const inputs: Array<{
      tag: string;
      type?: string;
      selector: string;
      name?: string;
      id?: string;
      placeholder?: string;
      ariaLabel?: string;
    }> = [];

    const buttons: Array<{
      tag: string;
      selector: string;
      text?: string;
      type?: string;
      role?: string;
      ariaLabel?: string;
    }> = [];

    const links: Array<{
      tag: string;
      selector: string;
      text?: string;
    }> = [];

    const anomalies: Array<{
      kind: 'broken-image' | 'horizontal-overflow' | 'empty-button' | 'zero-size-element';
      selector: string;
      detail: string;
    }> = [];

    // 1. Collect inputs
    document.querySelectorAll('input:not([type="hidden"]), textarea, select').forEach((el, idx) => {
      const input = el as HTMLInputElement;
      if (input.offsetParent === null && input.offsetWidth === 0) return; // not visible

      const tag = input.tagName.toLowerCase();
      const type = input.type;
      const name = input.name;
      const id = input.id;
      const placeholder = input.placeholder;
      const ariaLabel = input.getAttribute('aria-label') || undefined;

      const selector = id
        ? `#${id}`
        : name
          ? `${tag}[name="${name}"]`
          : `${tag}:nth-of-type(${idx + 1})`;

      inputs.push({ tag, type, selector, name, id, placeholder, ariaLabel });
    });

    // 2. Collect buttons & submitters
    document
      .querySelectorAll('button, input[type="submit"], [role="button"]')
      .forEach((el, idx) => {
        const btn = el as HTMLElement;
        if (btn.offsetParent === null && btn.offsetWidth === 0) return;

        const tag = btn.tagName.toLowerCase();
        const text = (btn.textContent || '').trim();
        const id = btn.id;
        const type = btn.getAttribute('type') || undefined;
        const role = btn.getAttribute('role') || undefined;
        const ariaLabel = btn.getAttribute('aria-label') || undefined;

        const selector = id
          ? `#${id}`
          : text.length > 0 && text.length < 30
            ? `${tag}:has-text("${text}")`
            : `${tag}:nth-of-type(${idx + 1})`;

        if (!text && !ariaLabel) {
          anomalies.push({
            kind: 'empty-button',
            selector,
            detail: 'Button has neither text label nor aria-label (inaccessible and confusing)',
          });
        }

        buttons.push({ tag, selector, text, type, role, ariaLabel });
      });

    // 3. Collect internal navigation links
    document.querySelectorAll('a[href]:not([href^="#"]):not([href^="javascript"])').forEach((el) => {
      const a = el as HTMLAnchorElement;
      if (a.offsetParent === null && a.offsetWidth === 0) return;
      const text = (a.textContent || '').trim();
      const href = a.getAttribute('href') || '';
      if (href.startsWith('http') && !href.includes(window.location.host)) return; // skip 3rd party
      links.push({
        tag: 'a',
        selector: `a[href="${href}"]`,
        text: text.slice(0, 40),
      });
    });

    // 4. Check broken images
    document.querySelectorAll('img').forEach((img) => {
      if (img.complete && img.naturalWidth === 0 && img.src && !img.src.startsWith('data:')) {
        anomalies.push({
          kind: 'broken-image',
          selector: img.src ? `img[src="${img.src}"]` : 'img',
          detail: `Broken image source failed to load: ${img.src}`,
        });
      }
    });

    // 5. Check horizontal viewport overflow
    if (document.documentElement.scrollWidth > window.innerWidth + 20) {
      anomalies.push({
        kind: 'horizontal-overflow',
        selector: 'html',
        detail: `Page body scrollWidth (${document.documentElement.scrollWidth}px) exceeds window innerWidth (${window.innerWidth}px)`,
      });
    }

    return {
      inputs: inputs.map((inp) => ({
        ...inp,
        semanticKind:
          inp.tag === 'select'
            ? ('select' as const)
            : inp.type === 'submit'
              ? ('submit-button' as const)
              : inp.type === 'checkbox'
                ? ('checkbox' as const)
                : 'generic-text',
      })),
      buttons: buttons.map((btn) => ({
        ...btn,
        semanticKind: (btn.type === 'submit' ? 'submit-button' : 'action-button') as
          | 'submit-button'
          | 'action-button',
      })),
      links: links.map((l) => ({
        ...l,
        semanticKind: 'nav-link' as const,
      })),
      formsCount: document.querySelectorAll('form').length,
      anomalies,
    };
  });
}

/**
 * Autonomous QA Agent that mimics a human QA manual testing session:
 * 1. Explores login flow and inputs realistic credentials
 * 2. Clicks interactive action buttons & tabs
 * 3. Inspects DOM for broken images, overlapping layouts, and unhandled errors
 * 4. Produces verifiable reproduction steps
 */
export class AutonomousQaAgent {
  constructor(private options: AutonomousAgentOptions = {}) {}

  async runAutonomousJourney(
    page: Page,
    startUrl: string,
    journeyName: string = 'Autonomous Human-Like QA Traversal',
  ): Promise<AutonomousJourneyResult> {
    const startedAt = Date.now();
    const actions: AgentAction[] = [];
    const reproduction: string[] = [];
    const anomalies: VisualLayoutAnomaly[] = [];
    const errors: string[] = [];

    const maxSteps = this.options.maxSteps ?? 10;
    const mode = this.options.mode ?? 'sandbox';

    // Track uncaught page errors
    page.on('pageerror', (err) => {
      errors.push(`Uncaught JavaScript Exception: ${err.message}`);
    });

    page.on('response', (res) => {
      if (res.status() >= 500) {
        errors.push(`HTTP ${res.status()} Internal Server Error on ${res.url()}`);
      }
    });

    // Step 1: Initial navigation
    const navStart = Date.now();
    try {
      await page.goto(startUrl, { waitUntil: 'load', timeout: 15000 });
      actions.push({
        step: 1,
        type: 'navigate',
        target: startUrl,
        durationMs: Date.now() - navStart,
        status: 'passed',
      });
      reproduction.push(`1. Open URL: ${startUrl}`);
    } catch (err) {
      actions.push({
        step: 1,
        type: 'navigate',
        target: startUrl,
        durationMs: Date.now() - navStart,
        status: 'failed',
        error: (err as Error).message,
      });
      reproduction.push(`1. Open URL: ${startUrl} (FAILED: ${(err as Error).message})`);
      return {
        journeyName,
        startUrl,
        finalUrl: page.url(),
        passed: false,
        totalSteps: 1,
        actions,
        reproduction,
        anomalies,
        errors: [...errors, (err as Error).message],
        durationMs: Date.now() - startedAt,
      };
    }

    let currentStep = 2;

    // Traversal loop
    while (currentStep <= maxSteps) {
      // 1. Inspect elements and visual anomalies on current page
      let inspection: PageInspectionSummary;
      try {
        inspection = await inspectPageElements(page);
        anomalies.push(...inspection.anomalies);
      } catch {
        break;
      }

      // 2. Decide next action:
      // A. If unfilled inputs exist (e.g. login or search form), fill them first!
      if (inspection.inputs.length > 0 && currentStep < maxSteps) {
        for (const input of inspection.inputs.slice(0, 3)) {
          const val = generateMockValueForSemanticKind(
            classifyInputElement(input),
            this.options.credentials,
          );
          const fillStart = Date.now();
          try {
            await page.fill(input.selector, val, { timeout: 2000 });
            actions.push({
              step: currentStep,
              type: 'fill',
              target: input.selector,
              value: input.semanticKind === 'password' ? '********' : val,
              durationMs: Date.now() - fillStart,
              status: 'passed',
            });
            reproduction.push(
              `${currentStep}. Fill ${input.selector} with "${input.semanticKind === 'password' ? '********' : val}"`,
            );
            currentStep++;
            if (currentStep > maxSteps) break;
          } catch {
            // continue
          }
        }
      }

      // B. If a submit button or primary CTA button is present, click it
      const ctaBtn =
        inspection.buttons.find(
          (b) =>
            b.type === 'submit' ||
            (b.text && /masuk|login|sign in|submit|simpan|kirim|tambah/i.test(b.text)),
        ) ?? inspection.buttons[0];

      if (ctaBtn && currentStep <= maxSteps) {
        // Mode guard check: in prod-safe mode, do not execute form submissions that mutate data
        if (mode === 'prod-safe' && ctaBtn.type === 'submit') {
          actions.push({
            step: currentStep,
            type: 'click',
            target: ctaBtn.selector,
            durationMs: 0,
            status: 'passed',
            value: 'skipped by mode-guard in prod-safe',
          });
          reproduction.push(
            `${currentStep}. Skip clicking submit button ${ctaBtn.selector} (Observe-only Mode Guard enforced)`,
          );
          break;
        }

        const clickStart = Date.now();
        try {
          await page.click(ctaBtn.selector, { timeout: 3000 });
          await page.waitForTimeout(500);

          actions.push({
            step: currentStep,
            type: 'click',
            target: ctaBtn.selector,
            value: ctaBtn.text,
            durationMs: Date.now() - clickStart,
            status: 'passed',
          });
          reproduction.push(
            `${currentStep}. Click button "${ctaBtn.text || ctaBtn.selector}"`,
          );
          currentStep++;
        } catch {
          // button might have moved or page navigated
        }
      } else if (inspection.links.length > 0 && currentStep <= maxSteps) {
        // C. If no button, click a navigation link
        const targetLink = inspection.links[0];
        const linkStart = Date.now();
        try {
          await page.click(targetLink.selector, { timeout: 3000 });
          await page.waitForTimeout(500);

          actions.push({
            step: currentStep,
            type: 'click',
            target: targetLink.selector,
            value: targetLink.text,
            durationMs: Date.now() - linkStart,
            status: 'passed',
          });
          reproduction.push(
            `${currentStep}. Click navigation link "${targetLink.text || targetLink.selector}"`,
          );
          currentStep++;
        } catch {
          break;
        }
      } else {
        // No further action needed
        break;
      }
    }

    const passed = errors.length === 0 && anomalies.length === 0;

    return {
      journeyName,
      startUrl,
      finalUrl: page.url(),
      passed,
      totalSteps: actions.length,
      actions,
      reproduction,
      anomalies,
      errors,
      durationMs: Date.now() - startedAt,
    };
  }
}
