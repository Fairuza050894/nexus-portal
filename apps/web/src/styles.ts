export const PORTAL_STYLES = `
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
`;
