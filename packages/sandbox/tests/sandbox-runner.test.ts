import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runSandbox, type ChildHandle, type SandboxDeps } from '../src/index.js';

const FIXTURE = fileURLToPath(new URL('../../../fixtures/sample-todo-api', import.meta.url));
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface Mock {
  deps: SandboxDeps;
  calls: string[];
  child: ChildHandle;
  removeDir: (path: string) => void;
}

function createMock(): Mock {
  const calls: string[] = [];
  let clock = 0;
  const child: ChildHandle = {
    pid: 4242,
    exitCode: null,
    kill: vi.fn(() => {
      child.exitCode = 0;
      return true;
    }),
  };
  const removeDir = vi.fn((path: string) => rmSync(path, { recursive: true, force: true }));
  const deps: SandboxDeps = {
    env: {
      PATH: process.env.PATH ?? '/usr/bin',
      HOME: process.env.HOME ?? '/tmp',
      GITHUB_TOKEN: 'testtoken123',
    },
    exec: vi.fn(async (command: string) => {
      calls.push(`exec:${command}`);
      return { stdout: '', stderr: '' };
    }),
    spawnServer: vi.fn((command: string) => {
      calls.push(`spawn:${command}`);
      return child;
    }),
    fetch: vi.fn(async () => ({ ok: true, status: 200 })),
    sleep: vi.fn(async (ms: number) => {
      clock += ms;
    }),
    now: () => clock,
    mkdtemp: () => {
      const dir = mkdtempSync(join(tmpdir(), 'qa-runner-test-'));
      tempDirs.push(dir);
      return dir;
    },
    removeDir,
    copyDir: (source, destination) => cpSync(source, destination, { recursive: true }),
    exists: (path) => existsSync(path),
    killGroup: vi.fn((_pid, signal) => {
      calls.push(`kill:${signal}`);
      if (signal === 'SIGTERM') child.exitCode = 0;
    }),
  };
  return { deps, calls, child, removeDir };
}

describe('sandbox runner', () => {
  it('starts a trusted local app, checks health, and tears the process down', async () => {
    const { deps, calls, removeDir } = createMock();
    const result = await runSandbox(
      { localPath: FIXTURE, allowLocalProcess: true, port: 3100 },
      deps,
    );

    expect(result.ok).toBe(true);
    expect(result.healthOk).toBe(true);
    expect(result.isolation).toBe('process');
    expect(result.stack).toBe('node');
    expect(result.appUrl).toBe('http://127.0.0.1:3100/health');
    expect(result.teardown.ok).toBe(true);
    expect(calls).toContain('spawn:node server.js');
    expect(calls).toContain('kill:SIGTERM');
    expect(result.logs.some((line) => line.includes('health'))).toBe(true);
    expect(removeDir).toHaveBeenCalled();
  });

  it('injects the token only into the clone environment and never runs installs with it', async () => {
    const { deps } = createMock();
    const exec = vi.fn(
      async (command: string, options: { cwd: string; env: Record<string, string> }) => {
        if (command.startsWith('git clone')) {
          expect(options.env.GITHUB_TOKEN).toBe('testtoken123');
          mkdirSync(join(options.cwd, 'repo'), { recursive: true });
          writeFileSync(join(options.cwd, 'repo', 'package.json'), '{}');
          return { stdout: 'cloned\n', stderr: '' };
        }
        expect(options.env.GITHUB_TOKEN).toBeUndefined();
        return { stdout: '', stderr: '' };
      },
    );
    deps.exec = exec;

    const result = await runSandbox(
      {
        repoUrl: 'https://git.example.com/team/app.git',
        tokenRef: 'vault:git/readonly',
        allowLocalProcess: true,
        isolation: 'process',
        port: 3000,
      },
      { ...deps, env: { ...deps.env, QA_VAULT_GIT_READONLY: 'testtoken123' } },
    );

    expect(result.ok).toBe(true);
    expect(exec).toHaveBeenCalled();
  });

  it('reports failure and still cleans the workdir when cloning fails', async () => {
    const { deps, removeDir } = createMock();
    deps.exec = vi.fn(async () => {
      throw new Error('clone failed');
    });

    const result = await runSandbox(
      {
        repoUrl: 'https://git.example.com/team/app.git',
        allowLocalProcess: true,
        isolation: 'process',
      },
      deps,
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('sandbox stage failed');
    expect(result.error).toContain('clone failed');
    expect(result.logs.some((line) => line.includes('clone failed'))).toBe(true);
    expect(removeDir).toHaveBeenCalled();
  });

  it('runs remote repositories in a hardened container and removes it', async () => {
    const { deps, calls } = createMock();
    deps.exec = vi.fn(async (command: string) => {
      calls.push(`exec:${command}`);
      if (command.startsWith('docker info')) return { stdout: '27.0.0\n', stderr: '' };
      if (command.startsWith('docker run')) return { stdout: 'container123\n', stderr: '' };
      return { stdout: '', stderr: '' };
    });

    const result = await runSandbox(
      { localPath: FIXTURE, isolation: 'container', port: 3100 },
      deps,
    );

    expect(result.ok).toBe(true);
    expect(result.isolation).toBe('container');
    expect(result.containerId).toBe('container123');
    expect(result.teardown.ok).toBe(true);
    expect(calls.some((command) => command.includes('--memory 512m'))).toBe(true);
    expect(calls.some((command) => command.includes('--cap-drop ALL'))).toBe(true);
    expect(calls.some((command) => command.includes('--publish 127.0.0.1:3100:3100'))).toBe(true);
    expect(calls.some((command) => command.includes('docker rm --force'))).toBe(true);
    expect(deps.spawnServer).not.toHaveBeenCalled();
  });

  it('returns a health reason when the app never becomes healthy', async () => {
    const { deps } = createMock();
    deps.fetch = vi.fn(async () => {
      throw new Error('connection refused');
    });

    const result = await runSandbox(
      { localPath: FIXTURE, allowLocalProcess: true, healthTimeoutMs: 1000, port: 3100 },
      deps,
    );

    expect(result.ok).toBe(false);
    expect(result.healthOk).toBe(false);
    expect(result.reason).toContain('did not become healthy');
  });

  it('rejects process isolation for untrusted layouts', async () => {
    const { deps } = createMock();
    const result = await runSandbox({ localPath: FIXTURE, isolation: 'process' }, deps);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('trusted local fixtures');
  });
});
