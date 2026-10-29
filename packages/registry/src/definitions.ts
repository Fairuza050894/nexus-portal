import type { TestTypeRegistryDefinition } from './types.js';

export const E2E_DEFINITION: TestTypeRegistryDefinition = {
  type: 'e2e',
  label: { id: 'Playwright E2E', en: 'Playwright E2E' },
  icon: 'globe',
  help: {
    id: 'Uji alur perjalanan pengguna berbasis Playwright browser.',
    en: 'Browser-based user journey tests driven by Playwright.',
  },
  lane: 'e2e',
  modes: { sandbox: true, staging: true, prodSafe: true },
  requiresApproval: false,
  globals: [
    {
      key: 'url',
      label: { id: 'Target URL', en: 'Target URL' },
      kind: 'url',
      required: true,
      placeholder: 'https://staging.app.example.com',
      help: { id: 'URL root aplikasi web yang diuji', en: 'Base web application URL to test' },
    },
    {
      key: 'environment',
      label: { id: 'Lingkungan', en: 'Environment' },
      kind: 'select',
      options: [
        { value: 'staging', label: { id: 'Staging', en: 'Staging' } },
        { value: 'sandbox', label: { id: 'Sandbox', en: 'Sandbox' } },
        { value: 'production', label: { id: 'Production (safe)', en: 'Production (safe)' } },
      ],
    },
    {
      key: 'browser',
      label: { id: 'Browser', en: 'Browser' },
      kind: 'select',
      options: [
        { value: 'chromium', label: { id: 'Chromium', en: 'Chromium' } },
        { value: 'firefox', label: { id: 'Firefox', en: 'Firefox' } },
        { value: 'webkit', label: { id: 'WebKit', en: 'WebKit' } },
      ],
    },
    {
      key: 'login',
      label: { id: 'Vault Auth Ref', en: 'Vault Auth Ref' },
      kind: 'secretRef',
      placeholder: 'vault:qa/user-credentials',
      help: {
        id: 'Gunakan alias vault:..., bukan password mentah',
        en: 'Use vault:... reference, not raw passwords',
      },
    },
  ],
  columns: [
    {
      key: 'id',
      label: { id: 'ID Kasus', en: 'Case ID' },
      kind: 'text',
      required: true,
      placeholder: 'TC-AUTH-001',
      width: '130px',
    },
    {
      key: 'scenario',
      label: { id: 'Skenario', en: 'Scenario' },
      kind: 'text',
      required: true,
      placeholder: 'Login dengan kredensial valid',
    },
    {
      key: 'steps',
      label: { id: 'Langkah-langkah', en: 'Steps' },
      kind: 'text',
      placeholder: 'Buka /login; isi user & password; klik Submit',
    },
    {
      key: 'expected',
      label: { id: 'Hasil yang Diharapkan', en: 'Expected Result' },
      kind: 'text',
      required: true,
      placeholder: 'Dashboard tampil dengan salam pengguna',
    },
    {
      key: 'severity',
      label: { id: 'Tingkat Kritis', en: 'Severity' },
      kind: 'select',
      required: true,
      width: '120px',
      options: [
        { value: 'critical', label: { id: 'Kritis', en: 'Critical' } },
        { value: 'high', label: { id: 'Tinggi', en: 'High' } },
        { value: 'medium', label: { id: 'Sedang', en: 'Medium' } },
        { value: 'low', label: { id: 'Rendah', en: 'Low' } },
      ],
    },
    {
      key: 'requirement',
      label: { id: 'Kebutuhan', en: 'Requirement' },
      kind: 'text',
      placeholder: 'REQ-AUTH-01',
      width: '130px',
    },
  ],
  defaults: [
    {
      id: 'TC-AUTH-001',
      scenario: 'Login valid pengguna',
      steps: 'Buka halaman login; masukkan kredensial; klik login',
      expected: 'Pengguna dialihkan ke dasbor utama',
      severity: 'critical',
      requirement: 'REQ-AUTH-01',
    },
  ],
  validators: ['atLeastOneRow', 'urlOnAllowlist'],
  importTemplate: 'templates/e2e.xlsx',
};

export const API_DEFINITION: TestTypeRegistryDefinition = {
  type: 'api',
  label: { id: 'REST & OpenAPI', en: 'REST & OpenAPI' },
  icon: 'server',
  help: {
    id: 'Uji endpoint HTTP/REST, skema OpenAPI, status code, dan otorisasi.',
    en: 'HTTP/REST endpoint tests, OpenAPI schema validation, status codes, and auth.',
  },
  lane: 'api',
  modes: { sandbox: true, staging: true, prodSafe: true },
  requiresApproval: false,
  globals: [
    {
      key: 'baseUrl',
      label: { id: 'API Base URL', en: 'API Base URL' },
      kind: 'url',
      required: true,
      placeholder: 'https://api.staging.example.com',
    },
    {
      key: 'specUrl',
      label: { id: 'OpenAPI Spec URL', en: 'OpenAPI Spec URL' },
      kind: 'path',
      placeholder: '/openapi.json',
      help: {
        id: 'Path atau URL lengkap ke spesifikasi OpenAPI 3.x',
        en: 'Path or full URL to OpenAPI 3.x spec',
      },
    },
    {
      key: 'authType',
      label: { id: 'Tipe Autentikasi', en: 'Auth Type' },
      kind: 'select',
      options: [
        { value: 'none', label: { id: 'Tanpa Auth', en: 'None' } },
        { value: 'bearer', label: { id: 'Bearer Token', en: 'Bearer Token' } },
        { value: 'basic', label: { id: 'HTTP Basic', en: 'HTTP Basic' } },
        { value: 'apikey', label: { id: 'API Key Header', en: 'API Key Header' } },
      ],
    },
  ],
  columns: [
    {
      key: 'method',
      label: { id: 'Metode', en: 'Method' },
      kind: 'select',
      required: true,
      width: '100px',
      options: [
        { value: 'GET', label: { id: 'GET', en: 'GET' } },
        { value: 'POST', label: { id: 'POST', en: 'POST' } },
        { value: 'PUT', label: { id: 'PUT', en: 'PUT' } },
        { value: 'PATCH', label: { id: 'PATCH', en: 'PATCH' } },
        { value: 'DELETE', label: { id: 'DELETE', en: 'DELETE' } },
      ],
    },
    {
      key: 'endpoint',
      label: { id: 'Endpoint Path', en: 'Endpoint Path' },
      kind: 'path',
      required: true,
      placeholder: '/api/v1/resource',
    },
    {
      key: 'body',
      label: { id: 'Payload / Query Params', en: 'Payload / Query Params' },
      kind: 'json',
      placeholder: '{"limit": 10}',
    },
    {
      key: 'expectedStatus',
      label: { id: 'Status Diharapkan', en: 'Expected Status' },
      kind: 'number',
      required: true,
      width: '120px',
      placeholder: '200',
    },
    {
      key: 'schemaCheck',
      label: { id: 'Validasi Skema', en: 'Schema Check' },
      kind: 'boolean',
      width: '110px',
    },
    {
      key: 'severity',
      label: { id: 'Tingkat Kritis', en: 'Severity' },
      kind: 'select',
      required: true,
      width: '110px',
      options: [
        { value: 'critical', label: { id: 'Kritis', en: 'Critical' } },
        { value: 'high', label: { id: 'Tinggi', en: 'High' } },
        { value: 'medium', label: { id: 'Sedang', en: 'Medium' } },
        { value: 'low', label: { id: 'Rendah', en: 'Low' } },
      ],
    },
  ],
  defaults: [
    {
      method: 'GET',
      endpoint: '/health',
      expectedStatus: 200,
      schemaCheck: true,
      severity: 'high',
    },
  ],
  validators: ['atLeastOneRow', 'urlOnAllowlist'],
  importTemplate: 'templates/api.xlsx',
};

export const A11Y_DEFINITION: TestTypeRegistryDefinition = {
  type: 'a11y',
  label: { id: 'Aksesibilitas (WCAG)', en: 'Accessibility (WCAG)' },
  icon: 'eye',
  help: {
    id: 'Pemeriksaan aksesibilitas axe-core terintegrasi tanpa crawl ulang.',
    en: 'Integrated axe-core accessibility audits without redundant crawls.',
  },
  lane: 'a11y',
  modes: { sandbox: true, staging: true, prodSafe: true },
  requiresApproval: false,
  globals: [
    {
      key: 'url',
      label: { id: 'Target URL', en: 'Target URL' },
      kind: 'url',
      required: true,
      placeholder: 'https://staging.app.example.com',
    },
    {
      key: 'standard',
      label: { id: 'Standar WCAG', en: 'WCAG Standard' },
      kind: 'select',
      options: [
        {
          value: 'wcag21aa',
          label: { id: 'WCAG 2.1 AA (Direkomendasikan)', en: 'WCAG 2.1 AA (Recommended)' },
        },
        { value: 'wcag22aa', label: { id: 'WCAG 2.2 AA', en: 'WCAG 2.2 AA' } },
        { value: 'wcag21a', label: { id: 'WCAG 2.1 A', en: 'WCAG 2.1 A' } },
      ],
    },
  ],
  columns: [
    {
      key: 'pageName',
      label: { id: 'Nama Halaman', en: 'Page Name' },
      kind: 'text',
      required: true,
      placeholder: 'Beranda / Login',
    },
    {
      key: 'path',
      label: { id: 'Path Halaman', en: 'Page Path' },
      kind: 'path',
      required: true,
      placeholder: '/login',
    },
    {
      key: 'waitFor',
      label: { id: 'Tunggu Elemen (Selector)', en: 'Wait For Element' },
      kind: 'text',
      placeholder: '#app-root',
    },
    {
      key: 'failThreshold',
      label: { id: 'Batas Kegagalan', en: 'Fail Threshold' },
      kind: 'select',
      required: true,
      options: [
        { value: 'critical', label: { id: 'Critical saja', en: 'Critical only' } },
        {
          value: 'serious',
          label: { id: 'Critical & Serious (Default)', en: 'Critical & Serious (Default)' },
        },
        {
          value: 'moderate',
          label: { id: 'Semua (Critical, Serious, Moderate)', en: 'All (incl. Moderate)' },
        },
      ],
    },
  ],
  defaults: [
    {
      pageName: 'Beranda',
      path: '/',
      failThreshold: 'serious',
    },
  ],
  validators: ['atLeastOneRow', 'urlOnAllowlist'],
};

export const PERF_DEFINITION: TestTypeRegistryDefinition = {
  type: 'perf',
  label: { id: 'Kinerja & Vitals', en: 'Performance & Vitals' },
  icon: 'gauge',
  help: {
    id: 'Pengukuran Core Web Vitals (LCP, CLS, TTFB) dan beban k6.',
    en: 'Core Web Vitals metrics (LCP, CLS, TTFB) and k6 load scenarios.',
  },
  lane: 'perf',
  // prodSafe is explicitly false: Performance testing with load is forbidden in prod-safe!
  modes: { sandbox: true, staging: true, prodSafe: false },
  requiresApproval: true,
  globals: [
    {
      key: 'url',
      label: { id: 'Target URL', en: 'Target URL' },
      kind: 'url',
      required: true,
      placeholder: 'https://staging.app.example.com',
    },
    {
      key: 'tool',
      label: { id: 'Engine Kinerja', en: 'Performance Engine' },
      kind: 'select',
      options: [
        {
          value: 'vitals',
          label: { id: 'Web Vitals (Pasif / Aman)', en: 'Web Vitals (Passive / Safe)' },
        },
        {
          value: 'k6',
          label: { id: 'k6 Load Testing (Staging Only)', en: 'k6 Load Testing (Staging Only)' },
        },
      ],
    },
    {
      key: 'load',
      label: { id: 'Virtual Users & Durasi', en: 'VUs & Duration' },
      kind: 'text',
      placeholder: '10 VU / 30s',
    },
  ],
  columns: [
    {
      key: 'scenario',
      label: { id: 'Skenario', en: 'Scenario' },
      kind: 'text',
      required: true,
      placeholder: 'Pengambilan data katalog produk',
    },
    {
      key: 'endpoint',
      label: { id: 'Endpoint / Halaman', en: 'Endpoint / Page' },
      kind: 'path',
      required: true,
      placeholder: '/api/v1/products',
    },
    {
      key: 'p95MaxMs',
      label: { id: 'Maksimal p95 (ms)', en: 'Max p95 (ms)' },
      kind: 'number',
      required: true,
      placeholder: '500',
    },
    {
      key: 'errorRateMaxPercent',
      label: { id: 'Maksimal Error (%)', en: 'Max Error Rate (%)' },
      kind: 'number',
      required: true,
      placeholder: '1',
    },
  ],
  defaults: [
    {
      scenario: 'Web Vitals Halaman Utama',
      endpoint: '/',
      p95MaxMs: 1000,
      errorRateMaxPercent: 0,
    },
  ],
  validators: ['atLeastOneRow', 'urlOnAllowlist'],
};

export const VISUAL_DEFINITION: TestTypeRegistryDefinition = {
  type: 'visual',
  label: { id: 'Regresi Visual', en: 'Visual Regression' },
  icon: 'camera',
  help: {
    id: 'Perbandingan visual screenshot piksel demi piksel dengan baseline.',
    en: 'Pixel-level visual comparison of screenshots against baseline.',
  },
  lane: 'visual',
  modes: { sandbox: true, staging: true, prodSafe: true },
  requiresApproval: false,
  globals: [
    {
      key: 'url',
      label: { id: 'Target URL', en: 'Target URL' },
      kind: 'url',
      required: true,
      placeholder: 'https://staging.app.example.com',
    },
    {
      key: 'browser',
      label: { id: 'Browser Engine', en: 'Browser Engine' },
      kind: 'select',
      options: [
        { value: 'chromium', label: { id: 'Chromium', en: 'Chromium' } },
        { value: 'firefox', label: { id: 'Firefox', en: 'Firefox' } },
      ],
    },
  ],
  columns: [
    {
      key: 'path',
      label: { id: 'Path Halaman', en: 'Page Path' },
      kind: 'path',
      required: true,
      placeholder: '/dashboard',
    },
    {
      key: 'viewport',
      label: { id: 'Ukuran Layar', en: 'Viewport' },
      kind: 'select',
      required: true,
      options: [
        { value: 'desktop', label: { id: 'Desktop (1280x800)', en: 'Desktop (1280x800)' } },
        { value: 'tablet', label: { id: 'Tablet (768x1024)', en: 'Tablet (768x1024)' } },
        { value: 'mobile', label: { id: 'Mobile (375x667)', en: 'Mobile (375x667)' } },
      ],
    },
    {
      key: 'maskedAreas',
      label: { id: 'Area Masking (CSS Selector)', en: 'Masked Areas (Selector)' },
      kind: 'text',
      placeholder: '.user-avatar, .timestamp',
    },
    {
      key: 'tolerancePercent',
      label: { id: 'Toleransi Beda (%)', en: 'Tolerance (%)' },
      kind: 'number',
      placeholder: '0.1',
    },
  ],
  defaults: [
    {
      path: '/',
      viewport: 'desktop',
      tolerancePercent: 0.1,
    },
  ],
  validators: ['atLeastOneRow', 'urlOnAllowlist'],
};

export const SECURITY_PASSIVE_DEFINITION: TestTypeRegistryDefinition = {
  type: 'security-passive',
  label: { id: 'Keamanan Pasif', en: 'Passive Security' },
  icon: 'shield',
  help: {
    id: 'Pemeriksaan pasif HTTP headers, cookies, konfigurasi CORS, dan kebocoran informasi tanpa payload aktif.',
    en: 'Passive checks for HTTP headers, cookies, CORS policy, and info leaks without active payloads.',
  },
  lane: 'security',
  modes: { sandbox: true, staging: true, prodSafe: true },
  requiresApproval: true,
  globals: [
    {
      key: 'url',
      label: { id: 'Target URL', en: 'Target URL' },
      kind: 'url',
      required: true,
      placeholder: 'https://staging.app.example.com',
    },
    {
      key: 'authorizationConfirmation',
      label: { id: 'Konfirmasi Otorisasi Pengujian', en: 'Testing Authorization Confirmation' },
      kind: 'boolean',
      required: true,
      help: {
        id: 'Wajib dicentang untuk mengonfirmasi wewenang pemeriksaan keamanan pada target.',
        en: 'Must be checked to confirm authorization to inspect target security configuration.',
      },
    },
  ],
  columns: [
    {
      key: 'check',
      label: { id: 'Jenis Pemeriksaan', en: 'Check Type' },
      kind: 'select',
      required: true,
      options: [
        {
          value: 'security-headers',
          label: { id: 'Security Headers (CSP, HSTS, XFO)', en: 'Security Headers' },
        },
        {
          value: 'cookie-security',
          label: { id: 'Cookie Flags (Secure, HttpOnly, SameSite)', en: 'Cookie Flags' },
        },
        {
          value: 'cors-misconfig',
          label: { id: 'Konfigurasi CORS Terbuka', en: 'CORS Configuration' },
        },
        {
          value: 'info-disclosure',
          label: { id: 'Kebocoran Info Versi & Server Banner', en: 'Information Disclosure' },
        },
      ],
    },
    {
      key: 'path',
      label: { id: 'Path Target', en: 'Target Path' },
      kind: 'path',
      required: true,
      placeholder: '/',
    },
    {
      key: 'severity',
      label: { id: 'Tingkat Kritis', en: 'Severity' },
      kind: 'select',
      required: true,
      options: [
        { value: 'critical', label: { id: 'Kritis', en: 'Critical' } },
        { value: 'high', label: { id: 'Tinggi', en: 'High' } },
        { value: 'medium', label: { id: 'Sedang', en: 'Medium' } },
        { value: 'low', label: { id: 'Rendah', en: 'Low' } },
      ],
    },
  ],
  defaults: [
    {
      check: 'security-headers',
      path: '/',
      severity: 'high',
    },
    {
      check: 'cookie-security',
      path: '/',
      severity: 'high',
    },
  ],
  validators: ['atLeastOneRow', 'urlOnAllowlist'],
};

export const BUILTIN_DEFINITIONS: readonly TestTypeRegistryDefinition[] = [
  E2E_DEFINITION,
  API_DEFINITION,
  A11Y_DEFINITION,
  PERF_DEFINITION,
  VISUAL_DEFINITION,
  SECURITY_PASSIVE_DEFINITION,
];
