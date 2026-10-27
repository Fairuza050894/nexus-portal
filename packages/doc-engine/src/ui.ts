import { t, type DocLanguage } from './i18n.js';

const TIME_ZONE = 'Asia/Jakarta';

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeCsv(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function formatDateTime(iso: string | undefined, language: DocLanguage): string {
  if (!iso) return t(language, 'common.notAvailable');
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return escapeHtml(iso);
  return new Intl.DateTimeFormat(language === 'id' ? 'id-ID' : 'en-GB', {
    timeZone: TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date);
}

export function formatPercent(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return '—';
  return `${value.toFixed(1)}%`;
}

const BASE_CSS = `
  :root {
    color-scheme: dark;
    --bg: #0f172a; --card: #1e293b; --border: #334155; --text: #f8fafc;
    --text-muted: #94a3b8; --pass: #10b981; --risk: #f59e0b; --fail: #ef4444; --accent: #38bdf8;
  }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.5;
    background: var(--bg); color: var(--text); margin: 0; padding: 2rem; }
  .container { max-width: 1200px; margin: 0 auto; }
  h1, h2, h3 { margin-top: 1.5rem; margin-bottom: 0.75rem; }
  .muted { color: var(--text-muted); }
  .badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 4px; font-weight: 600; font-size: 0.85rem; border: 1px solid transparent; }
  .badge-go, .badge-pass { background: #064e3b; color: #6ee7b7; border-color: #059669; }
  .badge-risk, .badge-skip { background: #78350f; color: #fde68a; border-color: #d97706; }
  .badge-nogo, .badge-fail { background: #7f1d1d; color: #fca5a5; border-color: #dc2626; }
  .badge-verified { background: #1e3a8a; color: #93c5fd; border-color: #2563eb; }
  .badge-auto { background: #4c1d95; color: #c4b5fd; border-color: #7c3aed; }
  .badge-review { background: #374151; color: #d1d5db; border-color: #4b5563; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem; margin-bottom: 1.25rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; }
  .metric { font-size: 1.8rem; font-weight: 700; margin: 0.25rem 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 0.75rem; font-size: 0.92rem; }
  th, td { text-align: left; padding: 0.55rem 0.6rem; border-bottom: 1px solid var(--border); vertical-align: top; }
  th { background: #1e293b; color: var(--text-muted); font-size: 0.8rem; text-transform: uppercase; cursor: pointer; }
  tr:hover { background: #33415522; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  code { background: #0b1222; padding: 0.1rem 0.3rem; border-radius: 4px; }
  .nav { display: flex; gap: 0.9rem; flex-wrap: wrap; margin-bottom: 1.5rem; padding-bottom: 0.9rem; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
  ul { margin: 0.4rem 0; padding-left: 1.4rem; }
  .search { width: 100%; padding: 0.6rem; border-radius: 6px; border: 1px solid var(--border); background: #0b1222; color: var(--text); }
  tr.selected { background: #1d4ed833; }
  @media print {
    body { background: white; color: black; padding: 0; }
    .card { border: 1px solid #ccc; background: white; }
    .nav, .search { display: none; }
    th { cursor: default; }
  }
`;

const SORT_SCRIPT = `
document.querySelectorAll('table.sortable').forEach(function (table) {
  var headers = table.querySelectorAll('thead th');
  headers.forEach(function (th, index) {
    th.title = 'Sort';
    th.addEventListener('click', function () {
      var tbody = table.querySelector('tbody');
      if (!tbody) return;
      var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
      var asc = th.dataset.sort !== 'asc';
      headers.forEach(function (other) { delete other.dataset.sort; });
      th.dataset.sort = asc ? 'asc' : 'desc';
      rows.sort(function (a, b) {
        var av = (a.children[index] && a.children[index].textContent || '').trim();
        var bv = (b.children[index] && b.children[index].textContent || '').trim();
        var an = parseFloat(av), bn = parseFloat(bv);
        var cmp = !isNaN(an) && !isNaN(bn) ? an - bn : av.localeCompare(bv);
        return asc ? cmp : -cmp;
      });
      rows.forEach(function (row) { tbody.appendChild(row); });
    });
  });
});
`;

export function docNav(language: DocLanguage): string {
  return `
  <nav class="nav">
    <a href="index.html">${t(language, 'doc.overview')}</a>
    <a href="executive-summary.html">${t(language, 'doc.executive')}</a>
    <a href="execution-report.html">${t(language, 'doc.execution')}</a>
    <a href="findings-register.html">${t(language, 'doc.findings')}</a>
    <a href="test-catalogue.html">${t(language, 'doc.catalogue')}</a>
    <a href="traceability-matrix.html">${t(language, 'doc.traceability')}</a>
    <a href="failure-analysis.html">${t(language, 'doc.failure')}</a>
    <a href="coverage-report.html">${t(language, 'doc.coverage')}</a>
    <a href="application-map.html">${t(language, 'doc.appmap')}</a>
    <a href="run-comparison.html">${t(language, 'doc.comparison')}</a>
    <a href="plan-approval.html">${t(language, 'doc.plan')}</a>
    <a href="not-covered.html">${t(language, 'doc.notCovered')}</a>
  </nav>`;
}

export function htmlPage(
  language: DocLanguage,
  title: string,
  body: string,
  extraScript = '',
): string {
  return `<!DOCTYPE html>
<html lang="${language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${BASE_CSS}</style>
</head>
<body>
<div class="container">
  ${docNav(language)}
  ${body}
  <p class="muted" style="margin-top:2rem;font-size:0.8rem;">${t(language, 'common.generated')}</p>
</div>
<script>${SORT_SCRIPT}${extraScript}</script>
</body>
</html>`;
}

export function badge(language: DocLanguage, value: string): string {
  const normalized = value.toLowerCase();
  const cls =
    normalized === 'go' || normalized === 'passed' || normalized === 'pass'
      ? 'badge-go'
      : normalized === 'go with risks' ||
          normalized === 'skipped' ||
          normalized === 'flaky' ||
          normalized === 'medium' ||
          normalized === 'high'
        ? 'badge-risk'
        : normalized === 'no-go' || normalized === 'failed' || normalized === 'critical'
          ? 'badge-nogo'
          : normalized.includes('auto')
            ? 'badge-auto'
            : normalized.includes('verified')
              ? 'badge-verified'
              : 'badge-review';
  const label =
    normalized === 'passed'
      ? t(language, 'label.pass')
      : normalized === 'failed'
        ? t(language, 'label.fail')
        : normalized === 'skipped'
          ? t(language, 'label.skip')
          : value;
  return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
}

export function table(
  language: DocLanguage,
  headers: string[],
  rows: string[][],
  options: { sortable?: boolean } = {},
): string {
  if (rows.length === 0) return `<p class="muted">${t(language, 'common.none')}</p>`;
  const head = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('');
  const body = rows.map((row) => `<tr>${row.join('')}</tr>`).join('');
  return `<table class="${options.sortable === false ? '' : 'sortable'}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export function evidenceLinks(
  evidence: Array<Record<string, unknown>> | undefined,
  linkable: boolean,
): string {
  if (!evidence || evidence.length === 0) return '<span class="muted">—</span>';
  const links = evidence.map((item) => {
    const path = typeof item.path === 'string' ? item.path : undefined;
    const url = typeof item.url === 'string' ? item.url : undefined;
    const label = typeof item.type === 'string' ? item.type : 'evidence';
    if (path && !path.includes('..') && linkable) {
      const href = `evidence/${path.replace(/^evidence\//, '')}`;
      return `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
    }
    if (url && /^https?:\/\//.test(url)) {
      return `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`;
    }
    return `<code>${escapeHtml(JSON.stringify(item))}</code>`;
  });
  return links.join('<br>');
}

export function sparkline(points: Array<{ runId: string; passRate: number }>): string {
  if (points.length < 2) return '';
  const width = 560;
  const height = 90;
  const step = width / (points.length - 1);
  const coords = points
    .map((point, index) => {
      const y = height - (Math.max(0, Math.min(100, point.passRate)) / 100) * height;
      return `${(index * step).toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="pass rate trend" width="100%" height="${height}">
    <polyline fill="none" stroke="currentColor" stroke-width="2" points="${coords}"></polyline>
  </svg>`;
}
