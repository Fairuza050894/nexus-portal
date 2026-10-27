import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeRepo, ownersFor } from '../src/index.js';

const dirs: string[] = [];

function tempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'qa-repo-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('repo analyzer', () => {
  it('extracts Express and Next App Router routes, pages, tests, and owners', () => {
    const repo = tempRepo();
    mkdirSync(join(repo, 'app', 'api', 'todos'), { recursive: true });
    mkdirSync(join(repo, 'tests'), { recursive: true });
    mkdirSync(join(repo, 'node_modules', 'ignored'), { recursive: true });

    writeFileSync(
      join(repo, 'server.js'),
      [
        "const app = require('express')();",
        "app.get('/health', (_req, res) => res.send('ok'));",
        "app.post('/api/todos/:id', (_req, res) => res.send('ok'));",
        'app.listen(3000);',
      ].join('\n'),
    );
    writeFileSync(
      join(repo, 'app', 'api', 'todos', 'route.ts'),
      [
        'export async function GET() { return new Response("ok"); }',
        'export const POST = async () => new Response("ok");',
      ].join('\n'),
    );
    writeFileSync(join(repo, 'app', 'page.tsx'), 'export default function Page() { return null; }');
    writeFileSync(join(repo, 'tests', 'api.test.ts'), 'test("x", () => {});');
    writeFileSync(join(repo, 'node_modules', 'ignored', 'index.js'), "app.get('/nope', () => {});");
    writeFileSync(join(repo, 'package.json'), '{"name":"repo"}');
    writeFileSync(join(repo, 'LICENSE'), 'MIT');
    writeFileSync(join(repo, 'config.js'), 'const password = "supersecretvalue";');
    writeFileSync(join(repo, 'CODEOWNERS'), '**/*.ts @frontend\n/app/api/** @backend\n');

    const analysis = analyzeRepo({ repoDir: repo, stack: 'node' });

    expect(analysis.stack).toBe('node');
    expect(analysis.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: 'GET',
          path: '/health',
          file: 'server.js',
          framework: 'express',
        }),
        expect.objectContaining({ method: 'POST', path: '/api/todos/:id', framework: 'express' }),
        expect.objectContaining({
          method: 'GET',
          path: '/api/todos',
          framework: 'next-app',
          file: 'app/api/todos/route.ts',
        }),
        expect.objectContaining({ method: 'POST', path: '/api/todos', framework: 'next-app' }),
      ]),
    );
    expect(analysis.pageRoutes).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: '/', file: 'app/page.tsx' })]),
    );
    expect(analysis.testFiles).toEqual(['tests/api.test.ts']);
    expect(analysis.routes.some((route) => route.path === '/nope')).toBe(false);
    expect(ownersFor('app/api/todos/route.ts', analysis.codeOwners)).toEqual(['@backend']);
    expect(analysis.dependencyFiles).toEqual(['package.json']);
    expect(analysis.licenseFiles).toEqual(['LICENSE']);
    expect(analysis.secretFindings).toEqual([
      expect.objectContaining({ file: 'config.js', line: 1, kind: 'hardcoded-credential' }),
    ]);
    expect(analysis.warnings.some((warning) => warning.includes('not a git checkout'))).toBe(true);
  });
});
