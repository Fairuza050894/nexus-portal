import { describe, expect, it } from 'vitest';
import {
  isHostAllowed,
  isLookalike,
  prodSafeBlocksMutation,
  resolveHost,
  validateRedirect,
  validateRunRequest,
} from '../src/index.js';

const baseRequest = {
  name: 'pilot run',
  mode: 'sandbox',
  web: { urls: ['http://127.0.0.1:3100/health'] },
  lanes: { e2e: true, api: true },
};

describe('mode guard', () => {
  it('allows a sandbox request with an allowlisted local target', () => {
    const verdict = validateRunRequest(baseRequest);
    expect(verdict.allowed).toBe(true);
    expect(verdict.runRequest?.mode).toBe('sandbox');
  });

  it('rejects non-allowlisted hosts in staging', () => {
    const verdict = validateRunRequest({
      ...baseRequest,
      mode: 'staging',
      web: { urls: ['http://evil.example.com'] },
      authorization: { ownerConfirmed: true },
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reasons.some((reason) => reason.includes('not on allowlist'))).toBe(true);
  });

  it('rejects lookalike hosts', () => {
    const verdict = validateRunRequest({
      ...baseRequest,
      mode: 'staging',
      web: { urls: ['http://localhost.evil.com'] },
      authorization: { ownerConfirmed: true },
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reasons.some((reason) => reason.includes('lookalike'))).toBe(true);
  });

  it('supports wildcard allowlist entries for subdomains only', () => {
    expect(isHostAllowed('app.local', ['*.local'])).toBe(true);
    expect(isHostAllowed('local', ['*.local'])).toBe(false);
    expect(isHostAllowed('app.local.evil.com', ['*.local'])).toBe(false);
  });

  it('detects deceptive hosts that contain an allowlisted name', () => {
    expect(isLookalike('staging-qa-pilot.local.evil.com', ['staging-qa-pilot.local'])).toBe(true);
    expect(isLookalike('staging-qa-pilot.local', ['staging-qa-pilot.local'])).toBe(false);
  });

  it('rejects staging without authorization', () => {
    const verdict = validateRunRequest({ ...baseRequest, mode: 'staging' });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reasons.some((reason) => reason.includes('authorization'))).toBe(true);
  });

  it('rejects prod-safe without approvedBy', () => {
    const verdict = validateRunRequest({
      ...baseRequest,
      mode: 'prod-safe',
      authorization: { ownerConfirmed: true },
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reasons.some((reason) => reason.includes('approvedBy'))).toBe(true);
  });

  it('accepts prod-safe with ownerConfirmed + approvedBy + allowlisted host', () => {
    const verdict = validateRunRequest({
      ...baseRequest,
      mode: 'prod-safe',
      authorization: { ownerConfirmed: true, approvedBy: 'qa-lead@company.id' },
    });
    expect(verdict.allowed).toBe(true);
  });

  it('blocks the perf lane in prod-safe and unapproved staging', () => {
    const prod = validateRunRequest({
      ...baseRequest,
      mode: 'prod-safe',
      lanes: { perf: true },
      authorization: { ownerConfirmed: true, approvedBy: 'qa-lead' },
    });
    expect(prod.allowed).toBe(false);
    expect(prod.reasons.some((reason) => reason.includes('perf lane'))).toBe(true);

    const staging = validateRunRequest({
      ...baseRequest,
      mode: 'staging',
      lanes: { perf: true },
      authorization: { ownerConfirmed: true },
    });
    expect(staging.allowed).toBe(false);
    expect(staging.reasons.some((reason) => reason.includes('perfApproved'))).toBe(true);
  });

  it('rejects raw secrets but accepts secret references', () => {
    const raw = validateRunRequest({
      ...baseRequest,
      auth: { ref: 'vault:qa/user', password: 'P@ssw0rd' },
    });
    expect(raw.allowed).toBe(false);
    expect(raw.reasons.some((reason) => reason.includes('raw secret'))).toBe(true);

    const gitAllowlist = ['127.0.0.1', 'git.example.com'];
    const referenced = validateRunRequest(
      {
        ...baseRequest,
        repo: { url: 'https://git.example.com/app.git', tokenRef: 'vault:git/readonly' },
      },
      { allowlist: gitAllowlist },
    );
    expect(referenced.allowed).toBe(true);

    const rawTokenRef = validateRunRequest(
      {
        ...baseRequest,
        repo: { url: 'https://git.example.com/app.git', tokenRef: 'ghp_abcdefghijklmnop' },
      },
      { allowlist: gitAllowlist },
    );
    expect(rawTokenRef.allowed).toBe(false);
  });

  it('rejects requests without a target and localPath outside sandbox', () => {
    const noTarget = validateRunRequest({ name: 'empty' });
    expect(noTarget.allowed).toBe(false);
    expect(noTarget.reasons.some((reason) => reason.includes('at least one target'))).toBe(true);

    const localStaging = validateRunRequest({
      name: 'local',
      mode: 'staging',
      repo: { localPath: 'fixtures/sample-todo-api' },
      authorization: { ownerConfirmed: true },
    });
    expect(localStaging.allowed).toBe(false);
    expect(localStaging.reasons.some((reason) => reason.includes('localPath'))).toBe(true);
  });

  it('rejects modes disabled in config', () => {
    const verdict = validateRunRequest(baseRequest, { allowedModes: ['staging'] });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reasons.some((reason) => reason.includes('not enabled'))).toBe(true);
  });

  it('checks redirect hosts against the allowlist', () => {
    expect(validateRedirect('http://127.0.0.1:3100', '/health', ['127.0.0.1']).allowed).toBe(true);
    const blocked = validateRedirect('http://127.0.0.1:3100', 'http://evil.example.com', [
      '127.0.0.1',
    ]);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reasons[0]).toContain('redirect');
  });

  it('parses ssh-style repository hosts', () => {
    expect(resolveHost('git@git.company.id:team/app.git')).toBe('git.company.id');
    expect(resolveHost('https://git.company.id/team/app.git')).toBe('git.company.id');
  });

  it('blocks state-changing methods in prod-safe observe-only', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const result = prodSafeBlocksMutation(method, '/api/orders');
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('skipped by mode');
    }
    expect(prodSafeBlocksMutation('GET', '/api/orders').blocked).toBe(false);
  });
});
