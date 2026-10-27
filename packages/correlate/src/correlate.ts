import type { Finding, FindingSeverity } from '@nexus/core';
import { classifySignal, determineConfidence, determineSeverity } from './classify.js';
import { dedupeFindings, deriveRuleId, findingFingerprint } from './fingerprint.js';
import type { CorrelationOptions, CorrelationResult, RawSignal } from './types.js';

function normalizeTarget(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function targetsMatch(a: string, b: string): boolean {
  const normA = normalizeTarget(a);
  const normB = normalizeTarget(b);
  return normA.includes(normB) || normB.includes(normA);
}

export function correlateSignals(
  rawSignals: RawSignal[],
  options: CorrelationOptions = {},
): CorrelationResult {
  if (rawSignals.length === 0) {
    return {
      findings: [],
      confidenceTotals: { verified: 0, autoDiscovered: 0, needsReview: 0 },
      categoryTotals: {},
      severityTotals: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    };
  }

  // Group signals by primary correlation signature
  interface GroupedCluster {
    key: string;
    signals: RawSignal[];
    category: string;
    severity: FindingSeverity;
    lanes: Set<string>;
    pages: Set<string>;
    endpoints: Set<string>;
    components: Set<string>;
    evidence: Array<Record<string, unknown>>;
    requirements: Set<string>;
    codeRefs: Map<string, { file: string; line?: number; commit?: string }>;
    ruleIds: Set<string>;
  }

  const clusters = new Map<string, GroupedCluster>();

  for (const signal of rawSignals) {
    const category = classifySignal(signal);
    const severity = determineSeverity({ ...signal, category });
    const signalRuleId = deriveRuleId(signal);
    const pageTargets = new Set<string>();
    const endpointTargets = new Set<string>();
    const componentTargets = new Set<string>();
    if (signal.page) pageTargets.add(signal.page);
    if (signal.endpoint) endpointTargets.add(signal.endpoint);
    if (signal.component) componentTargets.add(signal.component);
    for (const target of signal.affected ?? []) {
      if (typeof target.page === 'string') pageTargets.add(target.page);
      if (typeof target.endpoint === 'string') endpointTargets.add(target.endpoint);
      if (typeof target.component === 'string') componentTargets.add(target.component);
    }
    const primaryPage = [...pageTargets][0];
    const primaryEndpoint = [...endpointTargets][0];
    const primaryComponent = [...componentTargets][0];

    // Derive correlation key based on category, rule identity, and targets.
    let key = '';
    if (category === 'accessibility') {
      key = `a11y:${signalRuleId}`;
    } else if (category === 'security') {
      key = `sec:${signalRuleId}${
        primaryComponent ? `:${primaryComponent.toLowerCase()}` : ''
      }`;
    } else if (category === 'performance') {
      key = `perf:${signalRuleId}`;
    } else if (primaryEndpoint) {
      key = `endpoint:${primaryEndpoint.toLowerCase()}:${signalRuleId}`;
    } else if (primaryPage) {
      key = `page:${primaryPage.toLowerCase()}:${signalRuleId}`;
    } else {
      key = `misc:${category}:${signalRuleId}`;
    }

    // Check if this signal correlates with an existing cluster via AppMap edges
    if (options.appMap && (primaryPage || primaryEndpoint)) {
      for (const [existingKey, cluster] of clusters.entries()) {
        if (primaryEndpoint && cluster.pages.size > 0) {
          for (const page of cluster.pages) {
            const hasEdge = options.appMap.edges.some(
              (edge) =>
                (targetsMatch(edge.from, page) && targetsMatch(edge.to, primaryEndpoint)) ||
                (targetsMatch(edge.to, page) && targetsMatch(edge.from, primaryEndpoint)),
            );
            if (hasEdge) {
              key = existingKey;
              break;
            }
          }
        } else if (primaryPage && cluster.endpoints.size > 0) {
          for (const endpoint of cluster.endpoints) {
            const hasEdge = options.appMap.edges.some(
              (edge) =>
                (targetsMatch(edge.from, primaryPage) && targetsMatch(edge.to, endpoint)) ||
                (targetsMatch(edge.to, primaryPage) && targetsMatch(edge.from, endpoint)),
            );
            if (hasEdge) {
              key = existingKey;
              break;
            }
          }
        }
      }
    }

    let cluster = clusters.get(key);
    if (!cluster) {
      cluster = {
        key,
        signals: [],
        category,
        severity,
        lanes: new Set<string>(),
        pages: new Set<string>(),
        endpoints: new Set<string>(),
        components: new Set<string>(),
        evidence: [],
        requirements: new Set<string>(),
        codeRefs: new Map(),
        ruleIds: new Set<string>(),
      };
      clusters.set(key, cluster);
    }

    cluster.signals.push(signal);
    cluster.lanes.add(signal.lane);
    cluster.ruleIds.add(signalRuleId);
    if (signal.page) cluster.pages.add(signal.page);
    if (signal.endpoint) cluster.endpoints.add(signal.endpoint);
    if (signal.component) cluster.components.add(signal.component);
    for (const target of signal.affected ?? []) {
      if (typeof target.page === 'string') cluster.pages.add(target.page);
      if (typeof target.endpoint === 'string') cluster.endpoints.add(target.endpoint);
      if (typeof target.component === 'string') cluster.components.add(target.component);
    }
    if (signal.requirements) {
      for (const req of signal.requirements) cluster.requirements.add(req);
    }
    if (signal.evidence) {
      for (const ev of signal.evidence) cluster.evidence.push(ev);
    }
    if (signal.codeFile) {
      cluster.codeRefs.set(signal.codeFile, {
        file: signal.codeFile,
        line: signal.codeLine,
        commit: signal.commit,
      });
    }

    // Escalate severity if incoming signal is more severe
    const severityRank: Record<FindingSeverity, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
      info: 0,
    };
    if (severityRank[severity] > severityRank[cluster.severity]) {
      cluster.severity = severity;
    }
  }

  // Convert clusters into unified Findings
  let findings: Finding[] = [];

  for (const cluster of clusters.values()) {
    const primarySignal = cluster.signals[0];
    const occurrences = cluster.signals.reduce(
      (total, signal) => total + (signal.occurrences ?? 1),
      0,
    );

    // Attach code files from Application Map "implemented-by" edges. Nodes are
    // matched by id/path so an endpoint failure links to the file that serves it.
    if (cluster.codeRefs.size === 0 && options.appMap) {
      const { nodes, edges } = options.appMap;
      const nodeIds = new Set<string>();
      for (const endpoint of cluster.endpoints) {
        for (const node of nodes) {
          if (targetsMatch(`${node.method ?? ''} ${node.path ?? node.id}`, endpoint)) {
            nodeIds.add(node.id);
          }
        }
      }
      for (const edge of edges) {
        if (edge.kind !== 'implemented-by') continue;
        if (!nodeIds.has(edge.from) && !nodeIds.has(edge.to)) continue;
        const codeId = nodeIds.has(edge.from) ? edge.to : edge.from;
        const codeNode = nodes.find((node) => node.id === codeId && node.type === 'code');
        const file = codeNode?.codeRef ?? codeNode?.path;
        if (file) cluster.codeRefs.set(file, { file });
      }
    }

    // Match suggested owner from CODEOWNERS
    let suggestedOwner = primarySignal.suggestedOwner;
    if (!suggestedOwner && options.codeOwners && cluster.codeRefs.size > 0) {
      const firstFile = Array.from(cluster.codeRefs.keys())[0];
      for (const [pattern, owner] of Object.entries(options.codeOwners)) {
        if (firstFile.includes(pattern.replace(/\*/g, ''))) {
          suggestedOwner = owner;
          break;
        }
      }
    }

    const affected: Array<Record<string, unknown>> = [];
    for (const page of cluster.pages) affected.push({ page });
    for (const endpoint of cluster.endpoints) affected.push({ endpoint });
    for (const component of cluster.components) affected.push({ component });
    affected.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

    // Compute title with correlated multi-lane context
    let title = primarySignal.title;
    if (cluster.lanes.size > 1 && cluster.endpoints.size > 0 && cluster.pages.size > 0) {
      const page = Array.from(cluster.pages)[0];
      const endpoint = Array.from(cluster.endpoints)[0];
      title = `Page ${page} failed: associated endpoint ${endpoint} returned error`;
    } else if (cluster.signals.length > 1 && cluster.category === 'accessibility') {
      const rule = primarySignal.title.replace(/^a11y:\s*/, '');
      title = `${rule} across ${cluster.pages.size || cluster.signals.length} pages`;
    }

    const confidence = determineConfidence({
      confidence: primarySignal.confidence,
      requirements: Array.from(cluster.requirements),
      expected: primarySignal.expected,
      category: cluster.category,
      lane: Array.from(cluster.lanes)[0],
    });

    const ruleId = [...cluster.ruleIds].sort().join('+') || 'unknown';
    const finding: Finding = {
      id: '',
      title,
      ruleId,
      severity: cluster.severity,
      confidence,
      category: cluster.category,
      lanes: [...cluster.lanes].sort(),
      occurrences,
      affected: affected.length > 0 ? affected : undefined,
      evidence: cluster.evidence,
      reproduction: primarySignal.reproduction,
      expected: primarySignal.expected,
      actual: primarySignal.actual,
      codeRefs: cluster.codeRefs.size > 0 ? Array.from(cluster.codeRefs.values()) : undefined,
      requirements: cluster.requirements.size > 0 ? Array.from(cluster.requirements) : undefined,
      status: 'new',
      ...(options.currentRunId
        ? { firstSeenRun: options.currentRunId, lastSeenRun: options.currentRunId }
        : {}),
      suggestedOwner,
      suggestedFix: primarySignal.suggestedFix,
    };
    finding.fingerprint = findingFingerprint(finding);
    findings.push(finding);
  }

  findings = dedupeFindings(findings);

  // Tally totals
  const confidenceTotals = {
    verified: findings.filter((f) => f.confidence === 'verified').length,
    autoDiscovered: findings.filter((f) => f.confidence === 'auto-discovered').length,
    needsReview: findings.filter((f) => f.confidence === 'needs-review').length,
  };

  const categoryTotals: Record<string, number> = {};
  for (const f of findings) {
    categoryTotals[f.category] = (categoryTotals[f.category] ?? 0) + 1;
  }

  const severityTotals: Record<FindingSeverity, number> = {
    critical: findings.filter((f) => f.severity === 'critical').length,
    high: findings.filter((f) => f.severity === 'high').length,
    medium: findings.filter((f) => f.severity === 'medium').length,
    low: findings.filter((f) => f.severity === 'low').length,
    info: findings.filter((f) => f.severity === 'info').length,
  };

  return {
    findings,
    confidenceTotals,
    categoryTotals,
    severityTotals,
  };
}
