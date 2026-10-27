import type { SessionResult } from '@nexus/session';
import { toFindings } from './findings.js';
import type { FindingDraft, LaneContext, LaneResult, LaneTestCase } from './types.js';

const SEVERITY_BY_HEADER: Record<string, FindingDraft['severity']> = {
  'content-security-policy': 'medium',
  'strict-transport-security': 'medium',
  'x-content-type-options': 'low',
  'x-frame-options': 'low',
  'referrer-policy': 'low',
};

export function runSecurityLane(
  _context: LaneContext,
  session: SessionResult | undefined,
): LaneResult {
  const startedAt = Date.now();
  if (!session || session.pages.length === 0) {
    return {
      lane: 'security',
      status: 'skipped',
      tests: [],
      findings: [],
      reason: 'no browser session',
      durationMs: Date.now() - startedAt,
    };
  }

  const tests: LaneTestCase[] = session.pages.map((page, index) => ({
    id: `TC-SEC-${String(index + 1).padStart(3, '0')}`,
    lane: 'security',
    name: `passive security observation ${page.path}`,
    status: page.error ? 'skipped' : 'passed',
    durationMs: page.durationMs,
    expected: 'response/cookies observed',
    actual: page.error ? `page did not load: ${page.error}` : 'observed',
  }));

  const drafts: FindingDraft[] = [];
  const missing = new Map<string, string[]>();
  const insecureCookies = new Map<string, string[]>();
  const mixedContent = new Map<string, string[]>();
  const serverHeaders = new Set<string>();

  for (const page of session.pages) {
    for (const header of page.security.missingHeaders) {
      const pages = missing.get(header) ?? [];
      pages.push(page.path);
      missing.set(header, pages);
    }
    for (const cookie of page.security.insecureCookies) {
      const pages = insecureCookies.get(cookie) ?? [];
      pages.push(page.path);
      insecureCookies.set(cookie, pages);
    }
    for (const url of page.security.mixedContent) {
      const pages = mixedContent.get(url) ?? [];
      pages.push(page.path);
      mixedContent.set(url, pages);
    }
    if (page.security.server) serverHeaders.add(page.security.server);
  }

  for (const [header, pages] of missing) {
    drafts.push({
      title: `Missing security header: ${header}`,
      ruleId: `missing-security-header:${header}`,
      severity: SEVERITY_BY_HEADER[header] ?? 'low',
      confidence: 'auto-discovered',
      category: 'security',
      lane: 'security',
      affected: pages.map((page) => ({ page })),
      expected: `${header} header present`,
      actual: 'header missing',
      evidence: [{ type: 'header', header }],
    });
  }
  for (const [cookie, pages] of insecureCookies) {
    drafts.push({
      title: `Cookie ${cookie} missing Secure/HttpOnly`,
      ruleId: `insecure-cookie:${cookie}`,
      severity: 'medium',
      confidence: 'auto-discovered',
      category: 'security',
      lane: 'security',
      affected: pages.map((page) => ({ page })),
      expected: 'Secure and HttpOnly set',
      actual: 'flag missing',
    });
  }
  for (const [url, pages] of mixedContent) {
    drafts.push({
      title: 'Mixed content request',
      ruleId: 'mixed-content',
      severity: 'high',
      confidence: 'auto-discovered',
      category: 'security',
      lane: 'security',
      affected: pages.map((page) => ({ page })),
      expected: 'all subresources use HTTPS',
      actual: url,
      evidence: [{ type: 'har-lite', path: url }],
    });
  }
  for (const server of serverHeaders) {
    drafts.push({
      title: `Server header discloses technology: ${server}`,
      ruleId: 'server-header-disclosure',
      severity: 'low',
      confidence: 'needs-review',
      category: 'security',
      lane: 'security',
      actual: server,
    });
  }

  const allSkipped = tests.length > 0 && tests.every((test) => test.status === 'skipped');
  return {
    lane: 'security',
    status: allSkipped ? 'skipped' : 'passed',
    tests,
    findings: toFindings(drafts),
    ...(allSkipped ? { reason: 'no page could be observed' } : {}),
    durationMs: Date.now() - startedAt,
  };
}
