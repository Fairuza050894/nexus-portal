import { describe, expect, it } from 'vitest';
import type { AppMap } from '../src/index.js';
import { buildFullStackLineage } from '../src/lineage.js';
import type { DatabaseSchema } from '@nexus/discover';

describe('Full-Stack Data Lineage & Topology Graph Builder', () => {
  const mockAppMap: AppMap = {
    schemaVersion: '1.0',
    generatedAt: '2026-10-28T00:00:00.000Z',
    nodes: [
      {
        id: 'p-checkout',
        type: 'page',
        path: '/checkout',
        title: 'Checkout Page',
        forms: 1,
        risk: 0.8,
        sources: ['crawl'],
        changedRecently: true,
        riskFactors: ['exposure'],
      },
      {
        id: 'ep-orders',
        type: 'endpoint',
        path: '/api/v1/orders',
        method: 'POST',
        risk: 0.9,
        sources: ['spec'],
        changedRecently: true,
        riskFactors: ['criticality'],
        authRequired: true,
        codeRef: 'controllers/order.controller.ts',
      },
      {
        id: 'ctrl-orders',
        type: 'code',
        sources: ['repo'],
        changedRecently: true,
        risk: 0.6,
        riskFactors: [],
      },
    ],
    edges: [{ from: 'p-checkout', to: 'ep-orders', kind: 'calls', confidence: 'verified' }],
    stats: {
      pages: 1,
      endpoints: 1,
      code: 1,
      edges: 1,
      highRisk: 1,
      changed: 3,
    },
  };

  const mockDbSchema: DatabaseSchema = {
    engine: 'prisma',
    warnings: [],
    tables: [
      {
        name: 'orders',
        columns: [
          {
            name: 'id',
            type: 'Int',
            isPrimaryKey: true,
            isForeignKey: false,
            isNullable: false,
            isSensitivePII: false,
          },
          {
            name: 'user_id',
            type: 'String',
            isPrimaryKey: false,
            isForeignKey: true,
            isNullable: false,
            isSensitivePII: false,
          },
          {
            name: 'card_token',
            type: 'String',
            isPrimaryKey: false,
            isForeignKey: false,
            isNullable: false,
            isSensitivePII: true,
          },
        ],
        foreignKeys: [{ column: 'user_id', foreignTable: 'users', foreignColumn: 'id' }],
      },
      {
        name: 'users',
        columns: [
          {
            name: 'id',
            type: 'String',
            isPrimaryKey: true,
            isForeignKey: false,
            isNullable: false,
            isSensitivePII: false,
          },
          {
            name: 'email',
            type: 'String',
            isPrimaryKey: false,
            isForeignKey: false,
            isNullable: false,
            isSensitivePII: true,
          },
          {
            name: 'password_hash',
            type: 'String',
            isPrimaryKey: false,
            isForeignKey: false,
            isNullable: false,
            isSensitivePII: true,
          },
        ],
        foreignKeys: [],
      },
    ],
  };

  it('builds end-to-end lineage connecting Page -> Endpoint -> DB Table', () => {
    const topology = buildFullStackLineage({
      appMap: mockAppMap,
      dbSchema: mockDbSchema,
    });

    expect(topology.nodes.length).toBeGreaterThanOrEqual(4);
    expect(topology.edges.length).toBeGreaterThanOrEqual(2);
    expect(topology.lineage.length).toBeGreaterThanOrEqual(1);

    // Verify lineage item
    const orderLineage = topology.lineage.find((l) => l.endpoint.includes('/api/v1/orders'));
    expect(orderLineage).toBeDefined();
    expect(orderLineage?.method).toBe('POST');
    expect(orderLineage?.handler).toBe('controllers/order.controller.ts');
    expect(orderLineage?.tables.some((t) => t.table === 'orders')).toBe(true);

    // Verify operation inference: POST maps to INSERT
    const orderTableTouch = orderLineage?.tables.find((t) => t.table === 'orders');
    expect(orderTableTouch?.operations).toContain('INSERT');
    expect(orderTableTouch?.sensitiveColumns).toContain('card_token');

    // Verify stats
    expect(topology.stats.totalTables).toBe(2);
    expect(topology.stats.piiTablesCount).toBe(2); // both orders and users have PII
  });

  it('reflects failed findings on affected topology nodes', () => {
    const topologyWithFailures = buildFullStackLineage({
      appMap: mockAppMap,
      dbSchema: mockDbSchema,
      findings: [
        {
          id: 'F-001',
          title: 'Order validation defect',
          severity: 'critical',
          confidence: 'verified',
          category: 'app-bug',
          lanes: ['api'],
          occurrences: 1,
          evidence: [],
          status: 'new',
          affected: [{ endpoint: 'POST /api/v1/orders' }],
        },
      ],
    });

    const endpointNode = topologyWithFailures.nodes.find(
      (n) => n.id === 'endpoint:POST /api/v1/orders',
    );
    expect(endpointNode?.status).toBe('failed');
  });
});
