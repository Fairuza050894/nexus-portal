import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { detectStack, loadRecipe, recipeFor } from '../src/stack-detect.js';

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'qa-stack-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('sandbox stack detection', () => {
  it('detects node from package.json', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'package.json'), '{}');
    expect(detectStack(dir)).toBe('node');
  });

  it('detects python from requirements.txt', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'requirements.txt'), '');
    expect(detectStack(dir)).toBe('python');
  });

  it('detects dotnet from a csproj file', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'app.csproj'), '<Project />');
    expect(detectStack(dir)).toBe('dotnet');
  });

  it('returns unknown when no signature matches', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'README.md'), 'hi');
    expect(detectStack(dir)).toBe('unknown');
  });

  it('returns a usable node recipe', () => {
    const recipe = recipeFor('node');
    expect(recipe.install.length).toBeGreaterThan(0);
    expect(recipe.start.length).toBeGreaterThan(0);
    expect(recipe.healthUrl).toContain('/health');
  });

  it('applies .qa/recipe.yaml overrides', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'package.json'), '{}');
    mkdirSync(join(dir, '.qa'));
    writeFileSync(
      join(dir, '.qa', 'recipe.yaml'),
      [
        'install: []',
        'build: []',
        'start:',
        '  - node custom.js',
        'healthUrl: http://127.0.0.1:4100/ready',
        'envNames:',
        '  - PORT',
      ].join('\n'),
    );
    const recipe = loadRecipe(dir);
    expect(recipe.start).toEqual(['node custom.js']);
    expect(recipe.install).toEqual([]);
    expect(recipe.healthUrl).toBe('http://127.0.0.1:4100/ready');
    expect(recipe.envNames).toEqual(['PORT']);
  });

  it('rejects an invalid recipe file', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'package.json'), '{}');
    mkdirSync(join(dir, '.qa'));
    writeFileSync(join(dir, '.qa', 'recipe.yaml'), 'start: nope');
    expect(() => loadRecipe(dir)).toThrow(/invalid \.qa\/recipe\.yaml/);
  });
});
