import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

export interface DocVerificationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  verifiedFiles: string[];
}

export interface DocVerificationOptions {
  /** Fail when no PDF was generated (use after a successful PDF pass). */
  requirePdf?: boolean;
}

export const REQUIRED_DOC_FILES = [
  'run-summary.json',
  'index.html',
  'report.md',
  'executive-summary.html',
  'executive-summary.md',
  'execution-report.html',
  'test-catalogue.html',
  'test-catalogue.md',
  'test-catalogue.csv',
  'test-catalogue.xlsx',
  'traceability-matrix.html',
  'traceability-matrix.csv',
  'traceability-matrix.xlsx',
  'failure-analysis.html',
  'failure-analysis.md',
  'findings-register.html',
  'findings-register.csv',
  'findings-register.md',
  'findings-register.xlsx',
  'application-map.html',
  'run-comparison.html',
  'plan-approval.html',
  'not-covered.html',
  'trend-stability.html',
  'coverage-report.html',
];

export const PDF_DOC_FILES = [
  'executive-summary.pdf',
  'execution-report.pdf',
  'plan-approval.pdf',
];

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'GitHub token', pattern: /gh[pousr]_[0-9a-zA-Z]{36}/ },
  { name: 'AWS access key', pattern: /AKIA[0-9A-Z]{16}/ },
  { name: 'private key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'bearer token', pattern: /Bearer\s+[a-zA-Z0-9_\-.]{40,}/ },
  { name: 'plaintext password', pattern: /"password"\s*:\s*"[^"]{4,}"/ },
];

const PII_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;

const PLACEHOLDER_PATTERNS = [/\{\{/, /\}\}/, /\bTODO\b/, /\bFIXME\b/, /lorem ipsum/i];

const TEXT_EXTENSIONS: Record<string, true> = {
  '.html': true,
  '.htm': true,
  '.md': true,
  '.csv': true,
  '.json': true,
  '.txt': true,
};
const JSON_EXTENSIONS: Record<string, true> = { '.json': true };

const BINARY_EXTENSIONS: Record<string, true> = {
  '.png': true,
  '.jpg': true,
  '.jpeg': true,
  '.webp': true,
  '.gif': true,
  '.zip': true,
  '.xlsx': true,
  '.woff': true,
  '.woff2': true,
};

function walk(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

function stripFragment(target: string): string {
  return target.split('#')[0]!.split('?')[0]!;
}

function resolveLink(docsDir: string, fromFile: string, target: string): string | undefined {
  if (
    target.length === 0 ||
    target.startsWith('http://') ||
    target.startsWith('https://') ||
    target.startsWith('mailto:') ||
    target.startsWith('data:') ||
    target.startsWith('#') ||
    target.startsWith('javascript:')
  ) {
    return undefined;
  }
  const clean = stripFragment(target);
  if (clean.length === 0) return undefined;
  const base = clean.startsWith('/') ? resolve(docsDir) : resolve(join(fromFile, '..'));
  return resolve(base, clean);
}

function extractLinks(content: string): string[] {
  const links: string[] = [];
  const html = /(?:href|src)="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = html.exec(content)) !== null) links.push(match[1]!);
  const markdown = /\]\(([^)\s]+)\)/g;
  while ((match = markdown.exec(content)) !== null) links.push(match[1]!);
  return links;
}

/**
 * Verifies generated documentation: required files, link resolution,
 * unrendered placeholders, missing metadata, secret/PII leaks, and PDF magic
 * bytes. Any error means the bundle must not be treated as valid.
 */
export function verifyDocs(
  docsDir: string,
  options: DocVerificationOptions = {},
): DocVerificationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const verifiedFiles: string[] = [];

  if (!existsSync(docsDir) || !statSync(docsDir).isDirectory()) {
    return {
      ok: false,
      errors: [`docs directory does not exist: ${docsDir}`],
      warnings,
      verifiedFiles,
    };
  }

  for (const file of REQUIRED_DOC_FILES) {
    if (!existsSync(join(docsDir, file))) errors.push(`required document missing: ${file}`);
  }

  const pdfFiles = PDF_DOC_FILES.filter((file) => existsSync(join(docsDir, file)));
  if (options.requirePdf && pdfFiles.length === 0) {
    errors.push('required PDF documents were not generated');
  }
  for (const file of PDF_DOC_FILES) {
    const fullPath = join(docsDir, file);
    if (!existsSync(fullPath)) continue;
    const header = readFileSync(fullPath).subarray(0, 5).toString('latin1');
    if (header !== '%PDF-') errors.push(`PDF does not open (bad header): ${file}`);
  }

  const files = walk(docsDir);
  for (const file of files) {
    const extension = extname(file).toLowerCase();
    if (extension === '.pdf') continue;
    if (BINARY_EXTENSIONS[extension]) continue;
    if (!TEXT_EXTENSIONS[extension]) {
      warnings.push(`not scanned (binary/unknown format): ${file}`);
      continue;
    }
    const content = readFileSync(file, 'utf8');
    verifiedFiles.push(file);
    const relativeFile = file.slice(docsDir.length + 1);

    for (const pattern of PLACEHOLDER_PATTERNS) {
      if (pattern.test(content)) {
        errors.push(`Unrendered placeholder matched ${pattern} in ${relativeFile}`);
      }
    }
    if (/(^|[^A-Za-z])undefined([^A-Za-z]|$)/.test(content)) {
      errors.push(`Missing metadata rendered as "undefined" in ${relativeFile}`);
    }
    if (/(^|[^A-Za-z])NaN([^A-Za-z]|$)/.test(content)) {
      errors.push(`Missing metadata rendered as "NaN" in ${relativeFile}`);
    }

    for (const secret of SECRET_PATTERNS) {
      if (secret.pattern.test(content)) {
        errors.push(`secret leak (${secret.name}) in ${relativeFile}`);
      }
    }
    if (!JSON_EXTENSIONS[extension]) {
      const pii = content.match(PII_PATTERN);
      if (pii) errors.push(`PII leak (email ${pii[0]}) in ${relativeFile}`);
    }

    if (extension === '.html' || extension === '.md') {
      for (const link of extractLinks(content)) {
        const resolved = resolveLink(docsDir, file, link);
        if (resolved && !existsSync(resolved)) {
          errors.push(`broken link ${link} in ${relativeFile}`);
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    verifiedFiles: verifiedFiles.map((file) => file.slice(docsDir.length + 1)),
  };
}
