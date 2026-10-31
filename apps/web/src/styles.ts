export const PORTAL_STYLES = `
    /* ==========================================================================
       Nexus QA Portal — Industrial Anti-Slop Design System
       High-density, low-latency, razor-sharp enterprise engineering console
       ========================================================================== */

    :root {
      /* Deep Zinc / Neutral Dark Palette (Zero muddy blue haze) */
      --bg: #09090b;
      --surface: #121215;
      --surface-subtle: #18181b;
      --surface-hover: #222227;
      --border: #27272a;
      --border-subtle: #1f1f23;
      --border-focus: #3b82f6;

      /* High-contrast Typographic Scale */
      --text: #a1a1aa;
      --text-bright: #fafafa;
      --text-muted: #71717a;

      /* Semantic Precision Accents (Solid & 8% alpha tints, no neon glare) */
      --accent: #2563eb;
      --accent-hover: #1d4ed8;
      --accent-fg: #60a5fa;

      --success: #059669;
      --success-bg: rgba(16, 185, 129, 0.08);
      --success-fg: #34d399;
      --success-border: rgba(16, 185, 129, 0.25);

      --warning: #d97706;
      --warning-bg: rgba(245, 158, 11, 0.08);
      --warning-fg: #fbbf24;
      --warning-border: rgba(245, 158, 11, 0.25);

      --danger: #dc2626;
      --danger-bg: rgba(239, 68, 68, 0.08);
      --danger-fg: #f87171;
      --danger-border: rgba(239, 68, 68, 0.25);

      --mono: "JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }

    /* Reset & Base Normalization */
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--sans);
      font-size: 13px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
      font-feature-settings: "cv02", "cv03", "cv04", "cv11";
    }

    /* Custom Minimalist Engineering Scrollbars */
    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    ::-webkit-scrollbar-track {
      background: var(--bg);
    }
    ::-webkit-scrollbar-thumb {
      background: #27272a;
      border-radius: 3px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: #3f3f46;
    }

    /* Focus States for Keyboard Accessibility */
    :focus-visible {
      outline: 2px solid var(--border-focus);
      outline-offset: 1px;
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
      position: sticky;
      top: 0;
      z-index: 40;
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
      background: var(--surface-subtle);
      border: 1px solid var(--border);
      color: var(--accent-fg);
      padding: 2px 7px;
      border-radius: 3px;
      font-size: 11px;
      letter-spacing: 0.06em;
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
      background: var(--surface-subtle);
      border: 1px solid var(--border);
      padding: 2px 7px;
      border-radius: 3px;
      color: var(--text-muted);
      font-variant-numeric: tabular-nums;
    }
    .nav-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    /* Main Console Layout */
    .console-layout {
      max-width: 1320px;
      margin: 0 auto;
      padding: 18px 24px 48px;
    }

    /* Step Navigation Bar */
    .step-bar {
      display: flex;
      border-bottom: 1px solid var(--border);
      margin-bottom: 22px;
      gap: 4px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 3px;
    }
    .step-item {
      padding: 8px 14px;
      font-size: 11px;
      font-weight: 600;
      font-family: var(--mono);
      color: var(--text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      border-radius: 3px;
      border-bottom: none;
      user-select: none;
      transition: color 0.12s ease, background 0.12s ease;
      letter-spacing: 0.03em;
    }
    .step-item:hover:not(.disabled) {
      color: var(--text-bright);
      background: var(--surface-hover);
    }
    .step-item.active {
      color: var(--text-bright);
      background: var(--surface-subtle);
      box-shadow: inset 0 0 0 1px var(--border);
    }
    .step-item.complete {
      color: var(--text);
    }
    .step-item.disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }
    .step-number {
      font-size: 10px;
      opacity: 0.8;
      font-weight: 700;
      color: var(--accent-fg);
    }

    /* Section Panels */
    .panel {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 4px;
      margin-bottom: 18px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
    }
    .panel-header {
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
      background: var(--surface-subtle);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      font-weight: 600;
      font-family: var(--mono);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-bright);
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
      margin-bottom: 5px;
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
      transition: border-color 0.12s ease;
    }
    .input-mono:focus {
      border-color: var(--border-focus);
      box-shadow: 0 0 0 1px var(--border-focus);
    }
    select,
    .select-mono {
      background-color: var(--bg) !important;
      color: var(--text-bright) !important;
      border: 1px solid var(--border);
      border-radius: 3px;
      padding: 0 24px 0 8px;
      font-size: 11px;
      outline: none;
      font-family: var(--mono);
      transition: border-color 0.12s ease;
      cursor: pointer;
      appearance: none;
      -webkit-appearance: none;
      background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238b949e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
      background-repeat: no-repeat;
      background-position: right 6px center;
      background-size: 11px;
    }
    select:focus,
    .select-mono:focus {
      border-color: var(--border-focus);
      box-shadow: 0 0 0 1px var(--border-focus);
    }
    select option,
    .select-mono option {
      background-color: #0d1117 !important;
      color: var(--text-bright) !important;
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
      transition: border-color 0.12s ease, background 0.12s ease;
      position: relative;
    }
    .mode-opt:hover {
      border-color: #3f3f46;
    }
    .mode-opt.selected {
      border-color: var(--border-focus);
      background: rgba(37, 99, 235, 0.06);
    }
    .mode-opt-title {
      font-family: var(--mono);
      font-size: 11px;
      font-weight: 700;
      color: var(--text-bright);
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
      letter-spacing: 0.03em;
    }
    .mode-opt-desc {
      font-size: 11px;
      color: var(--text-muted);
      line-height: 1.4;
    }

    /* Segmented Scope Selector */
    .scope-selector {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 16px;
    }
    .scope-opt {
      border: 1px solid var(--border);
      border-radius: 3px;
      padding: 8px 10px;
      background: var(--bg);
      cursor: pointer;
      transition: border-color 0.12s ease, background 0.12s ease;
    }
    .scope-opt:hover {
      border-color: #3f3f46;
    }
    .scope-opt.selected {
      border-color: var(--border-focus);
      background: rgba(37, 99, 235, 0.06);
    }
    .scope-opt-title {
      font-family: var(--mono);
      font-size: 11px;
      font-weight: 700;
      color: var(--text-bright);
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 3px;
      letter-spacing: 0.03em;
    }
    .scope-opt-desc {
      font-size: 10px;
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
    .banner-warn {
      background: var(--warning-bg);
      border-color: var(--warning-border);
      color: var(--warning-fg);
    }
    .banner-danger {
      background: var(--danger-bg);
      border-color: var(--danger-border);
      color: var(--danger-fg);
    }
    .banner-success {
      background: var(--success-bg);
      border-color: var(--success-border);
      color: var(--success-fg);
    }

    /* Badges & Tags */
    .tag, .badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 10px;
      font-family: var(--mono);
      font-weight: 600;
      letter-spacing: 0.04em;
      border: 1px solid transparent;
      text-transform: uppercase;
      font-variant-numeric: tabular-nums;
    }
    .tag-meta, .badge-role {
      background: var(--surface-subtle);
      border-color: var(--border);
      color: var(--text-muted);
    }
    .tag-verified, .badge-verified {
      background: var(--success-bg);
      color: var(--success-fg);
      border-color: var(--success-border);
    }
    .tag-discovered, .badge-discovered {
      background: rgba(37, 99, 235, 0.08);
      color: var(--accent-fg);
      border-color: rgba(96, 165, 250, 0.25);
    }
    .tag-review, .badge-review {
      background: var(--warning-bg);
      color: var(--warning-fg);
      border-color: var(--warning-border);
    }
    .tag-muted, .badge-skipped {
      background: var(--surface-subtle);
      color: var(--text-muted);
      border-color: var(--border);
    }
    .tag-critical {
      background: var(--danger-bg);
      color: var(--danger-fg);
      border-color: var(--danger-border);
    }
    .tag-high {
      background: rgba(249, 115, 22, 0.08);
      color: #fb923c;
      border-color: rgba(249, 115, 22, 0.25);
    }
    .tag-medium {
      background: var(--warning-bg);
      color: var(--warning-fg);
      border-color: var(--warning-border);
    }
    .tag-low {
      background: rgba(37, 99, 235, 0.08);
      color: var(--accent-fg);
      border-color: rgba(96, 165, 250, 0.25);
    }

    /* Interactive Lane Chips */
    .chip-interactive {
      cursor: pointer;
      user-select: none;
      transition: opacity 0.12s ease, border-color 0.12s ease;
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .chip-interactive:hover:not(.disabled) {
      border-color: #52525b;
    }
    .chip-interactive.inactive {
      background: var(--surface);
      color: var(--text-muted);
      border-color: var(--border);
      opacity: 0.5;
      text-decoration: line-through;
    }
    .chip-interactive.disabled {
      cursor: not-allowed;
      opacity: 0.35;
      background: var(--surface-subtle);
      border-color: var(--border-subtle);
    }

    /* Inline Drawer */
    .inline-drawer {
      border: 1px solid var(--border);
      border-radius: 4px;
      background: var(--surface-subtle);
      margin-top: 14px;
      margin-bottom: 14px;
      overflow: hidden;
    }
    .inline-drawer-header {
      padding: 8px 12px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: var(--mono);
      font-size: 11px;
      font-weight: 600;
      color: var(--text-bright);
    }
    .inline-drawer-body {
      padding: 12px;
      font-family: var(--mono);
      font-size: 11px;
      line-height: 1.6;
    }

    /* Action Buttons */
    .btn {
      height: 30px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 0 12px;
      font-size: 11px;
      font-weight: 600;
      font-family: var(--mono);
      border-radius: 3px;
      border: 1px solid transparent;
      cursor: pointer;
      text-decoration: none;
      transition: background 0.12s ease, border-color 0.12s ease;
      white-space: nowrap;
      letter-spacing: 0.03em;
    }
    .btn-primary {
      background: var(--accent);
      color: #fff;
    }
    .btn-primary:hover {
      background: var(--accent-hover);
    }
    .btn-secondary {
      background: var(--surface-subtle);
      border-color: var(--border);
      color: var(--text-bright);
    }
    .btn-secondary:hover {
      background: var(--surface-hover);
      border-color: #3f3f46;
    }
    .btn-danger {
      background: var(--danger);
      color: #fff;
    }
    .btn-danger:hover {
      background: #b91c1c;
    }

    /* Dense Data Table */
    .table-container {
      overflow-x: auto;
      border: 1px solid var(--border);
      border-radius: 4px;
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
      padding: 7px 10px;
      font-weight: 600;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border);
      font-family: var(--mono);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      white-space: nowrap;
    }
    table.data-table td {
      padding: 7px 10px;
      border-bottom: 1px solid var(--border-subtle);
      background: var(--bg);
      vertical-align: middle;
      font-variant-numeric: tabular-nums;
    }
    table.data-table tr:hover td {
      background: var(--surface-hover);
    }
    table.data-table tr:last-child td {
      border-bottom: none;
    }

    /* Metric Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 16px;
    }
    .kpi-box {
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 10px 12px;
      background: var(--surface);
    }
    .kpi-label {
      font-size: 10px;
      font-family: var(--mono);
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .kpi-val {
      font-size: 18px;
      font-weight: 700;
      font-family: var(--mono);
      color: var(--text-bright);
      margin-top: 3px;
      font-variant-numeric: tabular-nums;
    }

    /* Terminal Console */
    .terminal-box {
      background: #050507;
      border: 1px solid var(--border);
      border-radius: 3px;
      padding: 10px 12px;
      font-family: var(--mono);
      font-size: 11px;
      color: #d4d4d8;
      height: 240px;
      overflow-y: auto;
      line-height: 1.55;
    }
    .log-line {
      display: block;
      margin-bottom: 1px;
    }

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
      border-color: var(--border-focus);
      color: var(--text-bright);
    }
    .pill-badge {
      display: inline-block;
      margin-left: 6px;
      padding: 0 5px;
      border-radius: 3px;
      font-size: 10px;
      background: var(--border);
      color: var(--text-bright);
    }
    .col-scenario { min-width: 220px; }
    .col-steps { min-width: 260px; }
    .col-expected { min-width: 240px; }

    /* Live Telemetry Radar Beacon */
    @keyframes radar-beacon {
      0% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.15); opacity: 0.6; }
      100% { transform: scale(1); opacity: 1; }
    }
    .live-pulse {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--success-fg);
      font-weight: 700;
      font-size: 11px;
      font-family: var(--mono);
      letter-spacing: 0.04em;
    }
    .live-pulse-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--success-fg);
      border: 1px solid rgba(52, 211, 153, 0.4);
      animation: radar-beacon 2s infinite ease-in-out;
    }
    .progress-bar-bg {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 3px;
      height: 5px;
      overflow: hidden;
      margin-top: 4px;
    }
    .progress-bar-fill {
      height: 100%;
      background: var(--accent);
      transition: width 0.25s ease;
    }
    .progress-bar-fill.complete {
      background: var(--success-fg);
    }
    .terminal-window {
      border: 1px solid var(--border);
      border-radius: 4px;
      overflow: hidden;
      background: #050507;
    }
    .terminal-topbar {
      background: var(--surface-subtle);
      border-bottom: 1px solid var(--border);
      padding: 6px 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: var(--mono);
      font-size: 11px;
      color: var(--text-bright);
    }
    .terminal-dots {
      display: flex;
      gap: 5px;
      align-items: center;
    }
    .terminal-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      opacity: 0.75;
    }
    .terminal-dot-red { background: #ef4444; }
    .terminal-dot-yellow { background: #f59e0b; }
    .terminal-dot-green { background: #10b981; }
    .log-line {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 2px 0;
      font-family: var(--mono);
      font-size: 11px;
      line-height: 1.5;
    }
    .log-time {
      color: var(--text-muted);
      flex-shrink: 0;
      font-variant-numeric: tabular-nums;
    }
    .log-text {
      flex: 1;
      word-break: break-all;
    }

    /* Skipped rows & interactive highlights */
    tr.row-skipped td {
      opacity: 0.5;
      background: var(--surface-subtle);
    }
    tr.finding-row {
      cursor: pointer;
      transition: background 0.1s ease;
    }
    tr.finding-row:hover td {
      background: var(--surface-hover);
    }
    .svg-topology-node {
      cursor: pointer;
      transition: all 0.12s ease;
    }
    .svg-topology-node:hover rect {
      stroke: var(--border-focus);
      stroke-width: 2px;
      filter: brightness(1.1);
    }
    .auth-field-row {
      margin-bottom: 6px;
    }
`;
