import type { PortalState } from '../state.js';
import { defaultRegistry } from '@nexus/registry';

export function renderClientScript(state: PortalState): string {
  return `
    (function() {
      let currentStep = ${state.currentStep};
      let currentMode = '${state.mode}';
      let currentScope = '${state.scope}';
      let activeRunId = '${state.runId ?? ''}';
      let eventSource = null;
      let activeBuilderType = '${state.activeBuilderType}';
      let testRowsState = ${JSON.stringify(state.testRows)};
      let planCasesState = ${JSON.stringify(state.planCases)};
      let approvedCaseIds = new Set(${JSON.stringify(Array.from(state.approvedCaseIds))});
      let pendingSuggestions = [];
      const registryDefs = ${JSON.stringify(defaultRegistry.list())};
      const lang = '${state.language}';
      const findingsState = ${JSON.stringify(state.findings)};
      let selectedFindingForJira = null;
      let liveTimerInterval = null;
      let liveStartTime = null;

      function formatTime(iso) {
        try {
          return '[' + new Date(iso || Date.now()).toLocaleTimeString() + ']';
        } catch {
          return '[' + new Date().toLocaleTimeString() + ']';
        }
      }

      function startLiveTimer() {
        clearInterval(liveTimerInterval);
        liveStartTime = Date.now();
        const timerEl = document.getElementById('live-elapsed-timer');
        const startedEl = document.getElementById('live-started-at');
        if (startedEl) startedEl.textContent = 'MULAI: ' + new Date().toLocaleTimeString();

        liveTimerInterval = setInterval(() => {
          if (!liveStartTime || !timerEl) return;
          const elapsedSec = Math.floor((Date.now() - liveStartTime) / 1000);
          const m = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
          const s = String(elapsedSec % 60).padStart(2, '0');
          timerEl.textContent = 'DURASI: ' + m + ':' + s;
        }, 1000);
      }

      function stopLiveTimer() {
        clearInterval(liveTimerInterval);
        liveTimerInterval = null;
      }


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

        if (step === 3) {
          loadPlanPreview();
        }
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
      document.getElementById('btn-back-to-builder')?.addEventListener('click', () => switchStep(2));
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
          updateActiveLanes();
        });
      });

      // Scope selector
      document.querySelectorAll('.scope-opt').forEach(opt => {
        opt.addEventListener('click', () => {
          document.querySelectorAll('.scope-opt').forEach(o => o.classList.remove('selected'));
          opt.classList.add('selected');
          currentScope = opt.getAttribute('data-scope') || 'quick';
        });
      });

      // Interactive lane chips listeners
      function attachLaneChipListeners() {
        document.querySelectorAll('#active-lanes-chips .chip-interactive').forEach(chip => {
          chip.addEventListener('click', function() {
            if (this.classList.contains('disabled')) return;
            this.classList.toggle('inactive');
          });
        });
      }
      attachLaneChipListeners();

      // Dynamic Active Lanes calculation
      function updateActiveLanes() {
        const repo = (document.getElementById('input-repo')?.value || '').trim();
        const web = (document.getElementById('input-web')?.value || '').trim();
        const api = (document.getElementById('input-api-base')?.value || '').trim();
        const spec = (document.getElementById('input-api-spec')?.value || '').trim();

        const container = document.getElementById('active-lanes-chips');
        if (!container) return;

        const lanes = [];
        if (repo) lanes.push('repo');
        if (web) lanes.push('e2e', 'a11y', 'perf', 'security');
        if ((api || spec) && !lanes.includes('api')) lanes.push('api');

        if (lanes.length === 0) {
          container.innerHTML = '<span class="tag tag-muted">NO TARGETS CONFIGURED</span>';
        } else {
          container.innerHTML = lanes.map(l => {
            const isPerfLocked = currentMode === 'prod-safe' && l === 'perf';
            return '<span class="tag ' + (isPerfLocked ? 'tag-muted chip-interactive disabled' : 'tag-verified chip-interactive') + '" data-lane="' + l + '" title="' + (isPerfLocked ? 'Perf locked in prod-safe' : 'Klik untuk toggle lane') + '">' + l.toUpperCase() + (isPerfLocked ? ' (LOCKED)' : '') + '</span>';
          }).join('');
          attachLaneChipListeners();
        }
      }

      document.getElementById('input-repo')?.addEventListener('input', updateActiveLanes);
      document.getElementById('input-web')?.addEventListener('input', updateActiveLanes);
      document.getElementById('input-api-base')?.addEventListener('input', updateActiveLanes);
      document.getElementById('input-api-spec')?.addEventListener('input', updateActiveLanes);
      // Dynamic Auth Form Fields handlers
      function attachAuthFieldListeners() {
        document.querySelectorAll('.btn-del-auth-field').forEach(btn => {
          btn.addEventListener('click', function() {
            this.closest('.auth-field-row')?.remove();
            const container = document.getElementById('auth-fields-container');
            const hint = document.getElementById('auth-fields-empty-hint');
            if (hint && container) {
              hint.style.display = container.children.length === 0 ? 'block' : 'none';
            }
          });
        });
      }
      attachAuthFieldListeners();

      document.getElementById('btn-add-auth-field')?.addEventListener('click', () => {
        const container = document.getElementById('auth-fields-container');
        const hint = document.getElementById('auth-fields-empty-hint');
        if (!container) return;
        const idx = container.children.length;
        const row = document.createElement('div');
        row.className = 'auth-field-row';
        row.setAttribute('data-idx', String(idx));
        row.style.cssText = 'display:grid; grid-template-columns: 2fr 1fr 2fr 36px; gap:8px; align-items:center;';
        row.innerHTML =
          '<input type="text" class="input-mono auth-field-target" placeholder="Target / Label / Selector (contoh: Akses)" />' +
          '<select class="input-mono auth-field-action">' +
            '<option value="select">select (Dropdown)</option>' +
            '<option value="fill">fill (Teks)</option>' +
            '<option value="click">click (Klik)</option>' +
            '<option value="check">check (Centang)</option>' +
          '</select>' +
          '<input type="text" class="input-mono auth-field-value" placeholder="Nilai / Opsi (contoh: Internal)" />' +
          '<button type="button" class="btn btn-secondary btn-del-auth-field" style="height:28px; padding:0 6px; font-size:10px;">X</button>';
        container.appendChild(row);
        if (hint) hint.style.display = 'none';
        attachAuthFieldListeners();
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

        const activeLanesMap = {};
        document.querySelectorAll('#active-lanes-chips .chip-interactive').forEach(chip => {
          const laneKey = (chip.getAttribute('data-lane') || '').toLowerCase();
          const isInactive = chip.classList.contains('inactive');
          const isDisabled = chip.classList.contains('disabled');
          if (laneKey) {
            activeLanesMap[laneKey] = !isInactive && !isDisabled;
          }
        });

        const payload = {
          name: 'Portal Run ' + new Date().toLocaleTimeString(),
          mode: effectiveMode,
          scope: currentScope,
          lanes: activeLanesMap,
          testRows: testRowsState,
        };

        if (repoVal) payload.repo = { localPath: repoVal };
        if (webVal) payload.web = { urls: webVal.split(',').map(s => s.trim()).filter(Boolean) };
        if (apiBase || apiSpec) {
          payload.api = {};
          if (apiBase) payload.api.baseUrl = apiBase;
          if (apiSpec) payload.api.specUrl = apiSpec;
        }

        const guidedLogin = document.getElementById('check-guided-login')?.checked || false;
        const cookieStr = (document.getElementById('input-session-cookies')?.value || '').trim();
        const authRefVal = (document.getElementById('input-auth-ref')?.value || '').trim();
        const loginUrlVal = (document.getElementById('input-login-url')?.value || '').trim();

        const formFields = [];
        document.querySelectorAll('.auth-field-row').forEach(row => {
          const targetInput = row.querySelector('.auth-field-target');
          const actionInput = row.querySelector('.auth-field-action');
          const valueInput = row.querySelector('.auth-field-value');
          const target = (targetInput ? targetInput.value : '').trim();
          const action = (actionInput ? actionInput.value : 'select');
          const value = (valueInput ? valueInput.value : '').trim();
          if (target) {
            formFields.push({ target, action, value });
          }
        });

        if (guidedLogin || cookieStr || authRefVal || loginUrlVal || formFields.length > 0) {
          payload.auth = {
            interactive: Boolean(guidedLogin),
            ...(guidedLogin ? { roles: ['guided-login'] } : {}),
            ...(cookieStr ? { cookies: cookieStr } : {}),
            ...(authRefVal ? { ref: authRefVal } : {}),
            ...(loginUrlVal ? { loginUrl: loginUrlVal } : {}),
            ...(formFields.length > 0 ? { formFields } : {}),
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

      // Dry Run execution -> render to #dry-run-drawer without alert()
      document.getElementById('btn-dry-run')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn-dry-run');
        const drawer = document.getElementById('dry-run-drawer');
        const drawerContent = document.getElementById('dry-run-drawer-content');
        if (btn) btn.textContent = 'Estimating...';

        const payload = collectRunPayload();
        try {
          const res = await fetch('/api/runs/dry-run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const json = await res.json();
          if (drawer && drawerContent) {
            drawer.style.display = 'block';
            if (json.valid) {
              drawerContent.innerHTML =
                '<div style="color:var(--success-fg); font-weight:700; margin-bottom:8px;">[DRY RUN VALID] Konfigurasi target dan batasan mode berhasil diverifikasi!</div>' +
                '<div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:8px; margin-bottom:8px;">' +
                  '<div><strong>Mode:</strong> ' + json.mode + ' (' + json.rateLimitReqPerSec + ' req/s max)</div>' +
                  '<div><strong>Scope:</strong> ' + json.scope + '</div>' +
                  '<div><strong>Estimasi Request:</strong> ~' + json.estimatedRequests + ' req</div>' +
                  '<div><strong>Estimasi Durasi:</strong> ~' + json.estimatedDurationSeconds + ' detik</div>' +
                '</div>' +
                '<div style="margin-bottom:6px;"><strong>Active Lanes:</strong> ' +
                  (json.activeLanes || []).map(l => '<span class="tag tag-verified" style="margin-right:4px;">' + l.toUpperCase() + '</span>').join('') +
                '</div>' +
                '<div><strong>Targets:</strong> ' +
                  (json.targets || []).map(t => '<span class="tag tag-meta" style="margin-right:4px;">' + t + '</span>').join('') +
                '</div>' +
                (json.banner ? '<div class="banner banner-warn" style="margin-top:8px;">' + json.banner + '</div>' : '');
            } else {
              drawerContent.innerHTML =
                '<div style="color:var(--danger-fg); font-weight:700; margin-bottom:8px;">[DRY RUN FAILED] Validasi target atau otorisasi gagal:</div>' +
                '<ul style="margin-left:18px; color:var(--danger-fg);">' +
                  (json.errors || []).map(e => '<li>' + e + '</li>').join('') +
                '</ul>';
            }
          }
        } catch (err) {
          if (drawer && drawerContent) {
            drawer.style.display = 'block';
            drawerContent.innerHTML = '<div style="color:var(--danger-fg);">Dry run request failed: ' + err.message + '</div>';
          }
        } finally {
          if (btn) btn.textContent = 'Uji Kering (Dry Run)';
        }
      });

      document.getElementById('btn-close-dry-run-drawer')?.addEventListener('click', () => {
        const drawer = document.getElementById('dry-run-drawer');
        if (drawer) drawer.style.display = 'none';
      });

      // Builder Table Rendering and Interactions
      function renderBuilderTable() {
        const def = registryDefs.find(d => d.type === activeBuilderType);
        const rows = testRowsState[activeBuilderType] || [];
        const table = document.getElementById('builder-table');
        if (!table || !def) return;

        // Header
        const thead = table.querySelector('thead');
        if (thead) {
          thead.innerHTML = '<tr>' +
            def.columns.map(c => {
              let minW = '';
              if (c.key === 'scenario') minW = 'min-width:220px;';
              else if (c.key === 'steps') minW = 'min-width:260px;';
              else if (c.key === 'expected') minW = 'min-width:240px;';
              return '<th style="' + (c.width ? 'width:' + c.width + ';' : '') + minW + '">' + c.label.en + '</th>';
            }).join('') +
            '<th style="width:60px; text-align:right;">ACTION</th>' +
          '</tr>';
        }

        // Body
        const tbody = table.querySelector('tbody');
        if (tbody) {
          tbody.innerHTML = rows.map((row, rIdx) => {
            const cells = def.columns.map(col => {
              const val = row[col.key];
              let minW = '';
              if (col.key === 'scenario') minW = 'min-width:220px;';
              else if (col.key === 'steps') minW = 'min-width:260px;';
              else if (col.key === 'expected') minW = 'min-width:240px;';

              if (col.kind === 'select' && Array.isArray(col.options)) {
                const opts = col.options.map(opt => {
                  const isSel = String(val ?? '') === String(opt.value);
                  const lbl = opt.label[lang] || opt.label.en || opt.value;
                  return '<option value="' + opt.value + '" ' + (isSel ? 'selected' : '') + '>' + lbl + '</option>';
                }).join('');
                return '<td><select class="input-mono builder-cell" style="height:26px; padding:0 6px; font-size:11px; width:100%; ' + minW + '" data-row="' + rIdx + '" data-field="' + col.key + '">' + opts + '</select></td>';
              }
              if (col.kind === 'boolean') {
                const isTrue = val === true || String(val) === 'true';
                return '<td><select class="input-mono builder-cell" style="height:26px; padding:0 6px; font-size:11px; width:100%; ' + minW + '" data-row="' + rIdx + '" data-field="' + col.key + '">' +
                  '<option value="true" ' + (isTrue ? 'selected' : '') + '>true</option>' +
                  '<option value="false" ' + (!isTrue ? 'selected' : '') + '>false</option>' +
                '</select></td>';
              }
              return '<td><input type="text" class="input-mono builder-cell" style="height:26px; padding:0 6px; font-size:11px; width:100%; ' + minW + '" data-row="' + rIdx + '" data-field="' + col.key + '" value="' + String(val ?? '') + '" /></td>';
            }).join('');

            return '<tr data-row-index="' + rIdx + '">' +
              cells +
              '<td style="text-align:right;">' +
                '<button class="btn btn-secondary btn-del-row" style="height:22px; padding:0 6px; font-size:10px;" data-index="' + rIdx + '">DEL</button>' +
              '</td>' +
            '</tr>';
          }).join('');
        }

        // Update pill counts
        document.querySelectorAll('#type-switcher .type-pill').forEach(pill => {
          const pType = pill.getAttribute('data-type');
          const badge = pill.querySelector('.pill-badge');
          const count = (testRowsState[pType] || []).length;
          if (badge) badge.textContent = count;
        });

        // Mode-aware warnings
        const perfBlocked = document.getElementById('alert-perf-blocked');
        if (perfBlocked) perfBlocked.style.display = (currentMode === 'prod-safe' && activeBuilderType === 'perf') ? 'flex' : 'none';

        const secUnauth = document.getElementById('alert-sec-unauth');
        if (secUnauth) {
          const authChecked = document.getElementById('check-auth')?.checked || false;
          secUnauth.style.display = (currentMode !== 'sandbox' && !authChecked && activeBuilderType === 'security-passive') ? 'flex' : 'none';
        }

        attachBuilderCellListeners();
      }

      function attachBuilderCellListeners() {
        document.querySelectorAll('.builder-cell').forEach(el => {
          el.addEventListener('change', function() {
            const rIdx = Number(this.getAttribute('data-row'));
            const field = this.getAttribute('data-field');
            if (!isNaN(rIdx) && field && testRowsState[activeBuilderType] && testRowsState[activeBuilderType][rIdx]) {
              let val = this.value;
              if (val === 'true') val = true;
              else if (val === 'false') val = false;
              testRowsState[activeBuilderType][rIdx][field] = val;
            }
          });
          el.addEventListener('input', function() {
            const rIdx = Number(this.getAttribute('data-row'));
            const field = this.getAttribute('data-field');
            if (!isNaN(rIdx) && field && testRowsState[activeBuilderType] && testRowsState[activeBuilderType][rIdx]) {
              testRowsState[activeBuilderType][rIdx][field] = this.value;
            }
          });
        });

        document.querySelectorAll('.btn-del-row').forEach(btn => {
          btn.addEventListener('click', function() {
            const rIdx = Number(this.getAttribute('data-index'));
            if (!isNaN(rIdx) && testRowsState[activeBuilderType]) {
              testRowsState[activeBuilderType].splice(rIdx, 1);
              renderBuilderTable();
            }
          });
        });
      }
      attachBuilderCellListeners();

      // Switch type pill
      document.querySelectorAll('#type-switcher .type-pill').forEach(pill => {
        pill.addEventListener('click', () => {
          document.querySelectorAll('#type-switcher .type-pill').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          activeBuilderType = pill.getAttribute('data-type') || 'e2e';
          renderBuilderTable();
        });
      });

      // Add row button
      document.getElementById('btn-add-row')?.addEventListener('click', () => {
        if (!testRowsState[activeBuilderType]) testRowsState[activeBuilderType] = [];
        const def = registryDefs.find(d => d.type === activeBuilderType);
        const newRow = {};
        if (def) {
          def.columns.forEach(col => {
            newRow[col.key] = col.kind === 'boolean' ? false : (col.placeholder || '');
          });
        }
        testRowsState[activeBuilderType].push(newRow);
        renderBuilderTable();
      });

      // Suggest scenarios & Diff panel
      document.getElementById('btn-suggest-scenarios')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn-suggest-scenarios');
        const panel = document.getElementById('suggest-diff-panel');
        const content = document.getElementById('suggest-diff-content');
        if (btn) btn.textContent = 'Generating...';

        const webVal = (document.getElementById('input-web')?.value || '').trim();
        try {
          const res = await fetch('/api/suggest/' + activeBuilderType, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: webVal || 'http://127.0.0.1:3100',
              pages: ['/login', '/dashboard', '/profile'],
              endpoints: ['/api/v1/health', '/api/v1/todos', '/api/v1/orders']
            })
          });
          const json = await res.json();
          pendingSuggestions = json.suggestions || [];
          if (panel && content) {
            panel.style.display = 'block';
            if (pendingSuggestions.length === 0) {
              content.innerHTML = '<div style="color:var(--text-muted);">Tidak ada skenario baru yang disarankan untuk tipe ini.</div>';
            } else {
              content.innerHTML =
                '<div style="margin-bottom:8px; color:var(--accent-fg); font-weight:600;">Ditemukan ' + pendingSuggestions.length + ' usulan skenario cerdas:</div>' +
                '<table class="data-table" style="width:100%;">' +
                  '<thead><tr><th>ID</th><th>TITLE / SCENARIO</th><th>CONFIDENCE</th></tr></thead>' +
                  '<tbody>' +
                    pendingSuggestions.map(s =>
                      '<tr>' +
                        '<td>' + s.id + '</td>' +
                        '<td>' + (s.title || (s.fields && s.fields.scenario) || JSON.stringify(s.fields)) + '</td>' +
                        '<td><span class="tag tag-discovered">' + (s.confidence || 'auto-discovered') + '</span></td>' +
                      '</tr>'
                    ).join('') +
                  '</tbody>' +
                '</table>';
            }
          }
        } catch (err) {
          alert('Suggest request error: ' + err.message);
        } finally {
          if (btn) btn.textContent = 'Sarankan Skenario (Suggest)';
        }
      });

      document.getElementById('btn-apply-suggest')?.addEventListener('click', () => {
        if (pendingSuggestions.length > 0) {
          if (!testRowsState[activeBuilderType]) testRowsState[activeBuilderType] = [];
          pendingSuggestions.forEach(s => {
            const row = s.fields ? { ...s.fields, id: s.id } : { id: s.id, scenario: s.title };
            testRowsState[activeBuilderType].push(row);
          });
          pendingSuggestions = [];
          const panel = document.getElementById('suggest-diff-panel');
          if (panel) panel.style.display = 'none';
          renderBuilderTable();
        }
      });

      document.getElementById('btn-cancel-suggest')?.addEventListener('click', () => {
        pendingSuggestions = [];
        const panel = document.getElementById('suggest-diff-panel');
        if (panel) panel.style.display = 'none';
      });

      // Plan Review Preview & Table
      async function loadPlanPreview() {
        const payload = collectRunPayload();
        try {
          const res = await fetch('/api/runs/plan-preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (res.ok) {
            const plan = await res.json();
            planCasesState = plan.cases || [];
            approvedCaseIds = new Set(planCasesState.filter(c => c.approved).map(c => c.id));
            renderPlanTable();
          }
        } catch (err) {
          console.error('Plan preview fetch failed:', err);
        }
      }

      function renderPlanTable() {
        const laneFilter = document.getElementById('filter-plan-lane')?.value || 'all';
        const confFilter = document.getElementById('filter-plan-confidence')?.value || 'all';

        const toRun = planCasesState.filter(c => approvedCaseIds.has(c.id) && c.modeCompatibility === 'allowed').length;
        const needsApproval = planCasesState.filter(c => c.confidence === 'needs-review' && c.modeCompatibility === 'allowed').length;
        const skippedByMode = planCasesState.filter(c => c.modeCompatibility === 'skipped-by-mode').length;

        // Update KPI boxes
        const kpiVals = document.querySelectorAll('#step-view-3 .kpi-val');
        if (kpiVals.length >= 4) {
          kpiVals[0].textContent = planCasesState.length;
          kpiVals[1].textContent = toRun;
          kpiVals[2].textContent = needsApproval;
          kpiVals[3].textContent = skippedByMode;
        }

        // Update Lane dropdown options dynamically if empty
        const laneSelect = document.getElementById('filter-plan-lane');
        if (laneSelect && planCasesState.length > 0) {
          const currentVal = laneSelect.value;
          const uniqueLanes = [...new Set(planCasesState.map(c => c.lane))];
          laneSelect.innerHTML = '<option value="all">ALL LANES</option>' +
            uniqueLanes.map(l => '<option value="' + l + '" ' + (l === currentVal ? 'selected' : '') + '>' + l.toUpperCase() + '</option>').join('');
        }

        const tbody = document.querySelector('#plan-table tbody');
        if (!tbody) return;

        tbody.innerHTML = planCasesState.map(c => {
          const isSkipped = c.modeCompatibility === 'skipped-by-mode';
          const isChecked = approvedCaseIds.has(c.id) && !isSkipped;

          let confBadge = 'badge-verified tag-verified';
          if (c.confidence === 'needs-review') confBadge = 'badge-review tag-review';
          else if (c.confidence === 'auto-discovered') confBadge = 'badge-discovered tag-discovered';

          const visible = (laneFilter === 'all' || c.lane === laneFilter) &&
                          (confFilter === 'all' || c.confidence === confFilter);

          return '<tr class="' + (isSkipped ? 'row-skipped' : '') + '" data-lane="' + c.lane + '" data-confidence="' + c.confidence + '" style="' + (visible ? '' : 'display:none;') + '">' +
            '<td>' +
              (isSkipped
                ? '<span class="tag tag-muted" style="font-size:9px;">LOCKED</span>'
                : '<input type="checkbox" class="plan-checkbox" data-id="' + c.id + '" ' + (isChecked ? 'checked' : '') + ' />') +
            '</td>' +
            '<td style="font-family:var(--mono); font-weight:600;">' + c.id + '</td>' +
            '<td>' + c.title + '</td>' +
            '<td><span class="tag tag-meta">' + c.lane.toUpperCase() + '</span></td>' +
            '<td style="color:var(--text-muted); font-size:11px; font-family:var(--mono);">' + c.source + '</td>' +
            '<td>' +
              (isSkipped
                ? '<span class="tag tag-muted">SKIPPED BY MODE</span>'
                : '<span class="tag ' + confBadge + '">' + c.confidence + '</span>') +
            '</td>' +
            '<td><span class="tag tag-' + c.priority + '">' + c.priority + '</span></td>' +
          '</tr>';
        }).join('');

        attachPlanTableListeners();
      }

      function attachPlanTableListeners() {
        document.querySelectorAll('.plan-checkbox').forEach(cb => {
          cb.addEventListener('change', function() {
            const id = this.getAttribute('data-id');
            if (id) {
              if (this.checked) approvedCaseIds.add(id);
              else approvedCaseIds.delete(id);

              const toRun = planCasesState.filter(c => approvedCaseIds.has(c.id) && c.modeCompatibility === 'allowed').length;
              const needsApproval = planCasesState.filter(c => c.confidence === 'needs-review' && c.modeCompatibility === 'allowed').length;
              const kpiVals = document.querySelectorAll('#step-view-3 .kpi-val');
              if (kpiVals.length >= 3) {
                kpiVals[1].textContent = toRun;
                kpiVals[2].textContent = needsApproval;
              }
            }
          });
        });
      }
      attachPlanTableListeners();

      document.getElementById('filter-plan-lane')?.addEventListener('change', renderPlanTable);
      document.getElementById('filter-plan-confidence')?.addEventListener('change', renderPlanTable);

      document.getElementById('btn-approve-all-safe')?.addEventListener('click', () => {
        planCasesState.forEach(c => {
          if (c.modeCompatibility === 'allowed' && c.confidence !== 'needs-review') {
            approvedCaseIds.add(c.id);
          }
        });
        renderPlanTable();
      });

      // Approve and Run Plan button
      document.getElementById('btn-approve-and-run')?.addEventListener('click', async () => {
        const approvedList = Array.from(approvedCaseIds);
        if (approvedList.length === 0) {
          alert('Please approve at least one test case before starting the run.');
          return;
        }

        const btn = document.getElementById('btn-approve-and-run');
        if (btn) { btn.disabled = true; btn.textContent = 'Starting Run...'; }

        const payload = { ...collectRunPayload(), planApproval: 'review' };
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
            const err = await res.json();
            alert('Failed to create run: ' + (err.error || 'Server error'));
            if (btn) { btn.disabled = false; btn.textContent = 'Setujui dan Jalankan Rencana'; }
            return;
          }

          const run = await res.json();
          activeRunId = run.id;

          // Call approve endpoint
          const appRes = await fetch('/api/runs/' + activeRunId + '/plan/approve', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-User-Role': 'approver',
              'X-User-Email': approverVal,
            },
            body: JSON.stringify({ approvedCaseIds: approvedList })
          });

          if (!appRes.ok) {
            const appErr = await appRes.json();
            alert('Failed to approve plan: ' + (appErr.error || 'Approval error'));
            if (btn) { btn.disabled = false; btn.textContent = 'Setujui dan Jalankan Rencana'; }
            return;
          }

          switchStep(4);
          startSseStream(activeRunId);
        } catch (err) {
          alert('Network error approving and starting run: ' + err.message);
        } finally {
          if (btn) { btn.disabled = false; btn.textContent = 'Setujui dan Jalankan Rencana'; }
        }
      });

      // SSE Stream helper
      function startSseStream(runId) {
        startLiveTimer();
        const titleEl = document.getElementById('live-run-id-title');
        if (titleEl) titleEl.textContent = runId;

        // Reset stages indicators to initial pipeline state
        const initialStages = ['preflight', 'discover', 'app-map', 'lanes', 'correlate', 'document'];
        initialStages.forEach((st, idx) => {
          const badge = document.getElementById('stage-badge-' + st);
          if (badge) {
            badge.textContent = idx === 0 ? 'running' : 'pending';
            badge.className = 'tag ' + (idx === 0 ? 'tag-discovered' : 'tag-muted');
          }
          const dur = document.getElementById('stage-dur-' + st);
          if (dur) dur.textContent = '-';
        });

        // Reset lanes progress to standby
        const initialLanes = ['e2e', 'a11y', 'perf', 'security'];
        initialLanes.forEach(lane => {
          const statusEl = document.getElementById('lane-status-' + lane);
          const barEl = document.getElementById('lane-progress-bar-' + lane);
          if (statusEl) { statusEl.textContent = 'STANDBY'; statusEl.className = 'tag tag-muted'; }
          if (barEl) { barEl.style.width = '0%'; barEl.className = 'progress-bar-fill'; }
        });

        const terminal = document.getElementById('terminal-logs');
        if (terminal) {
          terminal.innerHTML = '<div class="log-line" data-kind="info">' +
            '<span class="log-time">' + formatTime() + '</span>' +
            '<span class="tag tag-discovered" style="font-size:9px; padding:0 4px;">INIT</span> ' +
            '<span class="log-text" style="color:var(--accent-fg); font-weight:600;">Pipeline initialized for run: ' + runId + '</span>' +
          '</div>';
        }

        if (eventSource) eventSource.close();
        eventSource = new EventSource('/api/runs/' + runId + '/events');

        eventSource.addEventListener('stage', (e) => {
          const data = JSON.parse(e.data);
          const rawStage = (data.stage || '').toLowerCase();
          const stageMap = { model: 'app-map', execute: 'lanes' };
          const mappedStage = stageMap[rawStage] || rawStage;

          const badge = document.getElementById('stage-badge-' + mappedStage);
          if (badge) {
            badge.textContent = data.status || 'running';
            badge.className = 'tag';
            if (data.status === 'ok') badge.classList.add('tag-verified');
            else if (data.status === 'running') badge.classList.add('tag-discovered');
            else if (data.status === 'failed') badge.classList.add('tag-review');
            else badge.classList.add('tag-muted');
          }

          const durEl = document.getElementById('stage-dur-' + mappedStage);
          if (durEl && data.durationMs !== undefined) {
            durEl.textContent = data.durationMs + 'ms';
          }

          if (data.requestsCount !== undefined) {
            const reqEl = document.getElementById('telemetry-requests');
            if (reqEl) reqEl.textContent = 'Requests Executed: ' + data.requestsCount;
          }

          if (mappedStage === 'lanes') {
            const lanes = ['e2e', 'a11y', 'perf', 'security'];
            lanes.forEach(lane => {
              const statusEl = document.getElementById('lane-status-' + lane);
              const barEl = document.getElementById('lane-progress-bar-' + lane);
              if (data.status === 'running') {
                if (statusEl) { statusEl.textContent = 'RUNNING'; statusEl.className = 'tag tag-discovered'; }
                if (barEl) { barEl.style.width = '65%'; barEl.className = 'progress-bar-fill'; }
              } else if (data.status === 'ok') {
                if (statusEl) { statusEl.textContent = 'PASSED'; statusEl.className = 'tag tag-verified'; }
                if (barEl) { barEl.style.width = '100%'; barEl.className = 'progress-bar-fill complete'; }
              } else if (data.status === 'failed') {
                if (statusEl) { statusEl.textContent = 'FAILED'; statusEl.className = 'tag tag-review'; }
                if (barEl) { barEl.style.width = '100%'; barEl.className = 'progress-bar-fill'; }
              }
            });
          }

          if (terminal) {
            const timeStr = formatTime(data.timestamp);
            const durStr = data.durationMs !== undefined ? ' (' + data.durationMs + 'ms)' : '';
            const line = document.createElement('div');
            line.className = 'log-line';
            line.setAttribute('data-kind', 'stage');
            line.innerHTML =
              '<span class="log-time">' + timeStr + '</span>' +
              '<span class="tag ' + (data.status === 'ok' ? 'tag-verified' : data.status === 'failed' ? 'tag-review' : 'tag-discovered') + '" style="font-size:9px; padding:0 4px;">STAGE</span> ' +
              '<span class="log-text">Stage [' + mappedStage + ']: ' + (data.status || '').toUpperCase() + durStr + '</span>';
            terminal.appendChild(line);
            terminal.scrollTop = terminal.scrollHeight;
          }
        });

        eventSource.addEventListener('log', (e) => {
          const data = JSON.parse(e.data);
          if (terminal) {
            const timeStr = formatTime(data.timestamp);
            const msg = data.message || '';
            const lower = msg.toLowerCase();
            let kind = 'info';
            let badge = '<span class="tag tag-meta" style="font-size:9px; padding:0 4px;">INFO</span>';
            if (lower.includes('stage [') || lower.includes('stage:')) {
              kind = 'stage';
              badge = '<span class="tag tag-verified" style="font-size:9px; padding:0 4px;">STAGE</span>';
            } else if (lower.includes('error') || lower.includes('failed')) {
              kind = 'error';
              badge = '<span class="tag tag-critical" style="font-size:9px; padding:0 4px;">ERROR</span>';
            } else if (lower.includes('warn')) {
              kind = 'warn';
              badge = '<span class="tag tag-review" style="font-size:9px; padding:0 4px;">WARN</span>';
            }

            const line = document.createElement('div');
            line.className = 'log-line';
            line.setAttribute('data-kind', kind);
            line.innerHTML =
              '<span class="log-time">' + timeStr + '</span>' +
              badge + ' ' +
              '<span class="log-text">' + msg + '</span>';
            terminal.appendChild(line);
            terminal.scrollTop = terminal.scrollHeight;
          }
        });

        eventSource.addEventListener('complete', (e) => {
          const data = JSON.parse(e.data);
          eventSource.close();
          stopLiveTimer();
          if (terminal) {
            const timeStr = formatTime(data.timestamp);
            const line = document.createElement('div');
            line.className = 'log-line';
            line.setAttribute('data-kind', 'stage');
            line.innerHTML =
              '<span class="log-time">' + timeStr + '</span>' +
              '<span class="tag tag-verified" style="font-size:9px; padding:0 4px; background:var(--success-bg); color:var(--success-fg);">DONE</span> ' +
              '<span class="log-text" style="color:var(--success-fg); font-weight:700;">Pipeline execution completed: Gate ' + (data.gate || '') + '</span>';
            terminal.appendChild(line);
            terminal.scrollTop = terminal.scrollHeight;
          }
          setTimeout(() => {
            window.location.href = '/?step=5&runId=' + runId;
          }, 1200);
        });

        eventSource.addEventListener('error', () => {
          eventSource.close();
        });
      }

      // Terminal Copy & Clear buttons
      document.getElementById('btn-copy-terminal-logs')?.addEventListener('click', function() {
        const text = document.getElementById('terminal-logs')?.innerText || '';
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text);
        }
        const btn = this;
        const oldText = btn.textContent;
        btn.textContent = 'TERSALIN!';
        setTimeout(() => { btn.textContent = oldText; }, 1500);
      });

      document.getElementById('btn-clear-terminal-logs')?.addEventListener('click', () => {
        const terminal = document.getElementById('terminal-logs');
        if (terminal) {
          terminal.innerHTML = '<div class="log-line" style="color:var(--text-muted);"><span class="log-time">' + formatTime() + '</span><span class="log-text">Log terminal dibersihkan.</span></div>';
        }
      });
      // Log level filter listener
      document.getElementById('filter-log-level')?.addEventListener('change', function() {
        const level = this.value;
        const lines = document.querySelectorAll('#terminal-logs .log-line');
        lines.forEach(line => {
          const kind = line.getAttribute('data-kind') || 'info';
          const text = (line.textContent || '').toLowerCase();
          if (level === 'all') {
            line.style.display = '';
          } else if (level === 'stage') {
            line.style.display = (kind === 'stage' || text.includes('stage [')) ? '' : 'none';
          } else if (level === 'info') {
            line.style.display = (kind === 'info' && !text.includes('warn') && !text.includes('error')) ? '' : 'none';
          } else if (level === 'warn') {
            line.style.display = (kind === 'warn' || text.includes('warn')) ? '' : 'none';
          } else if (level === 'error') {
            line.style.display = (kind === 'error' || text.includes('error') || text.includes('fail') || text.includes('cancel')) ? '' : 'none';
          }
        });
      });

      // Stop / Cancel Run listener
      document.getElementById('btn-stop-run')?.addEventListener('click', async () => {
        if (!activeRunId) {
          alert('No active run to cancel.');
          return;
        }

        const btn = document.getElementById('btn-stop-run');
        if (btn) { btn.disabled = true; btn.textContent = 'Cancelling...'; }

        try {
          const res = await fetch('/api/runs/' + activeRunId + '/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });

          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          stopLiveTimer();

          const stageOrder = ['preflight', 'discover', 'app-map', 'lanes', 'correlate', 'document'];
          stageOrder.forEach(st => {
            const badge = document.getElementById('stage-badge-' + st);
            if (badge && (badge.textContent === 'running' || badge.textContent === 'pending')) {
              badge.textContent = 'cancelled';
              badge.className = 'tag tag-muted';
            }
          });

          const terminal = document.getElementById('terminal-logs');
          if (terminal) {
            const timeStr = formatTime();
            const line = document.createElement('div');
            line.className = 'log-line';
            line.setAttribute('data-kind', 'error');
            line.innerHTML =
              '<span class="log-time">' + timeStr + '</span>' +
              '<span class="tag tag-critical" style="font-size:9px; padding:0 4px;">CANCEL</span> ' +
              '<span class="log-text" style="color:var(--danger-fg);">Run ' + activeRunId + ' stopped and cancelled by user.</span>';
            terminal.appendChild(line);
            terminal.scrollTop = terminal.scrollHeight;
          }
        } catch (err) {
          alert('Failed to stop run: ' + err.message);
        } finally {
          if (btn) { btn.disabled = false; btn.textContent = 'Batalkan Run'; }
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

          // Switch to Step 4 (Live Run) and start SSE
          switchStep(4);
          startSseStream(activeRunId);
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
      // Finding Inspector Drawer
      document.querySelectorAll('.finding-row').forEach(row => {
        row.addEventListener('click', function() {
          const id = this.getAttribute('data-id');
          const f = findingsState.find(x => x.id === id);
          if (!f) return;
          selectedFindingForJira = f;

          const drawer = document.getElementById('finding-inspector-drawer');
          const title = document.getElementById('finding-inspector-title');
          const content = document.getElementById('finding-inspector-content');
          if (drawer && title && content) {
            title.textContent = 'FINDING: ' + f.id + ' — ' + f.title;
            content.innerHTML =
              '<div style="display:flex; gap:8px; margin-bottom:10px;">' +
                '<span class="tag tag-' + f.severity + '">' + f.severity.toUpperCase() + '</span>' +
                '<span class="tag tag-discovered">' + f.confidence + '</span>' +
                '<span class="tag tag-meta">' + (f.lanes || []).join(', ').toUpperCase() + '</span>' +
              '</div>' +
              '<div style="margin-bottom:8px;">' +
                '<strong style="color:var(--text-muted); font-size:10px; text-transform:uppercase;">Expected:</strong>' +
                '<div style="margin-top:2px; color:var(--text-bright);">' + (f.expected || 'Memenuhi kriteria invariant dan spesifikasi API') + '</div>' +
              '</div>' +
              '<div style="margin-bottom:8px;">' +
                '<strong style="color:var(--text-muted); font-size:10px; text-transform:uppercase;">Actual / Evidence:</strong>' +
                '<div style="margin-top:2px; color:var(--warning-fg);">' + (f.actual || f.evidenceSummary || 'Deviasi terdeteksi saat eksekusi uji') + '</div>' +
              '</div>' +
              '<div style="margin-bottom:8px;">' +
                '<strong style="color:var(--text-muted); font-size:10px; text-transform:uppercase;">Fingerprint:</strong>' +
                '<div style="margin-top:2px; font-family:var(--mono); color:var(--text-muted); word-break:break-all;">' + (f.fingerprint || f.ruleId || '-') + '</div>' +
              '</div>' +
              '<div>' +
                '<strong style="color:var(--text-muted); font-size:10px; text-transform:uppercase;">Suggested Fix:</strong>' +
                '<div style="margin-top:2px; color:var(--accent-fg);">' + (f.suggestedFix || 'Tinjau endpoint handler dan periksa boundary logic serta header response') + '</div>' +
              '</div>';
            drawer.style.display = 'block';
          }
        });
      });

      document.getElementById('btn-close-finding-inspector')?.addEventListener('click', () => {
        const drawer = document.getElementById('finding-inspector-drawer');
        if (drawer) drawer.style.display = 'none';
      });

      document.getElementById('btn-copy-jira-markdown')?.addEventListener('click', function() {
        if (!selectedFindingForJira) return;
        const f = selectedFindingForJira;
        const jiraText =
          'h2. [' + f.id + '] ' + f.title + '\\n' +
          '*Severity*: ' + f.severity.toUpperCase() + ' | *Confidence*: ' + f.confidence + ' | *Lane*: ' + (f.lanes || []).join(', ').toUpperCase() + '\\n' +
          '*Fingerprint*: {{' + (f.fingerprint || f.ruleId || '-') + '}}\\n\\n' +
          'h3. Expected Behavior\\n' +
          (f.expected || 'Memenuhi kriteria invariant dan spesifikasi API') + '\\n\\n' +
          'h3. Actual Behavior\\n' +
          (f.actual || f.evidenceSummary || 'Deviasi terdeteksi saat eksekusi uji') + '\\n\\n' +
          'h3. Suggested Fix\\n' +
          (f.suggestedFix || 'Tinjau endpoint handler dan periksa boundary logic serta header response');

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(jiraText);
        } else {
          const ta = document.createElement('textarea');
          ta.value = jiraText;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }

        const btn = this;
        const oldText = btn.textContent;
        btn.textContent = 'TERSALIN!';
        setTimeout(() => { btn.textContent = oldText; }, 1500);
      });

      // Findings Search, Filter & Pagination
      let findingPageIndex = 0;
      const FINDING_PAGE_SIZE = 8;

      function renderFindingsPagination() {
        const query = (document.getElementById('finding-search')?.value || '').trim().toLowerCase();
        const severityFilter = (document.getElementById('filter-finding-severity')?.value || '').toLowerCase();
        const laneFilter = (document.getElementById('filter-finding-lane')?.value || '').toLowerCase();
        const confidenceFilter = (document.getElementById('filter-finding-confidence')?.value || '').toLowerCase();

        const rows = Array.from(document.querySelectorAll('#findings-table tbody tr.finding-row'));
        const matchingRows = [];

        rows.forEach(row => {
          const rowText = (row.textContent || '').toLowerCase();
          const rowSev = (row.getAttribute('data-severity') || '').toLowerCase();
          const rowLane = (row.getAttribute('data-lane') || '').toLowerCase();
          const rowConf = (row.getAttribute('data-confidence') || '').toLowerCase();

          const matchesQuery = !query || rowText.includes(query);
          const matchesSev = !severityFilter || rowSev === severityFilter;
          const matchesLane = !laneFilter || rowLane.includes(laneFilter);
          const matchesConf = !confidenceFilter || rowConf === confidenceFilter;

          if (matchesQuery && matchesSev && matchesLane && matchesConf) {
            matchingRows.push(row);
          }
          row.style.display = 'none';
        });

        const totalMatching = matchingRows.length;
        const totalPages = Math.max(1, Math.ceil(totalMatching / FINDING_PAGE_SIZE));
        if (findingPageIndex >= totalPages) findingPageIndex = totalPages - 1;
        if (findingPageIndex < 0) findingPageIndex = 0;

        const startIdx = findingPageIndex * FINDING_PAGE_SIZE;
        const endIdx = Math.min(startIdx + FINDING_PAGE_SIZE, totalMatching);

        for (let i = startIdx; i < endIdx; i++) {
          matchingRows[i].style.display = '';
        }

        const infoEl = document.getElementById('finding-page-info');
        if (infoEl) {
          if (totalMatching === 0) {
            infoEl.textContent = 'Tidak ada temuan yang cocok dengan filter';
          } else {
            infoEl.textContent = 'Menampilkan ' + (startIdx + 1) + '-' + endIdx + ' dari ' + totalMatching + ' temuan';
          }
        }

        const pageNumEl = document.getElementById('finding-page-num');
        if (pageNumEl) pageNumEl.textContent = 'Hal ' + (findingPageIndex + 1) + ' / ' + totalPages;

        const prevBtn = document.getElementById('btn-finding-prev');
        if (prevBtn) prevBtn.disabled = findingPageIndex <= 0;

        const nextBtn = document.getElementById('btn-finding-next');
        if (nextBtn) nextBtn.disabled = findingPageIndex >= totalPages - 1;
      }

      document.getElementById('finding-search')?.addEventListener('input', () => {
        findingPageIndex = 0;
        renderFindingsPagination();
      });
      document.getElementById('filter-finding-severity')?.addEventListener('change', () => {
        findingPageIndex = 0;
        renderFindingsPagination();
      });
      document.getElementById('filter-finding-lane')?.addEventListener('change', () => {
        findingPageIndex = 0;
        renderFindingsPagination();
      });
      document.getElementById('filter-finding-confidence')?.addEventListener('change', () => {
        findingPageIndex = 0;
        renderFindingsPagination();
      });
      document.getElementById('btn-finding-prev')?.addEventListener('click', () => {
        if (findingPageIndex > 0) {
          findingPageIndex--;
          renderFindingsPagination();
        }
      });
      document.getElementById('btn-finding-next')?.addEventListener('click', () => {
        findingPageIndex++;
        renderFindingsPagination();
      });

      renderFindingsPagination();

      // Lineage Table Search and PII Filter
      function filterLineageTable() {
        const query = (document.getElementById('lineage-search')?.value || '').trim().toLowerCase();
        const piiOnly = document.getElementById('check-filter-pii')?.checked || false;

        document.querySelectorAll('#lineage-table tbody tr').forEach(row => {
          const text = (row.textContent || '').toLowerCase();
          const page = (row.getAttribute('data-page') || '').toLowerCase();
          const endpoint = (row.getAttribute('data-endpoint') || '').toLowerCase();
          const handler = (row.getAttribute('data-handler') || '').toLowerCase();
          const tables = (row.getAttribute('data-tables') || '').toLowerCase();
          const hasPii = row.getAttribute('data-has-pii') === 'true';

          const matchesQuery = !query ||
            text.includes(query) ||
            page.includes(query) ||
            endpoint.includes(query) ||
            handler.includes(query) ||
            tables.includes(query);

          const matchesPii = !piiOnly || hasPii;

          row.style.display = (matchesQuery && matchesPii) ? '' : 'none';
        });
      }

      document.getElementById('lineage-search')?.addEventListener('input', filterLineageTable);
      document.getElementById('check-filter-pii')?.addEventListener('change', filterLineageTable);

      // SVG Node Click filter
      document.querySelectorAll('.svg-topology-node').forEach(node => {
        node.addEventListener('click', function() {
          const label = this.getAttribute('data-node-label') || '';
          const searchInput = document.getElementById('lineage-search');
          if (searchInput) {
            searchInput.value = label;
            filterLineageTable();
          }
        });
      });

      document.getElementById('btn-clear-lineage-search')?.addEventListener('click', () => {
        const searchInput = document.getElementById('lineage-search');
        if (searchInput) {
          searchInput.value = '';
          filterLineageTable();
        }
      });


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
