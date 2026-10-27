# QA Platform Agent Pack (v2 — Unified)

Paket aturan dan spesifikasi agar agent AI membangun **satu platform QA terpadu**: masukkan link repo dan/atau URL web (sandbox, staging, atau prod dengan mode aman), pilih mode dan scope, klik satu tombol, dan platform akan menemukan struktur aplikasi, menyusun rencana tes, menjalankan semua lane sekaligus, menggabungkan hasilnya menjadi temuan (*findings*), lalu menghasilkan dokumentasi lengkap dalam satu bundle.

## Ide inti: tidak ada tes yang terpisah-pisah

- **Satu peta aplikasi** (halaman, endpoint, kode, skor risiko) dipakai semua lane.
- **Satu sesi browser ter-instrumentasi**: sekali jalan, sekaligus menghasilkan hasil fungsional, aksesibilitas, performa (Web Vitals), error console/network, dan pemeriksaan keamanan pasif.
- **Satu mesin korelasi**: kegagalan UI + error API + file kode yang baru berubah digabung menjadi satu temuan dengan semua bukti.
- **Satu gate dan satu set dokumen.**
- **Tiga mode aman:** `sandbox` (bebas, aplikasi dijalankan dari repo di container terisolasi), `staging` (data sintetis), `prod-safe` (hanya mengamati, tidak mengubah data, tanpa beban/serangan).
- **Label kejujuran:** `verified` (terhadap requirement/spec/baris user), `auto-discovered` (anomali yang objektif terdeteksi), `needs-review` (dugaan heuristik).

## Isi paket

| File | Fungsi |
|---|---|
| `AGENTS.md` | Aturan utama agent (golden rules, workflow, DoD, kontrak perintah). **Baca pertama.** |
| `docs/01-ARCHITECTURE.md` | Arsitektur dan stack (lihat Addendum v2 untuk struktur monorepo) |
| `docs/02-TEST-STRATEGY.md` | Strategi tes, prioritas, flaky policy, quality gates, sumber tes dan confidence |
| `docs/03-DOC-GENERATION.md` | Spesifikasi dokumentasi sekali klik (15 dokumen) |
| `docs/04-CI-CD.md` | Pipeline PR, nightly, manual, release, dan deployment platform |
| **`docs/05-TARGET-INTAKE-AND-MODES.md`** | Input (repo/URL/spec), 3 mode, otorisasi, sandbox untuk kode tidak tepercaya, deteksi stack |
| **`docs/06-UNIFIED-PIPELINE.md`** | Pipeline terpadu: Application Map, lane, korelasi, generator tes, baseline |
| **`docs/07-TEST-BUILDER-UI.md`** | Web app, tombol jenis tes, form dan tabel dinamis (registry), plan review, API, CLI |
| **`docs/08-UI-FLOW-REFERENCE.md`** | Alur UI 5 langkah dari prototipe, skenario acceptance yang bisa diuji, contoh Run Request |
| `rules/coding-standards.md` | Standar kode, locator, Page Object |
| `rules/security-and-data.md` | Mode, otorisasi, secrets, sandbox, keamanan web app |
| `tasks/ROADMAP.md` | 10 fase (0–9) dengan acceptance criteria; milestone M1/M2/M3 |
| `prompts/starter-prompts.md` | 9 prompt siap pakai |

Catatan: file 01–04 ditulis sebelum konsep terpadu; **file 05–07 yang berlaku bila ada perbedaan**, dan addendum v2 sudah ditambahkan di 01–04.

## Cara memakai

1. Buat repo kosong, salin seluruh isi paket ke root.
2. Pastikan agent membaca `AGENTS.md` (atau tempel ke system prompt/custom instructions).
3. Gunakan **Prompt 1 (Kickoff)** di `prompts/starter-prompts.md`. Agent akan bertanya hal yang belum diketahui.
4. Kerjakan fase demi fase (`tasks/ROADMAP.md`). Mulai dengan keamanan (Prompt 3) sebelum fitur lain.
5. Milestone: **M1** perintah `qa run` satu baris, **M2** web app satu klik, **M3** CI dan jadwal otomatis.

## Yang perlu Anda siapkan

- Teknologi sandbox yang tersedia di kantor (Docker rootless, Kubernetes, dll.) dan kebijakan akses jaringan keluar.
- Siapa yang berwenang menyetujui host untuk `staging` dan `prod-safe` (`approvedBy`), serta daftar host yang boleh.
- 2–3 target pilot (repo + URL, URL saja, API).
- Provider git, SSO (OIDC), issue tracker, dan kebijakan penggunaan AI di kantor.

## Batasan yang jujur

- Tanpa requirement atau spesifikasi, platform hanya bisa memverifikasi **invarian umum** (tidak ada 5xx, tidak ada error JS, link tidak rusak, schema sesuai, a11y, header keamanan). Logika bisnis baru terverifikasi bila ada requirement, spec dengan contoh, atau baris tes dari user.
- Hanya uji sistem yang **Anda miliki atau berwenang uji**. Platform menolak target tanpa otorisasi.
- Aplikasi dari repo tidak selalu bisa dijalankan otomatis; bila gagal, platform tetap menjalankan analisis repo dan melaporkannya dengan jujur.

## Bahasa

File teknis berbahasa Inggris agar agent mengikutinya konsisten. Bahasa dokumen hasil generate dan UI bisa `id` (default) atau `en`.
