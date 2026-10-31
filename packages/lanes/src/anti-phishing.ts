import { redactString, type Finding } from '@nexus/core';
import { toFindings } from './findings.js';
import type { FindingDraft } from './types.js';

export interface EmailPhishingDefenseInput {
  domain: string;
  spfRecord?: string;
  dmarcRecord?: string;
}

export interface WebPhishingDefenseInput {
  url: string;
  headers: Record<string, string>;
  forms?: Array<{
    action?: string;
    method?: string;
    hasPasswordInput?: boolean;
    inputs?: string[];
  }>;
  links?: string[];
  allowedHosts?: string[];
}

export interface PhishingDefenseEvaluation {
  domain: string;
  scorePercent: number;
  emailProtected: boolean;
  webProtected: boolean;
  issues: string[];
  findings: Finding[];
}

export function evaluateEmailPhishingDefenses(input: EmailPhishingDefenseInput): {
  protected: boolean;
  issues: string[];
  drafts: FindingDraft[];
} {
  const issues: string[] = [];
  const drafts: FindingDraft[] = [];
  const domain = input.domain.toLowerCase();

  // 1. Evaluate SPF record
  if (!input.spfRecord) {
    issues.push(`Missing SPF record on ${domain} (permits unauthorized email senders)`);
    drafts.push({
      title: redactString(`[Anti-Phishing] Missing SPF Record on ${domain}`),
      ruleId: 'phishing:spf-missing',
      severity: 'high',
      confidence: 'verified',
      category: 'security',
      lane: 'security',
      affected: [{ domain }],
      expected: 'TXT record with valid SPF policy (e.g. "v=spf1 ... -all")',
      actual: 'No SPF TXT record detected for domain',
      suggestedFix: 'Publish an SPF TXT record designating authorized mail servers ending with "-all" hard-fail',
    });
  } else if (input.spfRecord.includes('+all')) {
    issues.push(`Critical SPF misconfiguration on ${domain}: "+all" allows any IP on the internet to send email`);
    drafts.push({
      title: redactString(`[Anti-Phishing] Critical SPF +all Misconfiguration on ${domain}`),
      ruleId: 'phishing:spf-allow-all',
      severity: 'critical',
      confidence: 'verified',
      category: 'security',
      lane: 'security',
      affected: [{ domain }],
      expected: 'SPF policy should end with "-all" or "~all"',
      actual: `Detected dangerous "+all" qualifier: "${input.spfRecord}"`,
      suggestedFix: 'Replace "+all" with "-all" in SPF TXT record immediately',
    });
  }

  // 2. Evaluate DMARC record
  if (!input.dmarcRecord) {
    issues.push(`Missing DMARC policy on _dmarc.${domain} (leaves brand vulnerable to CEO fraud & spoofing)`);
    drafts.push({
      title: redactString(`[Anti-Phishing] Missing DMARC Policy on ${domain}`),
      ruleId: 'phishing:dmarc-missing',
      severity: 'high',
      confidence: 'verified',
      category: 'security',
      lane: 'security',
      affected: [{ domain }],
      expected: 'Valid DMARC TXT record with p=reject or p=quarantine',
      actual: 'No DMARC record found at _dmarc.' + domain,
      suggestedFix: 'Deploy a DMARC policy with "v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s;" to prevent domain spoofing',
    });
  } else {
    const pMatch = input.dmarcRecord.match(/\bp\s*=\s*([a-zA-Z]+)/i);
    const policy = pMatch ? pMatch[1].toLowerCase() : 'none';

    if (policy === 'none') {
      issues.push(`Weak DMARC policy on ${domain} (p=none does not block phishing emails)`);
      drafts.push({
        title: redactString(`[Anti-Phishing] Ineffective DMARC Policy (p=none) on ${domain}`),
        ruleId: 'phishing:dmarc-p-none',
        severity: 'medium',
        confidence: 'verified',
        category: 'security',
        lane: 'security',
        affected: [{ domain }],
        expected: 'Enforced DMARC policy (p=quarantine or p=reject)',
        actual: `Policy is set to monitoring only (p=none): "${input.dmarcRecord}"`,
        suggestedFix: 'Graduate DMARC policy from p=none to p=quarantine or p=reject',
      });
    }
  }

  return {
    protected: issues.length === 0,
    issues,
    drafts,
  };
}

export function evaluateWebPhishingDefenses(input: WebPhishingDefenseInput): {
  protected: boolean;
  issues: string[];
  drafts: FindingDraft[];
} {
  const issues: string[] = [];
  const drafts: FindingDraft[] = [];

  const headers = Object.fromEntries(
    Object.entries(input.headers).map(([k, v]) => [k.toLowerCase(), v]),
  );

  const csp = headers['content-security-policy'] || '';
  const xfo = headers['x-frame-options'] || '';

  const hasFrameAncestors = /frame-ancestors\s+['"]?(?:'none'|'self'|none|self)/i.test(csp);
  const hasXfo = /^(?:DENY|SAMEORIGIN)$/i.test(xfo.trim());

  // Clickjacking / Phishing Overlay Protection
  if (!hasFrameAncestors && !hasXfo) {
    issues.push(`Page vulnerable to clickjacking / credential overlay phishing (Missing XFO and CSP frame-ancestors)`);
    drafts.push({
      title: redactString(`[Anti-Phishing] Clickjacking & Credential Overlay Risk on ${input.url}`),
      ruleId: 'phishing:clickjacking-framing-allowed',
      severity: 'high',
      confidence: 'verified',
      category: 'security',
      lane: 'security',
      affected: [{ url: input.url }],
      expected: 'X-Frame-Options: DENY/SAMEORIGIN or Content-Security-Policy: frame-ancestors \'self\'',
      actual: 'Framing allowed; attackers can embed this page in a malicious phishing iframe overlay',
      suggestedFix: 'Send "X-Frame-Options: DENY" and "Content-Security-Policy: frame-ancestors \'self\'" headers',
    });
  }

  // Login Form Action Hijacking Protection
  const allowed = (input.allowedHosts ?? []).map((h) => h.toLowerCase());
  for (const form of input.forms ?? []) {
    if (form.hasPasswordInput && form.action) {
      try {
        const actionUrl = new URL(form.action, input.url);
        const pageUrl = new URL(input.url);

        const isSameOrigin = actionUrl.origin === pageUrl.origin;
        const isAllowed = allowed.some((h) => actionUrl.hostname.includes(h) || h === '*');

        if (!isSameOrigin && !isAllowed) {
          issues.push(`Credential harvesting risk: Login form posts passwords to untrusted external origin: ${actionUrl.origin}`);
          drafts.push({
            title: redactString(`[Anti-Phishing] Login Form Submits Credentials to External Origin: ${actionUrl.origin}`),
            ruleId: 'phishing:form-action-external',
            severity: 'critical',
            confidence: 'verified',
            category: 'security',
            lane: 'security',
            affected: [{ url: input.url, formAction: form.action }],
            expected: 'Login and authentication forms must submit only to trusted same-origin endpoints',
            actual: `Form submits credentials to external host: ${actionUrl.host}`,
            suggestedFix: 'Point login form action to internal relative URL or trusted authentication gateway',
          });
        }
      } catch {
        // ignore malformed URLs
      }
    }
  }

  return {
    protected: issues.length === 0,
    issues,
    drafts,
  };
}

export function evaluatePhishingDefenses(options: {
  domain: string;
  url?: string;
  spfRecord?: string;
  dmarcRecord?: string;
  headers?: Record<string, string>;
  forms?: Array<{ action?: string; method?: string; hasPasswordInput?: boolean }>;
  allowedHosts?: string[];
}): PhishingDefenseEvaluation {
  const emailRes = evaluateEmailPhishingDefenses({
    domain: options.domain,
    spfRecord: options.spfRecord,
    dmarcRecord: options.dmarcRecord,
  });

  const webRes = evaluateWebPhishingDefenses({
    url: options.url ?? `https://${options.domain}`,
    headers: options.headers ?? {},
    forms: options.forms,
    allowedHosts: options.allowedHosts,
  });

  const allIssues = [...emailRes.issues, ...webRes.issues];
  const allDrafts = [...emailRes.drafts, ...webRes.drafts];

  const totalChecks = 4;
  const passedChecks = Math.max(0, totalChecks - allIssues.length);
  const scorePercent = Math.round((passedChecks / totalChecks) * 100);

  return {
    domain: options.domain,
    scorePercent,
    emailProtected: emailRes.protected,
    webProtected: webRes.protected,
    issues: allIssues,
    findings: toFindings(allDrafts),
  };
}
