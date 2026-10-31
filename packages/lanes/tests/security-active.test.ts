import { describe, expect, it } from 'vitest';
import { QaConfigSchema, RunRequestSchema } from '@nexus/core';
import {
  runActiveSecurityLane,
  STANDARD_ACTIVE_PROBES,
  generateNucleiTemplate,
  parseNucleiJsonFindings,
  parseZapAlerts,
} from '../src/index.js';
import type { LaneContext } from '../src/types.js';

describe('Active DAST Security Probing Engine (Fase 12)', () => {
  function makeContext(
    mode: 'sandbox' | 'staging' | 'prod-safe',
    securityActiveApproved: boolean = false,
  ): LaneContext {
    return {
      runId: 'RUN-SEC-ACTIVE-01',
      runDir: '/tmp',
      mode,
      scope: 'quick',
      request: RunRequestSchema.parse({
        name: 'active security dast test',
        mode,
        web: { urls: ['http://127.0.0.1:3100/'] },
        authorization:
          mode !== 'sandbox'
            ? {
                ownerConfirmed: true,
                approvedBy: 'SecOps Lead',
                securityActiveApproved,
              }
            : undefined,
      }),
      config: QaConfigSchema.parse({ env: 'test', allowlist: ['127.0.0.1'] }),
      discovery: {
        pages: [],
        endpoints: [
          { path: '/api/v1/search', method: 'GET', source: 'traffic' },
          { path: '/api/v1/view', method: 'GET', source: 'traffic' },
        ],
        traffic: [],
        warnings: [],
        crawl: {
          robots: { found: false, rules: 0 },
          budget: { requests: 0, maxRequests: 0, exhausted: false },
          circuit: { open: false },
        },
        auth: { used: false },
      },
      appMap: {
        schemaVersion: '1.0',
        generatedAt: new Date().toISOString(),
        nodes: [],
        edges: [],
        stats: { pages: 0, endpoints: 0, code: 0, edges: 0, highRisk: 0, changed: 0 },
      },
    };
  }

  describe('Standard Active Security Probes', () => {
    it('detects SQL injection when response leaks database syntax error', async () => {
      const sqliProbe = STANDARD_ACTIVE_PROBES.find((p) => p.category === 'sqli')!;
      expect(sqliProbe).toBeDefined();

      const vulnerableFetch = async () =>
        new Response(
          'Fatal error: Uncaught mysqli_sql_exception: You have an error in your SQL syntax near ...',
          { status: 500 },
        );

      const res = await sqliProbe.test(
        'http://127.0.0.1:3100',
        '/api/v1/search',
        vulnerableFetch as unknown as typeof fetch,
      );

      expect(res.vulnerable).toBe(true);
      expect(res.evidence).toContain('SQL syntax');
      expect(res.suggestedFix).toContain('parameterized queries');
    });

    it('detects Reflected XSS when canary tag is reflected unescaped in text/html', async () => {
      const xssProbe = STANDARD_ACTIVE_PROBES.find((p) => p.category === 'xss')!;
      expect(xssProbe).toBeDefined();

      const vulnerableFetch = async () =>
        new Response(
          '<html><body><h1>Search Results for <nx-xss-canary-tag></h1></body></html>',
          {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          },
        );

      const res = await xssProbe.test(
        'http://127.0.0.1:3100',
        '/search',
        vulnerableFetch as unknown as typeof fetch,
      );

      expect(res.vulnerable).toBe(true);
      expect(res.payloadSent).toBe('<nx-xss-canary-tag>');
      expect(res.suggestedFix).toContain('HTML encoding');
    });

    it('detects Directory Path Traversal when system file signature is returned', async () => {
      const traversalProbe = STANDARD_ACTIVE_PROBES.find((p) => p.category === 'traversal')!;
      expect(traversalProbe).toBeDefined();

      const vulnerableFetch = async () =>
        new Response('root:x:0:0:root:/root:/bin/bash\ndaemon:x:1:1:daemon:/usr/sbin:', {
          status: 200,
        });

      const res = await traversalProbe.test(
        'http://127.0.0.1:3100',
        '/download',
        vulnerableFetch as unknown as typeof fetch,
      );

      expect(res.vulnerable).toBe(true);
      expect(res.evidence).toContain('/etc/passwd');
    });

    it('detects Sensitive File Exposure when /.env is publicly accessible', async () => {
      const exposureProbe = STANDARD_ACTIVE_PROBES.find((p) => p.category === 'exposure')!;
      expect(exposureProbe).toBeDefined();

      const vulnerableFetch = async (url: string | URL | Request) => {
        if (String(url).includes('/.env')) {
          return new Response('APP_ENV=production\nDB_PASSWORD=superSecret12345\n', {
            status: 200,
          });
        }
        return new Response('Not Found', { status: 404 });
      };

      const res = await exposureProbe.test(
        'http://127.0.0.1:3100',
        '/',
        vulnerableFetch as unknown as typeof fetch,
      );

      expect(res.vulnerable).toBe(true);
      expect(res.endpoint).toBe('/.env');
    });

    it('detects Open Redirect vulnerability on 302 to external attacker domain', async () => {
      const redirectProbe = STANDARD_ACTIVE_PROBES.find((p) => p.category === 'open-redirect')!;
      expect(redirectProbe).toBeDefined();

      const vulnerableFetch = async () =>
        new Response(null, {
          status: 302,
          headers: {
            Location: 'https://evil-attacker.example.org/phishing',
          },
        });

      const res = await redirectProbe.test(
        'http://127.0.0.1:3100',
        '/login',
        vulnerableFetch as unknown as typeof fetch,
      );

      expect(res.vulnerable).toBe(true);
      expect(res.evidence).toContain('unvalidated external origin');
    });
  });

  describe('Nuclei & OWASP ZAP Parsers', () => {
    it('generates valid Nuclei YAML template', () => {
      const yaml = generateNucleiTemplate({
        id: 'exposed-actuator-env',
        name: 'Spring Boot Actuator Env Exposure',
        severity: 'high',
        path: '/actuator/env',
        matchers: [{ type: 'word', words: ['activeProfiles', 'propertySources'] }],
      });

      expect(yaml).toContain('id: exposed-actuator-env');
      expect(yaml).toContain('severity: high');
      expect(yaml).toContain('- "{{BaseURL}}/actuator/env"');
      expect(yaml).toContain('- "activeProfiles"');
    });

    it('parses Nuclei JSON output into normalized Findings', () => {
      const rawNuclei = [
        {
          'template-id': 'cve-2023-1234',
          info: {
            name: 'Sample Critical RCE',
            severity: 'critical',
            reference: ['https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2023-1234'],
          },
          'matched-at': 'http://127.0.0.1:3100/api/v1/exec',
        },
      ];

      const findings = parseNucleiJsonFindings(rawNuclei);
      expect(findings.length).toBe(1);
      expect(findings[0].severity).toBe('critical');
      expect(findings[0].ruleId).toBe('nuclei-cve-2023-1234');
      expect(findings[0].suggestedFix).toContain('CVE-2023-1234');
    });

    it('parses OWASP ZAP JSON alerts into normalized Findings', () => {
      const rawZap = [
        {
          id: '40012',
          alert: 'Cross Site Scripting (Reflected)',
          risk: 'High',
          url: 'http://127.0.0.1:3100/search',
          description: 'A parameter was reflected in response body without encoding',
          solution: 'Ensure all user input is HTML encoded',
        },
      ];

      const findings = parseZapAlerts(rawZap);
      expect(findings.length).toBe(1);
      expect(findings[0].severity).toBe('high');
      expect(findings[0].ruleId).toBe('zap-40012');
      expect(findings[0].suggestedFix).toBe('Ensure all user input is HTML encoded');
    });
  });

  describe('Active Security Lane Execution & Mode Guard', () => {
    it('strictly skips active security probing in prod-safe mode', async () => {
      const prodCtx = makeContext('prod-safe', true);
      const res = await runActiveSecurityLane(prodCtx);
      expect(res.status).toBe('skipped');
      expect(res.reason).toContain('strictly forbidden in prod-safe mode');
      expect(res.tests.length).toBe(0);
    });

    it('strictly skips active security probing in staging without securityActiveApproved', async () => {
      const stagingUnapproved = makeContext('staging', false);
      const res = await runActiveSecurityLane(stagingUnapproved);
      expect(res.status).toBe('skipped');
      expect(res.reason).toContain('requires authorization.securityActiveApproved=true');
    });

    it('executes active security probing in sandbox mode and flags vulnerabilities', async () => {
      const sandboxCtx = makeContext('sandbox');

      const mockFetch = async (url: string | URL | Request) => {
        const u = decodeURIComponent(String(url));
        // Simulate SQLi vulnerable on /api/v1/search
        if (u.includes('/api/v1/search') && u.includes("1'='1")) {
          return new Response('SQLSTATE[42000]: syntax error in SQL statement', { status: 500 });
        }
        return new Response('OK Safe Response', { status: 200 });
      };

      const res = await runActiveSecurityLane(sandboxCtx, {
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(res.status).toBe('failed');
      const failedTests = res.tests.filter((t) => t.status === 'failed');
      expect(failedTests.length).toBeGreaterThan(0);
      expect(res.findings.length).toBeGreaterThan(0);
      expect(res.findings[0].severity).toBe('critical');
      expect(res.findings[0].ruleId).toBe('dast-sql-injection');
    });

    it('passes cleanly when target has no active vulnerabilities', async () => {
      const sandboxCtx = makeContext('sandbox');
      const safeFetch = async () =>
        new Response('Safe clean application', {
          status: 200,
          headers: {
            'X-Frame-Options': 'DENY',
            'Content-Security-Policy': "frame-ancestors 'none'",
          },
        });

      const res = await runActiveSecurityLane(sandboxCtx, {
        fetchFn: safeFetch as unknown as typeof fetch,
      });

      expect(res.status).toBe('passed');
      expect(res.findings.length).toBe(0);
      expect(res.tests.every((t) => t.status === 'passed')).toBe(true);
    });
  });
});
