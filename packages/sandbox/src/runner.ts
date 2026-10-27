import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { redactString } from '@nexus/core';
import {
  detectStack,
  hasDockerfile,
  loadRecipe,
  recipeFor,
  type Recipe,
  type Stack,
} from './stack-detect.js';

export interface ChildHandle {
  pid?: number;
  exitCode: number | null;
  kill(signal?: NodeJS.Signals): boolean;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export interface FetchResponseLike {
  ok: boolean;
  status: number;
}

export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal; redirect?: 'follow' | 'manual' },
) => Promise<FetchResponseLike>;

export interface SandboxDeps {
  env: NodeJS.ProcessEnv;
  exec(
    command: string,
    options: { cwd: string; env: Record<string, string>; timeoutMs: number },
  ): Promise<CommandResult>;
  spawnServer(command: string, options: { cwd: string; env: Record<string, string> }): ChildHandle;
  fetch: FetchLike;
  sleep(ms: number): Promise<void>;
  now(): number;
  mkdtemp(): string;
  removeDir(path: string): void;
  copyDir(source: string, destination: string): void;
  exists(path: string): boolean;
  killGroup(pid: number, signal: NodeJS.Signals): void;
}

function runShellCommand(
  command: string,
  options: { cwd: string; env: Record<string, string>; timeoutMs: number },
): Promise<CommandResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, {
      cwd: options.cwd,
      env: options.env,
      shell: true,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeout = setTimeout(() => {
      if (child.pid) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      }
      if (!settled) {
        settled = true;
        rejectPromise(new Error(`command timed out after ${options.timeoutMs}ms: ${command}`));
      }
    }, options.timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.length > 200_000) stdout = stdout.slice(-200_000);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 200_000) stderr = stderr.slice(-200_000);
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        rejectPromise(error);
      }
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (settled) return;
      settled = true;
      if (code === 0) {
        resolvePromise({ stdout, stderr });
      } else {
        rejectPromise(
          new Error(`command exited with code ${code}: ${command}\n${stderr.slice(-2000)}`.trim()),
        );
      }
    });
  });
}

export const DEFAULT_DEPS: SandboxDeps = {
  env: process.env,
  exec: runShellCommand,
  spawnServer: (command, options) =>
    spawn(command, {
      cwd: options.cwd,
      env: options.env,
      shell: true,
      detached: true,
      stdio: 'ignore',
    }),
  fetch: (url, init) => fetch(url, init),
  sleep: (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms)),
  now: () => Date.now(),
  mkdtemp: () => mkdtempSync(join(tmpdir(), 'qa-sandbox-')),
  removeDir: (path) => rmSync(path, { recursive: true, force: true }),
  copyDir: (source, destination) =>
    cpSync(source, destination, { recursive: true, dereference: true }),
  exists: (path) => existsSync(path),
  killGroup: (pid, signal) => {
    try {
      process.kill(-pid, signal);
    } catch {
      try {
        process.kill(pid, signal);
      } catch {
        // process already gone
      }
    }
  },
};

export type Isolation = 'process' | 'container';

export interface SandboxOptions {
  repoUrl?: string;
  localPath?: string;
  ref?: string;
  tokenRef?: string;
  port?: number;
  healthTimeoutMs?: number;
  commandTimeoutMs?: number;
  isolation?: 'auto' | Isolation;
  allowLocalProcess?: boolean;
  keepWorkDir?: boolean;
  onRepoReady?: (info: { repoDir: string; stack: Stack; recipe: Recipe }) => Promise<void> | void;
  onReady?: (info: { appUrl?: string }) => Promise<void> | void;
}

export interface SandboxResult {
  ok: boolean;
  isolation?: Isolation;
  stack?: Stack;
  recipe?: Recipe;
  containerId?: string;
  appUrl?: string;
  healthOk: boolean;
  logs: string[];
  limitations: string[];
  error?: string;
  reason?: string;
  workDir?: string;
  durationMs: number;
  teardown: { ok: boolean; reason?: string };
}

export interface SandboxTeardown {
  ok: boolean;
  reason?: string;
}

export interface SandboxSession {
  result: SandboxResult;
  appUrl?: string;
  repoDir?: string;
  stop(): Promise<SandboxTeardown>;
}

const SAFE_ENV_KEYS = [
  'PATH',
  'HOME',
  'TMPDIR',
  'TEMP',
  'TMP',
  'LANG',
  'LC_ALL',
  'SHELL',
  'USER',
  'LOGNAME',
  'SystemRoot',
  'ComSpec',
  'PATHEXT',
];

function buildSandboxEnv(deps: SandboxDeps, recipe: Recipe, port: number): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of SAFE_ENV_KEYS) {
    const value = deps.env[key];
    if (value) env[key] = value;
  }
  env.CI = '1';
  env.NODE_ENV = 'test';
  env.PORT = String(port);
  for (const name of recipe.envNames) {
    const value = deps.env[name];
    if (value) env[name] = value;
  }
  return env;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function assertSafeRepoUrl(url: string): void {
  const allowed =
    /^https?:\/\/[^\s'`$;&|]+$/.test(url) ||
    /^ssh:\/\/[^\s'`$;&|]+$/.test(url) ||
    /^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+:[^\s'`$;&|]+$/.test(url);
  if (!allowed) {
    throw new Error('repo url contains unsupported characters or scheme');
  }
}

function assertSafeRef(ref: string): void {
  if (!/^[A-Za-z0-9._/-]+$/.test(ref)) {
    throw new Error(`unsafe git ref: ${ref}`);
  }
}

function resolveToken(reference: string, deps: SandboxDeps): string {
  const envKey = reference.startsWith('vault:')
    ? `QA_VAULT_${reference
        .slice('vault:'.length)
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')}`
    : reference;
  const token = deps.env[envKey];
  if (!token) {
    throw new Error(`secret reference ${reference} could not be resolved (looked for ${envKey})`);
  }
  return token;
}

function portFromHealthUrl(healthUrl: string | undefined, fallback = 3000): number {
  if (!healthUrl) return fallback;
  try {
    const url = new URL(healthUrl);
    if (url.port) return Number(url.port);
    return url.protocol === 'https:' ? 443 : 80;
  } catch {
    return fallback;
  }
}

function withHostPort(healthUrl: string | undefined, port: number): string {
  if (!healthUrl) return `http://127.0.0.1:${port}/health`;
  try {
    const url = new URL(healthUrl);
    url.hostname = '127.0.0.1';
    url.port = String(port);
    return url.href;
  } catch {
    return `http://127.0.0.1:${port}/health`;
  }
}

async function waitForHealth(
  url: string,
  child: ChildHandle | undefined,
  deps: SandboxDeps,
  timeoutMs: number,
  logs: string[],
): Promise<{ ok: boolean; reason?: string }> {
  const deadline = deps.now() + timeoutMs;
  let lastStatus: number | undefined;
  while (deps.now() < deadline) {
    if (child && child.exitCode !== null) {
      return { ok: false, reason: `application exited with code ${child.exitCode}` };
    }
    try {
      const response = await deps.fetch(url, { signal: AbortSignal.timeout(3000) });
      lastStatus = response.status;
      if (response.ok) return { ok: true };
    } catch {
      // not listening yet
    }
    await deps.sleep(250);
  }
  logs.push(`health check timed out: ${url}${lastStatus ? ` (last status ${lastStatus})` : ''}`);
  return {
    ok: false,
    reason: lastStatus
      ? `health check returned ${lastStatus} for ${url}`
      : `application did not become healthy at ${url}`,
  };
}

async function stopProcess(child: ChildHandle | undefined, deps: SandboxDeps): Promise<void> {
  if (!child || child.exitCode !== null || !child.pid) return;
  deps.killGroup(child.pid, 'SIGTERM');
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (child.exitCode !== null) return;
    await deps.sleep(100);
  }
  deps.killGroup(child.pid, 'SIGKILL');
  await deps.sleep(100);
}

function logTail(text: string, max = 2000): string {
  return redactString(text.trim().slice(-max));
}

export async function startSandbox(
  options: SandboxOptions,
  deps: SandboxDeps = DEFAULT_DEPS,
): Promise<SandboxSession> {
  const startedAt = deps.now();
  const logs: string[] = [];
  const limitations: string[] = [];
  const teardown: { ok: boolean; reason?: string } = { ok: true };
  let workDir: string | undefined;
  let repoDir: string | undefined;
  let child: ChildHandle | undefined;
  let containerName: string | undefined;
  let imageTag: string | undefined;
  let containerId: string | undefined;
  let isolation: Isolation | undefined;
  let stack: Stack | undefined;
  let recipe: Recipe | undefined;
  let appUrl: string | undefined;
  let outcome: Omit<SandboxResult, 'durationMs' | 'logs' | 'teardown' | 'limitations'> = {
    ok: false,
    healthOk: false,
    reason: 'sandbox stage failed',
  };

  let builtResult: SandboxResult | undefined;
  let stopped = false;

  const finish = (
    result: Omit<SandboxResult, 'durationMs' | 'logs' | 'teardown' | 'limitations'>,
  ): SandboxResult => {
    builtResult = {
      ...result,
      logs,
      limitations,
      teardown,
      durationMs: Math.max(0, deps.now() - startedAt),
      ...(workDir ? { workDir } : {}),
    };
    return builtResult;
  };

  const stop = async (): Promise<SandboxTeardown> => {
    if (stopped) return teardown;
    stopped = true;
    await stopProcess(child, deps);
    if (containerName) {
      try {
        await deps.exec(`docker rm --force ${shellQuote(containerName)}`, {
          cwd: workDir ?? tmpdir(),
          env: buildSandboxEnv(deps, recipeFor('unknown'), 0),
          timeoutMs: 30_000,
        });
      } catch {
        teardown.ok = false;
        teardown.reason = 'container removal failed';
        logs.push('teardown: container removal failed');
      }
    }
    if (imageTag) {
      try {
        await deps.exec(`docker rmi --force ${shellQuote(imageTag)}`, {
          cwd: workDir ?? tmpdir(),
          env: buildSandboxEnv(deps, recipeFor('unknown'), 0),
          timeoutMs: 30_000,
        });
      } catch {
        // image may be shared or already gone
      }
    }
    if (workDir && !options.keepWorkDir) {
      try {
        deps.removeDir(workDir);
        workDir = undefined;
        if (builtResult) delete builtResult.workDir;
      } catch {
        teardown.ok = false;
        teardown.reason = 'workdir removal failed';
        logs.push(`teardown: workdir retained at ${workDir}`);
      }
    } else if (workDir) {
      logs.push(`workdir retained: ${workDir}`);
    }
    if (builtResult) builtResult.durationMs = Math.max(0, deps.now() - startedAt);
    return teardown;
  };

  try {
    if (!options.repoUrl && !options.localPath) {
      throw new Error('sandbox requires repoUrl or localPath');
    }
    if (options.repoUrl && options.localPath) {
      throw new Error('sandbox accepts repoUrl or localPath, not both');
    }

    isolation =
      options.isolation && options.isolation !== 'auto'
        ? options.isolation
        : options.localPath && options.allowLocalProcess
          ? 'process'
          : 'container';

    if (isolation === 'process' && !options.allowLocalProcess) {
      throw new Error('process isolation is only allowed for trusted local fixtures');
    }
    if (isolation === 'process') {
      limitations.push(
        'process isolation: trusted local fixtures only; no OS-level resource limits',
      );
    }
    if (isolation === 'container') {
      limitations.push('container egress filtering is not enforced yet (hardening phase)');
    }

    workDir = deps.mkdtemp();
    repoDir = join(workDir, 'repo');

    if (options.localPath) {
      const source = resolve(options.localPath);
      if (!deps.exists(source)) throw new Error(`local repository not found: ${source}`);
      logs.push(`copy local repository ${source}`);
      deps.copyDir(source, repoDir);
    } else if (options.repoUrl) {
      assertSafeRepoUrl(options.repoUrl);
      const cloneEnv = buildSandboxEnv(deps, recipeFor('unknown'), 0);
      cloneEnv.GIT_TERMINAL_PROMPT = '0';
      if (options.tokenRef) {
        const token = resolveToken(options.tokenRef, deps);
        cloneEnv.GITHUB_TOKEN = token;
        logs.push(`resolved secret reference ${options.tokenRef}`);
      }
      if (options.ref) assertSafeRef(options.ref);
      const branch = options.ref ? `--branch ${shellQuote(options.ref)} ` : '';
      const command = `git clone --depth 1 ${branch}-- ${shellQuote(options.repoUrl)} ${shellQuote(repoDir)}`;
      logs.push(`clone ${options.repoUrl}${options.ref ? `#${options.ref}` : ''}`);
      const clone = await deps.exec(command, {
        cwd: workDir,
        env: cloneEnv,
        timeoutMs: options.commandTimeoutMs ?? 300_000,
      });
      if (clone.stdout.trim()) logs.push(logTail(clone.stdout));
    }
    stack = detectStack(repoDir);
    recipe = loadRecipe(repoDir);
    logs.push(`detected stack=${stack}`);
    if (recipe.healthUrl) appUrl = recipe.healthUrl;
    if (options.onRepoReady) {
      await options.onRepoReady({ repoDir, stack, recipe });
    }

    if (isolation === 'container' && !hasDockerfile(repoDir)) {
      throw new Error('remote repositories require a Dockerfile for container isolation');
    }
    if (isolation === 'process' && recipe.start.length === 0) {
      throw new Error('recipe has no start command');
    }

    const appPort = options.port ?? portFromHealthUrl(recipe.healthUrl);
    const sandboxEnv = buildSandboxEnv(deps, recipe, appPort);

    if (isolation === 'container') {
      await deps.exec('docker info --format "{{.ServerVersion}}"', {
        cwd: workDir,
        env: sandboxEnv,
        timeoutMs: 30_000,
      });
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      imageTag = `qa-sandbox-${suffix}`.toLowerCase();
      containerName = `qa-sandbox-${suffix}`;
      logs.push(`docker build ${imageTag}`);
      await deps.exec(`docker build --tag ${shellQuote(imageTag)} .`, {
        cwd: repoDir,
        env: sandboxEnv,
        timeoutMs: options.commandTimeoutMs ?? 600_000,
      });
      const runCommand = [
        'docker run --detach --rm',
        `--name ${shellQuote(containerName)}`,
        '--cap-drop ALL',
        '--security-opt no-new-privileges',
        '--pids-limit 256',
        '--memory 512m',
        '--cpus 1',
        `--publish 127.0.0.1:${appPort}:${appPort}`,
        `--env PORT=${appPort}`,
        shellQuote(imageTag),
      ].join(' ');
      logs.push('docker run container');
      containerId = (
        await deps.exec(runCommand, {
          cwd: repoDir,
          env: sandboxEnv,
          timeoutMs: options.commandTimeoutMs ?? 120_000,
        })
      ).stdout.trim();
      appUrl = withHostPort(recipe.healthUrl, appPort);
    } else {
      if (recipe.install.length > 0) {
        const installCommand = recipe.install.join(' && ');
        logs.push(`install: ${installCommand}`);
        const output = await deps.exec(installCommand, {
          cwd: repoDir,
          env: sandboxEnv,
          timeoutMs: options.commandTimeoutMs ?? 300_000,
        });
        if (output.stdout.trim()) logs.push(logTail(output.stdout));
      }
      if (recipe.build.length > 0) {
        const buildCommand = recipe.build.join(' && ');
        logs.push(`build: ${buildCommand}`);
        const output = await deps.exec(buildCommand, {
          cwd: repoDir,
          env: sandboxEnv,
          timeoutMs: options.commandTimeoutMs ?? 300_000,
        });
        if (output.stdout.trim()) logs.push(logTail(output.stdout));
      }
      const startCommand = recipe.start[0];
      logs.push(`start: ${startCommand}`);
      child = deps.spawnServer(startCommand, { cwd: repoDir, env: sandboxEnv });
      appUrl = withHostPort(recipe.healthUrl, appPort);
    }

    const health = await waitForHealth(
      appUrl,
      child,
      deps,
      options.healthTimeoutMs ?? 30_000,
      logs,
    );
    if (!health.ok && isolation === 'container' && containerName) {
      try {
        const containerLogs = await deps.exec(
          `docker logs --tail 100 ${shellQuote(containerName)}`,
          {
            cwd: workDir,
            env: sandboxEnv,
            timeoutMs: 30_000,
          },
        );
        if (containerLogs.stdout.trim()) logs.push(logTail(containerLogs.stdout));
        if (containerLogs.stderr.trim()) logs.push(logTail(containerLogs.stderr));
      } catch {
        // container already removed or logs unavailable
      }
    }
    logs.push(`health ${appUrl} => ${health.ok}`);
    if (health.ok && options.onReady) {
      await options.onReady({ appUrl });
    }

    outcome = {
      ok: health.ok,
      isolation,
      stack,
      recipe,
      containerId,
      appUrl,
      healthOk: health.ok,
      ...(health.reason ? { reason: health.reason } : {}),
    };
  } catch (error) {
    const message = (error as Error).message;
    logs.push(`ERROR: ${logTail(message)}`);
    outcome = {
      ok: false,
      isolation,
      stack,
      recipe,
      containerId,
      appUrl,
      healthOk: false,
      error: message,
      reason: 'sandbox stage failed',
    };
  }

  const result = finish(outcome);
  if (!result.ok) await stop();
  return { result, appUrl, repoDir, stop };
}

export async function runSandbox(
  options: SandboxOptions,
  deps: SandboxDeps = DEFAULT_DEPS,
): Promise<SandboxResult> {
  const session = await startSandbox(options, deps);
  await session.stop();
  return session.result;
}

export { detectStack, recipeFor, loadRecipe };
export type { Stack, Recipe };
