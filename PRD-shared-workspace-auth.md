# PRD — Separate Accounts dengan Shared Finance Workspace

## 1. Ringkasan

Ubah Finance Berdua dari model satu Firebase UID untuk dua orang menjadi model:

- pemilik dan pasangan memiliki akun Firebase masing-masing;
- kedua akun dimasukkan secara manual ke satu workspace;
- data finansial dibaca dan ditulis melalui workspace;
- setiap transaksi menyimpan UID dan nama pembuatnya;
- tidak ada fitur invite/join workspace di UI untuk MVP;
- akun dibuat manual melalui Firebase Console;
- aplikasi tidak lagi otomatis membuat anonymous account.

Hasil akhirnya: kedua orang tetap melihat data yang sama, tetapi aplikasi dapat menunjukkan siapa yang membuat setiap pemasukan atau pengeluaran.

## 2. Masalah saat ini

Implementasi sekarang memakai anonymous authentication ketika belum ada session. Ketika pengguna melakukan link ke email/password, Firebase mempertahankan UID yang sama. Jika dua perangkat login dengan email/password yang sama, kedua perangkat dianggap sebagai satu user.

Akibatnya:

- dua orang tidak memiliki UID berbeda;
- addedBy hanya berisi display name dari akun yang sama;
- aplikasi tidak dapat membedakan transaksi dibuat oleh pemilik atau pasangan;
- data masih disimpan pada finance_berdua_v2/users/{uid};
- fondasi workspace sudah tersedia, tetapi belum dipakai oleh alur utama;
- Firebase Rules hanya mengizinkan UID pemilik membaca data user tersebut.

## 3. Tujuan

1. Menyediakan login terpisah untuk pemilik dan pasangan.
2. Membuat kedua akun mengakses satu workspace finansial yang sama.
3. Menyimpan identitas pembuat pada setiap transaksi.
4. Membatasi akses database hanya kepada member workspace.
5. Menghapus ketergantungan runtime pada anonymous authentication.
6. Mempertahankan realtime sync dan offline queue.
7. Menyediakan dokumentasi provisioning manual melalui Firebase Console.

## 4. Di luar scope MVP

- registrasi akun dari dalam aplikasi;
- invite pasangan melalui email atau link;
- join workspace melalui kode dari UI;
- multiple workspace selector;
- role management dari aplikasi;
- transfer ownership;
- migrasi otomatis data anonymous lama;
- Cloud Functions atau backend admin;
- social login.

## 5. Keputusan tentang data anonymous lama

Data lama pada finance_berdua_v2/users/{anonymousUid} tidak perlu dimigrasikan karena sistem baru akan dipakai dengan dua akun Firebase yang dibuat manual.

Ketentuannya:

- data anonymous lama dibiarkan tersimpan dan tidak dihapus;
- aplikasi baru tidak membaca data tersebut secara otomatis;
- aplikasi baru tidak menulis data baru ke path users/{uid};
- tidak boleh ada destructive migration;
- migrasi atau import data lama adalah pekerjaan terpisah jika nanti diperlukan.

## 6. User stories

### US-01 — Login pemilik

Pemilik dapat login dengan email/password dan membuka workspace finansial bersama.

### US-02 — Login pasangan

Pasangan dapat login dengan akun email/password sendiri dan membuka workspace yang sama.

### US-03 — Identitas transaksi

Setiap pengguna dapat melihat siapa yang membuat pemasukan atau pengeluaran.

### US-04 — Akses workspace

Sistem hanya memberikan akses kepada UID yang terdaftar sebagai member workspace.

### US-05 — Logout sungguhan

Setelah logout, pengguna kembali ke login screen dan tidak dibuatkan anonymous user baru.

### US-06 — Provisioning manual

Administrator dapat membuat akun dan workspace melalui Firebase Console tanpa fitur invite di aplikasi.

## 7. Arsitektur target

~~~text
Firebase Auth
├── UID A: akun pemilik
└── UID B: akun pasangan

Realtime Database
└── finance_berdua_v2
    ├── memberships
    │   ├── UID_A
    │   │   └── WORKSPACE_ID
    │   └── UID_B
    │       └── WORKSPACE_ID
    └── workspaces
        └── WORKSPACE_ID
            ├── ownerUid
            ├── members
            ├── transactions
            ├── debts
            └── wedding_settings
~~~

Semua operasi finansial baru harus memakai workspaceId, bukan uid, sebagai scope data.

## 8. Data model

### 8.1 Membership index

Path:

~~~text
finance_berdua_v2/memberships/{uid}/{workspaceId}
~~~

Contoh:

~~~json
{
  "workspaceId": "family-2026",
  "role": "owner"
}
~~~

Membership index diperlukan agar aplikasi dapat menemukan workspace berdasarkan UID yang sedang login tanpa membaca seluruh workspace.

### 8.2 Workspace

Path:

~~~text
finance_berdua_v2/workspaces/{workspaceId}
~~~

Contoh:

~~~json
{
  "ownerUid": "UID_A",
  "name": "Keuangan Berdua",
  "members": {
    "UID_A": {
      "uid": "UID_A",
      "role": "owner",
      "displayName": "Nama Pemilik"
    },
    "UID_B": {
      "uid": "UID_B",
      "role": "member",
      "displayName": "Nama Pasangan"
    }
  }
}
~~~

partnerUid boleh tetap ada untuk kompatibilitas helper lama, tetapi sumber membership yang otoritatif adalah members/{uid}.

### 8.3 Transaction

Path:

~~~text
finance_berdua_v2/workspaces/{workspaceId}/transactions/{transactionId}
~~~

Contoh:

~~~json
{
  "id": 1730000000000,
  "tanggal": "2026-10-05",
  "jenis": "Pengeluaran",
  "kategori": "Makan",
  "deskripsi": "Makan malam",
  "nominal": 50000,
  "account": "QRIS",
  "addedByUid": "UID_B",
  "addedByName": "Nama Pasangan"
}
~~~

Ketentuan:

- addedByUid harus berasal dari Firebase Auth user yang aktif;
- addedByName berasal dari profile Firebase saat transaksi dibuat;
- UI menampilkan Gue jika UID transaksi sama dengan UID aktif;
- UI menampilkan addedByName jika dibuat member lain;
- addedBy tidak lagi menjadi field utama;
- jika kompatibilitas diperlukan saat refactor, addedBy boleh menjadi alias sementara, tetapi UI baru memakai addedByUid dan addedByName.

### 8.4 Debt dan wedding settings

Debt berpindah ke:

~~~text
finance_berdua_v2/workspaces/{workspaceId}/debts/{debtId}
~~~

Tambahkan createdByUid dan createdByName pada debt baru. Pembayaran debt yang menghasilkan transaksi wajib mengisi addedByUid dan addedByName.

Wedding settings berpindah ke:

~~~text
finance_berdua_v2/workspaces/{workspaceId}/wedding_settings
~~~

Struktur target dan categories tetap kompatibel dengan implementasi sekarang.

## 9. Alur autentikasi target

### 9.1 Startup

1. Panggil prepareAuth dengan browserLocalPersistence.
2. Tunggu onAuthStateChanged.
3. Jika user null, tampilkan AuthScreen.
4. Jangan memanggil signInAnonymously.
5. Jika user ada, simpan UID dan display name ke store.
6. Resolve membership berdasarkan UID.
7. Jika workspace ditemukan, subscribe ke workspace.
8. Jika workspace tidak ditemukan, tampilkan halaman akses belum dikonfigurasi.

### 9.2 Login

1. Pengguna mengisi email dan password.
2. Panggil signInWithEmailAndPassword.
3. Firebase mengubah auth state.
4. App resolve workspace dari memberships/{uid}.
5. App mulai membaca data workspace.

### 9.3 Logout

1. Pastikan tidak ada pending operation yang belum tersinkron.
2. Panggil signOut(auth).
3. Bersihkan workspace dan data store.
4. Tampilkan AuthScreen.
5. Jangan membuat anonymous account baru.

### 9.4 Account panel

Untuk MVP, hapus atau nonaktifkan flow:

- Link akun;
- Link akun baru;
- label Akun sementara;
- asumsi bahwa anonymous user adalah kondisi normal.

Account panel cukup menyediakan user aktif, workspace aktif, backup jika tetap dibutuhkan, dan logout.

Password reset tetap dipertahankan.

## 10. Resolve workspace

Buat helper seperti resolveUserWorkspace(uid).

Perilaku:

1. Baca finance_berdua_v2/memberships/{uid}.
2. Jika tidak ada membership, return null.
3. Untuk MVP, dukung satu workspace aktif. Jika ada lebih dari satu, pilih secara deterministik dan dokumentasikan TODO selector.
4. Baca detail workspaces/{workspaceId}.
5. Validasi workspace.members[uid] ada.
6. Simpan workspaceId dan detail workspace ke Zustand.
7. Hanya setelah itu mulai subscription transaksi, debt, dan wedding settings.

Tambahkan state store:

~~~js
workspaceId: null,
workspace: null,
workspaceLoading: false,
workspaceError: '',
setWorkspace(...),
clearWorkspace(...)
~~~

## 11. Perubahan data access layer

Tambahkan atau gunakan helper:

~~~js
workspaceTxRef(workspaceId)
workspaceTxItemRef(workspaceId, id)
workspaceDebtRef(workspaceId)
workspaceDebtItemRef(workspaceId, id)
workspaceWeddingRef(workspaceId)
membershipRef(uid)
~~~

Refactor fungsi write:

~~~js
saveTx(workspaceId, transaction)
removeTx(workspaceId, id)
saveDebt(workspaceId, debt)
removeDebt(workspaceId, id)
saveDebtPayment(workspaceId, debt, transaction)
saveWeddingSettings(workspaceId, settings)
~~~

uid boleh diteruskan sebagai actor metadata, tetapi tidak boleh digunakan sebagai path data utama.

Ubah subscribeToUserData(uid, handlers) menjadi subscribeToWorkspaceData(workspaceId, handlers).

Subscription membaca:

~~~text
workspaces/{workspaceId}/transactions
workspaces/{workspaceId}/debts
workspaces/{workspaceId}/wedding_settings
~~~

## 12. Perubahan komponen

### InputTransaction dan SplitBill

Semua transaksi baru wajib mengisi:

~~~js
addedByUid: currentUser.uid,
addedByName: currentUser.displayName || currentUser.email || 'Tidak diketahui'
~~~

Jangan menggunakan nama input manual sebagai sumber identitas actor.

### Debt

- Debt baru menyimpan createdByUid dan createdByName.
- Debt payment menyimpan actor metadata pada transaksi yang dihasilkan.

### History

Tampilkan:

~~~text
Gue · Rp50.000
atau
Dimas · Rp50.000
~~~

Aturan:

- addedByUid === currentUser.uid → Gue;
- selain itu → addedByName;
- metadata tidak ada → Tidak diketahui.

Search harus dapat mencari addedByName.

### Savings

Perhitungan kontribusi harus memakai addedByUid, bukan perbandingan nama string.

### Dashboard

Total tetap dihitung dari seluruh transaksi workspace. Jika ada ringkasan actor, kelompokkan berdasarkan addedByUid.

## 13. Offline queue

Offline behavior harus tetap tersedia.

Ketentuan:

- queue lokal tetap dipisahkan minimal berdasarkan UID login;
- payload operation menggunakan workspaceId saat flush;
- operasi offline sudah membawa addedByUid dan addedByName;
- flush tidak boleh menulis ke users/{uid};
- pending operation tetap mencegah logout sesuai behavior yang ada;
- queue hanya diproses jika UID dan workspace cocok dengan metadata queue.

## 14. Firebase Rules

Update firebase.rules.json.

### 14.1 Membership index

User hanya boleh membaca membership miliknya sendiri. Client tidak boleh menulis membership pada MVP; provisioning dilakukan melalui Firebase Console.

Konsep:

~~~json
"memberships": {
  "$uid": {
    ".read": "auth != null && auth.uid === $uid",
    ".write": false
  }
}
~~~

### 14.2 Workspace access

Member boleh membaca workspace jika:

~~~text
auth != null && data.child('members').child(auth.uid).exists()
~~~

Write rules:

- transactions: member workspace;
- debts: member workspace;
- wedding settings: member workspace;
- members: read-only untuk client, provisioning manual;
- ownerUid dan metadata membership tidak boleh diubah member biasa.

### 14.3 Transaction validation

Rules harus memvalidasi:

- addedByUid adalah string;
- addedByName adalah string;
- addedByUid === auth.uid;
- field transaksi lama tetap valid;
- nominal positif;
- jenis valid;
- account valid.

User tidak boleh menulis transaksi dengan actor UID orang lain.

### 14.4 Legacy path

Path users/{uid} boleh tetap ada untuk data lama, tetapi flow baru tidak boleh membaca atau menulisnya. Jangan hapus data lama pada pekerjaan ini.

## 15. Manual provisioning runbook

Buat docs/manual-workspace-provisioning.md.

### 15.1 Buat akun Auth

Di Firebase Console:

1. Buka Authentication → Users.
2. Tambahkan akun pemilik dengan email, password sementara, dan display name.
3. Tambahkan akun pasangan dengan email, password sementara, dan display name.
4. Catat UID masing-masing.
5. Jika perlu, minta user mengganti password melalui password reset.

### 15.2 Buat workspace

Gunakan workspace ID, misalnya family-2026, lalu buat:

~~~text
finance_berdua_v2/workspaces/family-2026
finance_berdua_v2/workspaces/family-2026/members/UID_A
finance_berdua_v2/workspaces/family-2026/members/UID_B
finance_berdua_v2/memberships/UID_A/family-2026
finance_berdua_v2/memberships/UID_B/family-2026
~~~

Contoh workspace:

~~~json
{
  "ownerUid": "UID_A",
  "name": "Keuangan Berdua",
  "members": {
    "UID_A": { "uid": "UID_A", "role": "owner", "displayName": "Nama Pemilik" },
    "UID_B": { "uid": "UID_B", "role": "member", "displayName": "Nama Pasangan" }
  }
}
~~~

Contoh membership:

~~~json
{
  "workspaceId": "family-2026",
  "role": "owner"
}
~~~

Jangan menyimpan password user atau Firebase Admin credential di repository.

### 15.3 Verifikasi

- login sebagai UID A;
- pastikan workspace ditemukan;
- login sebagai UID B;
- pastikan workspace yang sama ditemukan;
- pastikan keduanya melihat transaksi yang sama;
- pastikan UID yang tidak terdaftar ditolak.

## 16. Error states

### Tidak ada workspace

Tampilkan:

~~~text
Akun berhasil login, tetapi belum terhubung ke workspace.
Hubungi administrator untuk menyelesaikan konfigurasi akun.
~~~

Jangan menampilkan dashboard kosong seolah-olah data berhasil dimuat.

### Permission denied

Tampilkan pesan bahwa membership atau Firebase Rules belum benar.

### Data lama tidak muncul

Jelaskan bahwa sistem baru memakai workspace dan data anonymous lama tidak otomatis dibawa.

### Profile tanpa display name

Gunakan fallback user.email atau potongan UID.

## 17. Acceptance criteria

### Auth

- [ ] App tidak memanggil signInAnonymously pada startup.
- [ ] User tanpa session melihat login screen.
- [ ] UID A dan UID B dapat login.
- [ ] Logout tidak membuat anonymous user baru.
- [ ] Password reset tetap berfungsi.

### Workspace

- [ ] UID A dan UID B menemukan workspace ID yang sama.
- [ ] User tanpa membership tidak dapat membuka dashboard.
- [ ] Workspace disimpan sebelum subscription data dimulai.
- [ ] Flow baru tidak memakai users/{uid}.

### Transactions

- [ ] Transaksi UID A menyimpan addedByUid = UID_A.
- [ ] Transaksi UID B menyimpan addedByUid = UID_B.
- [ ] A melihat transaksi B dengan nama pasangan.
- [ ] B melihat transaksi A dengan nama pemilik.
- [ ] Label Gue hanya berdasarkan UID aktif.
- [ ] Split bill dan debt payment menyimpan actor metadata.
- [ ] Rules menolak addedByUid yang bukan auth.uid.

### Sync dan offline

- [ ] Perubahan A muncul realtime di B.
- [ ] Perubahan B muncul realtime di A.
- [ ] Transaksi offline masuk queue.
- [ ] Queue flush menulis ke workspace benar.
- [ ] Queue tidak menulis ke legacy user path.

### Legacy data

- [ ] Tidak ada migrasi otomatis anonymous data.
- [ ] Legacy anonymous data tidak dihapus.
- [ ] Aplikasi baru tidak membaca legacy anonymous data secara default.

## 18. Test plan

### Unit test

1. resolveUserWorkspace mengembalikan workspace yang benar.
2. Resolver mengembalikan null ketika membership kosong.
3. Formatter actor mengembalikan Gue untuk UID aktif.
4. Formatter actor mengembalikan nama pasangan untuk UID berbeda.
5. Payload transaksi selalu berisi actor metadata.
6. Save helper memakai workspace path.
7. Queue operation menyimpan workspace context.

### Firebase Emulator/integration test

1. UID A dapat membaca workspace.
2. UID B dapat membaca workspace.
3. UID C yang bukan member ditolak.
4. UID A tidak dapat menulis addedByUid = UID_B.
5. Member tidak dapat mengubah membership owner.
6. Flow baru tidak memakai users/{uid}.

### Manual two-account test

1. Browser/device pertama login sebagai A.
2. Browser/device kedua login sebagai B.
3. A membuat pemasukan.
4. B melihat pemasukan dengan nama A.
5. B membuat pengeluaran.
6. A melihat pengeluaran dengan nama B.
7. Buat transaksi saat offline.
8. Nyalakan internet dan pastikan transaksi tersinkron.
9. Logout pada kedua device.
10. Pastikan tidak ada anonymous session baru.

## 19. File yang kemungkinan perlu diubah

- src/App.jsx
- src/config/firebase.js
- src/store/useStore.js
- src/lib/workspace.js
- src/lib/db.js
- src/lib/sync.js
- src/lib/offlineQueue.js
- src/lib/queueSync.js
- src/components/AccountPanel.jsx
- src/components/InputTransaction.jsx
- src/components/SplitBill.jsx
- src/components/Debt.jsx
- src/components/History.jsx
- src/components/Savings.jsx
- src/components/Dashboard.jsx jika ada ringkasan actor
- firebase.rules.json
- docs/manual-workspace-provisioning.md
- test files yang relevan

## 20. Urutan implementasi untuk OpenCode

### Tahap 1 — Auth cleanup

1. Hapus auto anonymous login dari App.jsx.
2. Pastikan null auth menampilkan AuthScreen.
3. Hapus atau nonaktifkan link account flow.
4. Pastikan logout kembali ke login.
5. Jalankan lint dan build.

### Tahap 2 — Workspace resolution

1. Tambahkan membership refs dan loader.
2. Tambahkan state workspace ke store.
3. Resolve workspace setelah auth.
4. Buat empty/error state jika membership tidak ditemukan.
5. Tambahkan manual provisioning documentation.

### Tahap 3 — Workspace data layer

1. Tambahkan workspace transaction/debt/wedding refs.
2. Refactor save/remove functions untuk menerima workspaceId.
3. Refactor sync subscription ke workspace.
4. Refactor semua callsite komponen.
5. Pastikan flow utama tidak memanggil user-scoped refs.

### Tahap 4 — Actor attribution

1. Tambahkan addedByUid dan addedByName pada seluruh transaction creation path.
2. Tambahkan metadata actor pada debt creation.
3. Ubah History agar memakai UID sebagai pembanding.
4. Ubah Savings agar kontribusi memakai UID.
5. Tambahkan fallback untuk data tanpa actor metadata.

### Tahap 5 — Rules dan security

1. Tulis rules membership.
2. Tulis rules workspace read/write.
3. Tambahkan validation actor UID.
4. Jalankan emulator tests atau test matrix manual.
5. Deploy rules setelah verifikasi.

### Tahap 6 — Offline dan regression

1. Refactor queue flush ke workspace path.
2. Test offline transaction.
3. Test realtime update dua akun.
4. Test reload dan persistence.
5. Jalankan npm run lint dan npm run build.

## 21. Definition of Done

Pekerjaan selesai jika:

- dua akun manual dapat login secara terpisah;
- keduanya otomatis masuk ke workspace yang sama tanpa invite UI;
- data yang dilihat keduanya sama;
- setiap transaksi menampilkan actor yang benar;
- Firebase Rules menolak non-member;
- anonymous auth tidak lagi dipakai;
- logout tidak membuat anonymous session;
- offline queue tetap berfungsi;
- data anonymous lama tidak dihapus dan tidak mengganggu flow baru;
- dokumentasi provisioning manual tersedia;
- lint, build, dan test utama berhasil.

## 22. Instruksi implementasi untuk OpenCode

Implementasi harus dilakukan bertahap dan menjaga perubahan user-scoped lama tetap aman. Jangan menghapus data Firebase lama. Jangan membuat credential atau password di source code. Jangan menganggap workspace ditemukan hanya karena user berhasil login; membership harus diverifikasi sebelum membaca data finansial.

Jika menemukan konflik dengan struktur data lama, prioritaskan clean workspace baru sesuai PRD ini dan jangan membuat migrasi otomatis anonymous tanpa persetujuan terpisah.
