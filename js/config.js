/* ============ KONFIGURASI JALUR ============
   Isi GAS_URL dengan URL Web App Google Apps Script (akhiran /exec).
   Lihat README.md bagian "Setup Google Apps Script". */
window.JALUR_CONFIG = {
  APP_NAME: "JALUR",
  GAS_URL: "",          // contoh: "https://script.google.com/macros/s/AKfycb.../exec"
  LOCAL_MODE: false,    // true = tanpa login & tanpa server (HANYA untuk uji coba di komputer sendiri)
  AUTOSAVE_MS: 2500     // jeda sebelum perubahan dikirim ke server
};
