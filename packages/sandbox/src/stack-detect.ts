import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { z } from 'zod';

export const STACKS = [
  'node',
  'python',
  'java',
  'go',
  'php',
  'ruby',
  'dotnet',
  'container',
  'unknown',
] as const;
export type Stack = (typeof STACKS)[number];

export const RecipeFileSchema = z
  .object({
    stack: z.enum(STACKS).optional(),
    install: z.array(z.string()).optional(),
    test: z.array(z.string()).optional(),
    build: z.array(z.string()).optional(),
    start: z.array(z.string()).optional(),
    healthUrl: z
      .string()
      .url()
      .refine((value) => /^https?:\/\//.test(value), 'healthUrl must be http(s)')
      .optional(),
    envNames: z.array(z.string().regex(/^[A-Z][A-Z0-9_]*$/)).optional(),
    seedScript: z.array(z.string()).optional(),
  })
  .strict();
type RecipeFile = z.infer<typeof RecipeFileSchema>;

export interface Recipe {
  stack: Stack;
  install: string[];
  test?: string[];
  build: string[];
  start: string[];
  healthUrl?: string;
  envNames: string[];
  seedScript?: string[];
}

export const STACK_SIGNATURES: Array<{ stack: Stack; files: string[] }> = [
  { stack: 'node', files: ['package.json'] },
  { stack: 'python', files: ['pyproject.toml', 'requirements.txt'] },
  { stack: 'java', files: ['pom.xml', 'build.gradle'] },
  { stack: 'go', files: ['go.mod'] },
  { stack: 'php', files: ['composer.json'] },
  { stack: 'ruby', files: ['Gemfile'] },
  { stack: 'dotnet', files: ['*.csproj'] },
  { stack: 'container', files: ['docker-compose.yml', 'Dockerfile'] },
];

export const DEFAULT_RECIPES: Record<Stack, Recipe> = {
  node: {
    stack: 'node',
    install: ['npm install --ignore-scripts --no-audit --no-fund'],
    build: ['npm run build --if-present'],
    start: ['npm start'],
    healthUrl: 'http://127.0.0.1:3000/health',
    envNames: [],
  },
  python: {
    stack: 'python',
    install: ['python3 -m venv .venv && .venv/bin/pip install -r requirements.txt'],
    build: [],
    start: ['.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000'],
    healthUrl: 'http://127.0.0.1:8000/health',
    envNames: [],
  },
  java: {
    stack: 'java',
    install: ['mvn -B dependency:go-offline'],
    build: ['mvn -B package -DskipTests'],
    start: ['java -jar target/*.jar'],
    healthUrl: 'http://127.0.0.1:8080/health',
    envNames: [],
  },
  go: {
    stack: 'go',
    install: ['go mod download'],
    build: ['go build ./...'],
    start: ['go run .'],
    healthUrl: 'http://127.0.0.1:8080/health',
    envNames: [],
  },
  php: {
    stack: 'php',
    install: ['composer install'],
    build: [],
    start: ['php artisan serve --host=127.0.0.1 --port=8000'],
    healthUrl: 'http://127.0.0.1:8000/health',
    envNames: [],
  },
  ruby: {
    stack: 'ruby',
    install: ['bundle install'],
    build: [],
    start: ['rails s -b 127.0.0.1'],
    healthUrl: 'http://127.0.0.1:3000/up',
    envNames: [],
  },
  dotnet: {
    stack: 'dotnet',
    install: ['dotnet restore'],
    build: ['dotnet build'],
    start: ['dotnet run'],
    healthUrl: 'http://127.0.0.1:5000/health',
    envNames: [],
  },
  container: {
    stack: 'container',
    install: [],
    build: [],
    start: ['docker compose up'],
    healthUrl: 'http://127.0.0.1:80/health',
    envNames: [],
  },
  unknown: {
    stack: 'unknown',
    install: [],
    build: [],
    start: [],
    envNames: [],
  },
};

export function detectStack(repoDir: string): Stack {
  for (const signature of STACK_SIGNATURES) {
    for (const file of signature.files) {
      if (file.startsWith('*.')) {
        const suffix = file.slice(1);
        if (existsSync(repoDir) && readdirSync(repoDir).some((entry) => entry.endsWith(suffix))) {
          return signature.stack;
        }
      } else if (existsSync(join(repoDir, file))) {
        return signature.stack;
      }
    }
  }
  return 'unknown';
}

export function hasDockerfile(repoDir: string): boolean {
  return existsSync(join(repoDir, 'Dockerfile'));
}

export function recipeFor(stack: Stack, overrides: Partial<Recipe> = {}): Recipe {
  const base = DEFAULT_RECIPES[stack];
  const merged = { ...base, ...overrides, stack };
  const parsed = RecipeFileSchema.parse(merged);
  return {
    stack: parsed.stack ?? stack,
    install: parsed.install ?? base.install,
    test: parsed.test ?? base.test,
    build: parsed.build ?? base.build,
    start: parsed.start ?? base.start,
    healthUrl: parsed.healthUrl ?? base.healthUrl,
    envNames: parsed.envNames ?? base.envNames,
    seedScript: parsed.seedScript ?? base.seedScript,
  };
}

export function loadRecipe(repoDir: string): Recipe {
  const stack = detectStack(repoDir);
  const recipePath = join(repoDir, '.qa', 'recipe.yaml');
  if (!existsSync(recipePath)) return recipeFor(stack);

  let parsed: RecipeFile;
  try {
    parsed = RecipeFileSchema.parse(yaml.load(readFileSync(recipePath, 'utf8')) ?? {});
  } catch (error) {
    throw new Error(`invalid .qa/recipe.yaml: ${(error as Error).message}`);
  }
  return recipeFor(stack, parsed as Partial<Recipe>);
}
