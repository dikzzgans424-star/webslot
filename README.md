# AV Slot

Env Vercel: `MONGODB_URI`, `ADMIN_PASS` (WAJIB ganti), `ADMIN_PATTERN` (default 538167294), `INTERNAL_API_KEY`.

## Login web
User masukkan token di web (disimpan di `localStorage`, auto-login saat dibuka lagi). Token dibuat lewat bot (`.csn create`).
Sistem verifikasi WhatsApp dan sesi cookie sudah dihapus.

Admin: `/admin` atau `/owner` (pola → password) → tab Statistik · Game · Token · Log.
Config game disimpan di collection `gachaconfig`, log admin di `adminLogs`.
Collection lama `tokenVerify` dan `sessions` sudah tidak dipakai (boleh dihapus manual dari MongoDB).
