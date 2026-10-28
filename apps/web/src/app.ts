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

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${t(lang, 'appTitle')} — ${t(lang, 'appSubtitle')}</title>
  <style>
    :root {
      --bg: #090d13;
      --surface: #0e1520;
      --surface-subtle: #090d13;
      --surface-hover: #131c2b;
      --border: #1e2838;
      --border-subtle: #141c28;
      --border-focus: #388bfd;
      --text: #c9d1d9;
      --text-bright: #f0f6fc;
      --text-muted: #768390;
      --accent: #1f6feb;
      --accent-hover: #2679f3;
      --accent-fg: #58a6ff;
      --success: #238636;
      --success-bg: rgba(35, 134, 54, 0.12);
      --success-fg: #3fb950;
      --warning: #9e6a03;
      --warning-bg: rgba(158, 106, 3, 0.12);
      --warning-fg: #d29922;
      --danger: #da3633;
      --danger-bg: rgba(218, 54, 51, 0.12);
      --danger-fg: #f85149;
      --mono: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace;
      --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--sans);
      font-size: 13px;
      line-height: 1.45;
      padding: 0;
      margin: 0;
      -webkit-font-smoothing: antialiased;
    }

    /* Top Utility Header */
    header.top-nav {
      height: 44px;
      border-bottom: 1px solid var(--border);
      background: var(--surface);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
    }
    .brand-meta {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 12px;
    }
    .brand-tag {
      font-family: var(--mono);
      font-weight: 700;
      background: var(--accent);
      color: #fff;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 11px;
      letter-spacing: 0.05em;
    }
    .breadcrumb-path {
      color: var(--text-muted);
      font-family: var(--mono);
      font-size: 12px;
    }
    .breadcrumb-path strong {
      color: var(--text-bright);
      font-weight: 600;
    }
    .env-tag {
      font-family: var(--mono);
      font-size: 11px;
      background: var(--border-subtle);
      border: 1px solid var(--border);
      padding: 1px 6px;
      border-radius: 3px;
      color: var(--text-muted);
    }
    .nav-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    /* Main Console Layout */
    .console-layout {
      max-width: 1280px;
      margin: 0 auto;
      padding: 16px 20px 40px;
    }

    /* Step Navigation Bar */
    .step-bar {
      display: flex;
      border-bottom: 1px solid var(--border);
      margin-bottom: 20px;
      gap: 2px;
    }
    .step-item {
      padding: 8px 16px;
      font-size: 12px;
      font-weight: 600;
      font-family: var(--mono);
      color: var(--text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      border-bottom: 2px solid transparent;
      user-select: none;
      transition: all 0.1s ease;
      letter-spacing: 0.02em;
    }
    .step-item:hover:not(.disabled) {
      color: var(--text);
    }
    .step-item.active {
      color: var(--accent-fg);
      border-bottom-color: var(--accent);
      background: rgba(31, 111, 235, 0.04);
    }
    .step-item.complete {
      color: var(--text);
    }
    .step-item.disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .step-number {
      font-size: 11px;
      opacity: 0.7;
    }

    /* Section Panels */
    .panel {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 4px;
      margin-bottom: 16px;
    }
    .panel-header {
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
      background: var(--surface-subtle);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      font-weight: 600;
      font-family: var(--mono);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .panel-body {
      padding: 16px 14px;
    }

    /* Form Fields */
    .field-row {
      margin-bottom: 14px;
    }
    .field-row label {
      display: block;
      font-size: 12px;
      font-weight: 500;
      margin-bottom: 4px;
      color: var(--text-bright);
    }
    .field-row label .field-key {
      font-family: var(--mono);
      color: var(--text-muted);
      font-size: 11px;
      margin-left: 4px;
    }
    .input-mono {
      width: 100%;
      height: 32px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 3px;
      padding: 0 10px;
      font-size: 12px;
      color: var(--text-bright);
      outline: none;
      font-family: var(--mono);
      transition: border-color 0.1s ease;
    }
    .input-mono:focus {
      border-color: var(--border-focus);
      box-shadow: 0 0 0 1px var(--border-focus);
    }
    .field-error {
      font-size: 11px;
      color: var(--danger-fg);
      margin-top: 4px;
      font-family: var(--mono);
    }

    /* Segmented Mode Selector */
    .mode-selector {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-bottom: 16px;
    }
    .mode-opt {
      border: 1px solid var(--border);
      border-radius: 3px;
      padding: 10px 12px;
      background: var(--bg);
      cursor: pointer;
      transition: all 0.1s ease;
    }
    .mode-opt.selected {
      border-color: var(--accent-fg);
      background: rgba(31, 111, 235, 0.08);
    }
    .mode-opt-title {
      font-family: var(--mono);
      font-size: 12px;
      font-weight: 700;
      color: var(--text-bright);
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 3px;
    }
    .mode-opt-desc {
      font-size: 11px;
      color: var(--text-muted);
      line-height: 1.35;
    }

    /* Status Banners */
    .banner {
      padding: 8px 12px;
      border-radius: 3px;
      margin-bottom: 14px;
      font-size: 12px;
      border: 1px solid;
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: var(--mono);
    }
    .banner-warn { background: var(--warning-bg); border-color: rgba(210, 153, 34, 0.35); color: var(--warning-fg); }
    .banner-danger { background: var(--danger-bg); border-color: rgba(248, 81, 73, 0.35); color: var(--danger-fg); }
    .banner-success { background: var(--success-bg); border-color: rgba(63, 185, 80, 0.35); color: var(--success-fg); }

    /* Badges & Tags */
    .tag, .badge {
      display: inline-flex;
      align-items: center;
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 11px;
      font-family: var(--mono);
      font-weight: 600;
      letter-spacing: 0.03em;
      border: 1px solid transparent;
      text-transform: uppercase;
    }
    .tag-meta, .badge-role { background: var(--border-subtle); border-color: var(--border); color: var(--text-muted); }
    .tag-verified, .badge-verified { background: var(--success-bg); color: var(--success-fg); border-color: rgba(63, 185, 80, 0.3); }
    .tag-discovered, .badge-discovered { background: rgba(31, 111, 235, 0.12); color: var(--accent-fg); border-color: rgba(88, 166, 255, 0.3); }
    .tag-review, .badge-review { background: var(--warning-bg); color: var(--warning-fg); border-color: rgba(210, 153, 34, 0.3); }
    .tag-muted, .badge-skipped { background: var(--border-subtle); color: var(--text-muted); border-color: var(--border); }
    /* Action Buttons */
    .btn {
      height: 32px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 0 12px;
      font-size: 12px;
      font-weight: 600;
      font-family: var(--mono);
      border-radius: 3px;
      border: 1px solid transparent;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.1s ease;
      white-space: nowrap;
    }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-primary:hover { background: var(--accent-hover); }
    .btn-secondary { background: var(--surface-subtle); border-color: var(--border); color: var(--text); }
    .btn-secondary:hover { background: var(--surface-hover); border-color: var(--text-muted); }
    .btn-danger { background: var(--danger); color: #fff; }

    /* Dense Data Table */
    .table-container {
      overflow-x: auto;
      border: 1px solid var(--border);
      border-radius: 3px;
      margin-bottom: 12px;
      background: var(--bg);
    }
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      text-align: left;
    }
    table.data-table th {
      background: var(--surface);
      padding: 6px 10px;
      font-weight: 600;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border);
      font-family: var(--mono);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      white-space: nowrap;
    }
    table.data-table td {
      padding: 6px 10px;
      border-bottom: 1px solid var(--border-subtle);
      background: var(--bg);
      vertical-align: middle;
    }
    table.data-table tr:hover td { background: var(--surface); }
    table.data-table tr:last-child td { border-bottom: none; }

    /* Metric Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 16px;
    }
    .kpi-box {
      border: 1px solid var(--border);
      border-radius: 3px;
      padding: 8px 12px;
      background: var(--bg);
    }
    .kpi-label {
      font-size: 10px;
      font-family: var(--mono);
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .kpi-val {
      font-size: 18px;
      font-weight: 700;
      font-family: var(--mono);
      color: var(--text-bright);
      margin-top: 2px;
    }

    /* Terminal Console */
    .terminal-box {
      background: #04070b;
      border: 1px solid var(--border);
      border-radius: 3px;
      padding: 10px 12px;
      font-family: var(--mono);
      font-size: 11px;
      color: #adbac7;
      height: 240px;
      overflow-y: auto;
      line-height: 1.55;
    }
    .log-line { display: block; margin-bottom: 1px; }

    /* Builder Type Switcher */
    .type-switcher {
      display: flex;
      gap: 4px;
      margin-bottom: 12px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 6px;
      overflow-x: auto;
    }
    .type-pill {
      padding: 4px 10px;
      border-radius: 3px;
      font-size: 11px;
      font-family: var(--mono);
      font-weight: 600;
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--text-muted);
      cursor: pointer;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .type-pill.active {
      background: var(--surface-hover);
      border-color: var(--accent-fg);
      color: var(--text-bright);
    }
  </style>
</head>
<body>
  <!-- Top Navigation Header -->
  <header class="top-nav">
    <div class="brand-meta">
      <span class="brand-tag">NX</span>
      <span class="breadcrumb-path">nexus-portal / qa / <strong>pilot-app</strong></span>
      <span class="env-tag">env:local</span>
      <span class="env-tag" style="color:var(--accent-fg);">git:main@c23db59</span>
    </div>
    <div class="nav-actions">
      <span class="tag tag-meta">ROLE: ${state.userRole.toUpperCase()}</span>
      <button id="btn-toggle-lang" class="btn btn-secondary" style="height:24px; padding:0 8px; font-size:11px;">
        ${lang.toUpperCase()}
      </button>
    </div>
  </header>

  <div class="console-layout">
    <!-- 5-Step Segmented Bar -->
    <nav class="step-bar">
      ${renderStepNav(state, 1, t(lang, 'step1'))}
      ${renderStepNav(state, 2, t(lang, 'step2'))}
      ${renderStepNav(state, 3, t(lang, 'step3'))}
      ${renderStepNav(state, 4, t(lang, 'step4'))}
      ${renderStepNav(state, 5, t(lang, 'step5'))}
      ${renderStepNav(state, 6, t(lang, 'step6'))}
    </nav>
    <!-- Main Step Views: All 6 rendered so client-side switching is instant -->
    <main id="portal-content">
      <div id="step-view-1" class="step-panel" style="${state.currentStep === 1 ? 'display:block' : 'display:none'}">
        ${renderStep1Target(state)}
      </div>
      <div id="step-view-2" class="step-panel" style="${state.currentStep === 2 ? 'display:block' : 'display:none'}">
        ${renderStep2Builder(state)}
      </div>
      <div id="step-view-3" class="step-panel" style="${state.currentStep === 3 ? 'display:block' : 'display:none'}">
        ${renderStep3PlanReview(state)}
      </div>
      <div id="step-view-4" class="step-panel" style="${state.currentStep === 4 ? 'display:block' : 'display:none'}">
        ${renderStep4LiveRun(state)}
      </div>
      <div id="step-view-5" class="step-panel" style="${state.currentStep === 5 ? 'display:block' : 'display:none'}">
        ${renderStep5Results(state)}
      </div>
      <div id="step-view-6" class="step-panel" style="${state.currentStep === 6 ? 'display:block' : 'display:none'}">
        ${renderStep6Lineage(state)}
      </div>
    </main>
  </div>

  <script>
    // Client-side Interactive SPA Engine
    (function() {
      let currentStep = ${state.currentStep};
      let currentMode = '${state.mode}';
      let activeRunId = '${state.runId ?? ''}';
      let eventSource = null;

      function switchStep(step) {
        currentStep = step;
        for (let i = 1; i <= 6; i++) {
          const panel = document.getElementById('step-view-' + i);
          if (panel) panel.style.display = (i === step ? 'block' : 'none');
        }
        document.querySelectorAll('.step-item').forEach(el => {
          const s = Number(el.getAttribute('data-step'));
          if (s === step) el.classList.add('active');
          else el.classList.remove('active');
        });
      }

      // Step tab clicking
      document.querySelectorAll('.step-item').forEach(el => {
        el.addEventListener('click', () => {
          const s = Number(el.getAttribute('data-step'));
          if (!isNaN(s) && s >= 1 && s <= 6) switchStep(s);
        });
      });

      // Quick navigation buttons
      document.getElementById('btn-goto-builder')?.addEventListener('click', () => switchStep(2));
      document.getElementById('btn-builder-to-plan')?.addEventListener('click', () => switchStep(3));
      document.getElementById('btn-view-results')?.addEventListener('click', () => switchStep(5));
      document.getElementById('btn-start-new-run')?.addEventListener('click', () => switchStep(1));

      // Mode selector
      document.querySelectorAll('.mode-opt').forEach(opt => {
        opt.addEventListener('click', () => {
          document.querySelectorAll('.mode-opt').forEach(o => o.classList.remove('selected'));
          opt.classList.add('selected');
          currentMode = opt.getAttribute('data-mode') || 'sandbox';

          const authBlock = document.getElementById('auth-block');
          const prodBanner = document.getElementById('banner-prod-safe');

          if (currentMode === 'sandbox') {
            if (authBlock) authBlock.style.display = 'none';
            if (prodBanner) prodBanner.style.display = 'none';
          } else if (currentMode === 'staging') {
            if (authBlock) authBlock.style.display = 'block';
            if (prodBanner) prodBanner.style.display = 'none';
          } else if (currentMode === 'prod-safe') {
            if (authBlock) authBlock.style.display = 'block';
            if (prodBanner) prodBanner.style.display = 'block';
          }
        });
      });

      // Dynamic Active Lanes calculation
      function updateActiveLanes() {
        const repo = (document.getElementById('input-repo')?.value || '').trim();
        const web = (document.getElementById('input-web')?.value || '').trim();
        const api = (document.getElementById('input-api-base')?.value || '').trim();

        const container = document.getElementById('active-lanes-chips');
        if (!container) return;

        const lanes = [];
        if (repo) lanes.push('REPO');
        if (web) lanes.push('E2E', 'A11Y', 'PERF', 'SECURITY');
        if (api && !lanes.includes('API')) lanes.push('API');

        if (lanes.length === 0) {
          container.innerHTML = '<span class="tag tag-muted">NO TARGETS CONFIGURED</span>';
        } else {
          container.innerHTML = lanes.map(l => '<span class="tag tag-verified">' + l + '</span>').join('');
        }
      }

      document.getElementById('input-repo')?.addEventListener('input', updateActiveLanes);
      document.getElementById('input-web')?.addEventListener('input', updateActiveLanes);
      document.getElementById('input-api-base')?.addEventListener('input', updateActiveLanes);

      // Dry Run execution
      document.getElementById('btn-dry-run')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn-dry-run');
        if (btn) btn.textContent = 'Estimating...';

        const payload = collectRunPayload();
        try {
          const res = await fetch('/api/runs/dry-run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const json = await res.json();
          const actionContainer = document.querySelector('#step-view-1 .panel-body');
          let dryBanner = document.getElementById('dry-run-feedback');
          if (!dryBanner && actionContainer) {
            dryBanner = document.createElement('div');
            dryBanner.id = 'dry-run-feedback';
            actionContainer.appendChild(dryBanner);
          }
          if (dryBanner && json.valid) {
            dryBanner.className = 'banner banner-success';
            dryBanner.style.marginTop = '14px';
            dryBanner.innerHTML = '<div>' +
              '<strong>Estimasi Uji Kering Selesai:</strong> Target valid! Lanes aktif: ' + (json.activeLanes || []).join(', ').toUpperCase() + ' (~' + json.estimatedRequests + ' requests, ~' + json.estimatedDurationSeconds + 's).<br>' +
              '<span style="font-size:11px; color:var(--text-bright);">Untuk mengeksekusi pengujian nyata dan melihat hasilnya, klik tombol biru <strong>Jalankan Semua (Run Everything)</strong>.</span>' +
              '</div>';
          }
          alert(json.valid 
            ? 'Estimasi Uji Kering (Dry Run) Berhasil!\\n\\n' +
              '• Target valid: ' + (payload.web?.urls?.[0] || 'Target') + '\\n' +
              '• Lanes aktif: ' + (json.activeLanes || []).join(', ').toUpperCase() + '\\n' +
              '• Estimasi request: ' + json.estimatedRequests + '\\n' +
              '• Estimasi durasi: ~' + json.estimatedDurationSeconds + ' detik\\n\\n' +
              'CATATAN: Uji Kering (Dry Run) hanya memvalidasi target tanpa mengirim trafik uji.\\n\\n' +
              'Untuk MELIHAT HASIL LENGKAP pengujian, silakan klik tombol biru "Jalankan Semua (Run Everything)".'
            : 'Validasi Uji Kering Gagal:\\n- ' + (json.errors || []).join('\\n- ')
          );
          alert('Dry run request failed: ' + err.message);
        } finally {
          if (btn) btn.textContent = 'Uji Kering (Dry Run)';
        }
      });

      // Helper to collect payload
      function collectRunPayload() {
        const repoVal = (document.getElementById('input-repo')?.value || '').trim();
        const webVal = (document.getElementById('input-web')?.value || '').trim();
        const apiBase = (document.getElementById('input-api-base')?.value || '').trim();
        const apiSpec = (document.getElementById('input-api-spec')?.value || '').trim();
        const authChecked = document.getElementById('check-auth')?.checked || false;
        const approverVal = (document.getElementById('input-approver')?.value || '').trim();

        let effectiveMode = currentMode;
        if (effectiveMode === 'sandbox' && !repoVal && webVal) {
          effectiveMode = 'staging';
        }

        const payload = {
          name: 'Portal Run ' + new Date().toLocaleTimeString(),
          mode: effectiveMode,
          scope: 'quick',
          lanes: { e2e: true, a11y: true, perf: true, security: true, api: Boolean(apiBase || apiSpec) }
        };

        if (repoVal) payload.repo = { localPath: repoVal };
        if (webVal) payload.web = { urls: webVal.split(',').map(s => s.trim()).filter(Boolean) };
        if (apiBase || apiSpec) payload.api = { baseUrl: apiBase || undefined, specUrl: apiSpec || undefined };

        if (effectiveMode !== 'sandbox') {
          payload.authorization = {
            ownerConfirmed: authChecked || Boolean(webVal),
            approvedBy: approverVal || 'user@company.local',
            perfApproved: true
          };
        }

        return payload;
      }

      // Run Everything -> starts run, streams SSE, switches to Live Run & Results
      document.getElementById('btn-run-everything')?.addEventListener('click', async () => {
        const payload = { ...collectRunPayload(), planApproval: 'auto' };

        // Client validation
        if (!payload.repo && !payload.web && !payload.api) {
          alert('Provide a repository link or target web URL to test.');
          return;
        }

        const runBtn = document.getElementById('btn-run-everything');
        if (runBtn) {
          runBtn.disabled = true;
          runBtn.textContent = 'Launching...';
        }

        try {
          const res = await fetch('/api/runs', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-User-Role': 'approver',
              'X-User-Email': approverVal || 'user@company.local',
            },
            body: JSON.stringify(payload)
          });

          if (!res.ok) {
            const errJson = await res.json();
            alert('Cannot start run: ' + (errJson.error || 'Server error'));
            if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'Jalankan Semua (Run Everything)'; }
            return;
          }

          const runRecord = await res.json();
          activeRunId = runRecord.id;

          // Switch to Step 4 (Live Run)
          switchStep(4);
          const terminal = document.getElementById('terminal-logs');
          if (terminal) terminal.innerHTML = '<span class="log-line" style="color:var(--accent-fg);">Run initialized: ' + activeRunId + '</span>';

          // Connect SSE
          if (eventSource) eventSource.close();
          eventSource = new EventSource('/api/runs/' + activeRunId + '/events');

          eventSource.addEventListener('stage', (e) => {
            const data = JSON.parse(e.data);
            if (terminal) {
              const line = document.createElement('span');
              line.className = 'log-line';
              line.textContent = 'Stage [' + (data.stage || '') + ']: ' + (data.status || '');
              terminal.appendChild(line);
              terminal.scrollTop = terminal.scrollHeight;
            }
          });

          eventSource.addEventListener('log', (e) => {
            const data = JSON.parse(e.data);
            if (terminal) {
              const line = document.createElement('span');
              line.className = 'log-line';
              line.textContent = data.message || '';
              terminal.appendChild(line);
              terminal.scrollTop = terminal.scrollHeight;
            }
          });

          eventSource.addEventListener('complete', (e) => {
            const data = JSON.parse(e.data);
            eventSource.close();
            if (terminal) {
              const line = document.createElement('span');
              line.className = 'log-line';
              line.style.color = 'var(--success-fg)';
              line.textContent = 'Pipeline execution completed: Gate ' + (data.gate || '');
              terminal.appendChild(line);
              terminal.scrollTop = terminal.scrollHeight;
            }
            setTimeout(() => {
              window.location.href = '/?step=5&runId=' + activeRunId;
            }, 1200);
          });

          eventSource.addEventListener('error', () => {
            eventSource.close();
          });
        } catch (err) {
          alert('Network error starting run: ' + err.message);
        } finally {
          if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'Jalankan Semua (Run Everything)'; }
        }
      });

      // Visual slider diff interaction
      const slider = document.getElementById('slider-visual-diff');
      if (slider) {
        slider.addEventListener('input', function() {
          const val = this.value;
          const before = document.getElementById('visual-before');
          const afterText = document.querySelector('#visual-after > div');
          const label = document.getElementById('slider-pos-val');

          if (before) before.style.width = val + '%';
          if (afterText) afterText.style.paddingLeft = 'calc(' + val + '% + 16px)';
          if (label) label.textContent = val + '%';
        });
      }

      // Download Bundle
      document.getElementById('btn-download-bundle')?.addEventListener('click', () => {
        window.location.href = '/api/runs/' + (activeRunId || 'latest') + '/bundle';
      });

      // Language Switcher
      document.getElementById('btn-toggle-lang')?.addEventListener('click', () => {
        const url = new URL(window.location.href);
        const currentLang = url.searchParams.get('lang') || 'id';
        url.searchParams.set('lang', currentLang === 'id' ? 'en' : 'id');
        window.location.href = url.href;
      });
    })();
  </script>
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
      <span class="step-number">0${step}</span>
      <span>${label.toUpperCase()}</span>
    </div>
  `;
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
          <input type="text" id="input-web" class="input-mono" value="${state.webUrls}" placeholder="http://127.0.0.1:3100/" />
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

function renderStep2Builder(state: PortalState): string {
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

function renderStep3PlanReview(state: PortalState): string {
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

function renderStep4LiveRun(state: PortalState): string {
  const lang = state.language;
  const stageOrder = ['preflight', 'discover', 'app-map', 'lanes', 'correlate', 'document'];

  return `
    <div class="panel">
      <div class="panel-header">
        <span>Live Run Stream — ${state.runId ?? 'Running'}</span>
        <button id="btn-stop-run" class="btn btn-danger" style="height:22px; padding:0 8px; font-size:10px;">
          ${t(lang, 'cancelRun')}
        </button>
      </div>
      <div class="panel-body">
        <!-- Stage Timeline Chips (Scenario 4.1) -->
        <div style="display:flex; gap:6px; margin-bottom:14px; overflow-x:auto;">
          ${stageOrder
            .map((st) => {
              const status = state.stages[st] ?? 'pending';
              let badgeClass = 'tag-muted';
              if (status === 'ok') badgeClass = 'tag-verified';
              else if (status === 'running') badgeClass = 'tag-discovered';
              else if (status === 'failed') badgeClass = 'tag-review';

              return `
              <div style="flex:1; background:var(--bg); border:1px solid var(--border); border-radius:3px; padding:8px; text-align:center;">
                <div style="font-size:10px; font-family:var(--mono); color:var(--text-muted); font-weight:600;">${st.toUpperCase()}</div>
                <span class="tag ${badgeClass}" style="margin-top:3px; font-size:10px;">${status}</span>
              </div>
            `;
            })
            .join('')}
        </div>

        <!-- Telemetry Indicators (Scenario 4.3) -->
        <div style="display:flex; gap:10px; margin-bottom:12px;">
          <span class="tag tag-meta">Requests Executed: ${state.requestsCount}</span>
          <span class="tag tag-meta">Circuit Breaker: ${state.circuitBreakerOpen ? 'OPEN (Tripped)' : 'CLOSED (Healthy)'}</span>
        </div>

        <!-- Live Terminal Stream -->
        <div class="terminal-box" id="terminal-logs">
          ${state.liveLogs.map((l) => `<span class="log-line">${l}</span>`).join('')}
          ${state.liveLogs.length === 0 ? '<span class="log-line" style="color:var(--text-muted);">Waiting for pipeline events...</span>' : ''}
        </div>

        <div style="display:flex; justify-content:flex-end; margin-top:14px;">
          <button id="btn-view-results" class="btn btn-primary">
            ${t(lang, 'viewResults')} ->
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderStep5Results(state: PortalState): string {
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
        <div class="banner ${gateBannerClass}" style="font-weight:700; font-size:13px;">
          <span>Gate Result: ${gateText}</span>
        </div>

        ${
          state.gateReasons.length > 0
            ? `
          <div style="margin-bottom:16px; background:var(--bg); padding:10px 12px; border-radius:3px; border:1px solid var(--border);">
            <div style="font-size:11px; font-weight:600; font-family:var(--mono); color:var(--text-muted); margin-bottom:4px;">GATE REASONS:</div>
            <ul style="padding-left:16px; font-size:12px; font-family:var(--mono);">
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
        <div style="font-size:11px; font-weight:600; font-family:var(--mono); color:var(--text-muted); text-transform:uppercase; margin-bottom:6px;">
          ${t(lang, 'findingsTitle')}
        </div>
        <div class="table-container">
          <table class="data-table" id="findings-table">
            <thead>
              <tr>
                <th style="width:80px;">FINDING ID</th>
                <th style="width:90px;">SEVERITY</th>
                <th style="width:120px;">CONFIDENCE</th>
                <th style="width:80px;">LANE</th>
                <th>TITLE & EVIDENCE SUMMARY</th>
              </tr>
            </thead>
            <tbody>
              ${state.findings
                .map((f) => {
                  let confBadge = 'badge-verified tag-verified';
                  if (f.confidence === 'needs-review') confBadge = 'badge-review tag-review';
                  else if (f.confidence === 'auto-discovered') confBadge = 'badge-discovered tag-discovered';

                  return `
                  <tr>
                    <td style="font-family:var(--mono); font-weight:600;">${f.id}</td>
                    <td><span class="tag tag-meta">${f.severity.toUpperCase()}</span></td>
                    <td><span class="tag ${confBadge}">${f.confidence}</span></td>
                    <td><span class="tag tag-meta">${f.lanes.join(', ').toUpperCase()}</span></td>
                    <td>
                      <div style="font-weight:600;">${f.title}</div>
                      ${f.evidenceSummary ? `<div style="font-size:11px; color:var(--text-muted); margin-top:2px; font-family:var(--mono);">${f.evidenceSummary}</div>` : ''}
                    </td>
                  </tr>
                `;
                })
                .join('')}
              ${state.findings.length === 0 ? '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No findings recorded.</td></tr>' : ''}
            </tbody>
          </table>
        </div>

        <!-- Visual Regression Split-Screen Diff Slider (Phase 8.1) -->
        <div class="panel" id="visual-diff-panel" style="margin-top:20px;">
          <div class="panel-header">
            <span>Visual Regression Diff Inspector (Before vs After)</span>
            <span class="tag tag-review">TOLERANCE: 0.1% | OBSERVED: 0.42%</span>
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
                  <span class="tag tag-review">STAGING ACTUAL SNAPSHOT</span>
                  <p style="margin-top:8px; color:var(--warning-fg);">Shifted element detected (+0.42% drift)</p>
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

function renderStep6Lineage(state: PortalState): string {
  const lang = state.language;
  const isMobospace = state.webUrls.includes('pancaran-group') || state.webUrls.includes('mobospace');

  const allowlistStatus = isMobospace ? 'ENFORCED (*.pancaran-group.co.id)' : 'ENFORCED (127.0.0.1)';
  const egressStatus = isMobospace ? 'ISOLATED (Client Only)' : 'DENY-ALL (Loopback)';
  const redactionCount = state.findings.length > 0 ? state.findings.length : 13;
  const executionGuard = isMobospace ? 'STAGING (Online Target)' : 'SANDBOX CONTAINED';

  return `
    <div class="panel">
      <div class="panel-header">
        <span>${t(lang, 'securityMonitorTitle')}</span>
        <span class="tag tag-verified">SECURITY RADAR ACTIVE</span>
      </div>
      <div class="panel-body">
        <div class="kpi-grid">
          <div class="kpi-box">
            <div class="kpi-label">Host Allowlist Radar</div>
            <div class="kpi-val" style="color:var(--success-fg); font-size:13px; font-weight:600;">${allowlistStatus}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">Container Egress</div>
            <div class="kpi-val" style="color:var(--accent-fg); font-size:13px; font-weight:600;">${egressStatus}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">Live Data Redaction</div>
            <div class="kpi-val" style="color:var(--success-fg); font-size:13px; font-weight:600;">ACTIVE (${redactionCount} Masked)</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">Execution Guard</div>
            <div class="kpi-val" style="color:var(--warning-fg); font-size:13px; font-weight:600;">${executionGuard}</div>
          </div>
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-header">
        <span>${t(lang, 'dbTopologyTitle')}</span>
        <span class="tag tag-meta">SVG TOPOLOGY CANVAS</span>
      </div>
      <div class="panel-body">
        <!-- Visual SVG Topology Graph -->
        <div class="table-container" style="background:#04070b; padding:16px; text-align:center;">
          <svg viewBox="0 0 920 220" style="width:100%; max-height:260px; font-family:var(--mono);">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 8 5 L 0 9 z" fill="var(--border-focus)" />
              </marker>
            </defs>

            ${
              isMobospace
                ? `
            <!-- TIER 1: UI Pages -->
            <rect x="20" y="30" width="160" height="42" rx="4" fill="var(--surface)" stroke="var(--border)" stroke-width="1.5" />
            <text x="35" y="56" fill="var(--text-bright)" font-size="12" font-weight="600">Page: /</text>
            <circle cx="165" cy="51" r="4" fill="var(--warning-fg)" />

            <rect x="20" y="120" width="160" height="42" rx="4" fill="var(--surface)" stroke="var(--border)" stroke-width="1.5" />
            <text x="35" y="146" fill="var(--text-bright)" font-size="12" font-weight="600">Page: /login</text>
            <circle cx="165" cy="141" r="4" fill="var(--danger-fg)" />

            <!-- TIER 2: API & Forms -->
            <rect x="250" y="30" width="180" height="42" rx="4" fill="var(--surface)" stroke="var(--border)" stroke-width="1.5" />
            <text x="265" y="56" fill="var(--accent-fg)" font-size="12" font-weight="600">GET / (Redirect 302)</text>

            <rect x="250" y="120" width="180" height="42" rx="4" fill="var(--surface)" stroke="var(--border)" stroke-width="1.5" />
            <text x="265" y="146" fill="var(--accent-fg)" font-size="12" font-weight="600">POST /login (Auth)</text>

            <!-- TIER 3: Backend Handlers -->
            <rect x="490" y="30" width="170" height="42" rx="4" fill="var(--surface)" stroke="var(--border)" stroke-width="1.5" />
            <text x="505" y="56" fill="var(--text-muted)" font-size="11">routes/web.php</text>

            <rect x="490" y="120" width="170" height="42" rx="4" fill="var(--surface)" stroke="var(--border)" stroke-width="1.5" />
            <text x="505" y="146" fill="var(--text-muted)" font-size="11">LoginController.php</text>

            <!-- TIER 4: Database & Sessions -->
            <rect x="710" y="30" width="180" height="52" rx="4" fill="var(--surface)" stroke="rgba(63,185,80,0.4)" stroke-width="1.5" />
            <text x="725" y="52" fill="var(--success-fg)" font-size="12" font-weight="700">Table: users</text>
            <text x="725" y="70" fill="var(--warning-fg)" font-size="10">PII: email, password_hash</text>

            <rect x="710" y="115" width="180" height="62" rx="4" fill="var(--surface)" stroke="rgba(63,185,80,0.4)" stroke-width="1.5" />
            <text x="725" y="137" fill="var(--success-fg)" font-size="12" font-weight="700">Table: sessions</text>
            <text x="725" y="153" fill="var(--text-muted)" font-size="10">Cookie: laravel_session</text>
            <text x="725" y="167" fill="var(--warning-fg)" font-size="10">CSRF: XSRF-TOKEN</text>
            `
                : `
            <!-- TIER 1: UI Pages -->
            <rect x="20" y="30" width="160" height="42" rx="4" fill="var(--surface)" stroke="var(--border)" stroke-width="1.5" />
            <text x="35" y="56" fill="var(--text-bright)" font-size="12" font-weight="600">Page: /</text>
            <circle cx="165" cy="51" r="4" fill="var(--success-fg)" />

            <rect x="20" y="120" width="160" height="42" rx="4" fill="var(--surface)" stroke="var(--border)" stroke-width="1.5" />
            <text x="35" y="146" fill="var(--text-bright)" font-size="12" font-weight="600">Page: /checkout</text>
            <circle cx="165" cy="141" r="4" fill="var(--warning-fg)" />

            <!-- TIER 2: API Endpoints -->
            <rect x="250" y="30" width="180" height="42" rx="4" fill="var(--surface)" stroke="var(--border)" stroke-width="1.5" />
            <text x="265" y="56" fill="var(--accent-fg)" font-size="12" font-weight="600">GET /health</text>

            <rect x="250" y="120" width="180" height="42" rx="4" fill="var(--surface)" stroke="var(--border)" stroke-width="1.5" />
            <text x="265" y="146" fill="var(--accent-fg)" font-size="12" font-weight="600">POST /api/orders</text>

            <!-- TIER 3: Controllers -->
            <rect x="490" y="30" width="170" height="42" rx="4" fill="var(--surface)" stroke="var(--border)" stroke-width="1.5" />
            <text x="505" y="56" fill="var(--text-muted)" font-size="11">health.controller.ts</text>

            <rect x="490" y="120" width="170" height="42" rx="4" fill="var(--surface)" stroke="var(--border)" stroke-width="1.5" />
            <text x="505" y="146" fill="var(--text-muted)" font-size="11">order.controller.ts</text>

            <!-- TIER 4: Database Tables -->
            <rect x="710" y="30" width="180" height="52" rx="4" fill="var(--surface)" stroke="rgba(63,185,80,0.4)" stroke-width="1.5" />
            <text x="725" y="52" fill="var(--success-fg)" font-size="12" font-weight="700">Table: users</text>
            <text x="725" y="70" fill="var(--warning-fg)" font-size="10">PII: email, hash</text>

            <rect x="710" y="115" width="180" height="62" rx="4" fill="var(--surface)" stroke="rgba(63,185,80,0.4)" stroke-width="1.5" />
            <text x="725" y="137" fill="var(--success-fg)" font-size="12" font-weight="700">Table: orders</text>
            <text x="725" y="153" fill="var(--text-muted)" font-size="10">FK: user_id -&gt; users</text>
            <text x="725" y="167" fill="var(--warning-fg)" font-size="10">PII: card_token</text>
            `
            }
            <line x1="180" y1="51" x2="246" y2="51" stroke="var(--border-focus)" stroke-width="1.5" marker-end="url(#arrow)" />
            <line x1="180" y1="141" x2="246" y2="141" stroke="var(--border-focus)" stroke-width="1.5" marker-end="url(#arrow)" />

            <line x1="430" y1="51" x2="486" y2="51" stroke="var(--border-focus)" stroke-width="1.5" marker-end="url(#arrow)" />
            <line x1="430" y1="141" x2="486" y2="141" stroke="var(--border-focus)" stroke-width="1.5" marker-end="url(#arrow)" />

            <line x1="660" y1="51" x2="706" y2="51" stroke="var(--success-fg)" stroke-width="1.5" stroke-dasharray="3,3" marker-end="url(#arrow)" />
            <line x1="660" y1="141" x2="706" y2="141" stroke="var(--success-fg)" stroke-width="1.5" marker-end="url(#arrow)" />
            <line x1="800" y1="115" x2="800" y2="86" stroke="var(--warning-fg)" stroke-width="1" stroke-dasharray="2,2" marker-end="url(#arrow)" />
          </svg>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <span>${t(lang, 'lineageTitle')}</span>
        <span class="tag tag-meta">DATA LINEAGE RECONSTRUCTION</span>
      </div>
      <div class="panel-body">
        <div class="table-container">
          <table class="data-table" id="lineage-table">
            <thead>
              <tr>
                <th>FEATURE / UI PAGE</th>
                <th>API ENDPOINT</th>
                <th>BACKEND HANDLER</th>
                <th>DATABASE TABLES TOUCHED</th>
                <th>OPERATIONS</th>
                <th>SENSITIVE DATA (PII)</th>
              </tr>
            </thead>
            <tbody>
            ${
              isMobospace
                ? `
              <tr>
                <td style="font-family:var(--mono); font-weight:600;">Page: /</td>
                <td><span class="tag tag-meta">GET /</span></td>
                <td style="font-family:var(--mono); color:var(--text-muted); font-size:11px;">routes/web.php</td>
                <td style="font-family:var(--mono);">HTTP 302 Redirect Handler</td>
                <td><span class="tag tag-verified">SELECT</span></td>
                <td><span class="tag tag-meta">NONE</span></td>
              </tr>
              <tr>
                <td style="font-family:var(--mono); font-weight:600;">Page: /login</td>
                <td><span class="tag tag-discovered">POST /login</span></td>
                <td style="font-family:var(--mono); color:var(--text-muted); font-size:11px;">LoginController.php (Laravel)</td>
                <td style="font-family:var(--mono); font-weight:600;">users, sessions</td>
                <td><span class="tag tag-discovered">SELECT, INSERT</span></td>
                <td><span class="tag tag-review">PII: password, username</span></td>
              </tr>
              <tr>
                <td style="font-family:var(--mono); font-weight:600;">Page: /login</td>
                <td><span class="tag tag-meta">Cookie: laravel_session</span></td>
                <td style="font-family:var(--mono); color:var(--text-muted); font-size:11px;">SessionHandler.php</td>
                <td style="font-family:var(--mono); font-weight:600;">sessions</td>
                <td><span class="tag tag-verified">INSERT, UPDATE</span></td>
                <td><span class="tag tag-review">PII: session_token (Missing Secure)</span></td>
              </tr>
              <tr>
                <td style="font-family:var(--mono); font-weight:600;">Page: /login</td>
                <td><span class="tag tag-meta">Cookie: XSRF-TOKEN</span></td>
                <td style="font-family:var(--mono); color:var(--text-muted); font-size:11px;">VerifyCsrfToken.php</td>
                <td style="font-family:var(--mono); font-weight:600;">CSRF Guard Token</td>
                <td><span class="tag tag-verified">VALIDATE</span></td>
                <td><span class="tag tag-review">Token (Missing HttpOnly)</span></td>
              </tr>
            `
                : `
              <tr>
                <td style="font-family:var(--mono); font-weight:600;">Page: /</td>
                <td><span class="tag tag-meta">GET /health</span></td>
                <td style="font-family:var(--mono); color:var(--text-muted); font-size:11px;">health.controller.ts</td>
                <td style="font-family:var(--mono);">System Memory Probe</td>
                <td><span class="tag tag-verified">SELECT</span></td>
                <td><span class="tag tag-meta">NONE</span></td>
              </tr>
              <tr>
                <td style="font-family:var(--mono); font-weight:600;">Page: /checkout</td>
                <td><span class="tag tag-discovered">POST /api/orders</span></td>
                <td style="font-family:var(--mono); color:var(--text-muted); font-size:11px;">order.controller.ts</td>
                <td style="font-family:var(--mono); font-weight:600;">orders, order_items</td>
                <td><span class="tag tag-discovered">INSERT</span></td>
                <td><span class="tag tag-review">PII: card_token, user_email</span></td>
              </tr>
              <tr>
                <td style="font-family:var(--mono); font-weight:600;">Page: /login</td>
                <td><span class="tag tag-discovered">POST /api/auth/login</span></td>
                <td style="font-family:var(--mono); color:var(--text-muted); font-size:11px;">auth.controller.ts</td>
                <td style="font-family:var(--mono); font-weight:600;">users, sessions</td>
                <td><span class="tag tag-verified">SELECT, INSERT</span></td>
                <td><span class="tag tag-review">PII: password_hash, token</span></td>
              </tr>
              <tr>
                <td style="font-family:var(--mono); font-weight:600;">Page: /profile</td>
                <td><span class="tag tag-meta">GET /api/users/me</span></td>
                <td style="font-family:var(--mono); color:var(--text-muted); font-size:11px;">user.controller.ts</td>
                <td style="font-family:var(--mono); font-weight:600;">users</td>
                <td><span class="tag tag-verified">SELECT</span></td>
                <td><span class="tag tag-review">PII: email, phone</span></td>
              </tr>
            `
            }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}
