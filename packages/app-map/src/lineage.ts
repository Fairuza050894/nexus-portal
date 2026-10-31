import type { Finding } from '@nexus/core';
import type { DatabaseSchema } from '@nexus/discover';
import type { AppMap } from './index.js';

export type TopologyNodeType = 'page' | 'endpoint' | 'controller' | 'table' | 'external';
export type TopologyEdgeKind = 'calls' | 'queries' | 'integrates';

export interface TopologyNode {
  id: string;
  label: string;
  type: TopologyNodeType;
  status: 'ok' | 'failed' | 'warning';
  isPII?: boolean;
  metadata?: Record<string, unknown>;
}

export interface TopologyEdge {
  from: string;
  to: string;
  label?: string;
  kind: TopologyEdgeKind;
}

export interface LineageTableTouch {
  table: string;
  operations: Array<'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'>;
  sensitiveColumns: string[];
}

export interface DataLineageEntry {
  id: string;
  pageOrFeature: string;
  endpoint: string;
  method: string;
  handler?: string;
  tables: LineageTableTouch[];
  externalServices?: string[];
}

export interface FullStackTopology {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  lineage: DataLineageEntry[];
  stats: {
    totalEndpoints: number;
    totalPages: number;
    totalTables: number;
    piiTablesCount: number;
  };
}

export interface BuildLineageOptions {
  appMap: AppMap;
  dbSchema?: DatabaseSchema;
  findings?: Finding[];
}

function inferOperationsForMethod(
  method: string,
): Array<'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'> {
  const m = method.toUpperCase();
  if (m === 'GET') return ['SELECT'];
  if (m === 'POST') return ['INSERT'];
  if (m === 'PUT' || m === 'PATCH') return ['UPDATE'];
  if (m === 'DELETE') return ['DELETE'];
  return ['SELECT'];
}

function matchTablesForEndpoint(
  endpointPath: string,
  dbSchema?: DatabaseSchema,
): LineageTableTouch[] {
  if (!dbSchema || dbSchema.tables.length === 0) {
    return [];
  }

  const touches: LineageTableTouch[] = [];
  const normalizedPath = endpointPath.toLowerCase().replace(/[^a-z0-9]/g, ' ');

  for (const table of dbSchema.tables) {
    const tableNameLower = table.name.toLowerCase();
    const singularName = tableNameLower.endsWith('s')
      ? tableNameLower.slice(0, -1)
      : tableNameLower;

    if (normalizedPath.includes(tableNameLower) || normalizedPath.includes(singularName)) {
      const sensitiveCols = table.columns.filter((c) => c.isSensitivePII).map((c) => c.name);
      touches.push({
        table: table.name,
        operations: ['SELECT'], // will be updated by caller
        sensitiveColumns: sensitiveCols,
      });
    }
  }

  return touches;
}

export function buildFullStackLineage(options: BuildLineageOptions): FullStackTopology {
  const { appMap, dbSchema, findings = [] } = options;
  const nodes: TopologyNode[] = [];
  const edges: TopologyEdge[] = [];
  const lineage: DataLineageEntry[] = [];
  const nodeMap = new Map<string, TopologyNode>();

  const failedTargets = new Set<string>();
  const warningTargets = new Set<string>();
  for (const f of findings) {
    for (const aff of f.affected ?? []) {
      const t = String(aff.endpoint ?? aff.page ?? aff.component ?? '');
      if (t) {
        if (f.severity === 'critical' || f.severity === 'high') {
          failedTargets.add(t);
        } else {
          warningTargets.add(t);
        }
      }
    }
  }

  // Helper to add node safely
  function addNode(node: TopologyNode): void {
    if (!nodeMap.has(node.id)) {
      nodeMap.set(node.id, node);
      nodes.push(node);
    }
  }

  // 1. Add DB Schema tables as nodes
  const piiTablesSet = new Set<string>();
  if (dbSchema) {
    for (const table of dbSchema.tables) {
      const hasPII = table.columns.some((c) => c.isSensitivePII);
      if (hasPII) piiTablesSet.add(table.name);

      addNode({
        id: `table:${table.name}`,
        label: `Table: ${table.name}`,
        type: 'table',
        status: 'ok',
        isPII: hasPII,
        metadata: {
          columns: table.columns.map((c) => c.name),
          sensitiveColumns: table.columns.filter((c) => c.isSensitivePII).map((c) => c.name),
          foreignKeys: table.foreignKeys,
        },
      });

      // Add foreign key edges
      for (const fk of table.foreignKeys) {
        edges.push({
          from: `table:${table.name}`,
          to: `table:${fk.foreignTable}`,
          label: `FK (${fk.column})`,
          kind: 'queries',
        });
      }
    }
  }

  // 2. Add AppMap nodes (pages, endpoints, controllers)
  const pageNodes = appMap.nodes.filter((n) => n.type === 'page');
  const endpointNodes = appMap.nodes.filter((n) => n.type === 'endpoint');
  const codeNodes = appMap.nodes.filter((n) => n.type === 'code');

  for (const page of pageNodes) {
    const path = page.path ?? '/';
    const status = failedTargets.has(path) ? 'failed' : warningTargets.has(path) ? 'warning' : 'ok';
    addNode({
      id: `page:${path}`,
      label: page.title || `Page: ${path}`,
      type: 'page',
      status,
      metadata: { forms: page.forms, risk: page.risk },
    });
  }

  for (const ep of endpointNodes) {
    const method = (ep.method ?? 'GET').toUpperCase();
    const path = ep.path ?? '/';
    const epId = `${method} ${path}`;
    const status =
      failedTargets.has(epId) || failedTargets.has(path)
        ? 'failed'
        : warningTargets.has(epId)
          ? 'warning'
          : 'ok';

    addNode({
      id: `endpoint:${epId}`,
      label: epId,
      type: 'endpoint',
      status,
      metadata: { authRequired: ep.authRequired, risk: ep.risk },
    });

    // Match with DB tables
    const tableTouches = matchTablesForEndpoint(path, dbSchema);
    const ops = inferOperationsForMethod(method);
    for (const tt of tableTouches) {
      tt.operations = ops;
      edges.push({
        from: `endpoint:${epId}`,
        to: `table:${tt.table}`,
        label: ops.join(','),
        kind: 'queries',
      });
    }

    // Find caller page from appMap edges or correlate
    let callingPage = 'Direct API / Client';
    const callerEdge = appMap.edges.find(
      (e) =>
        (e.to === ep.id || e.to === epId || e.to.includes(path)) &&
        (e.from.startsWith('page:') || e.from.startsWith('/')),
    );
    if (callerEdge) {
      callingPage = callerEdge.from.replace(/^page:/, '');
    } else {
      const matchedPage = pageNodes.find(
        (p) => p.path && p.path.length > 1 && path.toLowerCase().includes(p.path.toLowerCase().replace(/^\//, '')),
      );
      if (matchedPage?.path) {
        callingPage = matchedPage.path;
      } else if (pageNodes.length > 0) {
        callingPage = pageNodes[lineage.length % pageNodes.length].path || '/';
      }
    }

    const cleanPath = path.startsWith('/') ? path : `/${path}`;

    // Lineage record
    lineage.push({
      id: `LIN-${method}-${cleanPath.replace(/[^a-zA-Z0-9]/g, '_')}`,
      pageOrFeature: callingPage.startsWith('Page:') ? callingPage : `Page: ${callingPage}`,
      endpoint: cleanPath,
      method,
      handler: ep.codeRef,
      tables: tableTouches,
      externalServices: ep.authRequired ? ['Identity Provider / Auth Vault'] : [],
    });
  }

  for (const code of codeNodes) {
    addNode({
      id: `controller:${code.id}`,
      label: code.id,
      type: 'controller',
      status: 'ok',
      metadata: { risk: code.risk },
    });
  }

  // 3. Connect AppMap edges (page -> endpoint, controller -> endpoint)
  for (const edge of appMap.edges) {
    const fromId = edge.from.startsWith('/') ? `page:${edge.from}` : edge.from;
    const toId = edge.to.startsWith('/') ? `page:${edge.to}` : edge.to;

    edges.push({
      from: fromId,
      to: toId,
      label: edge.kind,
      kind: edge.kind === 'calls' ? 'calls' : 'integrates',
    });
  }

  // If few/no explicit edges, connect pages to endpoints by common path
  if (edges.length === 0 && pageNodes.length > 0 && endpointNodes.length > 0) {
    for (const p of pageNodes) {
      for (const e of endpointNodes) {
        edges.push({
          from: `page:${p.path ?? '/'}`,
          to: `endpoint:${(e.method ?? 'GET').toUpperCase()} ${e.path ?? '/'}`,
          label: 'calls',
          kind: 'calls',
        });
      }
    }
  }

  return {
    nodes,
    edges,
    lineage,
    stats: {
      totalEndpoints: endpointNodes.length,
      totalPages: pageNodes.length,
      totalTables: dbSchema?.tables.length ?? 0,
      piiTablesCount: piiTablesSet.size,
    },
  };
}
