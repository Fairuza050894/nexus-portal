import { t } from './i18n.js';
import { defaultRegistry } from '@nexus/registry';
import type { PortalState, PortalStep } from './state.js';

export function renderPortalHtml(state: PortalState): string {
  const lang = state.language;


  // Compute active lanes preview for Step 1
  const hasRepo = Boolean(state.repoUrl.trim());
  const hasWeb = Boolean(state.webUrls.trim());
  const hasApi = Boolean(state.apiBaseUrl.trim() || state.apiSpecUrl.trim());

  const activeLanes: string[] = [];
  if (hasRepo) activeLanes.push('repo');
  if (hasWeb) {
    activeLanes.push('e2e', 'a11y', 'perf', 'security');
  }
  if (hasApi && !activeLanes.includes('api')) {
    activeLanes.push('api');
  }

  // Estimated requests & duration

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${t(lang, 'appTitle')} — ${t(lang, 'appSubtitle')}</title>
  <style>
    :root {
      --bg: #0b0f17;
      --surface: #111827;
      --surface-elevated: #1a2234;
      --border: #232f46;
      --border-focus: #3b82f6;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #3b82f6;
      --accent-hover: #2563eb;
      --success: #10b981;
      --success-bg: rgba(16, 185, 129, 0.12);
      --warning: #f59e0b;
      --warning-bg: rgba(245, 158, 11, 0.12);
      --danger: #ef4444;
      --danger-bg: rgba(239, 68, 68, 0.12);
      --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--sans);
      font-size: 14px;
      line-height: 1.5;
      padding: 0;
      margin: 0;
      -webkit-font-smoothing: antialiased;
    }

    /* Layout */
    .app-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 24px 20px;
    }

    /* Header */
    header.top-nav {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 24px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-logo {
      width: 28px;
      height: 28px;
      background: var(--accent);
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      color: #fff;
      font-family: var(--mono);
      font-size: 14px;
    }
    .brand-text h1 {
      font-size: 18px;
      font-weight: 600;
      letter-spacing: -0.02em;
    }
    .brand-text p {
      font-size: 12px;
      color: var(--text-muted);
    }
    .nav-controls {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-family: var(--mono);
      font-weight: 500;
      border: 1px solid transparent;
    }
    .badge-role { background: var(--surface-elevated); border-color: var(--border); color: var(--text-muted); }
    .badge-verified { background: var(--success-bg); color: var(--success); border-color: rgba(16,185,129,0.3); }
    .badge-discovered { background: rgba(59,130,246,0.12); color: var(--accent); border-color: rgba(59,130,246,0.3); }
    .badge-review { background: var(--warning-bg); color: var(--warning); border-color: rgba(245,158,11,0.3); }
    .badge-skipped { background: rgba(148,163,184,0.1); color: var(--text-muted); border-color: var(--border); }

    /* Step Navigation Bar */
    .step-bar {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 8px;
      margin-bottom: 28px;
    }
    .step-item {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 12px 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 10px;
      transition: all 0.15s ease;
      color: var(--text-muted);
      user-select: none;
    }
    .step-item.active {
      border-color: var(--accent);
      background: var(--surface-elevated);
      color: var(--text);
    }
    .step-item.complete {
      color: var(--text);
      border-color: rgba(59,130,246,0.3);
    }
    .step-item.disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .step-number {
      font-family: var(--mono);
      font-size: 13px;
      font-weight: 700;
      color: var(--accent);
    }
    .step-title {
      font-size: 13px;
      font-weight: 500;
    }

    /* Content Cards */
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .card-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    /* Form Inputs */
    .form-group {
      margin-bottom: 18px;
    }
    .form-group label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 6px;
      color: var(--text);
    }
    .form-control {
      width: 100%;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 9px 12px;
      font-size: 13px;
      color: var(--text);
      outline: none;
      transition: border-color 0.15s ease;
      font-family: var(--mono);
    }
    .form-control:focus {
      border-color: var(--border-focus);
    }
    .form-error {
      font-size: 12px;
      color: var(--danger);
      margin-top: 5px;
    }
    .form-help {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 4px;
    }

    /* Mode Selection Grid */
    .mode-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }
    .mode-card {
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 16px;
      background: var(--bg);
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .mode-card.selected {
      border-color: var(--accent);
      background: rgba(59,130,246,0.06);
    }
    .mode-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .mode-name { font-weight: 600; font-size: 14px; }
    .mode-desc { font-size: 12px; color: var(--text-muted); }

    /* Persistent Banners */
    .alert-banner {
      padding: 12px 16px;
      border-radius: 4px;
      margin-bottom: 20px;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 10px;
      border: 1px solid;
    }
    .alert-banner-warning { background: var(--warning-bg); border-color: rgba(245,158,11,0.3); color: var(--warning); }
    .alert-banner-danger { background: var(--danger-bg); border-color: rgba(239,68,68,0.3); color: var(--danger); }
    .alert-banner-success { background: var(--success-bg); border-color: rgba(16,185,129,0.3); color: var(--success); }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 9px 16px;
      font-size: 13px;
      font-weight: 600;
      border-radius: 4px;
      border: 1px solid transparent;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.15s ease;
    }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-primary:hover { background: var(--accent-hover); }
    .btn-secondary { background: var(--surface-elevated); border-color: var(--border); color: var(--text); }
    .btn-secondary:hover { background: var(--border); }
    .btn-danger { background: var(--danger); color: #fff; }

    /* Data Tables */
    .table-container {
      overflow-x: auto;
      border: 1px solid var(--border);
      border-radius: 4px;
      margin-bottom: 16px;
    }
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      text-align: left;
    }
    table.data-table th {
      background: var(--surface-elevated);
      padding: 10px 14px;
      font-weight: 600;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border);
      font-family: var(--mono);
      font-size: 12px;
      white-space: nowrap;
    }
    table.data-table td {
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
      background: var(--surface);
      vertical-align: middle;
    }
    table.data-table tr:last-child td { border-bottom: none; }
    table.data-table tr:hover td { background: var(--surface-elevated); }

    /* Terminal Console */
    .terminal-box {
      background: #05080e;
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 14px;
      font-family: var(--mono);
      font-size: 12px;
      color: #cbd5e1;
      height: 260px;
      overflow-y: auto;
      line-height: 1.6;
    }
    .log-line { display: block; margin-bottom: 2px; }
    .log-line-stage { color: var(--accent); font-weight: 600; }
    .log-line-error { color: var(--danger); }

    /* Filter Pills */
    .type-switcher {
      display: flex;
      gap: 6px;
      margin-bottom: 16px;
      overflow-x: auto;
      padding-bottom: 4px;
    }
    .type-pill {
      padding: 6px 14px;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 500;
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--text-muted);
      cursor: pointer;
      white-space: nowrap;
    }
    .type-pill.active {
      background: var(--surface-elevated);
      border-color: var(--accent);
      color: var(--text);
    }
  </style>
</head>
<body>
  <div class="app-container">
    <!-- Header -->
    <header class="top-nav">
      <div class="brand">
        <div class="brand-logo">NX</div>
        <div class="brand-text">
          <h1>${t(lang, 'appTitle')}</h1>
          <p>${t(lang, 'appSubtitle')}</p>
        </div>
      </div>
      <div class="nav-controls">
        <span class="badge badge-role">Role: ${state.userRole.toUpperCase()}</span>
        <button id="btn-toggle-lang" class="btn btn-secondary" style="padding: 4px 10px; font-size: 12px;">
          ${lang === 'id' ? 'ID 🇮🇩' : 'EN 🇬🇧'}
        </button>
      </div>
    </header>

    <!-- 5-Step Navigation Header -->
    <nav class="step-bar">
      ${renderStepNav(state, 1, t(lang, 'step1'))}
      ${renderStepNav(state, 2, t(lang, 'step2'))}
      ${renderStepNav(state, 3, t(lang, 'step3'))}
      ${renderStepNav(state, 4, t(lang, 'step4'))}
      ${renderStepNav(state, 5, t(lang, 'step5'))}
    </nav>

    <!-- Main Step Views -->
    <main id="portal-content">
      ${renderActiveStep(state)}
    </main>
  </div>
</body>
</html>`;
}

function renderStepNav(state: PortalState, step: PortalStep, label: string): string {
  const isActive = state.currentStep === step;
  const isComplete = state.furthestStep > step;
  const isAccessible = state.furthestStep >= step;

  let classes = 'step-item';
  if (isActive) classes += ' active';
  else if (isComplete) classes += ' complete';
  if (!isAccessible) classes += ' disabled';

  return `
    <div class="${classes}" data-step="${step}">
      <span class="step-number">${step}</span>
      <span class="step-title">${label}</span>
    </div>
  `;
}

function renderActiveStep(state: PortalState): string {
  switch (state.currentStep) {
    case 1:
      return renderStep1Target(state);
    case 2:
      return renderStep2Builder(state);
    case 3:
      return renderStep3PlanReview(state);
    case 4:
      return renderStep4LiveRun(state);
    case 5:
      return renderStep5Results(state);
  }
}

function renderStep1Target(state: PortalState): string {
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
    <div class="card">
      <div class="card-title">
        <span>Target Aplikasi & Mode Eksekusi</span>
        <span class="badge badge-role">M1 / M2 Engine Ready</span>
      </div>

      <!-- Mode selection grid -->
      <label style="font-weight:600; margin-bottom:8px; display:block;">Pilih Mode Eksekusi (Mode Guard):</label>
      <div class="mode-grid">
        <div class="mode-card ${state.mode === 'sandbox' ? 'selected' : ''}" data-mode="sandbox">
          <div class="mode-header">
            <span class="mode-name">${t(lang, 'modeSandboxTitle')}</span>
            <span class="badge badge-verified">Ephemeral</span>
          </div>
          <div class="mode-desc">${t(lang, 'modeSandboxDesc')}</div>
        </div>
        <div class="mode-card ${state.mode === 'staging' ? 'selected' : ''}" data-mode="staging">
          <div class="mode-header">
            <span class="mode-name">${t(lang, 'modeStagingTitle')}</span>
            <span class="badge badge-discovered">Non-Prod</span>
          </div>
          <div class="mode-desc">${t(lang, 'modeStagingDesc')}</div>
        </div>
        <div class="mode-card ${state.mode === 'prod-safe' ? 'selected' : ''}" data-mode="prod-safe">
          <div class="mode-header">
            <span class="mode-name">${t(lang, 'modeProdSafeTitle')}</span>
            <span class="badge badge-review">Observe-Only</span>
          </div>
          <div class="mode-desc">${t(lang, 'modeProdSafeDesc')}</div>
        </div>
      </div>

      <!-- Prod safe banner -->
      ${
        isProdSafe
          ? `<div class="alert-banner alert-banner-warning" id="banner-prod-safe">
              <span>⚠️ ${t(lang, 'prodSafeBanner')}</span>
            </div>`
          : ''
      }

      <!-- Target input fields -->
      <div class="form-group">
        <label for="input-repo">${t(lang, 'repoUrlLabel')}</label>
        <input type="text" id="input-repo" class="form-control" value="${state.repoUrl}" placeholder="fixtures/sample-todo-api" />
        ${state.validationErrors.repo ? `<div class="form-error">${state.validationErrors.repo}</div>` : ''}
      </div>

      <div class="form-group">
        <label for="input-web">${t(lang, 'webUrlLabel')}</label>
        <input type="text" id="input-web" class="form-control" value="${state.webUrls}" placeholder="http://127.0.0.1:3100/" />
        ${state.validationErrors.web ? `<div class="form-error">${state.validationErrors.web}</div>` : ''}
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
        <div class="form-group">
          <label for="input-api-base">${t(lang, 'apiBaseUrlLabel')}</label>
          <input type="text" id="input-api-base" class="form-control" value="${state.apiBaseUrl}" placeholder="http://127.0.0.1:3100" />
        </div>
        <div class="form-group">
          <label for="input-api-spec">${t(lang, 'apiSpecUrlLabel')}</label>
          <input type="text" id="input-api-spec" class="form-control" value="${state.apiSpecUrl}" placeholder="/openapi.json" />
        </div>
      </div>

      <!-- Authorization block: Hidden in sandbox, shown in staging/prod-safe (Scenarios 1.5, 1.6) -->
      ${
        !isSandbox
          ? `
        <div class="card" id="auth-block" style="background:var(--bg); border-color:rgba(59,130,246,0.3); margin-top:16px;">
          <div class="card-title" style="font-size:14px; margin-bottom:12px;">Konfirmasi Otorisasi Pengujian (Wajib)</div>
          <div class="form-group" style="margin-bottom:12px;">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
              <input type="checkbox" id="check-auth" ${state.authorizationConfirmed ? 'checked' : ''} />
              <span>${t(lang, 'authConfirmationLabel')}</span>
            </label>
            ${state.validationErrors.auth ? `<div class="form-error">${state.validationErrors.auth}</div>` : ''}
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label for="input-approver">${t(lang, 'approverLabel')}</label>
            <input type="text" id="input-approver" class="form-control" value="${state.approvedBy}" placeholder="approver@company.local" />
            ${state.validationErrors.approver ? `<div class="form-error">${state.validationErrors.approver}</div>` : ''}
          </div>
        </div>
      `
          : ''
      }

      <!-- Dynamic Active Lanes Chips (Scenario 1.7) -->
      <div style="margin: 20px 0 24px 0; padding-top:16px; border-top:1px solid var(--border);">
        <div style="font-size:13px; font-weight:600; margin-bottom:8px;">${t(lang, 'activeLanes')}</div>
        <div id="active-lanes-chips" style="display:flex; gap:8px; flex-wrap:wrap;">
          ${activeLanes.map((l) => `<span class="badge badge-verified" style="font-size:12px;">${l.toUpperCase()}</span>`).join('')}
          ${activeLanes.length === 0 ? `<span class="badge badge-skipped">Belum ada target diisi</span>` : ''}
        </div>
      </div>

      <!-- Action Buttons -->
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div style="display:flex; gap:12px;">
          <button id="btn-run-everything" class="btn btn-primary" style="font-size:14px; padding:10px 20px;">
            ⚡ ${t(lang, 'runEverything')}
          </button>
          <button id="btn-dry-run" class="btn btn-secondary">
            📋 ${t(lang, 'dryRun')}
          </button>
        </div>
        <button id="btn-goto-builder" class="btn btn-secondary">
          ⚙️ ${t(lang, 'customizeBuilder')} →
        </button>
      </div>
    </div>
  `;
}

function renderStep2Builder(state: PortalState): string {
  const lang = state.language;
  const isProdSafe = state.mode === 'prod-safe';
  const activeType = state.activeBuilderType;
  const def = defaultRegistry.get(activeType);

  const rows = state.testRows[activeType] ?? [];

  return `
    <div class="card">
      <div class="card-title">
        <span>Test Builder — Tipe Uji Berbasis Registry</span>
        <button id="btn-suggest-scenarios" class="btn btn-secondary">
          💡 ${t(lang, 'suggestScenarios')}
        </button>
      </div>

      <!-- Type Switcher Buttons (Scenario 2.1) -->
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

      <!-- Mode-aware blocking warnings (Scenarios 2.2, 2.3) -->
      ${
        isProdSafe && activeType === 'perf'
          ? `
        <div class="alert-banner alert-banner-danger" id="alert-perf-blocked">
          <span>⛔ Pengujian beban performa (perf) diblokir pada mode prod-safe untuk mencegah degradasi layanan target.</span>
        </div>
      `
          : ''
      }

      ${
        state.mode !== 'sandbox' && !state.authorizationConfirmed && activeType === 'security-passive'
          ? `
        <div class="alert-banner alert-banner-warning" id="alert-sec-unauth">
          <span>⚠️ Harap konfirmasi otorisasi pengujian pada Langkah 1 untuk mengaktifkan audit keamanan pasif.</span>
        </div>
      `
          : ''
      }

      <!-- Editable Data Table (Scenario 2.4) -->
      <div class="table-container">
        <table class="data-table" id="builder-table">
          <thead>
            <tr>
              ${def?.columns.map((c) => `<th style="${c.width ? `width:${c.width};` : ''}">${c.label.en}</th>`).join('')}
              <th style="width:70px; text-align:right;">Aksi</th>
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
                    <input type="text" class="form-control" style="padding:4px 8px; font-size:12px;"
                      data-field="${col.key}" value="${String(row[col.key] ?? '')}" />
                  </td>
                `,
                  )
                  .join('')}
                <td style="text-align:right;">
                  <button class="btn btn-secondary btn-del-row" style="padding:2px 8px; font-size:11px;" data-index="${rIdx}">
                    ✕
                  </button>
                </td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:16px;">
        <button id="btn-add-row" class="btn btn-secondary">
          + ${t(lang, 'addRow')}
        </button>
        <button id="btn-builder-to-plan" class="btn btn-primary">
          Review Plan & Run →
        </button>
      </div>
    </div>
  `;
}

function renderStep3PlanReview(state: PortalState): string {
  const lang = state.language;
  const cases = state.planCases;

  const toRun = cases.filter((c) => state.approvedCaseIds.has(c.id) && c.modeCompatibility === 'allowed').length;
  const needsApproval = cases.filter((c) => c.confidence === 'needs-review' && c.modeCompatibility === 'allowed').length;
  const skippedByMode = cases.filter((c) => c.modeCompatibility === 'skipped-by-mode').length;

  return `
    <div class="card">
      <div class="card-title">
        <span>Plan Review & Persetujuan Kasus Pengujian</span>
        <button id="btn-approve-all-safe" class="btn btn-secondary">
          🛡️ ${t(lang, 'approveAllSafe')}
        </button>
      </div>

      <!-- Plan summary metric counters (Scenario 3.1) -->
      <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; margin-bottom:20px;">
        <div class="card" style="padding:14px; background:var(--bg); margin:0;">
          <div style="font-size:12px; color:var(--text-muted);">Total Kandidat</div>
          <div style="font-size:20px; font-weight:700; font-family:var(--mono);">${cases.length}</div>
        </div>
        <div class="card" style="padding:14px; background:var(--bg); margin:0;">
          <div style="font-size:12px; color:var(--text-muted);">Akan Dijalankan</div>
          <div style="font-size:20px; font-weight:700; font-family:var(--mono); color:var(--success);">${toRun}</div>
        </div>
        <div class="card" style="padding:14px; background:var(--bg); margin:0;">
          <div style="font-size:12px; color:var(--text-muted);">${t(lang, 'needsApprovalChip')}</div>
          <div style="font-size:20px; font-weight:700; font-family:var(--mono); color:var(--warning);">${needsApproval}</div>
        </div>
        <div class="card" style="padding:14px; background:var(--bg); margin:0;">
          <div style="font-size:12px; color:var(--text-muted);">Dilewati Mode</div>
          <div style="font-size:20px; font-weight:700; font-family:var(--mono); color:var(--text-muted);">${skippedByMode}</div>
        </div>
      </div>

      <!-- Table of cases (Scenarios 3.2, 3.3, 3.8) -->
      <div class="table-container">
        <table class="data-table" id="plan-table">
          <thead>
            <tr>
              <th style="width:40px;">Pilih</th>
              <th style="width:110px;">ID Kasus</th>
              <th>Judul Skenario</th>
              <th style="width:90px;">Lane</th>
              <th style="width:100px;">Sumber</th>
              <th style="width:130px;">Confidence</th>
              <th style="width:90px;">Prioritas</th>
            </tr>
          </thead>
          <tbody>
            ${cases
              .map((c) => {
                const isSkipped = c.modeCompatibility === 'skipped-by-mode';
                const isChecked = state.approvedCaseIds.has(c.id) && !isSkipped;

                let confBadge = 'badge-verified';
                if (c.confidence === 'needs-review') confBadge = 'badge-review';
                else if (c.confidence === 'auto-discovered') confBadge = 'badge-discovered';

                return `
                <tr class="${isSkipped ? 'row-skipped' : ''}">
                  <td>
                    ${
                      isSkipped
                        ? '<span class="badge badge-skipped" style="font-size:10px;">LOCKED</span>'
                        : `<input type="checkbox" class="plan-checkbox" data-id="${c.id}" ${isChecked ? 'checked' : ''} />`
                    }
                  </td>
                  <td style="font-family:var(--mono); font-weight:600;">${c.id}</td>
                  <td>${c.title}</td>
                  <td><span class="badge badge-role">${c.lane.toUpperCase()}</span></td>
                  <td style="color:var(--text-muted); font-size:12px;">${c.source}</td>
                  <td>
                    ${
                      isSkipped
                        ? `<span class="badge badge-skipped">${t(lang, 'skippedByModeBadge')}</span>`
                        : `<span class="badge ${confBadge}">${c.confidence}</span>`
                    }
                  </td>
                  <td><span class="badge badge-role">${c.priority}</span></td>
                </tr>
              `;
              })
              .join('')}
          </tbody>
        </table>
      </div>

      ${state.validationErrors.plan ? `<div class="form-error" style="margin-bottom:12px;">${state.validationErrors.plan}</div>` : ''}

      <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:20px;">
        <button id="btn-approve-and-run" class="btn btn-primary" style="font-size:14px; padding:10px 22px;">
          🚀 ${t(lang, 'approveAndRun')}
        </button>
      </div>
    </div>
  `;
}

function renderStep4LiveRun(state: PortalState): string {
  const lang = state.language;

  const stageOrder = ['preflight', 'discover', 'app-map', 'lanes', 'correlate', 'document'];

  return `
    <div class="card">
      <div class="card-title">
        <span>Live Run Progression — ${state.runId ?? 'Running'}</span>
        <button id="btn-stop-run" class="btn btn-danger" style="font-size:12px;">
          ⏹ ${t(lang, 'cancelRun')}
        </button>
      </div>

      <!-- Stage progression timeline (Scenario 4.1) -->
      <div style="display:flex; gap:8px; margin-bottom:20px; overflow-x:auto;">
        ${stageOrder
          .map((st) => {
            const status = state.stages[st] ?? 'pending';
            let badgeClass = 'badge-skipped';
            if (status === 'ok') badgeClass = 'badge-verified';
            else if (status === 'running') badgeClass = 'badge-discovered';
            else if (status === 'failed') badgeClass = 'badge-review';

            return `
            <div style="flex:1; background:var(--bg); border:1px solid var(--border); border-radius:4px; padding:10px; text-align:center;">
              <div style="font-size:11px; color:var(--text-muted); font-weight:600;">${st.toUpperCase()}</div>
              <span class="badge ${badgeClass}" style="margin-top:4px;">${status}</span>
            </div>
          `;
          })
          .join('')}
      </div>

      <!-- Metrics counter and circuit breaker (Scenario 4.3) -->
      <div style="display:flex; gap:16px; margin-bottom:16px; font-size:13px;">
        <span class="badge badge-role">Requests Executed: ${state.requestsCount}</span>
        <span class="badge badge-role">Circuit Breaker: ${state.circuitBreakerOpen ? 'OPEN (Tripped)' : 'CLOSED (Healthy)'}</span>
      </div>

      <!-- Live Terminal Console -->
      <div class="terminal-box" id="terminal-logs">
        ${state.liveLogs.map((l) => `<span class="log-line">${l}</span>`).join('')}
        ${state.liveLogs.length === 0 ? '<span class="log-line" style="color:var(--text-muted);">Waiting for pipeline events...</span>' : ''}
      </div>

      <div style="display:flex; justify-content:flex-end; margin-top:20px;">
        <button id="btn-view-results" class="btn btn-primary" style="font-size:14px; padding:10px 22px;">
          ${t(lang, 'viewResults')} →
        </button>
      </div>
    </div>
  `;
}

function renderStep5Results(state: PortalState): string {
  const lang = state.language;
  const gate = state.gate ?? 'GO WITH RISKS';

  let gateBadge = 'alert-banner-warning';
  let gateText = t(lang, 'gateRisks');
  if (gate === 'GO') {
    gateBadge = 'alert-banner-success';
    gateText = t(lang, 'gateGo');
  } else if (gate === 'NO-GO') {
    gateBadge = 'alert-banner-danger';
    gateText = t(lang, 'gateNoGo');
  }

  const verifiedCount = state.findings.filter((f) => f.confidence === 'verified').length;
  const autoCount = state.findings.filter((f) => f.confidence === 'auto-discovered').length;
  const reviewCount = state.findings.filter((f) => f.confidence === 'needs-review').length;

  return `
    <div class="card">
      <div class="card-title">
        <span>Executive Run Results & Quality Gate</span>
        <div style="display:flex; gap:10px;">
          <button id="btn-download-bundle" class="btn btn-primary">
            📦 ${t(lang, 'downloadBundle')}
          </button>
          <button id="btn-start-new-run" class="btn btn-secondary">
            🔄 ${t(lang, 'startNewRun')}
          </button>
        </div>
      </div>

      <!-- Gate Decision Banner (Scenario 5.1) -->
      <div class="alert-banner ${gateBadge}" style="font-size:15px; font-weight:700;">
        <span>Gate Result: ${gateText}</span>
      </div>

      ${
        state.gateReasons.length > 0
          ? `
        <div style="margin-bottom:20px; background:var(--bg); padding:12px 16px; border-radius:4px; border:1px solid var(--border);">
          <div style="font-size:12px; font-weight:600; color:var(--text-muted); margin-bottom:6px;">Gate Reasons:</div>
          <ul style="padding-left:18px; font-size:13px;">
            ${state.gateReasons.map((r) => `<li>${r}</li>`).join('')}
          </ul>
        </div>
      `
          : ''
      }

      <!-- Confidence metrics (Scenario 5.2) -->
      <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; margin-bottom:24px;">
        <div class="card" style="padding:14px; background:var(--bg); margin:0;">
          <div style="font-size:12px; color:var(--text-muted);">${t(lang, 'verifiedBadge')}</div>
          <div style="font-size:22px; font-weight:700; font-family:var(--mono); color:var(--success);">${verifiedCount}</div>
        </div>
        <div class="card" style="padding:14px; background:var(--bg); margin:0;">
          <div style="font-size:12px; color:var(--text-muted);">${t(lang, 'autoDiscoveredBadge')}</div>
          <div style="font-size:22px; font-weight:700; font-family:var(--mono); color:var(--accent);">${autoCount}</div>
        </div>
        <div class="card" style="padding:14px; background:var(--bg); margin:0;">
          <div style="font-size:12px; color:var(--text-muted);">${t(lang, 'needsReviewBadge')}</div>
          <div style="font-size:22px; font-weight:700; font-family:var(--mono); color:var(--warning);">${reviewCount}</div>
        </div>
      </div>

      <!-- Findings Board (Scenario 5.3) -->
      <div class="card-title" style="font-size:15px;">${t(lang, 'findingsTitle')}</div>
      <div class="table-container">
        <table class="data-table" id="findings-table">
          <thead>
            <tr>
              <th style="width:100px;">ID</th>
              <th style="width:100px;">Severity</th>
              <th style="width:130px;">Confidence</th>
              <th style="width:90px;">Lane</th>
              <th>Judul Temuan & Ringkasan Bukti</th>
            </tr>
          </thead>
          <tbody>
            ${state.findings
              .map((f) => {
                let confBadge = 'badge-verified';
                if (f.confidence === 'needs-review') confBadge = 'badge-review';
                else if (f.confidence === 'auto-discovered') confBadge = 'badge-discovered';

                return `
                <tr>
                  <td style="font-family:var(--mono); font-weight:600;">${f.id}</td>
                  <td><span class="badge badge-role">${f.severity.toUpperCase()}</span></td>
                  <td><span class="badge ${confBadge}">${f.confidence}</span></td>
                  <td><span class="badge badge-role">${f.lanes.join(', ').toUpperCase()}</span></td>
                  <td>
                    <div style="font-weight:600;">${f.title}</div>
                    ${f.evidenceSummary ? `<div style="font-size:12px; color:var(--text-muted); margin-top:2px;">${f.evidenceSummary}</div>` : ''}
                  </td>
                </tr>
              `;
              })
              .join('')}
            ${state.findings.length === 0 ? '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">Tidak ada temuan defect.</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
