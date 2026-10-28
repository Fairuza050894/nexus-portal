import { describe, expect, it } from 'vitest';
import {
  isSensitiveColumn,
  parsePrismaSchema,
  parseSqlSchema,
  extractDatabaseSchema,
} from '../src/index.js';

describe('Database Schema Extractor & PII Detection', () => {
  it('detects sensitive PII columns by name patterns', () => {
    expect(isSensitiveColumn('password')).toBe(true);
    expect(isSensitiveColumn('password_hash')).toBe(true);
    expect(isSensitiveColumn('api_token')).toBe(true);
    expect(isSensitiveColumn('user_email')).toBe(true);
    expect(isSensitiveColumn('nik_ktp')).toBe(true);
    expect(isSensitiveColumn('credit_card_number')).toBe(true);
    expect(isSensitiveColumn('phone_number')).toBe(true);

    expect(isSensitiveColumn('id')).toBe(false);
    expect(isSensitiveColumn('created_at')).toBe(false);
    expect(isSensitiveColumn('status')).toBe(false);
    expect(isSensitiveColumn('order_total')).toBe(false);
  });

  it('parses Prisma schema models, columns, relations, and primary keys', () => {
    const prismaContent = `
      model User {
        id        String   @id @default(uuid())
        email     String   @unique
        password  String
        name      String?
        orders    Order[]
        createdAt DateTime @default(now())
      }

      model Order {
        id         Int      @id @default(autoincrement())
        userId     String
        totalCents Int
        status     String
        user       User     @relation(fields: [userId], references: [id])
      }
    `;

    const tables = parsePrismaSchema(prismaContent, 'schema.prisma');
    expect(tables).toHaveLength(2);

    const userTable = tables.find((t) => t.name === 'User');
    expect(userTable).toBeDefined();
    expect(userTable?.columns.some((c) => c.name === 'id' && c.isPrimaryKey)).toBe(true);
    expect(userTable?.columns.some((c) => c.name === 'password' && c.isSensitivePII)).toBe(true);
    expect(userTable?.columns.some((c) => c.name === 'email' && c.isSensitivePII)).toBe(true);

    const orderTable = tables.find((t) => t.name === 'Order');
    expect(orderTable).toBeDefined();
    expect(orderTable?.foreignKeys).toHaveLength(1);
    expect(orderTable?.foreignKeys[0].column).toBe('userId');
    expect(orderTable?.foreignKeys[0].foreignTable).toBe('User');
    expect(orderTable?.foreignKeys[0].foreignColumn).toBe('id');
  });

  it('parses SQL DDL schema tables, columns, and foreign keys', () => {
    const sqlContent = `
      CREATE TABLE users (
        id VARCHAR(36) PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id VARCHAR(36) NOT NULL,
        total INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `;

    const tables = parseSqlSchema(sqlContent, 'schema.sql');
    expect(tables).toHaveLength(2);

    const users = tables.find((t) => t.name === 'users');
    expect(users).toBeDefined();
    expect(users?.columns.some((c) => c.name === 'id' && c.isPrimaryKey)).toBe(true);
    expect(users?.columns.some((c) => c.name === 'password_hash' && c.isSensitivePII)).toBe(true);

    const orders = tables.find((t) => t.name === 'orders');
    expect(orders).toBeDefined();
    expect(orders?.foreignKeys).toHaveLength(1);
    expect(orders?.foreignKeys[0].column).toBe('user_id');
    expect(orders?.foreignKeys[0].foreignTable).toBe('users');
  });

  it('extracts database schema safely from workspace repository', () => {
    const result = extractDatabaseSchema(process.cwd());
    expect(result).toBeDefined();
    expect(Array.isArray(result.tables)).toBe(true);
  });
});
