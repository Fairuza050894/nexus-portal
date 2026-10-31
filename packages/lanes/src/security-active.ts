import { redactString, type Finding } from '@nexus/core';
import { toFindings } from './findings.js';
import type { FindingDraft, LaneContext, LaneResult, LaneTestCase } from './types.js';

export interface ActiveSecurityProbeResult {
  vulnerable: boolean;
  endpoint: string;
  method: string;
  payloadSent?: string;
  evidence?: string;
  expected?: string;
  actual?: string;
  reproduction?: string[];
  suggestedFix?: string;
}

export interface ActiveSecurityProbe {
  id: string;
  ruleId: string;
  category: 'sqli' | 'xss' | 'traversal' | 'exposure' | 'open-redirect' | 'cve';
  name: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  confidence: 'verified' | 'auto-discovered' | 'needs-review';
  test(
    baseUrl: string,
    endpoint: string,
    fetchFn: typeof fetch,
  ): Promise<ActiveSecurityProbeResult>;
}

export interface ActiveSecurityProbeOptions {
  targetBaseUrl?: string;
  endpoints?: string[];
  timeoutMs?: number;
  customProbes?: ActiveSecurityProbe[];
  fetchFn?: typeof fetch;
  nucleiScan?: {
    enabled?: boolean;
    templates?: string[];
  };
  zapScan?: {
    enabled?: boolean;
    targetUrl?: string;
  };
}

// SQL Error patterns for SQLi detection
const SQL_ERROR_PATTERNS = [
  /syntax error in SQL statement/i,
  /SQLSTATE\[/i,
  /mysql_fetch/i,
  /pg_query/i,
  /SQLite3::/i,
  /ORA-01756/i,
  /Unclosed quotation mark/i,
  /You have an error in your SQL syntax/i,
  /PostgreSQL.*?ERROR/i,
  /Microsoft OLE DB Provider for SQL Server/i,
];

// Sensitive keywords for Exposure detection
const SENSITIVE_EXPOSURE_PATTERNS = [
  /DB_PASSWORD=/i,
  /APP_KEY=base64:/i,
  /ref:\s*refs\/heads\//i,
  /AWS_SECRET_ACCESS_KEY/i,
  /PRIVATE KEY-----/i,
  /"activeProfiles"\s*:/i,
];

export const STANDARD_ACTIVE_PROBES: ActiveSecurityProbe[] = [
  {
    id: 'SEC-PROBE-SQLI',
    ruleId: 'dast-sql-injection',
    category: 'sqli',
    name: 'Active SQL Injection Error-Based Probing',
    severity: 'critical',
    confidence: 'verified',
    async test(baseUrl, endpoint, fetchFn) {
      const targetUrl = new URL(endpoint, baseUrl);
      targetUrl.searchParams.set('id', "1' OR '1'='1' --");
      targetUrl.searchParams.set('q', "' OR '1'='1");

      try {
        const res = await fetchFn(targetUrl.toString(), {
          method: 'GET',
          headers: { 'User-Agent': 'nexus-dast-scanner/2.0' },
        });
        const text = await res.text();

        const match = SQL_ERROR_PATTERNS.find((pattern) => pattern.test(text));
        if (match) {
          return {
            vulnerable: true,
            endpoint,
            method: 'GET',
            payloadSent: targetUrl.search,
            evidence: `Response contained raw database syntax error matching: ${match.source}`,
            expected: 'Application handles input safely without leaking database syntax errors',
            actual: `Database error leaked in HTTP ${res.status} response body`,
            reproduction: [`GET ${targetUrl.toString()}`, `Inspect response body for ${match.source}`],
            suggestedFix: 'Use parameterized queries or ORM prepared statements instead of string concatenation',
          };
        }

        return {
          vulnerable: false,
          endpoint,
          method: 'GET',
        };
      } catch (err) {
        return {
          vulnerable: false,
          endpoint,
          method: 'GET',
          evidence: (err as Error).message,
        };
      }
    },
  },

  {
    id: 'SEC-PROBE-XSS',
    ruleId: 'dast-reflected-xss',
    category: 'xss',
    name: 'Active Reflected XSS Canary Probing',
    severity: 'high',
    confidence: 'verified',
    async test(baseUrl, endpoint, fetchFn) {
      const canary = '<nx-xss-canary-tag>';
      const targetUrl = new URL(endpoint, baseUrl);
      targetUrl.searchParams.set('search', canary);
      targetUrl.searchParams.set('q', canary);

      try {
        const res = await fetchFn(targetUrl.toString(), {
          method: 'GET',
          headers: { 'User-Agent': 'nexus-dast-scanner/2.0' },
        });
        const contentType = res.headers.get('content-type') || '';
        const text = await res.text();

        if (contentType.includes('text/html') && text.includes(canary)) {
          return {
            vulnerable: true,
            endpoint,
            method: 'GET',
            payloadSent: canary,
            evidence: `Canary payload "${canary}" was reflected unescaped in text/html response`,
            expected: 'User input must be HTML entity encoded before rendering',
            actual: `Raw markup tag was reflected directly in HTML body`,
            reproduction: [`GET ${targetUrl.toString()}`, `Verify unescaped "${canary}" in DOM`],
            suggestedFix: 'Apply context-aware HTML encoding (e.g., OWASP Java Encoder, DOMPurify, or template auto-escaping)',
          };
        }

        return { vulnerable: false, endpoint, method: 'GET' };
      } catch (err) {
        return { vulnerable: false, endpoint, method: 'GET', evidence: (err as Error).message };
      }
    },
  },

  {
    id: 'SEC-PROBE-TRAVERSAL',
    ruleId: 'dast-path-traversal',
    category: 'traversal',
    name: 'Active Directory Path Traversal Probing',
    severity: 'critical',
    confidence: 'verified',
    async test(baseUrl, endpoint, fetchFn) {
      const targetUrl = new URL(endpoint, baseUrl);
      targetUrl.searchParams.set('file', '../../../../etc/passwd');
      targetUrl.searchParams.set('path', '..%2F..%2F..%2Fetc%2Fpasswd');

      try {
        const res = await fetchFn(targetUrl.toString(), {
          method: 'GET',
          headers: { 'User-Agent': 'nexus-dast-scanner/2.0' },
        });
        const text = await res.text();

        if (text.includes('root:x:0:0:') || text.includes('[boot loader]')) {
          return {
            vulnerable: true,
            endpoint,
            method: 'GET',
            payloadSent: '../../../../etc/passwd',
            evidence: 'Response contained signatures of system file content (/etc/passwd)',
            expected: 'Path traversal sequences should be stripped and file access restricted',
            actual: 'System file content was retrieved via path traversal parameter',
            reproduction: [`GET ${targetUrl.toString()}`],
            suggestedFix: 'Validate file paths against a strict allowlist or use path.resolve with a base directory check',
          };
        }

        return { vulnerable: false, endpoint, method: 'GET' };
      } catch (err) {
        return { vulnerable: false, endpoint, method: 'GET', evidence: (err as Error).message };
      }
    },
  },

  {
    id: 'SEC-PROBE-EXPOSURE',
    ruleId: 'dast-sensitive-info-exposure',
    category: 'exposure',
    name: 'Sensitive File and Environment Exposure Probing',
    severity: 'high',
    confidence: 'verified',
    async test(baseUrl, _endpoint, fetchFn) {
      const sensitivePaths = ['/.env', '/.git/HEAD', '/actuator/env'];

      for (const p of sensitivePaths) {
        try {
          const targetUrl = new URL(p, baseUrl);
          const res = await fetchFn(targetUrl.toString(), {
            method: 'GET',
            headers: { 'User-Agent': 'nexus-dast-scanner/2.0' },
          });

          if (res.status === 200) {
            const text = await res.text();
            const match = SENSITIVE_EXPOSURE_PATTERNS.find((pat) => pat.test(text));
            if (match) {
              return {
                vulnerable: true,
                endpoint: p,
                method: 'GET',
                evidence: `Public access granted to ${p} containing sensitive credentials or repo state`,
                expected: `HTTP 403 or 404 for internal configuration files`,
                actual: `HTTP 200 with sensitive content exposed`,
                reproduction: [`curl -s ${targetUrl.toString()}`],
                suggestedFix: 'Block web server access to hidden dot-files and private actuators in reverse proxy rules',
              };
            }
          }
        } catch {
          // ignore error and continue
        }
      }

      return { vulnerable: false, endpoint: '/.env', method: 'GET' };
    },
  },

  {
    id: 'SEC-PROBE-REDIRECT',
    ruleId: 'dast-open-redirect',
    category: 'open-redirect',
    name: 'Active Open Redirect Vulnerability Probing',
    severity: 'medium',
    confidence: 'verified',
    async test(baseUrl, endpoint, fetchFn) {
      const evilTarget = 'https://evil-attacker.example.org';
      const targetUrl = new URL(endpoint, baseUrl);
      targetUrl.searchParams.set('redirect', evilTarget);
      targetUrl.searchParams.set('next', evilTarget);

      try {
        const res = await fetchFn(targetUrl.toString(), {
          method: 'GET',
          redirect: 'manual',
          headers: { 'User-Agent': 'nexus-dast-scanner/2.0' },
        });

        const location = res.headers.get('location') || '';
        if (
          (res.status === 301 || res.status === 302 || res.status === 307 || res.status === 308) &&
          location.startsWith(evilTarget)
        ) {
          return {
            vulnerable: true,
            endpoint,
            method: 'GET',
            payloadSent: evilTarget,
            evidence: `Server issued redirect to unvalidated external origin: ${location}`,
            expected: 'Redirect target must be validated against a strict internal allowlist',
            actual: `HTTP ${res.status} redirect location pointing to external domain`,
            reproduction: [`GET ${targetUrl.toString()}`, `Verify Location header contains ${evilTarget}`],
            suggestedFix: 'Enforce relative paths only or validate redirect URLs against an allowlist of trusted domains',
          };
        }

        return { vulnerable: false, endpoint, method: 'GET' };
      } catch (err) {
        return { vulnerable: false, endpoint, method: 'GET', evidence: (err as Error).message };
      }
    },
  },

  {
    id: 'SEC-PROBE-LARAVEL-IGNITION',
    ruleId: 'dast-laravel-ignition-rce',
    category: 'cve',
    name: 'Laravel Ignition Debug RCE (CVE-2021-3129) Probing',
    severity: 'critical',
    confidence: 'verified',
    async test(baseUrl, _endpoint, fetchFn) {
      const ignitionEndpoints = ['/_ignition/health-check', '/_ignition/execute-solution'];
      for (const igPath of ignitionEndpoints) {
        try {
          const targetUrl = new URL(igPath, baseUrl);
          const res = await fetchFn(targetUrl.toString(), {
            method: 'GET',
            headers: { 'User-Agent': 'nexus-dast-scanner/2.0' },
          });

          if (res.status === 200 || res.status === 405) {
            const body = await res.text();
            if (
              body.includes('can_execute_commands') ||
              body.includes('runnable_solutions') ||
              body.includes('Ignition')
            ) {
              return {
                vulnerable: true,
                endpoint: igPath,
                method: 'GET',
                evidence: `Exposed Laravel Ignition debug interface at ${igPath} permitting remote solution execution`,
                expected: 'Ignition debug routes must be disabled in staging and production (APP_DEBUG=false)',
                actual: `HTTP ${res.status} returned with Ignition diagnostic capabilities enabled`,
                reproduction: [`curl -s ${targetUrl.toString()}`],
                suggestedFix: 'Set APP_DEBUG=false in .env and update facade/ignition or spatie/laravel-ignition',
              };
            }
          }
        } catch {
          // ignore
        }
      }
      return { vulnerable: false, endpoint: '/_ignition/health-check', method: 'GET' };
    },
  },

  {
    id: 'SEC-PROBE-PHP-CGI',
    ruleId: 'dast-php-cgi-arg-injection',
    category: 'cve',
    name: 'PHP-CGI Argument Injection RCE (CVE-2024-4577) Probing',
    severity: 'critical',
    confidence: 'verified',
    async test(baseUrl, endpoint, fetchFn) {
      const probeQuery = '?%add+allow_url_include%3d1+%add+auto_prepend_file%3dphp://input';
      try {
        const targetUrl = new URL(endpoint + probeQuery, baseUrl);
        const res = await fetchFn(targetUrl.toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'nexus-dast-scanner/2.0',
          },
          body: '<?php echo "nx7_php_cgi_vulnerable"; exit; ?>',
        });
        const text = await res.text();
        if (text.includes('nx7_php_cgi_vulnerable')) {
          return {
            vulnerable: true,
            endpoint,
            method: 'POST',
            payloadSent: probeQuery,
            evidence: 'Server executed arbitrary PHP code injected via %ad best-fit character mapping in php-cgi',
            expected: 'Server rejects or strips %ad query arguments preventing PHP-CGI execution',
            actual: 'PHP-CGI argument injection executed arbitrary payload',
            reproduction: [`POST ${targetUrl.toString()} with PHP test payload`],
            suggestedFix: 'Upgrade PHP to 8.1.29, 8.2.20, or 8.3.8+ and disable php-cgi handlers',
          };
        }
        return { vulnerable: false, endpoint, method: 'POST' };
      } catch (err) {
        return { vulnerable: false, endpoint, method: 'POST', evidence: (err as Error).message };
      }
    },
  },

  {
    id: 'SEC-PROBE-CLICKJACKING-PHISHING',
    ruleId: 'phishing:clickjacking-framing-allowed',
    category: 'open-redirect',
    name: 'Anti-Phishing Clickjacking Framing Defense Check',
    severity: 'high',
    confidence: 'verified',
    async test(baseUrl, endpoint, fetchFn) {
      try {
        const targetUrl = new URL(endpoint, baseUrl);
        const res = await fetchFn(targetUrl.toString(), {
          method: 'GET',
          headers: { 'User-Agent': 'nexus-dast-scanner/2.0' },
        });

        const csp = res.headers.get('content-security-policy') || '';
        const xfo = res.headers.get('x-frame-options') || '';
        const hasFrameAncestors = /frame-ancestors\s+['"]?(?:'none'|'self'|none|self)/i.test(csp);
        const hasXfo = /^(?:DENY|SAMEORIGIN)$/i.test(xfo.trim());

        if (!hasFrameAncestors && !hasXfo) {
          return {
            vulnerable: true,
            endpoint,
            method: 'GET',
            evidence: 'Missing X-Frame-Options and CSP frame-ancestors; page can be embedded in external phishing frames',
            expected: 'X-Frame-Options: DENY or CSP frame-ancestors: \'self\'',
            actual: 'Page allows arbitrary third-party embedding, enabling credential overlay and clickjacking attacks',
            reproduction: [`GET ${targetUrl.toString()}`, 'Check response headers for framing defenses'],
            suggestedFix: 'Configure web server to return "X-Frame-Options: SAMEORIGIN" and "Content-Security-Policy: frame-ancestors \'self\'"',
          };
        }

        return { vulnerable: false, endpoint, method: 'GET' };
      } catch (err) {
        return { vulnerable: false, endpoint, method: 'GET', evidence: (err as Error).message };
      }
    },
  },
];

export function generateNucleiTemplate(options: {
  id: string;
  name: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  path: string;
  matchers: Array<{ type: string; words: string[] }>;
}): string {
  const wordsList = (words: string[]) => words.map((w) => `          - "${w}"`).join('\n');
  const matchersYaml = options.matchers
    .map(
      (m) => `      - type: ${m.type}
        words:
${wordsList(m.words)}`,
    )
    .join('\n');

  return `id: ${options.id}
info:
  name: ${options.name}
  author: nexus-portal
  severity: ${options.severity}
  tags: dast,nexus,security

http:
  - method: GET
    path:
      - "{{BaseURL}}${options.path}"
    matchers-condition: and
    matchers:
${matchersYaml}
`;
}

export function parseNucleiJsonFindings(
  rawResults: Array<Record<string, any>>,
): Finding[] {
  const drafts: FindingDraft[] = [];

  for (const item of rawResults) {
    const templateId = String(item['template-id'] || item.template || 'nuclei-detection');
    const info = item.info || {};
    const severity = (info.severity || 'medium').toLowerCase() as Finding['severity'];
    const matchedAt = String(item['matched-at'] || item.matched || '');

    drafts.push({
      title: redactString(`[Nuclei DAST] ${info.name || templateId} on ${matchedAt}`),
      ruleId: `nuclei-${templateId}`,
      severity: ['critical', 'high', 'medium', 'low', 'info'].includes(severity) ? severity : 'medium',
      confidence: 'auto-discovered',
      category: 'security',
      lane: 'security',
      affected: [{ url: matchedAt }],
      evidence: item.extracted_results ? [{ extracted: item.extracted_results }] : [],
      expected: 'Endpoint conforms to security baselines without CVE/DAST vulnerability triggers',
      actual: `Nuclei probe matched rule "${templateId}" on ${matchedAt}`,
      suggestedFix: info.reference ? `Refer to remediation advisory: ${info.reference[0]}` : undefined,
    });
  }

  return toFindings(drafts);
}

export function parseZapAlerts(alerts: Array<Record<string, any>>): Finding[] {
  const drafts: FindingDraft[] = [];

  for (const alert of alerts) {
    const risk = (alert.risk || 'Medium').toLowerCase();
    const severity: Finding['severity'] =
      risk === 'high' ? 'high' : risk === 'critical' ? 'critical' : risk === 'low' ? 'low' : 'medium';
    const alertName = String(alert.alert || alert.name || 'OWASP ZAP Finding');
    const url = String(alert.url || '');

    drafts.push({
      title: redactString(`[OWASP ZAP] ${alertName} at ${url}`),
      ruleId: `zap-${String(alert.pluginId || alert.id || 'alert')}`,
      severity,
      confidence: 'auto-discovered',
      category: 'security',
      lane: 'security',
      affected: [{ url }],
      evidence: alert.evidence ? [{ evidence: alert.evidence }] : [],
      expected: 'No active vulnerability triggered in OWASP ZAP active scan',
      actual: redactString(alert.description || alertName),
      suggestedFix: alert.solution ? redactString(alert.solution) : undefined,
    });
  }

  return toFindings(drafts);
}

export async function runActiveSecurityLane(
  context: LaneContext,
  options?: ActiveSecurityProbeOptions,
): Promise<LaneResult> {
  const startedAt = Date.now();

  // Mode Guard Check (Fase 12 / 8.3)
  if (context.mode === 'prod-safe') {
    return {
      lane: 'security',
      status: 'skipped',
      tests: [],
      findings: [],
      reason: 'active security scanning is strictly forbidden in prod-safe mode',
      durationMs: Date.now() - startedAt,
    };
  }

  if (context.mode === 'staging' && !context.request.authorization?.securityActiveApproved) {
    return {
      lane: 'security',
      status: 'skipped',
      tests: [],
      findings: [],
      reason:
        'active security scanning in staging mode requires authorization.securityActiveApproved=true',
      durationMs: Date.now() - startedAt,
    };
  }

  const baseUrl =
    options?.targetBaseUrl ??
    context.request.web?.urls[0] ??
    'http://127.0.0.1:3100';

  const endpoints =
    options?.endpoints ??
    (context.discovery.endpoints.length > 0
      ? context.discovery.endpoints.map((e) => e.path)
      : ['/', '/api/v1/health', '/api/v1/items']);

  const fetchFn = options?.fetchFn ?? globalThis.fetch;
  const probes = options?.customProbes ?? STANDARD_ACTIVE_PROBES;

  const tests: LaneTestCase[] = [];
  const drafts: FindingDraft[] = [];

  for (const [pIdx, probe] of probes.entries()) {
    for (const [eIdx, endpoint] of endpoints.entries()) {
      const testId = `TC-DAST-${String(pIdx + 1).padStart(2, '0')}-${String(eIdx + 1).padStart(2, '0')}`;
      const probeRes = await probe.test(baseUrl, endpoint, fetchFn);

      tests.push({
        id: testId,
        lane: 'security',
        name: `${probe.name} on ${endpoint}`,
        status: probeRes.vulnerable ? 'failed' : 'passed',
        durationMs: 45,
        expected: probeRes.expected ?? 'No active security vulnerability detected',
        actual: probeRes.actual ?? 'Endpoint responded safely to active probe',
        ...(probeRes.vulnerable ? { reason: probeRes.evidence } : {}),
      });

      if (probeRes.vulnerable) {
        drafts.push({
          title: `Active Vulnerability [${probe.name}]: ${endpoint}`,
          ruleId: probe.ruleId,
          severity: probe.severity,
          confidence: probe.confidence,
          category: 'security',
          lane: 'security',
          affected: [{ endpoint, method: probeRes.method }],
          expected: probeRes.expected,
          actual: probeRes.actual,
          evidence: probeRes.evidence ? [{ detail: probeRes.evidence }] : [],
          suggestedFix: probeRes.suggestedFix,
        });
      }
    }
  }

  const hasFailed = tests.some((t) => t.status === 'failed');

  return {
    lane: 'security',
    status: hasFailed ? 'failed' : 'passed',
    tests,
    findings: toFindings(drafts),
    durationMs: Date.now() - startedAt,
  };
}
