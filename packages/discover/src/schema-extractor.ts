import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface DatabaseColumn {
  name: string;
  type: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isNullable: boolean;
  isSensitivePII: boolean;
}

export interface DatabaseForeignKey {
  column: string;
  foreignTable: string;
  foreignColumn: string;
}

export interface DatabaseTable {
  name: string;
  columns: DatabaseColumn[];
  foreignKeys: DatabaseForeignKey[];
  sourceFile?: string;
}

export interface DatabaseSchema {
  engine: 'prisma' | 'sql' | 'generic';
  tables: DatabaseTable[];
  schemaFile?: string;
  warnings: string[];
}

const PII_NAME_PATTERNS = [
  /password/i,
  /passwd/i,
  /secret/i,
  /token/i,
  /hash/i,
  /salt/i,
  /nik/i,
  /ktp/i,
  /credit_?card/i,
  /card_?number/i,
  /cvv/i,
  /ssn/i,
  /email/i,
  /phone/i,
  /mobile/i,
  /no_?hp/i,
  /birth_?date/i,
  /dob/i,
];

export function isSensitiveColumn(columnName: string): boolean {
  return PII_NAME_PATTERNS.some((pattern) => pattern.test(columnName));
}

export function parsePrismaSchema(content: string, filePath?: string): DatabaseTable[] {
  const tables: DatabaseTable[] = [];
  const modelRegex = /model\s+([A-Za-z0-9_]+)\s*\{([^}]+)\}/g;
  let match: RegExpExecArray | null;

  while ((match = modelRegex.exec(content)) !== null) {
    const tableName = match[1];
    const body = match[2];
    const columns: DatabaseColumn[] = [];
    const foreignKeys: DatabaseForeignKey[] = [];

    const lines = body.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//') || line.startsWith('@@')) {
        continue;
      }

      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;

      const colName = parts[0];
      const rawType = parts[1];
      const isNullable = rawType.endsWith('?');
      const cleanType = rawType.replace('?', '');

      const isPrimaryKey = line.includes('@id');
      const isSensitive = isSensitiveColumn(colName);

      // Foreign key parsing from @relation
      let isForeignKey = false;
      const relationMatch = line.match(
        /@relation\([^)]*fields:\s*\[([^\]]+)\],[^)]*references:\s*\[([^\]]+)\]/,
      );
      if (relationMatch) {
        isForeignKey = true;
        const fkCols = relationMatch[1].split(',').map((s) => s.trim());
        const refCols = relationMatch[2].split(',').map((s) => s.trim());
        for (let i = 0; i < fkCols.length; i++) {
          foreignKeys.push({
            column: fkCols[i],
            foreignTable: cleanType,
            foreignColumn: refCols[i] ?? 'id',
          });
        }
      }

      columns.push({
        name: colName,
        type: cleanType,
        isPrimaryKey,
        isForeignKey,
        isNullable,
        isSensitivePII: isSensitive,
      });
    }

    tables.push({
      name: tableName,
      columns,
      foreignKeys,
      sourceFile: filePath,
    });
  }

  return tables;
}

export function parseSqlSchema(content: string, filePath?: string): DatabaseTable[] {
  const tables: DatabaseTable[] = [];
  const tableRegex =
    /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+["`]?([A-Za-z0-9_]+)["`]?\s*\(([\s\S]*?)\);/gi;
  let match: RegExpExecArray | null;

  while ((match = tableRegex.exec(content)) !== null) {
    const tableName = match[1];
    const body = match[2];
    const columns: DatabaseColumn[] = [];
    const foreignKeys: DatabaseForeignKey[] = [];

    const statements = body
      .split(',\n')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const stmt of statements) {
      // Check for standalone FOREIGN KEY statement
      const fkMatch = stmt.match(
        /FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+["`]?([A-Za-z0-9_]+)["`]?\s*\(([^)]+)\)/i,
      );
      if (fkMatch) {
        foreignKeys.push({
          column: fkMatch[1].replace(/["`]/g, '').trim(),
          foreignTable: fkMatch[2],
          foreignColumn: fkMatch[3].replace(/["`]/g, '').trim(),
        });
        continue;
      }

      // Check for standalone PRIMARY KEY (id)
      const pkMatch = stmt.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
      if (pkMatch) {
        const pkCol = pkMatch[1].replace(/["`]/g, '').trim();
        const existing = columns.find((c) => c.name === pkCol);
        if (existing) existing.isPrimaryKey = true;
        continue;
      }

      const parts = stmt.split(/\s+/);
      if (parts.length < 2) continue;

      const colName = parts[0].replace(/["`]/g, '');
      const colType = parts[1].replace(/[,;]/g, '');
      const isPrimaryKey = /PRIMARY\s+KEY/i.test(stmt);
      const isNullable = !/NOT\s+NULL/i.test(stmt);

      columns.push({
        name: colName,
        type: colType,
        isPrimaryKey,
        isForeignKey: false,
        isNullable,
        isSensitivePII: isSensitiveColumn(colName),
      });
    }

    // Mark foreign key columns
    for (const fk of foreignKeys) {
      const col = columns.find((c) => c.name === fk.column);
      if (col) col.isForeignKey = true;
    }

    tables.push({
      name: tableName,
      columns,
      foreignKeys,
      sourceFile: filePath,
    });
  }

  return tables;
}

export function extractDatabaseSchema(repoDir: string): DatabaseSchema {
  const warnings: string[] = [];

  // 1. Look for Prisma schema
  const prismaCandidates = [
    join(repoDir, 'prisma', 'schema.prisma'),
    join(repoDir, 'schema.prisma'),
  ];

  for (const candidate of prismaCandidates) {
    if (existsSync(candidate)) {
      try {
        const content = readFileSync(candidate, 'utf8');
        const tables = parsePrismaSchema(content, candidate);
        return {
          engine: 'prisma',
          tables,
          schemaFile: candidate,
          warnings,
        };
      } catch (err) {
        warnings.push(`Failed to parse Prisma schema at ${candidate}: ${(err as Error).message}`);
      }
    }
  }

  // 2. Look for SQL files / migrations
  const sqlFiles: string[] = [];
  function searchSql(dir: string, depth: number = 0): void {
    if (depth > 4 || !existsSync(dir)) return;
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (entry === 'node_modules' || entry === '.git') continue;
        const full = join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) {
          searchSql(full, depth + 1);
        } else if (
          entry.endsWith('.sql') &&
          (entry.includes('schema') ||
            entry.includes('init') ||
            entry.includes('migration') ||
            dir.includes('migration'))
        ) {
          sqlFiles.push(full);
        }
      }
    } catch {
      // ignore unreadable dirs
    }
  }

  searchSql(repoDir);

  if (sqlFiles.length > 0) {
    const allTables: DatabaseTable[] = [];
    for (const sqlFile of sqlFiles) {
      try {
        const content = readFileSync(sqlFile, 'utf8');
        const parsed = parseSqlSchema(content, sqlFile);
        allTables.push(...parsed);
      } catch (err) {
        warnings.push(`Failed to parse SQL file ${sqlFile}: ${(err as Error).message}`);
      }
    }

    if (allTables.length > 0) {
      return {
        engine: 'sql',
        tables: allTables,
        schemaFile: sqlFiles[0],
        warnings,
      };
    }
  }

  return {
    engine: 'generic',
    tables: [],
    warnings,
  };
}
