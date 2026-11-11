# JALUR – Produksi Manufactur

Aplikasi web untuk manajemen stok, project, RAP, belanja, dokumen (SOP, QC, Surat Jalan, Pengambilan Barang), dan investasi.
Front-end statis (HTML/CSS/JS) yang di-host di **Vercel**, dengan login **Admin / Staff** dan penyimpanan data di **Google Apps Script (Google Drive)**.

## Struktur proyek

```
jalur-crm/
├── index.html        Halaman utama + layar login
├── diagnosa.html     Halaman cek berkas, konfigurasi, dan koneksi server
├── css/style.css     Seluruh tampilan
├── js/
│   ├── config.js     ← ISI GAS_URL DI SINI
│   ├── app.js        Logika aplikasi
│   └── auth.js       Login admin/staff + sinkron ke server
├── img/logo.jpg      Logo
├── gas/              Kode Google Apps Script (BUKAN untuk di-host di Vercel)
│   ├── Code.gs       Endpoint data (muat/simpan) + backup harian
│   ├── Auth.gs       Akses masuk admin & staff (terpisah)
│   └── appsscript.json
├── vercel.json
└── README.md
```

## 1. Setup Google Apps Script (sekali saja)

1. Buat **Google Sheet** baru, mis. `JALUR Database`.
2. Menu **Extensions ▸ Apps Script**. (Harus dari sini agar script terhubung ke sheet.)
3. Buat dua file dan tempel isinya: `Code.gs` ← isi `gas/Code.gs`, `Auth.gs` ← isi `gas/Auth.gs`.
   (Opsional: tampilkan manifest lewat **Project Settings ▸ Show "appsscript.json"** lalu samakan dengan `gas/appsscript.json`.)
4. Pilih fungsi **`setupUsers`** lalu **Run**. Izinkan akses Google yang diminta.
   Buka **Execution log**: akan tertulis username dan **password acak** untuk `admin` dan `staff`. **Catat**, lalu ganti (langkah 7).
5. **Deploy ▸ New deployment ▸ Web app**:
   - *Execute as*: **Me**
   - *Who has access*: **Anyone**
   - Klik Deploy, salin **Web app URL** (berakhiran `/exec`).
6. Tempel URL itu ke `js/config.js` pada `GAS_URL`.
7. Ganti password / tambah pengguna di sheet **Users**: isi kolom **D (password_baru)** minimal 8 karakter, lalu menu **JALUR ▸ Terapkan password baru**.
   Nonaktifkan pengguna dengan mengubah kolom **F** menjadi `FALSE`.

> Setiap kali **mengubah kode** `.gs`, buat deployment baru: **Deploy ▸ Manage deployments ▸ Edit ▸ New version ▸ Deploy**. URL tetap sama.

## 2. Upload ke GitHub & Vercel

```bash
git init
git add .
git commit -m "JALUR pertama"
git branch -M main
git remote add origin https://github.com/USERNAME/NAMA-REPO.git
git push -u origin main
```

Di Vercel: **Add New ▸ Project ▸ Import** repo tersebut → *Framework Preset*: **Other** → Deploy. Tidak perlu build command.
Folder `gas/` ikut ter-upload tetapi tidak dipakai browser; aman (tidak berisi password).

Buka `https://domain-anda.vercel.app/diagnosa` untuk memastikan semua hijau.

## 3. Hak akses

| | Admin | Staff |
|---|---|---|
| Dashboard, Data Stok | ✅ lihat & ubah | 👁️ hanya lihat |
| Data Project: Absensi Harian, Timeline, Daftar Project, RAP Awal, RAP Final, Belanja | ✅ lihat & ubah | 👁️ hanya lihat |
| Data Master: Material, Jasa, Oprasional | ✅ lihat & ubah | 👁️ hanya lihat |
| SOP, Form QC | ✅ lihat & ubah | 👁️ hanya lihat |
| Input Barang, Output Barang, Form Pengambilan Barang, Surat Jalan, Investasi | ✅ | ❌ (menu tidak tampil, tetapi angkanya ikut terlihat di Dashboard) |

Staff dibatasi di **dua lapis**:
1. **Tampilan** (`js/auth.js`): form, tombol tambah/edit/hapus disembunyikan, isian dikunci, dan klik yang mengubah data diblokir. Tombol **Cetak**, tombol kembali (←), membuka folder, dan kolom pencarian tetap bisa dipakai.
2. **Server** (`gas/Code.gs`): perubahan dari staff **ditolak** (`STAFF_WRITE` kosong) dan staff menerima semua data (transparan) agar Dashboard, RAP Awal, RAP Final, dan Belanja tampil lengkap. Untuk menyembunyikan data tertentu, isi `STAFF_HIDDEN` di `Code.gs`.

Daftar menu staff diatur di `STAFF_MENU` (`js/auth.js`); aturan data di bagian atas `Code.gs`.

## 4. Cara kerja data

- Setelah login, data dimuat dari server; setiap perubahan **disimpan otomatis** ±2,5 detik kemudian.
- Data tersimpan di Google Drive pemilik script: `jalur-crm-data.json`, plus **backup harian** (`jalur-crm-backup-YYYYMMDD.json`, 10 terakhir).
- **Login pertama admin** saat server masih kosong: aplikasi menanyakan apakah data di browser itu diunggah ke server, atau mulai kosong.
- Tombol **Keluar** menyimpan dulu perubahan, lalu menghapus cache data di perangkat.
- Sesi login berlaku 6 jam, lalu perlu masuk lagi.

## 5. Keamanan & batasan (penting)

- Password hanya disimpan sebagai hash SHA-256 + garam rahasia di Script Properties. Login dikunci 10 menit setelah 5 kali gagal.
- Gunakan **HTTPS** (Vercel otomatis). URL Web App GAS bersifat publik; yang melindungi data adalah login + token sesi.
- Jika dua orang menyimpan bersamaan, berlaku **yang terakhir menyimpan menang** untuk kunci data yang sama. Hindari dua admin mengedit data yang sama di saat yang sama.
- Satu file JSON cocok untuk skala usaha kecil-menengah (batas server 20 MB). Bila data membesar, pertimbangkan database sungguhan.
- `LOCAL_MODE: true` pada `config.js` **mematikan login** — hanya untuk uji coba di komputer sendiri, jangan di-deploy.

## 6. Pemecahan masalah

Buka **`/diagnosa`** (juga ada tautan di layar login). Masalah umum:

| Gejala | Penyebab / solusi |
|---|---|
| "Server belum disetel" | `GAS_URL` di `js/config.js` masih kosong |
| "Tidak terhubung" | Web App belum di-deploy dengan akses **Anyone**, atau URL bukan `/exec` |
| "Belum ada pengguna" | Jalankan `setupUsers` di editor Apps Script |
| "Sheet Users tidak bisa dibaca" | Script dibuat dari menu Extensions pada Google Sheet? Bila berdiri sendiri, simpan ID sheet di Script Properties `SS_ID` |
| Perubahan kode GAS tidak terasa | Buat **New version** pada deployment (lihat catatan di atas) |
| Layar putih / error | Cek berkas di diagnosa; pastikan folder `css/`, `js/`, `img/` ikut ter-upload |

## Uji coba lokal

```bash
npx serve .      # lalu buka http://localhost:3000
```
Tanpa server GAS, set sementara `LOCAL_MODE: true` di `js/config.js`.
