import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import type { CodeOwnerRule, RepoAnalysis, RepoPageRoute, RepoRoute } from './types.js';

const SKIPPED_DIRECTORIES: Record<string, true> = {
  '.git': true,
  node_modules: true,
  dist: true,
  build: true,
  '.next': true,
  coverage: true,
  artifacts: true,
  vendor: true,
  '.venv': true,
  target: true,
};

const MAX_FILES = 3000;
const MAX_FILE_BYTES = 500_000;

const DEPENDENCY_FILES: Record<string, true> = {
  'package.json': true,
  'package-lock.json': true,
  'yarn.lock': true,
  'pnpm-lock.yaml': true,
  'requirements.txt': true,
  'pyproject.toml': true,
  'pom.xml': true,
  'build.gradle': true,
  'go.mod': true,
  'composer.json': true,
  Gemfile: true,
};

const SECRET_PATTERNS: Array<{ kind: string; pattern: RegExp }> = [
  { kind: 'private-key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { kind: 'aws-access-key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    kind: 'hardcoded-credential',
    pattern: /\b(?:password|secret|token|api[_-]?key)\s*[:=]\s*['"][^'"]{8,}['"]/i,
  },
];

export interface RepoAnalyzeOptions {
  repoDir: string;
  stack?: string;
}

function walkFiles(root: string): string[] {
  const files: string[] = [];
  const stack = [root];
  while (stack.length > 0 && files.length < MAX_FILES) {
    const current = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (files.length >= MAX_FILES) break;
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES[entry.name]) stack.push(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

function readTextFile(file: string): string | undefined {
  try {
    const buffer = readFileSync(file);
    if (buffer.length > MAX_FILE_BYTES || buffer.includes(0)) return undefined;
    return buffer.toString('utf8');
  } catch {
    return undefined;
  }
}

function lineNumberAt(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

function lineCount(source: string): number {
  return Math.max(1, source.split('\n').length);
}

function expressRoutes(file: string, source: string): RepoRoute[] {
  const routes: RepoRoute[] = [];
  const pattern =
    /\b(?:app|router|server|api)\s*\.\s*(get|post|put|patch|delete|all)\s*\(\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`)/g;
  for (const match of source.matchAll(pattern)) {
    const method = (match[1] ?? '').toUpperCase();
    const path = match[2] ?? match[3] ?? match[4];
    if (!method || !path) continue;
    routes.push({
      method: method === 'ALL' ? 'ALL' : method,
      path: path || '/',
      file,
      line: lineNumberAt(source, match.index ?? 0),
      framework: 'express',
      lineCount: lineCount(source),
    });
  }
  return routes;
}

function nextRoutePath(file: string, base: string): string | undefined {
  const relativeFile = relative(base, file).split(sep).join('/');
  const match = /(?:^|\/)app\/(.*)$/.exec(relativeFile);
  if (!match) return undefined;
  const segments = (match[1] ?? '')
    .split('/')
    .slice(0, -1)
    .filter((segment) => segment && !/^\(.*\)$/.test(segment) && !segment.startsWith('@'));
  if (segments.length === 0) return '/';
  const path = segments
    .map((segment) =>
      segment.startsWith('[...') && segment.endsWith(']')
        ? `:${segment.slice(4, -1)}`
        : segment.startsWith('[') && segment.endsWith(']')
          ? `:${segment.slice(1, -1)}`
          : segment,
    )
    .join('/');
  return `/${path}`;
}

function nextRoutes(file: string, source: string, base: string): RepoRoute[] {
  if (!/(?:^|\/)app\//.test(relative(base, file).split(sep).join('/'))) return [];
  if (!/^route\.(?:ts|js|tsx|jsx)$/.test(basename(file))) return [];
  const path = nextRoutePath(file, base);
  if (!path) return [];
  const methods = new Set<string>();
  const functionPattern =
    /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
  for (const match of source.matchAll(functionPattern)) {
    if (match[1]) methods.add(match[1]);
  }
  const constPattern = /export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*=/g;
  for (const match of source.matchAll(constPattern)) {
    if (match[1]) methods.add(match[1]);
  }
  return [...methods].map((method) => ({
    method,
    path,
    file,
    line: 1,
    framework: 'next-app' as const,
    lineCount: lineCount(source),
  }));
}

function nextPages(file: string, source: string, base: string): RepoPageRoute[] {
  if (!/^page\.(?:ts|js|tsx|jsx)$/.test(basename(file))) return [];
  const path = nextRoutePath(join(file, '..', 'route.ts'), base);
  if (!path) return [];
  return [{ path, file, lineCount: lineCount(source) }];
}

export function laravelRoutes(file: string, source: string): RepoRoute[] {
  const routes: RepoRoute[] = [];
  const routeRegex = /Route::(get|post|put|patch|delete|options)\(\s*['"]([^'"]+)['"]/gi;
  for (const match of source.matchAll(routeRegex)) {
    const method = match[1].toUpperCase();
    const rawPath = match[2];
    const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
    routes.push({
      method,
      path,
      file,
      line: lineNumberAt(source, match.index ?? 0),
      framework: 'laravel',
      lineCount: lineCount(source),
    });
  }
  return routes;
}

export function fastApiRoutes(file: string, source: string): RepoRoute[] {
  const routes: RepoRoute[] = [];
  const routeRegex = /@(?:app|router)\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/gi;
  for (const match of source.matchAll(routeRegex)) {
    const method = match[1].toUpperCase();
    const rawPath = match[2];
    const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
    routes.push({
      method,
      path,
      file,
      line: lineNumberAt(source, match.index ?? 0),
      framework: 'fastapi',
      lineCount: lineCount(source),
    });
  }
  return routes;
}

export function springBootRoutes(file: string, source: string): RepoRoute[] {
  const routes: RepoRoute[] = [];
  const routeRegex = /@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping)\(\s*(?:(?:value|path)\s*=\s*)?["']([^"']+)["']/gi;
  const methodMap: Record<string, string> = {
    getmapping: 'GET',
    postmapping: 'POST',
    putmapping: 'PUT',
    deletemapping: 'DELETE',
    patchmapping: 'PATCH',
  };
  for (const match of source.matchAll(routeRegex)) {
    const method = methodMap[match[1].toLowerCase()] ?? 'GET';
    const rawPath = match[2];
    const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
    routes.push({
      method,
      path,
      file,
      line: lineNumberAt(source, match.index ?? 0),
      framework: 'spring',
      lineCount: lineCount(source),
    });
  }
  return routes;
}

function parseCodeOwners(root: string): CodeOwnerRule[] {
  const candidates = [
    join(root, 'CODEOWNERS'),
    join(root, '.github', 'CODEOWNERS'),
    join(root, 'docs', 'CODEOWNERS'),
  ];
  const file = candidates.find((candidate) => existsSync(candidate));
  if (!file) return [];
  const rules: CodeOwnerRule[] = [];
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [pattern, ...owners] = line.split(/\s+/);
    if (!pattern || owners.length === 0) continue;
    rules.push({ pattern, owners });
  }
  return rules;
}

function codeOwnerPattern(pattern: string): RegExp {
  let normalized = pattern.replace(/^\//, '');
  const basenameOnly = !normalized.includes('/');
  if (normalized.endsWith('/')) normalized += '**';
  let source = normalized
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '§§')
    .replace(/\*/g, '[^/]*')
    .replace(/§§/g, '.*')
    .replace(/\?/g, '.');
  if (basenameOnly) source = `(?:.*/)?${source}`;
  return new RegExp(`^${source}$`);
}

export function ownersFor(file: string, rules: CodeOwnerRule[]): string[] {
  const normalized = file.split(sep).join('/');
  let owners: string[] = [];
  for (const rule of rules) {
    if (codeOwnerPattern(rule.pattern).test(normalized)) owners = rule.owners;
  }
  return owners;
}

function git(repoDir: string, args: string[]): string | undefined {
  try {
    return execFileSync('git', ['-C', repoDir, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

export function analyzeRepo(options: RepoAnalyzeOptions): RepoAnalysis {
  const files = walkFiles(options.repoDir);
  const warnings: string[] = [];
  const routes: RepoRoute[] = [];
  const pageRoutes: RepoPageRoute[] = [];
  const testFiles: string[] = [];
  const dependencyFiles: string[] = [];
  const licenseFiles: string[] = [];
  const secretFindings: RepoAnalysis['secretFindings'] = [];

  for (const file of files) {
    const relativeFile = relative(options.repoDir, file).split(sep).join('/');
    const basename = relativeFile.split('/').pop() ?? '';
    if (DEPENDENCY_FILES[basename]) dependencyFiles.push(relativeFile);
    if (/^(?:LICENSE|LICENCE|COPYING)(?:[.-]|$)/i.test(basename)) licenseFiles.push(relativeFile);
    if (
      /[.](?:test|spec)[.][cm]?[jt]sx?$/.test(relativeFile) ||
      relativeFile.includes('__tests__/')
    ) {
      testFiles.push(relativeFile);
    }
    const scanSource = readTextFile(file);
    if (scanSource) {
      for (const { kind, pattern } of SECRET_PATTERNS) {
        const match = pattern.exec(scanSource);
        if (match) {
          secretFindings.push({
            file: relativeFile,
            line: lineNumberAt(scanSource, match.index),
            kind,
          });
        }
      }
    }
    if (/[.](?:test|spec)[.]/.test(relativeFile)) {
      continue;
    }
    const source = scanSource;
    if (!source) continue;

    // 1. PHP / Laravel routes
    if (relativeFile.endsWith('.php')) {
      const laravel = laravelRoutes(file, source);
      if (laravel.length > 0) routes.push(...laravel);
      continue;
    }

    // 2. Python / FastAPI routes
    if (relativeFile.endsWith('.py')) {
      const fastapi = fastApiRoutes(file, source);
      if (fastapi.length > 0) routes.push(...fastapi);
      continue;
    }

    // 3. Java / Spring Boot routes
    if (relativeFile.endsWith('.java')) {
      const spring = springBootRoutes(file, source);
      if (spring.length > 0) routes.push(...spring);
      continue;
    }

    // 4. JS/TS (Next.js & Express)
    if (/[.][cm]?[jt]sx?$/.test(relativeFile)) {
      const next = nextRoutes(file, source, options.repoDir);
      if (next.length > 0) {
        routes.push(...next);
        pageRoutes.push(...nextPages(file, source, options.repoDir));
        continue;
      }
      pageRoutes.push(...nextPages(file, source, options.repoDir));
      if (relativeFile.startsWith('app/') || relativeFile.startsWith('src/app/')) continue;
      const express = expressRoutes(file, source);
      if (express.length > 0) routes.push(...express);
    }
  }
  const gitSha = git(options.repoDir, ['rev-parse', 'HEAD']);
  const gitBranch = git(options.repoDir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const changedFiles = (
    git(options.repoDir, ['log', '-n', '10', '--name-only', '--pretty=format:']) ?? ''
  )
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!gitSha) warnings.push('repository is not a git checkout; change history unavailable');

  const toRelative = (file: string): string => relative(options.repoDir, file).split(sep).join('/');

  return {
    stack: options.stack ?? 'unknown',
    gitSha: gitSha || undefined,
    gitBranch: gitBranch || undefined,
    changedFiles: [...new Set(changedFiles)],
    codeOwners: parseCodeOwners(options.repoDir),
    routes: routes.map((route) => ({ ...route, file: toRelative(route.file) })),
    pageRoutes: pageRoutes.map((route) => ({ ...route, file: toRelative(route.file) })),
    testFiles: [...new Set(testFiles)],
    dependencyFiles: [...new Set(dependencyFiles)],
    licenseFiles: [...new Set(licenseFiles)],
    secretFindings,
    filesScanned: files.length,
    warnings,
  };
}
