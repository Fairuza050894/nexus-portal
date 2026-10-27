export type FlagValue = string | boolean | string[];

export interface ParsedArgs {
  command?: string;
  positionals: string[];
  flags: Record<string, FlagValue>;
}

const BOOLEAN_FLAGS: Record<string, true> = {
  yes: true,
  json: true,
  open: true,
  help: true,
};

const REPEATABLE_FLAGS: Record<string, true> = {
  url: true,
};

const KNOWN_FLAGS: Record<string, true> = {
  config: true,
  url: true,
  repo: true,
  api: true,
  spec: true,
  mode: true,
  scope: true,
  name: true,
  resume: true,
  run: true,
  root: true,
  allowlist: true,
  yes: true,
  json: true,
  open: true,
  help: true,
};

export class ArgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArgError';
  }
}

export function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, FlagValue> = {};
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (!argument.startsWith('--')) {
      positionals.push(argument);
      continue;
    }
    const body = argument.slice(2);
    const equalsIndex = body.indexOf('=');
    const key = equalsIndex >= 0 ? body.slice(0, equalsIndex) : body;
    if (!key) throw new ArgError('empty flag name');
    if (!KNOWN_FLAGS[key]) throw new ArgError(`unknown flag --${key}`);
    if (BOOLEAN_FLAGS[key]) {
      flags[key] = true;
      continue;
    }
    const inlineValue = equalsIndex >= 0 ? body.slice(equalsIndex + 1) : undefined;
    const next = argv[index + 1];
    const value = inlineValue ?? (next && !next.startsWith('--') ? argv[++index] : undefined);
    if (value === undefined || value === '') {
      throw new ArgError(`flag --${key} requires a value`);
    }
    if (REPEATABLE_FLAGS[key]) {
      const existing = flags[key];
      flags[key] = [...(Array.isArray(existing) ? existing : []), ...value.split(',')];
    } else {
      flags[key] = value;
    }
  }

  return { command: positionals[0], positionals, flags };
}

export function stringFlag(flags: Record<string, FlagValue>, key: string): string | undefined {
  const value = flags[key];
  return typeof value === 'string' ? value : undefined;
}

export function booleanFlag(flags: Record<string, FlagValue>, key: string): boolean {
  return flags[key] === true;
}

export function listFlag(flags: Record<string, FlagValue>, key: string): string[] {
  const value = flags[key];
  if (Array.isArray(value)) return value;
  return typeof value === 'string' ? [value] : [];
}
