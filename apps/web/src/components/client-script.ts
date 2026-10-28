import type { PortalState } from '../state.js';

export function renderClientScript(state: PortalState): string {
  return `
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
            if (prodBanner) prodBanner.style.display = 'flex';
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
        if (apiBase && apiBase.startsWith('http')) {
          payload.api = { baseUrl: apiBase };
          if (apiSpec && apiSpec.startsWith('http')) {
            payload.api.specUrl = apiSpec;
          }
        }

        const guidedLogin = document.getElementById('check-guided-login')?.checked || false;
        const cookieStr = (document.getElementById('input-session-cookies')?.value || '').trim();

        if (guidedLogin || cookieStr) {
          payload.auth = {
            interactive: guidedLogin,
            roles: guidedLogin ? ['guided-login'] : undefined,
            cookies: cookieStr || undefined,
          };
        }

        if (effectiveMode !== 'sandbox') {
          payload.authorization = {
            ownerConfirmed: authChecked || Boolean(webVal),
            approvedBy: approverVal || 'user@company.local',
            perfApproved: true
          };
        }

        return payload;
      }

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
        } catch (err) {
          alert('Dry run request failed: ' + err.message);
        } finally {
          if (btn) btn.textContent = 'Uji Kering (Dry Run)';
        }
      });

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
          const approverVal = (payload.authorization && payload.authorization.approvedBy) ? payload.authorization.approvedBy : 'user@company.local';
          const res = await fetch('/api/runs', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-User-Role': 'approver',
              'X-User-Email': approverVal,
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
  `;
}
