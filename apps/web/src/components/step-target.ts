import { t } from '../i18n.js';
import type { PortalState } from '../state.js';

export function renderStep1Target(state: PortalState): string {
  const lang = state.language;
  const isProdSafe = state.mode === 'prod-safe';
  const isSandbox = state.mode === 'sandbox';

  const hasRepo = Boolean(state.repoUrl.trim());
  const hasWeb = Boolean(state.webUrls.trim());
  const hasApi = Boolean(state.apiBaseUrl.trim() || state.apiSpecUrl.trim());

  const activeLanes: string[] = [];
  if (hasRepo) activeLanes.push('repo');
  if (hasWeb) activeLanes.push('e2e', 'a11y', 'perf', 'security');
  if (hasApi && !activeLanes.includes('api')) activeLanes.push('api');

  return `
    <div class="panel">
      <div class="panel-header">
        <span>Execution Target & Mode Guard</span>
        <span class="tag tag-verified">ENGINE M1/M2 READY</span>
      </div>
      <div class="panel-body">
        <!-- Segmented Mode Control -->
        <label style="font-size:11px; font-weight:600; font-family:var(--mono); color:var(--text-muted); text-transform:uppercase; margin-bottom:6px; display:block;">
          Mode Guard (Strict Execution Boundary):
        </label>
        <div class="mode-selector">
          <div class="mode-opt ${state.mode === 'sandbox' ? 'selected' : ''}" data-mode="sandbox">
            <div class="mode-opt-title">
              <span>${t(lang, 'modeSandboxTitle').toUpperCase()}</span>
              <span class="tag tag-verified" style="font-size:10px;">EPHEMERAL</span>
            </div>
            <div class="mode-opt-desc">${t(lang, 'modeSandboxDesc')}</div>
          </div>
          <div class="mode-opt ${state.mode === 'staging' ? 'selected' : ''}" data-mode="staging">
            <div class="mode-opt-title">
              <span>${t(lang, 'modeStagingTitle').toUpperCase()}</span>
              <span class="tag tag-discovered" style="font-size:10px;">NON-PROD</span>
            </div>
            <div class="mode-opt-desc">${t(lang, 'modeStagingDesc')}</div>
          </div>
          <div class="mode-opt ${state.mode === 'prod-safe' ? 'selected' : ''}" data-mode="prod-safe">
            <div class="mode-opt-title">
              <span>${t(lang, 'modeProdSafeTitle').toUpperCase()}</span>
              <span class="tag tag-review" style="font-size:10px;">GET-ONLY</span>
            </div>
            <div class="mode-opt-desc">${t(lang, 'modeProdSafeDesc')}</div>
          </div>
        </div>

        <div class="banner banner-warn" id="banner-prod-safe" style="display:${isProdSafe ? 'flex' : 'none'};">
          <span>[OBSERVE-ONLY] ${t(lang, 'prodSafeBanner')}</span>
        </div>
        <!-- Segmented Scope Control -->
        <label style="font-size:11px; font-weight:600; font-family:var(--mono); color:var(--text-muted); text-transform:uppercase; margin-top:12px; margin-bottom:6px; display:block;">
          Scope (Execution Depth & Request Budget):
        </label>
        <div class="scope-selector">
          <div class="scope-opt ${state.scope === 'quick' ? 'selected' : ''}" data-scope="quick">
            <div class="scope-opt-title">
              <span>QUICK</span>
              <span class="tag tag-verified" style="font-size:9px;">~5-10s</span>
            </div>
            <div class="scope-opt-desc">~15 req/lane, 1x crawl, basic invariants</div>
          </div>
          <div class="scope-opt ${state.scope === 'standard' ? 'selected' : ''}" data-scope="standard">
            <div class="scope-opt-title">
              <span>STANDARD</span>
              <span class="tag tag-discovered" style="font-size:9px;">~20-30s</span>
            </div>
            <div class="scope-opt-desc">~45 req/lane, 3x crawl, full contracts & a11y</div>
          </div>
          <div class="scope-opt ${state.scope === 'deep' ? 'selected' : ''}" data-scope="deep">
            <div class="scope-opt-title">
              <span>DEEP</span>
              <span class="tag tag-review" style="font-size:9px;">~60-120s</span>
            </div>
            <div class="scope-opt-desc">~120 req/lane, deep fuzzing & exhaustive scan</div>
          </div>
          <div class="scope-opt ${state.scope === 'custom' ? 'selected' : ''}" data-scope="custom">
            <div class="scope-opt-title">
              <span>CUSTOM</span>
              <span class="tag tag-meta" style="font-size:9px;">TABLE-DRIVEN</span>
            </div>
            <div class="scope-opt-desc">Targeted test rows from Test Builder</div>
          </div>
        </div>


        <!-- Inputs Grid -->
        <div class="field-row">
          <label for="input-repo">${t(lang, 'repoUrlLabel')} <span class="field-key">repo.url | repo.localPath</span></label>
          <input type="text" id="input-repo" class="input-mono" value="${state.repoUrl}" placeholder="fixtures/sample-todo-api" />
          ${state.validationErrors.repo ? `<div class="field-error">${state.validationErrors.repo}</div>` : ''}
        </div>

        <div class="field-row">
          <label for="input-web">${t(lang, 'webUrlLabel')} <span class="field-key">web.urls</span></label>
          <input type="text" id="input-web" class="input-mono" value="${state.webUrls}" placeholder="https://mobospace-sandbox.pancaran-group.co.id/" />
          ${state.validationErrors.web ? `<div class="field-error">${state.validationErrors.web}</div>` : ''}
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
          <div class="field-row">
            <label for="input-api-base">${t(lang, 'apiBaseUrlLabel')} <span class="field-key">api.baseUrl</span></label>
            <input type="text" id="input-api-base" class="input-mono" value="${state.apiBaseUrl}" placeholder="http://127.0.0.1:3100" />
          </div>
          <div class="field-row">
            <label for="input-api-spec">${t(lang, 'apiSpecUrlLabel')} <span class="field-key">api.specUrl</span></label>
            <input type="text" id="input-api-spec" class="input-mono" value="${state.apiSpecUrl}" placeholder="/openapi.json" />
          </div>
        </div>

        <!-- Guided Login & Cookie Injection Controls -->
        <div class="field-row" style="margin-top:12px; padding:10px 12px; background:var(--bg); border:1px solid var(--border); border-radius:3px;">
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:600; font-size:12px; margin-bottom:4px;">
            <input type="checkbox" id="check-guided-login" />
            <span>Bantuan Login Interaktif (Guided Login: Buka browser, tunggu saya login, lalu lanjutkan otomatis)</span>
          </label>
          <div style="font-size:11px; color:var(--text-muted); margin-left:24px;">
            Sangat cocok untuk akun LDAP / SSO / 2FA kantor: Robot Playwright akan membuka browser nyata dan jeda hingga Anda selesai login, lalu otomatis mengambil alih untuk membedah seluruh halaman dalam.
          </div>
        </div>

        <div class="field-row" style="margin-top:8px;">
          <label for="input-session-cookies">Suntik Cookie Sesi (Opsional — misal: laravel_session=...):</label>
          <input type="text" id="input-session-cookies" class="input-mono" placeholder="laravel_session=eyJpdm...; XSRF-TOKEN=..." />
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-top:8px;">
          <div class="field-row">
            <label for="input-auth-ref">Vault Credential Ref <span class="field-key">auth.ref</span></label>
            <input type="text" id="input-auth-ref" class="input-mono" value="${state.authRef ?? ''}" placeholder="vault:qa/staging" />
          </div>
          <div class="field-row">
            <label for="input-login-url">Login Path Opsional <span class="field-key">auth.loginUrl</span></label>
            <input type="text" id="input-login-url" class="input-mono" value="${state.loginUrl ?? ''}" placeholder="/login" />
          </div>
        </div>

        <!-- Field Form Login Tambahan (Dropdown Akses / Role / Tenant) -->
        <div class="panel" style="background:var(--bg); border:1px solid var(--border); margin-top:8px;">
          <div class="panel-header" style="font-size:11px; display:flex; justify-content:space-between; align-items:center;">
            <span>Field Form Login Tambahan (Dropdown Akses / Role / Tenant)</span>
            <button type="button" id="btn-add-auth-field" class="btn btn-secondary" style="height:22px; padding:0 8px; font-size:10px;">
              + Tambah Field Login
            </button>
          </div>
          <div class="panel-body" style="padding:10px 12px;">
            <div id="auth-fields-container" style="display:flex; flex-direction:column; gap:8px;">
              ${(state.authFormFields ?? [])
                .map(
                  (f, idx) => `
                <div class="auth-field-row" data-idx="${idx}" style="display:grid; grid-template-columns: 2fr 1fr 2fr 36px; gap:8px; align-items:center;">
                  <input type="text" class="input-mono auth-field-target" placeholder="Target / Label / Selector (contoh: Akses)" value="${f.target}" />
                  <select class="input-mono auth-field-action">
                    <option value="select" ${f.action === 'select' ? 'selected' : ''}>select (Dropdown)</option>
                    <option value="fill" ${f.action === 'fill' ? 'selected' : ''}>fill (Teks)</option>
                    <option value="click" ${f.action === 'click' ? 'selected' : ''}>click (Klik)</option>
                    <option value="check" ${f.action === 'check' ? 'selected' : ''}>check (Centang)</option>
                  </select>
                  <input type="text" class="input-mono auth-field-value" placeholder="Nilai / Opsi (contoh: Internal)" value="${f.value}" />
                  <button type="button" class="btn btn-secondary btn-del-auth-field" style="height:28px; padding:0 6px; font-size:10px;">X</button>
                </div>
              `,
                )
                .join('')}
            </div>
            <div id="auth-fields-empty-hint" style="font-size:11px; color:var(--text-muted); ${(state.authFormFields?.length ?? 0) > 0 ? 'display:none;' : ''}">
              Belum ada field tambahan. Klik "+ Tambah Field Login" jika form login membutuhkan pilihan dropdown (seperti tipe akses Internal/Eksternal), role, atau tenant.
            </div>
          </div>
        </div>


        <!-- Authorization Block (Scenarios 1.5, 1.6) -->
        <div class="panel" id="auth-block" style="background:var(--bg); border-color:rgba(88,166,255,0.3); margin-top:12px; display:${!isSandbox ? 'block' : 'none'};">
          <div class="panel-header" style="font-size:11px;">Authorization & Approver Sign-off (Mandatory)</div>
          <div class="panel-body" style="padding:10px 12px;">
            <div class="field-row" style="margin-bottom:8px;">
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="checkbox" id="check-auth" ${state.authorizationConfirmed ? 'checked' : ''} />
                <span>${t(lang, 'authConfirmationLabel')}</span>
              </label>
              ${state.validationErrors.auth ? `<div class="field-error">${state.validationErrors.auth}</div>` : ''}
            </div>
            <div class="field-row" style="margin-bottom:0;">
              <label for="input-approver">${t(lang, 'approverLabel')} <span class="field-key">authorization.approvedBy</span></label>
              <input type="text" id="input-approver" class="input-mono" value="${state.approvedBy}" placeholder="approver@company.local" />
              ${state.validationErrors.approver ? `<div class="field-error">${state.validationErrors.approver}</div>` : ''}
            </div>
          </div>
        </div>

        <!-- Active Lanes Chips (Scenario 1.7) -->
        <div style="margin: 16px 0; padding-top:12px; border-top:1px solid var(--border);">
          <div style="font-size:11px; font-weight:600; font-family:var(--mono); color:var(--text-muted); text-transform:uppercase; margin-bottom:6px;">
            ${t(lang, 'activeLanes')}
          </div>
          <div id="active-lanes-chips" style="display:flex; gap:6px; flex-wrap:wrap;">
            ${activeLanes
              .map((l) => {
                const isPerfLocked = isProdSafe && l === 'perf';
                return `<span class="tag ${isPerfLocked ? 'tag-muted chip-interactive disabled' : 'tag-verified chip-interactive'}" data-lane="${l}" title="${isPerfLocked ? 'Perf locked in prod-safe' : 'Klik untuk toggle lane'}">${l.toUpperCase()}${isPerfLocked ? ' (LOCKED)' : ''}</span>`;
              })
              .join('')}
            ${activeLanes.length === 0 ? `<span class="tag tag-muted">NO TARGETS CONFIGURED</span>` : ''}
          </div>
        </div>
        <!-- Inline Dry Run Drawer -->
        <div id="dry-run-drawer" class="inline-drawer" style="display:none;">
          <div class="inline-drawer-header">
            <span id="dry-run-drawer-title" style="color:var(--text-bright);">HASIL UJI KERING (DRY RUN ESTIMATE)</span>
            <button type="button" id="btn-close-dry-run-drawer" class="btn btn-secondary" style="height:20px; padding:0 6px; font-size:10px;">TUTUP [X]</button>
          </div>
          <div class="inline-drawer-body" id="dry-run-drawer-content"></div>
        </div>

        <!-- Action Pathways: Fast-Track vs Gated Plan -->
        <div style="margin-top:16px; padding:12px; background:var(--bg); border:1px solid var(--border); border-radius:4px;">
          <div style="font-size:11px; font-weight:700; font-family:var(--mono); color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;">
            Pilih Alur Eksekusi Pengujian (Execution Workflow):
          </div>
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:12px;">
            <!-- Opsi A: Jalur Cepat Auto-Pilot -->
            <div style="border:1px solid var(--border); border-radius:3px; padding:12px; background:var(--surface); display:flex; flex-direction:column; justify-content:space-between;">
              <div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <span style="font-size:12px; font-weight:700; color:var(--text-bright);">1. Jalur Cepat (Auto-Pilot)</span>
                  <span class="tag tag-verified" style="font-size:9px;">1-KLIK</span>
                </div>
                <div style="font-size:11px; color:var(--text-muted); line-height:1.4; margin-bottom:10px;">
                  Sistem otomatis menyusun rencana uji, meng-approve kandidat aman, dan langsung melompat ke <strong>Langkah 04 Live Run</strong>.
                </div>
              </div>
              <div style="display:flex; gap:6px;">
                <button id="btn-run-everything" class="btn btn-primary" style="flex:1;">
                  ${t(lang, 'runEverything')} &rarr;
                </button>
                <button id="btn-dry-run" class="btn btn-secondary">
                  ${t(lang, 'dryRun')}
                </button>
              </div>
            </div>

            <!-- Opsi B: Jalur Bertahap (QA Governance) -->
            <div style="border:1px solid var(--border); border-radius:3px; padding:12px; background:var(--surface); display:flex; flex-direction:column; justify-content:space-between;">
              <div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <span style="font-size:12px; font-weight:700; color:var(--accent-fg);">2. Jalur Terkontrol (QA Gated)</span>
                  <span class="tag tag-discovered" style="font-size:9px;">BERTAHAP</span>
                </div>
                <div style="font-size:11px; color:var(--text-muted); line-height:1.4; margin-bottom:10px;">
                  Atur skenario uji kustom di <strong>Langkah 02 (Test Builder)</strong>, lalu tinjau & berikan persetujuan di <strong>Langkah 03 (Review Plan)</strong>.
                </div>
              </div>
              <button id="btn-goto-builder" class="btn btn-secondary" style="width:100%; height:32px;">
                ${t(lang, 'customizeBuilder')} (Langkah 02) &rarr;
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
