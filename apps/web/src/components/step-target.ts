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
            ${activeLanes.map((l) => `<span class="tag tag-verified">${l.toUpperCase()}</span>`).join('')}
            ${activeLanes.length === 0 ? `<span class="tag tag-muted">NO TARGETS CONFIGURED</span>` : ''}
          </div>
        </div>

        <!-- Action Bar -->
        <div style="display:flex; justify-content:space-between; align-items:center; padding-top:10px; border-top:1px solid var(--border);">
          <div style="display:flex; gap:8px;">
            <button id="btn-run-everything" class="btn btn-primary">
              ${t(lang, 'runEverything')}
            </button>
            <button id="btn-dry-run" class="btn btn-secondary">
              ${t(lang, 'dryRun')}
            </button>
          </div>
          <button id="btn-goto-builder" class="btn btn-secondary">
            ${t(lang, 'customizeBuilder')} ->
          </button>
        </div>
      </div>
    </div>
  `;
}
