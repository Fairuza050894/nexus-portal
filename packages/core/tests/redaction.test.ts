import { describe, expect, it } from 'vitest';
import { redactString, redactValue } from '../src/index.js';

describe('redaction', () => {
  it('redacts secret assignments, authorization headers, emails, and card numbers', () => {
    const text =
      'password=hunter2 Authorization: Bearer abc mail qa@company.id card 4111 1111 1111 1111';
    const redacted = redactString(text);
    expect(redacted).not.toContain('hunter2');
    expect(redacted).not.toContain('qa@company.id');
    expect(redacted).not.toContain('4111');
    expect(redacted).toContain('[REDACTED]');
  });

  it('redacts nested request values without mutating the input', () => {
    const input = {
      auth: { ref: 'vault:qa/user' },
      note: 'token=abc123',
      email: 'person@example.com',
    };
    const output = redactValue(input);
    expect(output.note).toBe('token=[REDACTED]');
    expect(output.email).toBe('[EMAIL_REDACTED]');
    expect(output.auth.ref).toBe('vault:qa/user');
    expect(input.note).toBe('token=abc123');
  });

  it('redacts provider tokens even without key=value syntax', () => {
    const text =
      'failed with ghp_123456789012345678901234567890123456 and AKIA1234567890ABCDEF and Bearer abcdefghijklmnopqrstuvwx';
    const redacted = redactString(text);
    expect(redacted).not.toContain('ghp_123456789012345678901234567890123456');
    expect(redacted).not.toContain('AKIA1234567890ABCDEF');
    expect(redacted).not.toContain('abcdefghijklmnopqrstuvwx');
    expect(redacted).toContain('[TOKEN_REDACTED]');
    expect(redacted).toContain('[AWS_KEY_REDACTED]');
  });
});
