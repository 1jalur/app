/**
 * JALUR – Backend Google Apps Script  (file: Code.gs)
 * Tugas: menerima permintaan dari web (login, muat data, simpan data) dan
 * menyimpan seluruh data aplikasi sebagai satu file JSON di Google Drive.
 * Autentikasi & pengguna ada di Auth.gs.
 */

const APP = {
  NAME: "JALUR",
  VERSION: "1.0.0",
  DATA_FILE: "jalur-crm-data.json",   // dibuat otomatis di Google Drive pemilik script
  BACKUP_PREFIX: "jalur-crm-backup-",
  BACKUP_KEEP: 10,                    // simpan 10 backup harian terakhir
  LOCK_MS: 20000,
  MAX_BYTES: 20 * 1024 * 1024
};

/* ---------- HAK AKSES DATA ----------
 * ADMIN : membaca & menulis semua data.
 * STAFF : HANYA MELIHAT, tetapi datanya TRANSPARAN (semua data dikirim).
 *         Server menolak semua perubahan dari staff
 *         (kecuali kunci yang Anda tulis di STAFF_WRITE, saat ini kosong).
 *         Isi STAFF_HIDDEN bila ada data yang ingin disembunyikan, mis. ["investasi"].
 *         STAFF_HIDE_BUDGET = true membuang nilai "budget" project dari data staff.
 * Contoh bila suatu saat staff boleh mengisi Form QC:  STAFF_WRITE = ["qc"] */
const STAFF_WRITE       = [];     // staff tidak boleh mengubah data apa pun
const STAFF_HIDDEN      = [];     // data yang disembunyikan dari staff (kosong = staff melihat semua data)
const STAFF_HIDE_BUDGET = false;  // false = nominal project terlihat oleh staff

/* ---------- ENDPOINT ---------- */

/** GET ?action=ping  → cek server hidup (dipakai diagnosa.html). Tidak membuka data apa pun. */
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || "ping";
  if (action === "ping") {
    return out({
      ok: true, app: APP.NAME, version: APP.VERSION, time: new Date().toISOString(),
      users: countUsers_(), dataFile: !!findFile_()
    });
  }
  return out({ ok: false, error: "Aksi tidak dikenal" });
}

/** POST (body teks JSON): {action, ...}  */
function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); }
  catch (err) { return out({ ok: false, error: "Permintaan tidak valid" }); }
  try {
    switch (req.action) {
      case "login":  return out(login_(req.username, req.password));
      case "logout": return out(logout_(req.token));
      case "load":   return out(loadData_(req.token));
      case "save":   return out(saveData_(req.token, req.data));
      case "ping":   return out({ ok: true });
      default:       return out({ ok: false, error: "Aksi tidak dikenal" });
    }
  } catch (err) {
    return out({ ok: false, error: String((err && err.message) || err) });
  }
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- DATA ---------- */

function findFile_() {
  const it = DriveApp.getFilesByName(APP.DATA_FILE);
  return it.hasNext() ? it.next() : null;
}
function readData_() {
  const f = findFile_();
  if (!f) return null;
  const t = f.getBlob().getDataAsString();
  return t ? JSON.parse(t) : null;
}
function writeData_(obj) {
  const txt = JSON.stringify(obj);
  if (txt.length > APP.MAX_BYTES) throw new Error("Data terlalu besar");
  const f = findFile_();
  if (f) f.setContent(txt); else DriveApp.createFile(APP.DATA_FILE, txt, MimeType.PLAIN_TEXT);
}

function forStaff_(data) {
  const d = JSON.parse(JSON.stringify(data));
  STAFF_HIDDEN.forEach(function (k) { delete d[k]; });
  if (STAFF_HIDE_BUDGET && Array.isArray(d.projects)) d.projects = d.projects.map(function (p) { const q = Object.assign({}, p); delete q.budget; return q; });
  return d;
}

function loadData_(token) {
  const s = session_(token);
  if (!s) return { ok: false, code: "auth", error: "Sesi habis, silakan masuk lagi" };
  const data = readData_();
  if (!data) return { ok: true, data: null, role: s.role };
  return { ok: true, role: s.role, data: s.role === "admin" ? data : forStaff_(data) };
}

function saveData_(token, data) {
  const s = session_(token);
  if (!s) return { ok: false, code: "auth", error: "Sesi habis, silakan masuk lagi" };
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, error: "Data tidak valid" };

  const lock = LockService.getScriptLock();
  lock.waitLock(APP.LOCK_MS);
  try {
    backupHarian_();
    if (s.role === "admin") {
      if (!Array.isArray(data.projects)) return { ok: false, error: "Data admin tidak lengkap (projects)" };
      writeData_(data);
    } else {
      const cur = readData_() || {};
      STAFF_WRITE.forEach(function (k) { if (k in data) cur[k] = data[k]; });
      writeData_(cur);
    }
    return { ok: true, savedAt: new Date().toISOString() };
  } finally {
    lock.releaseLock();
  }
}

/** Salinan harian file data (otomatis, maksimal BACKUP_KEEP berkas). */
function backupHarian_() {
  const day = Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyyMMdd");
  const c = CacheService.getScriptCache();
  if (c.get("bk_" + day)) return;
  c.put("bk_" + day, "1", 21600);
  const f = findFile_();
  if (!f) return;
  const name = APP.BACKUP_PREFIX + day + ".json";
  if (!DriveApp.getFilesByName(name).hasNext()) f.makeCopy(name);
  const all = [], it = DriveApp.searchFiles('title contains "' + APP.BACKUP_PREFIX + '" and trashed = false');
  while (it.hasNext()) all.push(it.next());
  all.sort(function (a, b) { return b.getName().localeCompare(a.getName()); });
  all.slice(APP.BACKUP_KEEP).forEach(function (x) { x.setTrashed(true); });
}
