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
        <span>Test Builder — Katalog & Konfigurasi Skenario Uji</span>
        <button id="btn-suggest-scenarios" class="btn btn-secondary" style="height:24px; padding:0 8px; font-size:11px;">
          ⚡ ${t(lang, 'suggestScenarios')}
        </button>
      </div>
      <div class="panel-body">
        <!-- Guidance Banner for Step 2 -->
        <div style="font-size:11px; color:var(--text-muted); margin-bottom:12px; padding:8px 12px; background:var(--bg); border:1px solid var(--border); border-radius:3px; display:flex; justify-content:space-between; align-items:center;">
          <span>
            💡 <strong>Panduan Test Builder:</strong> Tambahkan skenario uji per-kategori di bawah ini atau klik <strong>"Sarankan Skenario"</strong> untuk rekomendasi otomatis. Setelah siap, klik <strong>"Lanjut ke Review Plan (Langkah 03) &rarr;"</strong>.
          </span>
        </div>

        <!-- Type Switcher Tabs (Scenario 2.1) -->
        <div class="type-switcher" id="type-switcher">
          ${defaultRegistry
            .list()
            .map(
              (item) => `
            <button class="type-pill ${item.type === activeType ? 'active' : ''}" data-type="${item.type}">
              ${item.label.en}
              <span class="pill-badge">${(state.testRows[item.type] ?? []).length}</span>
            </button>
          `,
            )
            .join('')}
        </div>
        <!-- Suggest Scenarios Diff Panel -->
        <div id="suggest-diff-panel" class="panel" style="display:none; margin-bottom:12px; background:var(--bg); border:1px solid var(--border-focus);">
          <div class="panel-header" style="font-size:11px; display:flex; justify-content:space-between; align-items:center;">
            <span>Review Usulan Skenario (Suggest Scenarios Diff)</span>
            <div style="display:flex; gap:6px;">
              <button type="button" id="btn-apply-suggest" class="btn btn-primary" style="height:22px; padding:0 8px; font-size:10px;">
                Terapkan ke Tabel (+ Baris)
              </button>
              <button type="button" id="btn-cancel-suggest" class="btn btn-secondary" style="height:22px; padding:0 8px; font-size:10px;">
                Batal
              </button>
            </div>
          </div>
          <div class="panel-body" id="suggest-diff-content" style="padding:10px 12px; font-family:var(--mono); font-size:11px; max-height:220px; overflow-y:auto;"></div>
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
          state.mode !== 'sandbox' &&
          !state.authorizationConfirmed &&
          activeType === 'security-passive'
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
                ${def?.columns
                  .map((c) => {
                    let minW = '';
                    if (c.key === 'scenario') minW = 'min-width:220px;';
                    else if (c.key === 'steps') minW = 'min-width:260px;';
                    else if (c.key === 'expected') minW = 'min-width:240px;';
                    return `<th style="${c.width ? `width:${c.width};` : ''}${minW}">${c.label.en}</th>`;
                  })
                  .join('')}
                <th style="width:60px; text-align:right;">ACTION</th>
              </tr>
            </thead>
            <tbody>
              ${rows
                .map(
                  (row, rIdx) => `
                <tr data-row-index="${rIdx}">
                  ${def?.columns
                    .map((col) => {
                      const val = row[col.key];
                      let minW = '';
                      if (col.key === 'scenario') minW = 'min-width:220px;';
                      else if (col.key === 'steps') minW = 'min-width:260px;';
                      else if (col.key === 'expected') minW = 'min-width:240px;';

                      if (col.kind === 'select' && Array.isArray(col.options)) {
                        const opts = col.options
                          .map((opt) => {
                            const isSelected = String(val ?? '') === String(opt.value);
                            const optText = opt.label[lang] ?? opt.label.en ?? opt.value;
                            return `<option value="${opt.value}" ${isSelected ? 'selected' : ''}>${optText}</option>`;
                          })
                          .join('');
                        return `
                    <td>
                      <select class="input-mono builder-cell" style="height:26px; padding:0 6px; font-size:11px; width:100%; ${minW}" data-field="${col.key}">
                        ${opts}
                      </select>
                    </td>
                  `;
                      }

                      if (col.kind === 'boolean') {
                        const isTrue = val === true || String(val) === 'true';
                        return `
                    <td>
                      <select class="input-mono builder-cell" style="height:26px; padding:0 6px; font-size:11px; width:100%; ${minW}" data-field="${col.key}">
                        <option value="true" ${isTrue ? 'selected' : ''}>true</option>
                        <option value="false" ${!isTrue ? 'selected' : ''}>false</option>
                      </select>
                    </td>
                  `;
                      }

                      return `
                    <td>
                      <input type="text" class="input-mono builder-cell" style="height:26px; padding:0 6px; font-size:11px; width:100%; ${minW}"
                        data-field="${col.key}" value="${String(val ?? '')}" />
                    </td>
                  `;
                    })
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

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px; padding-top:10px; border-top:1px solid var(--border);">
          <button id="btn-add-row" class="btn btn-secondary">
            + ${t(lang, 'addRow')}
          </button>
          <button id="btn-builder-to-plan" class="btn btn-primary">
            Lanjut ke Review Plan (Langkah 03) &rarr;
          </button>
        </div>
      </div>
    </div>
  `;
}
