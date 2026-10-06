# Manual Workspace Provisioning — Finance Berdua V2

## Overview

Finance Berdua V2 menggunakan model separate accounts + shared workspace. Dua orang memiliki akun Firebase terpisah dan otomatis mengakses workspace yang sama tanpa fitur invite di aplikasi.

**Penting**: Provisioning dilakukan melalui Firebase Console saja. Tidak ada UI untuk membuat akun atau invite. Setiap user harus:
1. Dibuat di Firebase Authentication
2. Ditambahkan ke workspace melalui Realtime Database manual entry

---

## Step-by-step

### 1. Buat akun di Firebase Authentication

Di [Firebase Console](https://console.firebase.google.com/):

1. Buka project Finance Berdua
2. Navigasi ke **Authentication** → **Users**
3. Klik **Add User**
4. **Pemilik (Akun 1)**:
   - Email: `pemilik@example.com` (ganti sesuai preferensi)
   - Password: `TempPassword123!` (user akan reset via email)
   - Display Name: `Nama Pemilik` (wajib diisi agar header tidak jatuh ke email/Akun)
5. Catat **UID pemilik**, misalnya: `uid_pemilik_abc123`

6. Ulangi untuk **Pasangan (Akun 2)**:
   - Email: `pasangan@example.com`
   - Password: `TempPassword456!`
   - Display Name: `Nama Pasangan`
   - UID: `uid_pasangan_xyz789`

---

### 2. Buat workspace di Realtime Database

Di [Firebase Console](https://console.firebase.google.com/):

1. Buka **Realtime Database**
2. Navigasi ke **Data** tab
3. Buka struktur: `finance_berdua_v2`

#### 2.1 Buat Workspace Record

Path: `finance_berdua_v2/workspaces/{workspaceId}`

Ganti `{workspaceId}` dengan ID unik, misalnya: `family-2026`

Nilai (JSON):
```json
{
  "ownerUid": "uid_pemilik_abc123",
  "name": "Keuangan Berdua",
  "members": {
    "uid_pemilik_abc123": {
      "uid": "uid_pemilik_abc123",
      "role": "owner",
      "displayName": "Nama Pemilik"
    },
    "uid_pasangan_xyz789": {
      "uid": "uid_pasangan_xyz789",
      "role": "member",
      "displayName": "Nama Pasangan"
    }
  }
}
```

**Catatan**: 
- `ownerUid` hanya untuk dokumentasi; flow baru tidak mengubahnya dari client
- `members` adalah sumber kebenaran untuk siapa member workspace
- Role saat ini hanya `owner` dan `member` (beda role belum diimplementasikan di business logic)

#### 2.2 Buat Membership Index untuk Pemilik

Path: `finance_berdua_v2/memberships/uid_pemilik_abc123/family-2026`

Nilai:
```json
{
  "workspaceId": "family-2026",
  "role": "owner"
}
```

#### 2.3 Buat Membership Index untuk Pasangan

Path: `finance_berdua_v2/memberships/uid_pasangan_xyz789/family-2026`

Nilai:
```json
{
  "workspaceId": "family-2026",
  "role": "member"
}
```

**Alasan membership index**: Aplikasi menggunakan path ini untuk menemukan workspace user tanpa membaca seluruh node workspaces. MVP hanya mendukung satu workspace per user; jika ada lebih dari satu, aplikasi memilih secara deterministic (sorted by ID).

---

### 3. Inisialisasi Workspace (Opsional)

Setelah workspace terbuat, aplikasi bisa langsung dipakai. Data finansial akan dibuat on-demand saat user membuat transaksi pertama.

Opsional: Jika ingin pre-create struktur kosong:

- `finance_berdua_v2/workspaces/family-2026/transactions` → `{}`
- `finance_berdua_v2/workspaces/family-2026/debts` → `{}`
- `finance_berdua_v2/workspaces/family-2026/wedding_settings` → `{ "target": 0, "categories": [] }`

---

## Verifikasi

### Login dan Test

**Device 1 (Pemilik)**:
1. Buka aplikasi
2. Login dengan `pemilik@example.com` dan password temporary
3. Ubah password via email reset
4. Verifikasi workspace ditemukan (tidak ada error "Akses Belum Dikonfigurasi")
5. Navigasi ke Dashboard — harus muncul (mungkin kosong)

**Device 2 (Pasangan)**:
1. Buka aplikasi
2. Login dengan `pasangan@example.com` dan password temporary
3. Ubah password via email reset
4. Verifikasi workspace yang sama ditemukan

### Test Two-Account Sync

1. Di Device 1 (Pemilik), buat transaksi:
   - Nominal: Rp 50.000
   - Kategori: Makan
   - Deskripsi: Test transaksi
2. Di Device 2 (Pasangan), refresh — transaksi seharusnya muncul dengan label "Nama Pemilik" atau UID pemilik
3. Di Device 2, buat transaksi lain
4. Di Device 1, refresh — transaksi baru seharusnya muncul dengan label "Nama Pasangan"

### Test Non-Member Rejection

Jika ada user ketiga (`uid_unknown`) yang tidak di-add ke workspace:
1. Login dengan UID tersebut
2. Aplikasi harus menampilkan error: "Akun belum terhubung ke workspace. Hubungi administrator."
3. User tidak bisa akses data finansial

---

## Troubleshooting

### Error: "Akses Belum Dikonfigurasi" (padahal akun benar)

**Kemungkinan penyebab**:
- Membership index belum dibuat di `finance_berdua_v2/memberships/{uid}/{workspaceId}`
- Path typo: cek spelling UID dan workspaceId
- Firebase Rules menolak read ke membership

**Solusi**:
1. Verifikasi membership path ada di Realtime Database
2. Verifikasi UID di path cocok dengan UID Firebase Auth
3. Cek Firebase Rules — pastikan user bisa read membership milik sendiri

### Error: "Akses database ditolak. Periksa akun atau RTDB Rules."

**Kemungkinan penyebab**:
- Firebase Rules belum di-deploy atau restrict akses
- Workspace tidak ada di `finance_berdua_v2/workspaces/{workspaceId}`
- User bukan member workspace (tidak ada entry di `members/{uid}`)

**Solusi**:
1. Deploy Firebase Rules (lihat bagian Tahap 5)
2. Verifikasi workspace record ada dan lengkap
3. Verifikasi user UID ada di `workspace.members`

### Offline transaction tidak sync setelah online

**Kemungkinan penyebab**:
- Queue flush gagal karena rules validation
- `addedByUid` di transaction tidak sesuai auth.uid (tampak tercemar dari offline queue)

**Solusi**:
1. Cek queue di browser DevTools → Application → IndexedDB → finance_berdua_v2 → tx_queue
2. Cek error di console atau app sync error banner
3. Buka History dan klik Retry untuk flush ulang

---

## Firebase Rules Deployment

Setelah provisioning manual data, deploy rules agar membership dan workspace terlindungi:

1. File: `firebase.rules.json`
2. Deploy: `firebase deploy --only database`
3. Verifikasi:
   - Non-member tidak bisa read data workspace
   - Member tidak bisa ubah `members` atau `ownerUid`
   - Transaction harus include `addedByUid === auth.uid`

---

## Advanced: Multiple Workspaces

**MVP status**: Satu workspace per user.

Jika user memiliki lebih dari satu membership:
```
finance_berdua_v2/memberships/{uid}
  ├── family-2026
  ├── family-2027
  └── shared-project
```

Aplikasi akan memilih secara deterministic (sorted ascending). Workspace selector UI belum ada.

**TODO untuk fase kedua**: Tambahkan UI picker workspace jika user punya banyak membership.

---

## Checklist

- [ ] Dua akun dibuat di Firebase Authentication
- [ ] UID pemilik dan pasangan tercatat
- [ ] Workspace record dibuat di `finance_berdua_v2/workspaces/{workspaceId}`
- [ ] Membership index dibuat untuk pemilik dan pasangan
- [ ] Pemilik bisa login dan melihat workspace
- [ ] Pasangan bisa login dan melihat workspace yang sama
- [ ] Transaksi dibuat pemilik muncul di pasangan dengan actor label
- [ ] Transaksi dibuat pasangan muncul di pemilik dengan actor label
- [ ] Offline transaction sync setelah online
- [ ] Non-member ditolak akses

---

## Support

Jika ada error, cek:
1. **Firebase Console Realtime Database** — struktur data lengkap?
2. **Firebase Console Rules** — rules sudah deployed?
3. **Browser Console** — error message apa?
4. **App Sync Banner** — ada pesan error?

Dokumentasi data model: lihat `PRD-shared-workspace-auth.md` bagian "Data model" (§8).
