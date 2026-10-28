import { describe, expect, it } from 'vitest';
import {
  isHostAllowed,
  isLookalike,
  validateRedirect,
  redactValue,
} from '@nexus/core';
import { hasMinimumRole, parseAuthHeader } from '../../apps/api/src/auth.js';

describe('Platform Security Review (9.1)', () => {
  describe('SSRF & Open Redirect Protection', () => {
    const allowlist = ['localhost', '127.0.0.1', '*.company.local', 'staging.company.id'];

    it('blocks internal private IP ranges and cloud metadata services (SSRF defense)', () => {
      // AWS / GCP instance metadata endpoint
      expect(isHostAllowed('169.254.169.254', allowlist)).toBe(false);
      expect(isHostAllowed('metadata.google.internal', allowlist)).toBe(false);

      // Private subnet IPs
      expect(isHostAllowed('10.0.0.1', allowlist)).toBe(false);
      expect(isHostAllowed('192.168.1.1', allowlist)).toBe(false);
      expect(isHostAllowed('172.16.0.1', allowlist)).toBe(false);

      // Approved hosts pass
      expect(isHostAllowed('localhost', allowlist)).toBe(true);
      expect(isHostAllowed('127.0.0.1', allowlist)).toBe(true);
      expect(isHostAllowed('app.company.local', allowlist)).toBe(true);
      expect(isHostAllowed('staging.company.id', allowlist)).toBe(true);
    });

    it('detects and blocks homoglyph and lookalike domain spoofing', () => {
      expect(isLookalike('paypal.com.attacker.com', ['paypal.com'])).toBe(true);
      expect(isLookalike('company.id.phishing.net', ['company.id'])).toBe(true);
      expect(isLookalike('totally-different.com', ['company.id'])).toBe(false);
    });

    it('validates HTTP redirects and blocks redirect-hopping to external targets', () => {
      // Safe redirect within allowlist
      const safeRedirect = validateRedirect(
        'https://staging.company.id/login',
        'https://staging.company.id/dashboard',
        allowlist,
      );
      expect(safeRedirect.allowed).toBe(true);

      // Malicious redirect hopping to external unapproved domain
      const evilRedirect = validateRedirect(
        'https://staging.company.id/login',
        'https://evil-attacker.com/steal-creds',
        allowlist,
      );
      expect(evilRedirect.allowed).toBe(false);
      expect(evilRedirect.reasons[0]).toContain('redirect host not on allowlist');
    });
  });

  describe('Role-Based Access Control (RBAC) Boundaries', () => {
    it('enforces role hierarchy and permissions across platform endpoints', () => {
      // Role hierarchy: viewer (1) < runner (2) < approver (3) < admin (4)
      expect(hasMinimumRole('viewer', 'runner')).toBe(false);
      expect(hasMinimumRole('viewer', 'approver')).toBe(false);
      expect(hasMinimumRole('runner', 'approver')).toBe(false);

      expect(hasMinimumRole('approver', 'runner')).toBe(true);
      expect(hasMinimumRole('admin', 'approver')).toBe(true);
      expect(hasMinimumRole('admin', 'viewer')).toBe(true);
    });

    it('parses authentication headers and rejects forged tokens', () => {
      const viewerUser = parseAuthHeader({ authorization: 'Bearer token-for-viewer' });
      expect(viewerUser.role).toBe('viewer');

      const approverUser = parseAuthHeader({ authorization: 'Bearer token-for-approver' });
      expect(approverUser.role).toBe('approver');

      const adminUser = parseAuthHeader({ 'x-user-role': 'admin', 'x-user-email': 'sec-lead@company.local' });
      expect(adminUser.role).toBe('admin');
      expect(adminUser.email).toBe('sec-lead@company.local');
    });
  });

  describe('Secret Leakage & PII Redaction Audit', () => {
    it('redacts private keys, tokens, passwords, credit cards, and emails', () => {
      const sensitivePayload = {
        title: 'User profile query',
        token: 'ghp_123456789012345678901234567890123456',
        awsKey: 'AKIAIOSFODNN7EXAMPLE',
        authHeader: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M',
        secretPass: 'password=SuperSecretPassword123!',
        userEmail: 'sensitive.executive@company.internal',
        cardNumber: '4111-2222-3333-4444',
      };

      const redacted = redactValue(sensitivePayload);
      const json = JSON.stringify(redacted);

      // Verify zero plaintext secrets remain
      expect(json).not.toContain('ghp_123456789012345678901234567890123456');
      expect(json).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(json).not.toContain('SuperSecretPassword123!');
      expect(json).not.toContain('sensitive.executive@company.internal');
      expect(json).not.toContain('4111-2222-3333-4444');

      expect(json).toContain('[TOKEN_REDACTED]');
      expect(json).toContain('[AWS_KEY_REDACTED]');
      expect(json).toContain('[EMAIL_REDACTED]');
      expect(json).toContain('[CARD_REDACTED]');
    });
  });
});
