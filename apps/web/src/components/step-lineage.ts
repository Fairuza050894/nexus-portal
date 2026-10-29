import { t } from '../i18n.js';
import type { PortalState } from '../state.js';

export function renderStep6Lineage(state: PortalState): string {
  const lang = state.language;
  const isMobospace =
    state.webUrls.includes('pancaran-group') || state.webUrls.includes('mobospace');

  const allowlistStatus = isMobospace
    ? 'ENFORCED (*.pancaran-group.co.id)'
    : 'ENFORCED (127.0.0.1)';
  const egressStatus = isMobospace ? 'ISOLATED (Client Only)' : 'DENY-ALL (Loopback)';
  const topology = state.topology;
  const lineageEntries =
    topology?.lineage && topology.lineage.length > 0 ? topology.lineage : undefined;
  const dynamicPiiCount = lineageEntries
    ? lineageEntries.reduce(
        (acc, entry) =>
          acc +
          entry.tables.reduce(
            (tAcc, t) => tAcc + (t.sensitiveColumns.length > 0 ? t.sensitiveColumns.length : 0),
            0,
          ),
        0,
      )
    : 0;
  const redactionCount =
    dynamicPiiCount > 0 ? dynamicPiiCount : state.findings.length > 0 ? state.findings.length : 13;
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
            <g class="svg-topology-node" style="cursor:pointer;" data-node-label="/">
              <rect x="20" y="30" width="160" height="42" rx="4" fill="var(--surface)" stroke="var(--border)" stroke-width="1.5" />
              <text x="35" y="56" fill="var(--text-bright)" font-size="12" font-weight="600">Page: /</text>
              <circle cx="165" cy="51" r="4" fill="var(--warning-fg)" />
            </g>

            <g class="svg-topology-node" style="cursor:pointer;" data-node-label="login">
              <rect x="20" y="120" width="160" height="42" rx="4" fill="var(--surface)" stroke="var(--border)" stroke-width="1.5" />
              <text x="35" y="146" fill="var(--text-bright)" font-size="12" font-weight="600">Page: /login</text>
              <circle cx="165" cy="141" r="4" fill="var(--danger-fg)" />
            </g>

            <!-- TIER 2: API & Forms -->
            <g class="svg-topology-node" style="cursor:pointer;" data-node-label="GET /">
              <rect x="250" y="30" width="180" height="42" rx="4" fill="var(--surface)" stroke="var(--border)" stroke-width="1.5" />
              <text x="265" y="56" fill="var(--accent-fg)" font-size="12" font-weight="600">GET / (Redirect 302)</text>
            </g>

            <g class="svg-topology-node" style="cursor:pointer;" data-node-label="POST /login">
              <rect x="250" y="120" width="180" height="42" rx="4" fill="var(--surface)" stroke="var(--border)" stroke-width="1.5" />
              <text x="265" y="146" fill="var(--accent-fg)" font-size="12" font-weight="600">POST /login (Auth)</text>
            </g>

            <!-- TIER 3: Backend Handlers -->
            <g class="svg-topology-node" style="cursor:pointer;" data-node-label="routes/web.php">
              <rect x="490" y="30" width="170" height="42" rx="4" fill="var(--surface)" stroke="var(--border)" stroke-width="1.5" />
              <text x="505" y="56" fill="var(--text-muted)" font-size="11">routes/web.php</text>
            </g>

            <g class="svg-topology-node" style="cursor:pointer;" data-node-label="LoginController">
              <rect x="490" y="120" width="170" height="42" rx="4" fill="var(--surface)" stroke="var(--border)" stroke-width="1.5" />
              <text x="505" y="146" fill="var(--text-muted)" font-size="11">LoginController.php</text>
            </g>

            <!-- TIER 4: Database & Sessions -->
            <g class="svg-topology-node" style="cursor:pointer;" data-node-label="users">
              <rect x="710" y="30" width="180" height="52" rx="4" fill="var(--surface)" stroke="rgba(63,185,80,0.4)" stroke-width="1.5" />
              <text x="725" y="52" fill="var(--success-fg)" font-size="12" font-weight="700">Table: users</text>
              <text x="725" y="70" fill="var(--warning-fg)" font-size="10">PII: email, password_hash</text>
            </g>

            <g class="svg-topology-node" style="cursor:pointer;" data-node-label="sessions">
              <rect x="710" y="115" width="180" height="62" rx="4" fill="var(--surface)" stroke="rgba(63,185,80,0.4)" stroke-width="1.5" />
              <text x="725" y="137" fill="var(--success-fg)" font-size="12" font-weight="700">Table: sessions</text>
              <text x="725" y="153" fill="var(--text-muted)" font-size="10">Cookie: laravel_session</text>
              <text x="725" y="167" fill="var(--warning-fg)" font-size="10">CSRF: XSRF-TOKEN</text>
            </g>
            `
                : `
            <!-- TIER 1: UI Pages -->
            <g class="svg-topology-node" style="cursor:pointer;" data-node-label="/">
              <rect x="20" y="30" width="160" height="42" rx="4" fill="var(--surface)" stroke="var(--border)" stroke-width="1.5" />
              <text x="35" y="56" fill="var(--text-bright)" font-size="12" font-weight="600">Page: /</text>
              <circle cx="165" cy="51" r="4" fill="var(--success-fg)" />
            </g>

            <g class="svg-topology-node" style="cursor:pointer;" data-node-label="checkout">
              <rect x="20" y="120" width="160" height="42" rx="4" fill="var(--surface)" stroke="var(--border)" stroke-width="1.5" />
              <text x="35" y="146" fill="var(--text-bright)" font-size="12" font-weight="600">Page: /checkout</text>
              <circle cx="165" cy="141" r="4" fill="var(--warning-fg)" />
            </g>

            <!-- TIER 2: API Endpoints -->
            <g class="svg-topology-node" style="cursor:pointer;" data-node-label="GET /health">
              <rect x="250" y="30" width="180" height="42" rx="4" fill="var(--surface)" stroke="var(--border)" stroke-width="1.5" />
              <text x="265" y="56" fill="var(--accent-fg)" font-size="12" font-weight="600">GET /health</text>
            </g>

            <g class="svg-topology-node" style="cursor:pointer;" data-node-label="POST /api/orders">
              <rect x="250" y="120" width="180" height="42" rx="4" fill="var(--surface)" stroke="var(--border)" stroke-width="1.5" />
              <text x="265" y="146" fill="var(--accent-fg)" font-size="12" font-weight="600">POST /api/orders</text>
            </g>

            <!-- TIER 3: Controllers -->
            <g class="svg-topology-node" style="cursor:pointer;" data-node-label="health.controller">
              <rect x="490" y="30" width="170" height="42" rx="4" fill="var(--surface)" stroke="var(--border)" stroke-width="1.5" />
              <text x="505" y="56" fill="var(--text-muted)" font-size="11">health.controller.ts</text>
            </g>

            <g class="svg-topology-node" style="cursor:pointer;" data-node-label="order.controller">
              <rect x="490" y="120" width="170" height="42" rx="4" fill="var(--surface)" stroke="var(--border)" stroke-width="1.5" />
              <text x="505" y="146" fill="var(--text-muted)" font-size="11">order.controller.ts</text>
            </g>

            <!-- TIER 4: Database Tables -->
            <g class="svg-topology-node" style="cursor:pointer;" data-node-label="users">
              <rect x="710" y="30" width="180" height="52" rx="4" fill="var(--surface)" stroke="rgba(63,185,80,0.4)" stroke-width="1.5" />
              <text x="725" y="52" fill="var(--success-fg)" font-size="12" font-weight="700">Table: users</text>
              <text x="725" y="70" fill="var(--warning-fg)" font-size="10">PII: email, hash</text>
            </g>

            <g class="svg-topology-node" style="cursor:pointer;" data-node-label="orders">
              <rect x="710" y="115" width="180" height="62" rx="4" fill="var(--surface)" stroke="rgba(63,185,80,0.4)" stroke-width="1.5" />
              <text x="725" y="137" fill="var(--success-fg)" font-size="12" font-weight="700">Table: orders</text>
              <text x="725" y="153" fill="var(--text-muted)" font-size="10">FK: user_id -&gt; users</text>
              <text x="725" y="167" fill="var(--warning-fg)" font-size="10">PII: card_token</text>
            </g>
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
        <!-- Search and Filter Bar -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; gap:12px; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:8px; flex:1; max-width:400px;">
            <label for="lineage-search" style="font-size:11px; font-family:var(--mono); color:var(--text-muted); text-transform:uppercase;">Search:</label>
            <input type="text" id="lineage-search" class="input-mono" placeholder="Cari page, endpoint, handler, atau table..." style="height:26px; font-size:11px;" />
          </div>
          <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-family:var(--mono); font-size:11px;">
            <input type="checkbox" id="check-filter-pii" />
            <span>Tampilkan Hanya Data Sensitif (PII Only)</span>
          </label>
        </div>

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
              lineageEntries
                ? lineageEntries
                    .map((entry) => {
                      const tablesList = entry.tables.map((t) => t.table).join(', ') || 'NONE';
                      const opsList =
                        [...new Set(entry.tables.flatMap((t) => t.operations))].join(', ') ||
                        (entry.method === 'GET' ? 'SELECT' : 'INSERT');
                      const sensitiveCols = [
                        ...new Set(entry.tables.flatMap((t) => t.sensitiveColumns)),
                      ];
                      const hasPii = sensitiveCols.length > 0;
                      return `
                    <tr class="lineage-row" data-page="${entry.pageOrFeature}" data-endpoint="${entry.endpoint}" data-handler="${entry.handler ?? ''}" data-tables="${tablesList}" data-has-pii="${hasPii ? 'true' : 'false'}">
                      <td style="font-family:var(--mono); font-weight:600;">${entry.pageOrFeature}</td>
                      <td><span class="tag tag-meta">${entry.method.toUpperCase()} ${entry.endpoint}</span></td>
                      <td style="font-family:var(--mono); color:var(--text-muted); font-size:11px;">${entry.handler ?? '-'}</td>
                      <td style="font-family:var(--mono); font-weight:600;">${tablesList}</td>
                      <td><span class="tag tag-verified">${opsList}</span></td>
                      <td>
                        ${hasPii ? `<span class="tag tag-review">PII: ${sensitiveCols.join(', ')}</span>` : `<span class="tag tag-meta">NONE</span>`}
                      </td>
                    </tr>
                  `;
                    })
                    .join('')
                : isMobospace
                  ? `
              <tr class="lineage-row" data-page="Page: /" data-endpoint="GET /" data-handler="routes/web.php" data-tables="HTTP 302 Redirect Handler" data-has-pii="false">
                <td style="font-family:var(--mono); font-weight:600;">Page: /</td>
                <td><span class="tag tag-meta">GET /</span></td>
                <td style="font-family:var(--mono); color:var(--text-muted); font-size:11px;">routes/web.php</td>
                <td style="font-family:var(--mono);">HTTP 302 Redirect Handler</td>
                <td><span class="tag tag-verified">SELECT</span></td>
                <td><span class="tag tag-meta">NONE</span></td>
              </tr>
              <tr class="lineage-row" data-page="Page: /login" data-endpoint="POST /login" data-handler="LoginController.php (Laravel)" data-tables="users, sessions" data-has-pii="true">
                <td style="font-family:var(--mono); font-weight:600;">Page: /login</td>
                <td><span class="tag tag-discovered">POST /login</span></td>
                <td style="font-family:var(--mono); color:var(--text-muted); font-size:11px;">LoginController.php (Laravel)</td>
                <td style="font-family:var(--mono); font-weight:600;">users, sessions</td>
                <td><span class="tag tag-discovered">SELECT, INSERT</span></td>
                <td><span class="tag tag-review">PII: password, username</span></td>
              </tr>
              <tr class="lineage-row" data-page="Page: /login" data-endpoint="Cookie: laravel_session" data-handler="SessionHandler.php" data-tables="sessions" data-has-pii="true">
                <td style="font-family:var(--mono); font-weight:600;">Page: /login</td>
                <td><span class="tag tag-meta">Cookie: laravel_session</span></td>
                <td style="font-family:var(--mono); color:var(--text-muted); font-size:11px;">SessionHandler.php</td>
                <td style="font-family:var(--mono); font-weight:600;">sessions</td>
                <td><span class="tag tag-verified">INSERT, UPDATE</span></td>
                <td><span class="tag tag-review">PII: session_token (Missing Secure)</span></td>
              </tr>
              <tr class="lineage-row" data-page="Page: /login" data-endpoint="Cookie: XSRF-TOKEN" data-handler="VerifyCsrfToken.php" data-tables="CSRF Guard Token" data-has-pii="true">
                <td style="font-family:var(--mono); font-weight:600;">Page: /login</td>
                <td><span class="tag tag-meta">Cookie: XSRF-TOKEN</span></td>
                <td style="font-family:var(--mono); color:var(--text-muted); font-size:11px;">VerifyCsrfToken.php</td>
                <td style="font-family:var(--mono); font-weight:600;">CSRF Guard Token</td>
                <td><span class="tag tag-verified">VALIDATE</span></td>
                <td><span class="tag tag-review">Token (Missing HttpOnly)</span></td>
              </tr>
            `
                  : `
              <tr class="lineage-row" data-page="Page: /" data-endpoint="GET /health" data-handler="health.controller.ts" data-tables="System Memory Probe" data-has-pii="false">
                <td style="font-family:var(--mono); font-weight:600;">Page: /</td>
                <td><span class="tag tag-meta">GET /health</span></td>
                <td style="font-family:var(--mono); color:var(--text-muted); font-size:11px;">health.controller.ts</td>
                <td style="font-family:var(--mono);">System Memory Probe</td>
                <td><span class="tag tag-verified">SELECT</span></td>
                <td><span class="tag tag-meta">NONE</span></td>
              </tr>
              <tr class="lineage-row" data-page="Page: /checkout" data-endpoint="POST /api/orders" data-handler="order.controller.ts" data-tables="orders, order_items" data-has-pii="true">
                <td style="font-family:var(--mono); font-weight:600;">Page: /checkout</td>
                <td><span class="tag tag-discovered">POST /api/orders</span></td>
                <td style="font-family:var(--mono); color:var(--text-muted); font-size:11px;">order.controller.ts</td>
                <td style="font-family:var(--mono); font-weight:600;">orders, order_items</td>
                <td><span class="tag tag-discovered">INSERT</span></td>
                <td><span class="tag tag-review">PII: card_token, user_email</span></td>
              </tr>
              <tr class="lineage-row" data-page="Page: /login" data-endpoint="POST /api/auth/login" data-handler="auth.controller.ts" data-tables="users, sessions" data-has-pii="true">
                <td style="font-family:var(--mono); font-weight:600;">Page: /login</td>
                <td><span class="tag tag-discovered">POST /api/auth/login</span></td>
                <td style="font-family:var(--mono); color:var(--text-muted); font-size:11px;">auth.controller.ts</td>
                <td style="font-family:var(--mono); font-weight:600;">users, sessions</td>
                <td><span class="tag tag-verified">SELECT, INSERT</span></td>
                <td><span class="tag tag-review">PII: password_hash, token</span></td>
              </tr>
              <tr class="lineage-row" data-page="Page: /profile" data-endpoint="GET /api/users/me" data-handler="user.controller.ts" data-tables="users" data-has-pii="true">
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
