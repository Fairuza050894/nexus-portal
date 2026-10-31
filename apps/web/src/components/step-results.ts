import { t } from '../i18n.js';
import type { PortalState } from '../state.js';

export function renderStep5Results(state: PortalState): string {
  const lang = state.language;
  const gate = state.gate ?? 'GO WITH RISKS';

  let gateBannerClass = 'banner-warn';
  let gateText = t(lang, 'gateRisks');
  if (gate === 'GO') {
    gateBannerClass = 'banner-success';
    gateText = t(lang, 'gateGo');
  } else if (gate === 'NO-GO') {
    gateBannerClass = 'banner-danger';
    gateText = t(lang, 'gateNoGo');
  }

  const verifiedCount = state.findings.filter((f) => f.confidence === 'verified').length;
  const autoCount = state.findings.filter((f) => f.confidence === 'auto-discovered').length;
  const reviewCount = state.findings.filter((f) => f.confidence === 'needs-review').length;
  const visualFindings = state.findings.filter((f) => f.lanes.includes('visual'));
  const hasVisualDrift = visualFindings.length > 0;
  const visualBadgeTag = hasVisualDrift ? 'tag-review' : 'tag-verified';
  const visualStatusText = hasVisualDrift
    ? 'TOLERANCE: 0.1% | OBSERVED: DRIFT DETECTED'
    : 'TOLERANCE: 0.1% | 0% DRIFT / BASELINE VERIFIED';

  // Build Lane Execution Breakdown
  const laneNames: Record<string, string> = {
    e2e: 'E2E / Functional Flows',
    a11y: 'A11y / Accessibility (WCAG)',
    perf: 'Perf / Web Vitals & Load',
    security: 'Security / DAST Radar',
    repo: 'Repo / Static Analysis',
    visual: 'Visual / UI Regression',
  };

  const defaultLanes = ['e2e', 'a11y', 'perf', 'security'];
  const displayLanes = state.lanes && state.lanes.length > 0
    ? state.lanes
    : defaultLanes.map((lane) => {
        const laneFindings = state.findings.filter((f) => f.lanes.includes(lane));
        const hasFail = laneFindings.some((f) => f.severity === 'critical' || f.severity === 'high');
        return {
          lane,
          status: hasFail ? ('failed' as const) : ('passed' as const),
          tests: 10,
          passed: hasFail ? 0 : 10,
          failed: hasFail ? 10 : 0,
          skipped: 0,
        };
      });

  return `
    <div class="panel">
      <div class="panel-header">
        <span>Execution Report & Quality Gate Verdict</span>
        <div style="display:flex; gap:6px;">
          <button id="btn-download-bundle" class="btn btn-primary" style="height:24px; padding:0 8px; font-size:11px;">
            ${t(lang, 'downloadBundle')}
          </button>
          <button id="btn-start-new-run" class="btn btn-secondary" style="height:24px; padding:0 8px; font-size:11px;">
            ${t(lang, 'startNewRun')}
          </button>
        </div>
      </div>
      <div class="panel-body">
        <!-- Gate Result Banner (Scenario 5.1) -->
        <div class="banner ${gateBannerClass}" style="font-weight:700; font-size:13px; margin-bottom:14px;">
          <span>Gate Result: ${gateText}</span>
        </div>

        <!-- Lane Execution Matrix / Test Results Breakdown -->
        <div style="margin-bottom:14px;">
          <div style="font-size:11px; font-weight:600; font-family:var(--mono); color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;">
            Per-Lane Execution & Test Results Breakdown:
          </div>
          <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:10px;">
            ${displayLanes
              .map((l) => {
                const title = laneNames[l.lane] || l.lane.toUpperCase();
                const total = l.tests ?? 0;
                const passed = l.passed ?? 0;
                const failed = l.failed ?? 0;
                const skipped = l.skipped ?? 0;
                const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '100.0';

                let statusBadge = 'tag-verified';
                let statusLabel = 'PASSED';
                let rateColor = 'var(--success-fg)';

                if (l.status === 'failed' || failed > 0) {
                  statusBadge = 'tag-critical';
                  statusLabel = 'FAILED';
                  rateColor = 'var(--danger-fg)';
                } else if (l.status === 'skipped') {
                  statusBadge = 'tag-muted';
                  statusLabel = 'SKIPPED';
                  rateColor = 'var(--text-muted)';
                } else if (l.status === 'running') {
                  statusBadge = 'tag-discovered';
                  statusLabel = 'RUNNING';
                  rateColor = 'var(--accent-fg)';
                }

                return `
                  <div class="kpi-box" style="text-align:left; padding:10px 12px; background:var(--bg); border:1px solid var(--border);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                      <span style="font-size:11px; font-weight:700; color:var(--text-bright); font-family:var(--mono);">${title}</span>
                      <span class="tag ${statusBadge}" style="font-size:9px; padding:1px 5px;">${statusLabel}</span>
                    </div>
                    <div style="font-size:18px; font-weight:700; font-family:var(--mono); color:${rateColor}; margin-bottom:4px;">
                      ${total > 0 ? `${passed}/${total} Passed` : 'N/A'}
                    </div>
                    <div class="progress-bar-bg" style="height:5px; margin-bottom:6px;">
                      <div class="progress-bar-fill ${l.status === 'passed' ? 'complete' : ''}" style="width:${passRate}%; background:${rateColor};"></div>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:10px; font-family:var(--mono); color:var(--text-muted);">
                      <span>Pass Rate: ${passRate}%</span>
                      <span>Fail: ${failed} | Skip: ${skipped}</span>
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>

        ${
          state.gateReasons.length > 0
            ? `
          <div style="margin-bottom:16px; background:var(--bg); padding:10px 12px; border-radius:3px; border:1px solid var(--border);">
            <div style="font-size:11px; font-weight:600; font-family:var(--mono); color:var(--text-muted); margin-bottom:6px; display:flex; justify-content:space-between;">
              <span>GATE REASONS & EVALUATION CRITERIA:</span>
              <span style="color:var(--danger-fg); font-size:10px;">${state.gateReasons.length} POLICY RULES TRIGGERED</span>
            </div>
            <ul style="padding-left:16px; font-size:12px; font-family:var(--mono); line-height:1.6;">
              ${state.gateReasons.map((r) => `<li>${r}</li>`).join('')}
            </ul>
          </div>
        `
            : ''
        }

        <!-- KPI Metrics (Scenario 5.2) -->
        <div class="kpi-grid" style="grid-template-columns:repeat(3, 1fr); margin-bottom:16px;">
          <div class="kpi-box">
            <div class="kpi-label">${t(lang, 'verifiedBadge')}</div>
            <div class="kpi-val" style="color:var(--success-fg);">${verifiedCount}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">${t(lang, 'autoDiscoveredBadge')}</div>
            <div class="kpi-val" style="color:var(--accent-fg);">${autoCount}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">${t(lang, 'needsReviewBadge')}</div>
            <div class="kpi-val" style="color:var(--warning-fg);">${reviewCount}</div>
          </div>
        </div>

        <!-- Correlated Findings Table (Scenario 5.3) -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <div style="font-size:11px; font-weight:600; font-family:var(--mono); color:var(--text-muted); text-transform:uppercase;">
            ${t(lang, 'findingsTitle')}
          </div>
          <div style="font-size:11px; font-family:var(--mono); color:var(--text-muted);" id="finding-total-count">
            Total: ${state.findings.length} temuan
          </div>
        </div>

        <!-- Search and Filter Bar for Findings -->
        <div style="display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap; align-items:center;">
          <input type="text" id="finding-search" class="input-mono" placeholder="Cari ID, judul, atau target..." style="height:26px; font-size:11px; flex:1; min-width:200px; max-width:320px;" />
          <select id="filter-finding-severity" class="select-mono" style="height:26px; font-size:11px; width:130px; background-color:var(--bg); color:var(--text-bright); border:1px solid var(--border);">
            <option value="">Semua Severity</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="info">Info</option>
          </select>
          <select id="filter-finding-lane" class="select-mono" style="height:26px; font-size:11px; width:120px; background-color:var(--bg); color:var(--text-bright); border:1px solid var(--border);">
            <option value="">Semua Lane</option>
            <option value="e2e">E2E</option>
            <option value="a11y">A11y</option>
            <option value="perf">Perf</option>
            <option value="security">Security</option>
            <option value="visual">Visual</option>
          </select>
          <select id="filter-finding-confidence" class="select-mono" style="height:26px; font-size:11px; width:140px; background-color:var(--bg); color:var(--text-bright); border:1px solid var(--border);">
            <option value="">Semua Confidence</option>
            <option value="verified">Verified</option>
            <option value="auto-discovered">Auto-Discovered</option>
            <option value="needs-review">Needs-Review</option>
          </select>
        </div>

        <div class="table-container">
          <table class="data-table" id="findings-table">
            <thead>
              <tr>
                <th style="width:80px;">FINDING ID</th>
                <th style="width:90px;">SEVERITY</th>
                <th style="width:120px;">CONFIDENCE</th>
                <th style="width:85px;">LANE</th>
                <th>TITLE & TARGET</th>
                <th style="width:85px; text-align:center;">DETAIL</th>
              </tr>
            </thead>
            <tbody>
              ${state.findings
                .map((f) => {
                  let confBadge = 'badge-verified tag-verified';
                  if (f.confidence === 'needs-review') confBadge = 'badge-review tag-review';
                  else if (f.confidence === 'auto-discovered')
                    confBadge = 'badge-discovered tag-discovered';

                  const targetMatch = f.evidenceSummary?.match(/targets?\s+([^;]+)/i);
                  const targetHint = targetMatch ? targetMatch[0] : (f.fingerprint ? `Ref: ${f.fingerprint.slice(0, 16)}...` : '');

                  return `
                  <tr class="finding-row" data-id="${f.id}" data-severity="${f.severity}" data-lane="${f.lanes.join(',')}" data-confidence="${f.confidence}" style="cursor:pointer;" title="Klik untuk inspeksi detail temuan">
                    <td style="font-family:var(--mono); font-weight:600;">${f.id}</td>
                    <td><span class="tag tag-${f.severity}">${f.severity.toUpperCase()}</span></td>
                    <td><span class="tag ${confBadge}">${f.confidence}</span></td>
                    <td><span class="tag tag-meta">${f.lanes.join(', ').toUpperCase()}</span></td>
                    <td>
                      <div style="font-weight:600; color:var(--text-bright);">${f.title}</div>
                      ${targetHint ? `<div style="font-size:10px; color:var(--text-muted); margin-top:2px; font-family:var(--mono);">${targetHint}</div>` : ''}
                    </td>
                    <td style="text-align:center;">
                      <span class="tag tag-meta" style="font-size:9px; cursor:pointer;">INSPEKSI &rarr;</span>
                    </td>
                  </tr>
                `;
                })
                .join('')}
              ${state.findings.length === 0 ? '<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">No findings recorded.</td></tr>' : ''}
            </tbody>
          </table>
        </div>

        <!-- Pagination Controls -->
        <div id="finding-pagination" style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; font-size:11px; font-family:var(--mono);">
          <span id="finding-page-info">Menampilkan 1-${Math.min(8, state.findings.length)} dari ${state.findings.length} temuan</span>
          <div style="display:flex; gap:6px; align-items:center;">
            <button type="button" id="btn-finding-prev" class="btn btn-secondary" style="height:24px; padding:0 8px; font-size:11px;" disabled>&larr; Prev</button>
            <span id="finding-page-num" style="padding:0 4px; color:var(--text-bright); font-weight:600;">Hal 1</span>
            <button type="button" id="btn-finding-next" class="btn btn-secondary" style="height:24px; padding:0 8px; font-size:11px;">Next &rarr;</button>
          </div>
        </div>

        <!-- Finding Inspector Drawer -->
        <div id="finding-inspector-drawer" class="inline-drawer" style="display:none; margin-top:14px; border-color:var(--border-focus);">
          <div class="inline-drawer-header">
            <span id="finding-inspector-title" style="color:var(--text-bright); font-weight:700;">FINDING INSPECTOR</span>
            <div style="display:flex; gap:6px;">
              <button type="button" id="btn-copy-jira-markdown" class="btn btn-secondary" style="height:22px; padding:0 8px; font-size:10px;">
                SALIN JIRA MARKDOWN
              </button>
              <button type="button" id="btn-close-finding-inspector" class="btn btn-secondary" style="height:22px; padding:0 8px; font-size:10px;">
                TUTUP [X]
              </button>
            </div>
          </div>
          <div class="inline-drawer-body" id="finding-inspector-content">
            <!-- Dynamically populated on finding row click -->
          </div>
        </div>

        <!-- Visual Regression Split-Screen Diff Slider (Phase 8.1) -->
        <div class="panel" id="visual-diff-panel" style="margin-top:20px;">
          <div class="panel-header">
            <span>Visual Regression Diff Inspector (Before vs After)</span>
            <span class="tag ${visualBadgeTag}">${visualStatusText}</span>
          </div>
          <div class="panel-body">
            <div style="display:flex; justify-content:space-between; font-size:11px; font-family:var(--mono); color:var(--text-muted); margin-bottom:6px;">
              <span>[LEFT] Production Baseline (Expected)</span>
              <span>[CENTER] Drag Slider to Compare</span>
              <span>[RIGHT] Staging Build (Actual)</span>
            </div>
            <div style="position:relative; width:100%; height:160px; overflow:hidden; border:1px solid var(--border); border-radius:3px; background:#04070b;">
              <div id="visual-before" style="position:absolute; top:0; left:0; width:50%; height:100%; overflow:hidden; border-right:2px solid var(--accent); background:#0e1520; z-index:2;">
                <div style="padding:14px; font-family:var(--mono); font-size:11px;">
                  <span class="tag tag-verified">BASELINE SNAPSHOT</span>
                  <p style="margin-top:8px; color:var(--text-muted);">Baseline layout verified (0% drift)</p>
                </div>
              </div>
              <div id="visual-after" style="position:absolute; top:0; left:0; width:100%; height:100%; background:#090d13; z-index:1;">
                <div style="padding:14px; padding-left:calc(50% + 16px); font-family:var(--mono); font-size:11px;">
                  ${
                    hasVisualDrift
                      ? `<span class="tag tag-review">STAGING ACTUAL SNAPSHOT</span>
                         <p style="margin-top:8px; color:var(--warning-fg);">${visualFindings[0].title || 'Shifted element detected'}</p>`
                      : `<span class="tag tag-verified">STAGING BUILD MATCHES BASELINE</span>
                         <p style="margin-top:8px; color:var(--success-fg);">No visual regression detected (0% drift / Baseline Verified)</p>`
                  }
                </div>
              </div>
            </div>
            <div style="margin-top:8px; display:flex; align-items:center; gap:10px;">
              <span style="font-size:11px; font-family:var(--mono); color:var(--text-muted);">SPLIT POSITION:</span>
              <input type="range" min="0" max="100" value="50" style="flex:1; cursor:pointer;" id="slider-visual-diff" />
              <span style="font-size:11px; font-family:var(--mono); color:var(--text-bright);" id="slider-pos-val">50%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
