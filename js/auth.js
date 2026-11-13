/**
 * JALUR – Akses masuk ADMIN & STAFF  (file: Auth.gs)
 *
 * Pengguna disimpan di sheet "Users" pada Google Sheet tempat script ini terpasang:
 *   A username | B nama | C role (admin/staff) | D password_baru | E password_hash | F aktif
 * Password TIDAK disimpan polos: hanya hash SHA-256 + garam rahasia (Script Properties).
 *
 * Cara kelola pengguna (tanpa mengubah kode):
 *   1. Jalankan setupUsers() sekali  → membuat user "admin" & "staff" dengan password acak (lihat Log eksekusi).
 *   2. Tambah/ubah user langsung di sheet Users: isi kolom D (password_baru) lalu
 *      menu "JALUR ▸ Terapkan password baru". Kolom D otomatis dikosongkan.
 *   3. Nonaktifkan user: ubah kolom F menjadi FALSE.
 */

const AUTH = {
  SHEET: "Users",
  TTL: 21600,        // sesi login 6 jam (maksimum CacheService)
  MAX_FAIL: 5,       // gagal login berturut-turut sebelum dikunci
  LOCK_SEC: 600,     // lama kunci 10 menit
  MIN_PW: 8
};

/** Menu di Google Sheet. */
function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu("JALUR")
      .addItem("Buat user awal (admin & staff)", "setupUsers")
      .addItem("Terapkan password baru", "terapkanPasswordBaru")
      .addToUi();
  } catch (e) {}
}

/* ---------- Penyimpanan pengguna ---------- */

function ss_() {
  const id = PropertiesService.getScriptProperties().getProperty("SS_ID"); // opsional bila script berdiri sendiri
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}
function sheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName(AUTH.SHEET);
  if (!sh) {
    sh = ss.insertSheet(AUTH.SHEET);
    sh.appendRow(["username", "nama", "role", "password_baru", "password_hash", "aktif"]);
    sh.setFrozenRows(1);
    sh.getRange("D1").setNote("Isi password baru (min. 8 karakter), lalu menu JALUR > Terapkan password baru. Kolom ini otomatis dikosongkan.");
  }
  return sh;
}
function salt_() {
  const p = PropertiesService.getScriptProperties();
  let s = p.getProperty("AUTH_SALT");
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty("AUTH_SALT", s); }
  return s;
}
function hash_(pw) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt_() + ":" + pw, Utilities.Charset.UTF_8);
  return "h$" + raw.map(function (b) { return ("0" + (b & 255).toString(16)).slice(-2); }).join(""); // awalan h$ agar tidak dibaca sebagai angka
}
function randomPw_() { return Utilities.getUuid().replace(/-/g, "").slice(0, 10); }

function countUsers_() {
  try {
    const v = sheet_().getDataRange().getValues();
    let n = 0;
    for (let i = 1; i < v.length; i++) if (v[i][0] && v[i][4]) n++;
    return n;
  } catch (e) { return -1; }
}

/* ---------- Dijalankan manual dari editor / menu Sheet ---------- */

function setupUsers() {
  const sh = sheet_();
  const rows = sh.getDataRange().getValues().slice(1);
  const ada = function (u) { return rows.some(function (r) { return String(r[0]).trim().toLowerCase() === u; }); };
  const dibuat = [];
  [["admin", "Administrator", "admin"], ["staff", "Staff", "staff"]].forEach(function (d) {
    if (ada(d[0])) return;
    const pw = randomPw_();
    sh.appendRow([d[0], d[1], d[2], "", hash_(pw), true]);
    dibuat.push(d[0] + "  /  " + pw + "   (" + d[2] + ")");
  });
  Logger.log(dibuat.length
    ? "USER AWAL DIBUAT. CATAT PASSWORD INI lalu segera ganti lewat kolom password_baru:\n" + dibuat.join("\n")
    : "User admin & staff sudah ada. Tidak ada yang dibuat.");
  return dibuat;
}

function terapkanPasswordBaru() {
  const sh = sheet_(), v = sh.getDataRange().getValues();
  let ok = 0, pendek = [];
  for (let i = 1; i < v.length; i++) {
    const pw = String(v[i][3] === undefined ? "" : v[i][3]).trim();
    if (!pw) continue;
    if (pw.length < AUTH.MIN_PW) { pendek.push(v[i][0]); continue; }
    sh.getRange(i + 1, 5).setValue(hash_(pw));
    sh.getRange(i + 1, 4).clearContent();
    if (String(v[i][5]) === "") sh.getRange(i + 1, 6).setValue(true);
    ok++;
  }
  const msg = ok + " password diperbarui." + (pendek.length ? " Dilewati (kurang dari " + AUTH.MIN_PW + " karakter): " + pendek.join(", ") : "");
  Logger.log(msg);
  try { SpreadsheetApp.getActive().toast(msg, "JALUR", 6); } catch (e) {}
  return msg;
}

/* ---------- Dipanggil oleh Code.gs ---------- */

function login_(username, password) {
  const u = String(username || "").trim().toLowerCase();
  if (!u || !password) return { ok: false, error: "Isi username dan password" };

  const cache = CacheService.getScriptCache(), fk = "fail_" + u, fails = +(cache.get(fk) || 0);
  if (fails >= AUTH.MAX_FAIL) return { ok: false, error: "Terlalu banyak percobaan. Coba lagi 10 menit lagi." };

  const v = sheet_().getDataRange().getValues();
  let row = null;
  for (let i = 1; i < v.length; i++) {
    if (String(v[i][0]).trim().toLowerCase() === u) { row = v[i]; break; }
  }
  const pwOk = !!row && !!row[4] && String(row[4]) === hash_(String(password));
  const aktif = !!row && String(row[5]).toUpperCase() !== "FALSE";
  if (!pwOk || !aktif) {
    cache.put(fk, String(fails + 1), AUTH.LOCK_SEC);
    return { ok: false, error: "Username atau password salah" };   // pesan sama untuk semua kasus
  }
  cache.remove(fk);
  const role = String(row[2]).trim().toLowerCase() === "admin" ? "admin" : "staff";
  const nama = row[1] || u;
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "");
  cache.put("tok_" + token, JSON.stringify({ u: u, role: role, nama: nama }), AUTH.TTL);
  return { ok: true, token: token, role: role, nama: nama, ttl: AUTH.TTL };
}

function session_(token) {
  if (!token) return null;
  const raw = CacheService.getScriptCache().get("tok_" + token);
  return raw ? JSON.parse(raw) : null;
}

function logout_(token) {
  if (token) CacheService.getScriptCache().remove("tok_" + token);
  return { ok: true };
}

