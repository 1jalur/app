/**
 * JALUR – Lampiran penawaran PDF di Google Drive  (file: Penawaran.gs)
 *
 * File PDF disimpan di folder "JALUR-penawaran" pada Google Drive pemilik script (dibuat otomatis).
 * Aplikasi tidak memakai tautan Drive; file diambil lewat script ini dengan token login,
 * jadi folder TIDAK perlu dibagikan ke siapa pun.
 *   - ADMIN : unggah, lihat, hapus.
 *   - STAFF : hanya lihat.
 * Dipanggil dari doPost() di Code.gs (3 baris "case pdf...").
 */

const PDF = {
  FOLDER: "JALUR-penawaran",
  MAX_BYTES: 5 * 1024 * 1024    // 5 MB per file (dikirim sebagai base64 lewat web app)
};

function pdfFolder_() {
  const p = PropertiesService.getScriptProperties(), id = p.getProperty("PDF_FOLDER_ID");
  if (id) {
    try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {}
  }
  const f = DriveApp.createFolder(PDF.FOLDER);
  p.setProperty("PDF_FOLDER_ID", f.getId());
  return f;
}

// Hanya file DI DALAM folder penawaran yang boleh dibaca/dihapus (mencegah akses ke file Drive lain lewat ID).
function pdfFile_(id, folder) {
  if (!id || !/^[\w-]{10,}$/.test(String(id))) return null;
  try {
    const f = DriveApp.getFileById(String(id));
    if (f.isTrashed()) return null;
    const it = f.getParents();
    while (it.hasNext()) if (it.next().getId() === folder.getId()) return f;
  } catch (e) {}
  return null;
}

function pdfSafeName_(n) {
  n = String(n || "penawaran.pdf").replace(/[\\\/:*?"<>|\r\n]+/g, "_").trim() || "penawaran.pdf";
  if (!/\.pdf$/i.test(n)) n += ".pdf";
  return n.slice(-80);
}

const PDF_AUTH_ERR_ = { ok: false, code: "auth", error: "Sesi habis, silakan masuk lagi" };

function pdfUpload_(token, name, b64) {
  const s = session_(token);
  if (!s) return PDF_AUTH_ERR_;
  if (s.role !== "admin") return { ok: false, error: "Hanya admin yang boleh mengunggah" };
  if (!b64 || typeof b64 !== "string") return { ok: false, error: "File kosong" };
  if (b64.length > Math.ceil(PDF.MAX_BYTES * 4 / 3) + 16) return { ok: false, error: "Ukuran file maksimal 5 MB" };
  const bytes = Utilities.base64Decode(b64);
  if (bytes.length > PDF.MAX_BYTES) return { ok: false, error: "Ukuran file maksimal 5 MB" };
  // tanda tangan file PDF: "%PDF"
  if (!(bytes.length > 4 && bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68 && bytes[3] === 70)) return { ok: false, error: "File bukan PDF yang valid" };
  const nama = pdfSafeName_(name);
  const f = pdfFolder_().createFile(Utilities.newBlob(bytes, "application/pdf", Date.now() + "-" + nama));
  return { ok: true, id: f.getId(), nama: nama, size: bytes.length };
}

function pdfGet_(token, id) {
  if (!session_(token)) return PDF_AUTH_ERR_;
  const f = pdfFile_(id, pdfFolder_());
  if (!f) return { ok: false, error: "File tidak ditemukan (mungkin sudah dihapus)" };
  return { ok: true, nama: f.getName().replace(/^\d+-/, ""), data: Utilities.base64Encode(f.getBlob().getBytes()) };
}

function pdfDelete_(token, id) {
  const s = session_(token);
  if (!s) return PDF_AUTH_ERR_;
  if (s.role !== "admin") return { ok: false, error: "Hanya admin yang boleh menghapus" };
  const f = pdfFile_(id, pdfFolder_());
  if (f) f.setTrashed(true);   // masuk Sampah Drive (bisa dipulihkan)
  return { ok: true };
}
