import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { ComplianceMapping, RunSummary } from '@nexus/core';
import { loadComplianceMapping } from '@nexus/core';
import { createZip, listZipNames, type ZipEntry } from './zip.js';
import { renderDocumentSet, type AppMapView, type DocContext, type HistoryPoint } from './documents.js';
import type { DocLanguage } from './i18n.js';
import { createXlsx, type XlsxSheet } from './xlsx.js';
import { createSarif } from './sarif.js';
import { createJUnit } from './junit.js';

export * from './verify.js';
export * from './documents.js';
export * from './i18n.js';
export * from './ui.js';
export { generatePdfDocs } from './pdf.js';
export { createXlsx } from './xlsx.js';
export type { XlsxSheet } from './xlsx.js';
export { createSarif, serializeSarif } from './sarif.js';
export { createJUnit } from './junit.js';

export interface DocOptions {
  language?: DocLanguage;
  /** Run directory containing app-map.json and session.json. */
  runDir?: string;
  /** Previous runs, newest first, for trend documents. */
  history?: HistoryPoint[];
  /** Loaded compliance mapping (already validated). */
  complianceMapping?: ComplianceMapping;
  /** Path to a compliance mapping YAML; loaded and validated by generateDocs. */
  complianceMappingPath?: string;
}

function readJsonFile<T>(filePath: string): T | undefined {
  if (!existsSync(filePath)) return undefined;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

function appMapView(runDir: string | undefined): AppMapView | undefined {
  if (!runDir) return undefined;
  const raw = readJsonFile<{
    nodes?: Array<Record<string, unknown>>;
    edges?: Array<Record<string, unknown>>;
  }>(join(runDir, 'app-map.json'));
  if (!raw?.nodes) return undefined;
  return {
    nodes: raw.nodes.map((node) => ({
      id: String(node.id ?? ''),
      type: String(node.type ?? 'unknown'),
      ...(typeof node.path === 'string' ? { path: node.path } : {}),
      ...(typeof node.method === 'string' ? { method: node.method } : {}),
      ...(typeof node.title === 'string' ? { title: node.title } : {}),
      ...(typeof node.status === 'number' ? { status: node.status } : {}),
      ...(typeof node.risk === 'number' ? { risk: node.risk } : {}),
      ...(node.changedRecently === true ? { changedRecently: true } : {}),
      ...(typeof node.suggestedOwner === 'string' ? { suggestedOwner: node.suggestedOwner } : {}),
      ...(Array.isArray(node.sources)
        ? { sources: node.sources.map((source) => String(source)) }
        : {}),
    })),
    edges: (raw.edges ?? []).map((edge) => ({
      from: String(edge.from ?? ''),
      to: String(edge.to ?? ''),
      kind: String(edge.kind ?? ''),
      confidence: String(edge.confidence ?? ''),
    })),
  };
}

function sessionPages(
  runDir: string | undefined,
): Array<{ path: string; title?: string; status?: number }> | undefined {
  if (!runDir) return undefined;
  const raw = readJsonFile<{ pages?: Array<Record<string, unknown>> }>(
    join(runDir, 'session.json'),
  );
  if (!raw?.pages) return undefined;
  return raw.pages
    .filter((page) => typeof page.path === 'string')
    .map((page) => ({
      path: String(page.path),
      ...(typeof page.title === 'string' ? { title: page.title } : {}),
      ...(typeof page.status === 'number' ? { status: page.status } : {}),
    }));
}

function workbookSheets(summary: RunSummary): XlsxSheet[] {
  const catalogue: XlsxSheet = {
    name: 'Test Catalogue',
    rows: [
      ['ID', 'Lane', 'Feature', 'Title', 'Requirements', 'Expected', 'Actual', 'Status', 'DurationMs', 'Reason'],
      ...(summary.tests ?? []).map((test) => [
        test.id,
        test.lane,
        test.feature ?? '',
        test.title,
        (test.requirements ?? []).join('; '),
        test.expected ?? '',
        test.actual ?? '',
        test.status,
        test.durationMs,
        test.reason ?? '',
      ]),
    ],
  };
  const traceability: XlsxSheet = {
    name: 'Traceability',
    rows: [
      ['Requirement', 'Title', 'Tests', 'Coverage'],
      ...(summary.requirements ?? []).map((requirement) => [
        requirement.id,
        requirement.title,
        requirement.tests.join('; '),
        requirement.covered ? 'covered' : 'uncovered',
      ]),
    ],
  };
  const findings: XlsxSheet = {
    name: 'Findings',
    rows: [
      [
        'ID',
        'Title',
        'Severity',
        'Confidence',
        'Category',
        'Lanes',
        'Occurrences',
        'Status',
        'FirstSeenRun',
        'LastSeenRun',
        'SuggestedOwner',
      ],
      ...summary.findings.map((finding) => [
        finding.id,
        finding.title,
        finding.severity,
        finding.confidence,
        finding.category,
        finding.lanes.join('; '),
        finding.occurrences,
        finding.status,
        finding.firstSeenRun ?? '',
        finding.lastSeenRun ?? summary.run.id,
        finding.suggestedOwner ?? '',
      ]),
    ],
  };
  return [catalogue, traceability, findings];
}

export function generateDocs(
  summary: RunSummary,
  docsDir: string,
  options: DocOptions = {},
): string[] {
  const language = options.language ?? 'id';
  mkdirSync(docsDir, { recursive: true });

  const complianceMapping =
    options.complianceMapping ??
    (options.complianceMappingPath
      ? loadComplianceMapping(options.complianceMappingPath)
      : undefined);
  const map = appMapView(options.runDir);
  const pages = sessionPages(options.runDir);
  const ctx: DocContext = {
    runId: summary.run.id,
    ...(options.runDir && existsSync(options.runDir) ? { runArtifacts: true } : {}),
    ...(map ? { appMap: map } : {}),
    ...(pages ? { sessionPages: pages } : {}),
    ...(options.history ? { history: options.history } : {}),
    ...(complianceMapping ? { complianceMapping } : {}),
  };

  const writtenFiles: string[] = [];
  const writeDoc = (filename: string, content: string | Buffer) => {
    const fullPath = join(docsDir, filename);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content);
    writtenFiles.push(fullPath);
  };

  writeDoc('run-summary.json', `${JSON.stringify(summary, null, 2)}\n`);
  for (const file of renderDocumentSet(summary, language, ctx)) {
    writeDoc(file.name, file.content);
  }
  const sheets = workbookSheets(summary);
  writeDoc('test-catalogue.xlsx', createXlsx([sheets[0]!]));
  writeDoc('traceability-matrix.xlsx', createXlsx([sheets[1]!]));
  writeDoc('findings-register.xlsx', createXlsx([sheets[2]!]));
  writeDoc('findings.sarif', `${JSON.stringify(createSarif(summary), null, 2)}\n`);
  writeDoc('junit.xml', createJUnit(summary));

  if (options.runDir) {
    const appMapPath = join(options.runDir, 'app-map.json');
    if (existsSync(appMapPath)) {
      writeDoc('application-map.json', readFileSync(appMapPath));
    }
    const evidenceDir = join(options.runDir, 'evidence');
    if (existsSync(evidenceDir)) {
      cpSync(evidenceDir, join(docsDir, 'evidence'), { recursive: true });
    }
  }

  return writtenFiles;
}

export function copyLatestDocs(rootDir: string, docsDir: string): string {
  const latest = join(rootDir, 'artifacts', 'docs', 'latest');
  rmSync(latest, { recursive: true, force: true });
  mkdirSync(join(rootDir, 'artifacts', 'docs'), { recursive: true });
  cpSync(docsDir, latest, { recursive: true });
  return latest;
}

function collectFiles(directory: string, prefix: string): ZipEntry[] {
  if (!existsSync(directory)) return [];
  const entries: ZipEntry[] = [];
  const children = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  for (const entry of children) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      entries.push(...collectFiles(fullPath, `${prefix}${entry.name}/`));
    } else if (entry.isFile()) {
      entries.push({ name: `${prefix}${entry.name}`, data: readFileSync(fullPath) });
    }
  }
  return entries;
}

export interface BundleOptions {
  summary: RunSummary;
  docsDir: string;
  stagesDir: string;
  outFile: string;
  runDir?: string;
}

export interface BundleResult {
  path: string;
  names: string[];
  bytes: number;
  sha256: string;
}

export function createBundle(options: BundleOptions): BundleResult {
  const docEntries = collectFiles(options.docsDir, '');
  const stageEntries = collectFiles(options.stagesDir, 'stages/');
  const rootEntries: ZipEntry[] = [];
  const evidenceEntries: ZipEntry[] = [];
  const docNames = new Set(docEntries.map((entry) => entry.name));
  if (options.runDir) {
    for (const entry of collectFiles(join(options.runDir, 'evidence'), 'evidence/')) {
      // generateDocs copies evidence into the docs directory; keep one entry.
      if (!docNames.has(entry.name)) evidenceEntries.push(entry);
    }
  }
  if (options.runDir && existsSync(options.runDir)) {
    for (const entry of readdirSync(options.runDir, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      if (entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'run-summary.json') {
        rootEntries.push({
          name: entry.name,
          data: readFileSync(join(options.runDir, entry.name)),
        });
      }
    }
  }
  const checksums = [...docEntries, ...stageEntries, ...rootEntries, ...evidenceEntries]
    .map((entry) => `${createHash('sha256').update(entry.data).digest('hex')}  ${entry.name}`)
    .sort()
    .join('\n');
  const entries: ZipEntry[] = [
    ...docEntries,
    ...stageEntries,
    ...rootEntries,
    ...evidenceEntries,
    { name: 'checksums.txt', data: Buffer.from(`${checksums}\n`, 'utf8') },
  ];
  const buffer = createZip(entries);
  mkdirSync(dirname(options.outFile), { recursive: true });
  writeFileSync(options.outFile, buffer);
  return {
    path: options.outFile,
    names: listZipNames(buffer),
    bytes: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
}

export function relativeTo(rootDir: string, filePath: string): string {
  return relative(rootDir, filePath).replace(/\\/g, '/');
}

export { listZipNames } from './zip.js';
export type { ZipEntry } from './zip.js';
