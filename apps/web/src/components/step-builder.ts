import { t } from '../i18n.js';
import { defaultRegistry } from '@nexus/registry';
import type { PortalState } from '../state.js';

export function renderStep2Builder(state: PortalState): string {
  const lang = state.language;
  const isProdSafe = state.mode === 'prod-safe';
  const activeType = state.activeBuilderType;
  const def = defaultRegistry.get(activeType);

  const rows = state.testRows[activeType] ?? [];

  return `
    <div class="panel">
      <div class="panel-header">
        <span>Test Builder — Registry Type Catalog</span>
        <button id="btn-suggest-scenarios" class="btn btn-secondary" style="height:24px; padding:0 8px; font-size:11px;">
          ${t(lang, 'suggestScenarios')}
        </button>
      </div>
      <div class="panel-body">
        <!-- Type Switcher Tabs (Scenario 2.1) -->
        <div class="type-switcher" id="type-switcher">
          ${defaultRegistry
            .list()
            .map(
              (item) => `
            <button class="type-pill ${item.type === activeType ? 'active' : ''}" data-type="${item.type}">
              ${item.label.en}
            </button>
          `,
            )
            .join('')}
        </div>

        <!-- Mode-aware Warnings (Scenarios 2.2, 2.3) -->
        ${
          isProdSafe && activeType === 'perf'
            ? `
          <div class="banner banner-danger" id="alert-perf-blocked">
            <span>[BLOCKED] Pengujian beban performa (perf) diblokir pada mode prod-safe untuk mencegah degradasi layanan target.</span>
          </div>
        `
            : ''
        }

        ${
          state.mode !== 'sandbox' && !state.authorizationConfirmed && activeType === 'security-passive'
            ? `
          <div class="banner banner-warn" id="alert-sec-unauth">
            <span>[AUTH REQUIRED] konfirmasi otorisasi pengujian pada Langkah 1 untuk mengaktifkan audit keamanan pasif.</span>
          </div>
        `
            : ''
        }

        <!-- Dense Data Table (Scenario 2.4) -->
        <div class="table-container">
          <table class="data-table" id="builder-table">
            <thead>
              <tr>
                ${def?.columns.map((c) => `<th style="${c.width ? `width:${c.width};` : ''}">${c.label.en}</th>`).join('')}
                <th style="width:60px; text-align:right;">ACTION</th>
              </tr>
            </thead>
            <tbody>
              ${rows
                .map(
                  (row, rIdx) => `
                <tr data-row-index="${rIdx}">
                  ${def?.columns
                    .map(
                      (col) => `
                    <td>
                      <input type="text" class="input-mono" style="height:26px; padding:0 6px; font-size:11px;"
                        data-field="${col.key}" value="${String(row[col.key] ?? '')}" />
                    </td>
                  `,
                    )
                    .join('')}
                  <td style="text-align:right;">
                    <button class="btn btn-secondary btn-del-row" style="height:22px; padding:0 6px; font-size:10px;" data-index="${rIdx}">
                      DEL
                    </button>
                  </td>
                </tr>
              `,
                )
                .join('')}
            </tbody>
          </table>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
          <button id="btn-add-row" class="btn btn-secondary">
            + ${t(lang, 'addRow')}
          </button>
          <button id="btn-builder-to-plan" class="btn btn-primary">
            Review Plan & Run ->
          </button>
        </div>
      </div>
    </div>
  `;
}
