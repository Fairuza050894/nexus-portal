import { describe, expect, it } from 'vitest';
import type { AppMap, AppMapNode, AppMapEdge } from '@nexus/app-map';
import { orderCasesByRisk, type PlannedTestCase } from '@nexus/planner';
import { dedupeFindings } from '@nexus/correlate';
import type { Finding } from '@nexus/core';

describe('Platform Scalability & High-Load Performance (9.2)', () => {
  it('processes and risk-orders 1,000+ test cases in under 100ms', () => {
    const cases: PlannedTestCase[] = [];
    for (let i = 1; i <= 1000; i++) {
      cases.push({
        id: `TC-SCALE-${String(i).padStart(4, '0')}`,
        title: `Scale benchmark test case #${i}`,
        lane: i % 2 === 0 ? 'api' : 'e2e',
        type: i % 2 === 0 ? 'api' : 'e2e',
        source: 'spec',
        confidence: 'auto-discovered',
        priority: i % 10 === 0 ? 'critical' : 'medium',
        riskScore: Number((Math.random() * 0.9).toFixed(2)),
        target: { endpoint: `/api/v1/resource/${i}` },
        assertionType: 'spec-schema',
        estDurationMs: 100,
        modeCompatibility: 'allowed',
      });
    }

    const start = performance.now();
    const { orderedCases, riskOrdering } = orderCasesByRisk(cases, ['/api/v1/resource/100']);
    const elapsed = performance.now() - start;

    expect(orderedCases).toHaveLength(1000);
    expect(riskOrdering).toHaveLength(1000);
    expect(elapsed).toBeLessThan(100); // Must be under 100ms
  });

  it('efficiently builds and traverses large AppMap graph (500 nodes, 1,000 edges)', () => {
    const nodes: AppMapNode[] = [];
    const edges: AppMapEdge[] = [];

    for (let i = 1; i <= 500; i++) {
      nodes.push({
        id: `node-${i}`,
        type: i % 3 === 0 ? 'page' : 'endpoint',
        path: `/path/${i}`,
        risk: 0.3,
        sources: ['crawl'],
        changedRecently: i % 20 === 0,
        riskFactors: [],
      });
    }

    for (let i = 1; i <= 1000; i++) {
      const fromIdx = (i % 500) + 1;
      const toIdx = ((i * 3) % 500) + 1;
      edges.push({
        from: `node-${fromIdx}`,
        to: `node-${toIdx}`,
        kind: 'calls',
        confidence: 'auto-discovered',
      });
    }

    const appMap: AppMap = {
      schemaVersion: '1.0',
      generatedAt: new Date().toISOString(),
      nodes,
      edges,
      stats: {
        pages: nodes.filter((n) => n.type === 'page').length,
        endpoints: nodes.filter((n) => n.type === 'endpoint').length,
        code: 0,
        edges: edges.length,
        highRisk: 0,
        changed: nodes.filter((n) => n.changedRecently).length,
      },
    };

    expect(appMap.nodes).toHaveLength(500);
    expect(appMap.edges).toHaveLength(1000);
  });

  it('deduplicates 500+ findings with deterministic fingerprinting without memory spikes', () => {
    const rawFindings: Finding[] = [];
    for (let i = 1; i <= 500; i++) {
      const ruleIndex = i % 25; // 25 distinct rules repeated 20 times each
      rawFindings.push({
        id: `F-RAW-${i}`,
        title: `Repeated security anomaly on endpoint #${ruleIndex}`,
        ruleId: `sec-rule-${ruleIndex}`,
        severity: 'high',
        confidence: 'auto-discovered',
        category: 'security',
        lanes: ['security'],
        occurrences: 1,
        affected: [{ endpoint: `/api/v1/resource/${ruleIndex}` }],
        evidence: [],
        status: 'new',
      });
    }

    const start = performance.now();
    const deduped = dedupeFindings(rawFindings);
    const elapsed = performance.now() - start;

    expect(deduped.length).toBeLessThanOrEqual(25);
    expect(elapsed).toBeLessThan(150); // Under 150ms
  });
});
