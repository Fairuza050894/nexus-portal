import { t } from '../i18n.js';
import type { PortalState } from '../state.js';

export function renderStep3PlanReview(state: PortalState): string {
  const lang = state.language;
  const cases = state.planCases;

  const toRun = cases.filter((c) => state.approvedCaseIds.has(c.id) && c.modeCompatibility === 'allowed').length;
  const needsApproval = cases.filter((c) => c.confidence === 'needs-review' && c.modeCompatibility === 'allowed').length;
  const skippedByMode = cases.filter((c) => c.modeCompatibility === 'skipped-by-mode').length;

  return `
    <div class="panel">
      <div class="panel-header">
        <span>Execution Plan & Case Approvals</span>
        <button id="btn-approve-all-safe" class="btn btn-secondary" style="height:24px; padding:0 8px; font-size:11px;">
          ${t(lang, 'approveAllSafe')}
        </button>
      </div>
      <div class="panel-body">
        <!-- KPI Metrics (Scenario 3.1) -->
        <div class="kpi-grid">
          <div class="kpi-box">
            <div class="kpi-label">Total Kandidat</div>
            <div class="kpi-val">${cases.length}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">Akan Dijalankan</div>
            <div class="kpi-val" style="color:var(--success-fg);">${toRun}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">${t(lang, 'needsApprovalChip')}</div>
            <div class="kpi-val" style="color:var(--warning-fg);">${needsApproval}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">Dilewati Mode</div>
            <div class="kpi-val" style="color:var(--text-muted);">${skippedByMode}</div>
          </div>
        </div>

        <!-- Cases Table (Scenarios 3.2, 3.3, 3.8) -->
        <div class="table-container">
          <table class="data-table" id="plan-table">
            <thead>
              <tr>
                <th style="width:36px;">SEL</th>
                <th style="width:110px;">CASE ID</th>
                <th>SCENARIO TITLE</th>
                <th style="width:80px;">LANE</th>
                <th style="width:90px;">SOURCE</th>
                <th style="width:120px;">CONFIDENCE</th>
                <th style="width:80px;">PRIORITY</th>
              </tr>
            </thead>
            <tbody>
              ${cases
                .map((c) => {
                  const isSkipped = c.modeCompatibility === 'skipped-by-mode';
                  const isChecked = state.approvedCaseIds.has(c.id) && !isSkipped;

                  let confBadge = 'badge-verified tag-verified';
                  if (c.confidence === 'needs-review') confBadge = 'badge-review tag-review';
                  else if (c.confidence === 'auto-discovered') confBadge = 'badge-discovered tag-discovered';

                  return `
                  <tr class="${isSkipped ? 'row-skipped' : ''}">
                    <td>
                      ${
                        isSkipped
                          ? '<span class="tag tag-muted" style="font-size:9px;">LOCKED</span>'
                          : `<input type="checkbox" class="plan-checkbox" data-id="${c.id}" ${isChecked ? 'checked' : ''} />`
                      }
                    </td>
                    <td style="font-family:var(--mono); font-weight:600;">${c.id}</td>
                    <td>${c.title}</td>
                    <td><span class="tag tag-meta">${c.lane.toUpperCase()}</span></td>
                    <td style="color:var(--text-muted); font-size:11px; font-family:var(--mono);">${c.source}</td>
                    <td>
                      ${
                        isSkipped
                          ? `<span class="tag tag-muted">${t(lang, 'skippedByModeBadge')}</span>`
                          : `<span class="tag ${confBadge}">${c.confidence}</span>`
                      }
                    </td>
                    <td><span class="tag tag-meta">${c.priority}</span></td>
                  </tr>
                `;
                })
                .join('')}
            </tbody>
          </table>
        </div>

        ${state.validationErrors.plan ? `<div class="field-error" style="margin-bottom:12px;">${state.validationErrors.plan}</div>` : ''}

        <div style="display:flex; justify-content:flex-end; margin-top:16px;">
          <button id="btn-approve-and-run" class="btn btn-primary">
            ${t(lang, 'approveAndRun')}
          </button>
        </div>
      </div>
    </div>
  `;
}
