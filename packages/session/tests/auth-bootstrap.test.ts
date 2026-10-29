import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapAuthenticatedSession } from '../src/index.js';

describe('AuthBootstrapper - Generic Multi-Field Form Login & Session Bootstrap', () => {
  let server: Server;
  let baseUrl: string;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-auth-test-'));

    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

      if (url.pathname === '/login') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <body>
              <h2>Login Portal</h2>
              <form action="/do-login" method="POST">
                <div>
                  <label for="user">Username</label>
                  <input type="text" name="username" id="user" />
                </div>
                <div>
                  <label for="pass">Password</label>
                  <input type="password" name="password" id="pass" />
                </div>
                <div>
                  <label for="access">Tipe Akses</label>
                  <select name="access" id="access">
                    <option value="Eksternal">Eksternal</option>
                    <option value="Internal">Internal</option>
                  </select>
                </div>
                <div>
                  <button type="submit" id="btn-login">Masuk</button>
                </div>
              </form>
            </body>
          </html>
        `);
        return;
      }

      if (url.pathname === '/do-login' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          const params = new URLSearchParams(body);
          const u = params.get('username');
          const p = params.get('password');
          const a = params.get('access');

          if (u === 'qa_admin' && p === 'SuperSecret123!' && a === 'Internal') {
            res.writeHead(302, {
              Location: '/dashboard',
              'Set-Cookie': 'auth_session=token_abc12345; Path=/; HttpOnly',
            });
            res.end();
          } else {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end('Unauthorized');
          }
        });
        return;
      }

      if (url.pathname === '/dashboard') {
        const cookie = req.headers.cookie || '';
        if (cookie.includes('auth_session=token_abc12345')) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<h1>Welcome to Admin Dashboard</h1>');
        } else {
          res.writeHead(302, { Location: '/login' });
          res.end();
        }
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    });

    const { promise, resolve } = Promise.withResolvers<void>();
    server.listen(0, '127.0.0.1', () => resolve());
    await promise;

    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    const { promise, resolve } = Promise.withResolvers<void>();
    server.close(() => resolve());
    await promise;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns used: false when no auth config is provided', async () => {
    const result = await bootstrapAuthenticatedSession({
      targetUrl: baseUrl,
      artifactDir: tmpDir,
    });
    expect(result.used).toBe(false);
  });

  it('bootstraps session directly from raw cookies without browser navigation', async () => {
    const result = await bootstrapAuthenticatedSession({
      targetUrl: baseUrl,
      auth: {
        cookies: 'laravel_session=session_token_xyz999; XSRF-TOKEN=token_csrf_123',
      },
      artifactDir: join(tmpDir, 'raw-cookies'),
    });

    expect(result.used).toBe(true);
    expect(result.cookieHeader).toContain('laravel_session=session_token_xyz999');
    expect(result.storageStatePath).toBeDefined();
    expect(existsSync(result.storageStatePath!)).toBe(true);

    const savedState = JSON.parse(readFileSync(result.storageStatePath!, 'utf8')) as {
      cookies: Array<{ name: string; value: string }>;
    };
    expect(savedState.cookies.some((c) => c.name === 'laravel_session')).toBe(true);
  });

  it('successfully logs in via Playwright filling username, password, and selecting dropdown option', async () => {
    const env = {
      QA_VAULT_TEST_APP: JSON.stringify({
        username: 'qa_admin',
        password: 'SuperSecret123!',
      }),
    };

    const result = await bootstrapAuthenticatedSession({
      targetUrl: baseUrl,
      auth: {
        ref: 'vault:test/app',
        loginUrl: '/login',
        formFields: [{ target: 'select[name="access"]', action: 'select', value: 'Internal' }],
      },
      artifactDir: join(tmpDir, 'form-login'),
      env,
      headless: true,
      timeoutMs: 15_000,
    });

    expect(result.used).toBe(true);
    expect(result.cookieHeader).toContain('auth_session=token_abc12345');
    expect(result.storageStatePath).toBeDefined();
    expect(existsSync(result.storageStatePath!)).toBe(true);
    expect(result.finalUrl).toContain('/dashboard');
  });

  it('falls back gracefully and logs error when vault credentials are missing from env', async () => {
    const logs: string[] = [];
    const result = await bootstrapAuthenticatedSession({
      targetUrl: baseUrl,
      auth: {
        ref: 'vault:non/existent',
        loginUrl: '/login',
      },
      artifactDir: join(tmpDir, 'missing-vault'),
      env: {},
      timeoutMs: 500,
      onLog: (msg) => logs.push(msg),
    });

    expect(logs.some((l) => l.includes('Kredensial vault tidak ditemukan di process.env'))).toBe(
      true,
    );
    expect(result.warnings?.some((w) => w.includes('Kredensial vault tidak ditemukan'))).toBe(true);
  });
});
