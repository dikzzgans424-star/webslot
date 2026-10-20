# Miwa Gacha

Env Vercel: `MONGODB_URI`, `ADMIN_PASS` (WAJIB ganti), `ADMIN_PATTERN` (default 538167294), `INTERNAL_API_KEY`,
`ALLOW_TOKEN_LOGIN` (set `0` setelah semua user pindah ke login WhatsApp; kosong = login token lama masih jalan).

## Login web (v2)
1. User `.csn create` di bot → akun dibuat (token disimpan di server, tidak dikirim ke chat).
2. Buka `/verify`, isi nomor WA → dapat kode → kirim `.csn verify KODE` di grup/DM bot.
3. Web login otomatis lewat cookie sesi httpOnly (30 hari). `.csn logout` mencabut semua sesi.

Admin: `/admin` atau `/owner` (pola → password). Config game di `gachaconfig`, log admin di `adminLogs`.
Collection baru: `tokenVerify` (kode 5 menit), `sessions` (TTL 30 hari).
