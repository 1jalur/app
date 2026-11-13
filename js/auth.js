/* ============ AKSES MASUK: ADMIN & STAFF + SINKRON KE GOOGLE APPS SCRIPT ============ */
(function () {
  "use strict";
  var C = window.JALUR_CONFIG || {}, SK = "jalur_session";
  var $ = function (id) { return document.getElementById(id); };
  // Menu yang boleh dibuka staff (id menu di sidebar). Admin boleh semuanya.
  // Staff HANYA MELIHAT (tidak bisa menambah/mengubah/menghapus) di semua menu ini.
  var STAFF_MENU = ["dashboard", "stok", "absensi", "timeline", "projects", "rapawal", "rap", "belanja",
                    "material", "jasa", "oper", "sop", "qc"];
  // Kunci data yang HARUS ada agar aplikasi tidak error (daftar = array, OBJ = objek)
  var ARR = ["projects", "rap", "material", "input", "output", "adj", "tim", "tlc", "tlp", "keg", "lem", "qc",
             "jasa", "oper", "investasi", "sop", "sj", "pengajuan", "rapa", "rapf", "spfl"];
  var OBJ = ["abs", "spt"];
  function lengkapi(d) {
    ARR.forEach(function (k) { if (!Array.isArray(d[k])) d[k] = []; });
    OBJ.forEach(function (k) { if (!d[k] || typeof d[k] !== "object" || Array.isArray(d[k])) d[k] = {}; });
    return d;
  }
  var sess = null, timer = null, dirty = false, busy = false, roleDone = false;

  window.JALUR = {
    onSave: function () {
      if (!sess || C.LOCAL_MODE || sess.role === "staff") return;   // staff tidak pernah mengirim data ke server
      dirty = true; stat("Menyimpan…");
      clearTimeout(timer); timer = setTimeout(push, C.AUTOSAVE_MS || 2500);
    },
    get session() { return sess; },
    token: function () { return Promise.resolve(sess && sess.token); }   // dipakai js/penawaran.js
  };

  function stat(t) { var e = $("wstat"); if (e) e.textContent = t; }
  function showLogin(msg) { $("login").style.display = "flex"; $("who").hidden = true; $("lerr").textContent = msg || ""; setTimeout(function () { $("lu").focus(); }, 50); }
  function hideLogin() { $("login").style.display = "none"; }

  function api(action, body) {
    if (!C.GAS_URL) return Promise.reject(new Error("GAS_URL belum diisi di js/config.js"));
    return fetch(C.GAS_URL, {
      method: "POST", redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(Object.assign({ action: action }, body || {}))
    }).then(function (r) {
      if (!r.ok) throw new Error("Server menjawab " + r.status);
      return r.json();
    });
  }

  function applyRole() {
    if (roleDone) return; roleDone = true;
    if (sess.role !== "staff") return;
    applyReadOnly();
    MENU.forEach(function (g) { g[1] = g[1].filter(function (i) { return STAFF_MENU.indexOf(i[0]) >= 0; }); });
    for (var i = MENU.length - 1; i >= 0; i--) if (!MENU[i][1].length) MENU.splice(i, 1);
    var _go = window.go;
    window.go = function (id) { return _go(STAFF_MENU.indexOf(id) >= 0 ? id : STAFF_MENU[0]); };
  }


  // ===== MODE HANYA-LIHAT untuk staff =====
  // Menyembunyikan form & tombol tambah/ubah/hapus, mengunci isian, dan memblokir klik yang mengubah data.
  // Tombol "Cetak", tombol kembali (←), membuka folder, dan kolom pencarian tetap berfungsi.
  function applyReadOnly() {
    var st = document.createElement("style");
    st.textContent = "body.ro #mn .box:has(.form){display:none!important}body.ro #mn button.ic{display:none!important}";
    document.head.appendChild(st);
    document.body.classList.add("ro");
    var mn = $("mn"), KEEP = "[data-q],#qs,#mq,#spq,#mo,#pw,[data-tl=tls]";
    function lock() {
      mn.querySelectorAll("button").forEach(function (b) { if (!/Cetak|←/.test(b.textContent)) b.style.display = "none"; });
      mn.querySelectorAll('[data-a="b"],[data-tl="b"],[data-spn],#nt,#tlnp').forEach(function (e) { e.style.display = "none"; });
      mn.querySelectorAll("p").forEach(function (e) { if (/^Pilih warna/.test(e.textContent.trim())) e.style.display = "none"; });
      mn.querySelectorAll("input,select,textarea").forEach(function (i) {
        if (i.matches(KEEP)) return;
        if (i.tagName === "TEXTAREA") { i.readOnly = true; i.placeholder = "Belum ada tulisan"; }
        else if (i.tagName === "INPUT" && (i.type === "text" || i.type === "number")) i.readOnly = true;
        else i.disabled = true;
      });
    }
    new MutationObserver(lock).observe(mn, { childList: true, subtree: true });
    lock();
    var ACT = "[data-a],[data-tl],[data-qc],[data-sa],[data-ra],[data-fa],[data-ba],[data-sp],[data-spn],[data-spp],[data-mt],[data-sj],[data-pg],[data-e],[data-d]";
    function guard(e) {
      var t = e.target; if (!t || !t.closest) return;
      var bt = t.closest("button");
      if (bt && /Cetak|←/.test(bt.textContent)) return;
      if (t.closest('[data-ra="o"],[data-fa="o"],[data-ba="o"],[data-sp="o"],[data-tl="tg"]')) return;
      var stop = e.type === "click" ? !!(bt || t.closest(ACT)) : !!t.closest('[data-tl="c"],[data-tl="cx"],[data-a="c"]');
      if (stop) { e.stopImmediatePropagation(); e.preventDefault(); }
    }
    ["click", "mousedown", "mouseover", "dblclick"].forEach(function (n) { mn.addEventListener(n, guard, true); });
  }

  function startSession(s) {
    sess = s;
    try { sessionStorage.setItem(SK, JSON.stringify(s)); } catch (e) {}
    applyRole();
    $("wtxt").textContent = s.nama + " · " + (s.role === "admin" ? "Admin" : "Staff");
    $("who").hidden = false;
  }

  function resetForms() {
    try { Object.keys(MD).forEach(function (k) { MS[k] = { f: newMF(k), ei: -1, q: "" }; }); } catch (e) {}
  }

  function pull() {
    return api("load", { token: sess.token }).then(function (j) {
      if (!j.ok) { var er = new Error(j.error || "Gagal memuat data"); er.auth = j.code === "auth"; throw er; }
      if (j.data) {
        S = lengkapi(j.data);
        try { localStorage.setItem("crm1", JSON.stringify(S)); } catch (e) {}
        resetForms();
        stat("Data dimuat dari server");
      } else if (sess.role === "admin") {
        // Server masih kosong
        if (!confirm("Server masih kosong.\n\nOK = unggah data yang ada di browser ini ke server.\nBatal = mulai dengan data kosong.")) {
          S = lengkapi({}); resetForms();
        }
        dirty = true; return push();
      }
    });
  }

  function push() {
    if (!sess || busy || !dirty) return Promise.resolve();
    busy = true; dirty = false;
    return api("save", { token: sess.token, data: S }).then(function (j) {
      if (!j.ok) { if (j.code === "auth") { dirty = true; expired(); return; } throw new Error(j.error); }
      stat("Tersimpan ✓ " + new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }));
    }).catch(function () {
      dirty = true; stat("Gagal sinkron, dicoba lagi…");
      clearTimeout(timer); timer = setTimeout(push, 15000);
    }).then(function () { busy = false; });
  }

  function expired() {
    sess = null; try { sessionStorage.removeItem(SK); } catch (e) {}
    showLogin("Sesi habis, silakan masuk lagi.");
  }

  function enter() { hideLogin(); window.go("dashboard"); }

  $("lf").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var b = $("lb"), u = $("lu").value.trim();
    b.disabled = true; $("lerr").textContent = "";
    api("login", { username: u, password: $("lp").value }).then(function (j) {
      if (!j.ok) throw new Error(j.error || "Login gagal");
      $("lp").value = "";
      startSession({ token: j.token, role: j.role, nama: j.nama || u, u: u.toLowerCase() });
      return dirty ? push().then(pull) : pull();
    }).then(enter).catch(function (e) {
      sess = null; try { sessionStorage.removeItem(SK); } catch (x) {}
      $("who").hidden = true; $("lerr").textContent = e.message || "Gagal masuk";
    }).then(function () { b.disabled = false; });
  });

  $("wout").addEventListener("click", function () {
    if (!sess) return;
    var done = function () {
      var t = sess && sess.token;
      (t ? api("logout", { token: t }).catch(function () {}) : Promise.resolve()).then(function () {
        try { sessionStorage.removeItem(SK); localStorage.removeItem("crm1"); } catch (e) {}
        location.reload();
      });
    };
    if (dirty) {
      push().then(function () {
        if (dirty && !confirm("Ada perubahan yang belum tersinkron ke server. Tetap keluar?")) return;
        done();
      });
    } else done();
  });

  window.addEventListener("beforeunload", function (e) { if (dirty && sess) { e.preventDefault(); e.returnValue = ""; } });

  // ===== Mulai =====
  // Muat modul lampiran PDF (js/penawaran.js) bila index.html belum memuatnya
  function muatPenawaran() {
    if (document.querySelector('script[src*="penawaran.js"]')) return;
    var pj = document.createElement("script"); pj.src = "js/penawaran.js"; document.body.appendChild(pj);
  }
  if (document.readyState === "complete") muatPenawaran(); else window.addEventListener("load", muatPenawaran);
  if (C.LOCAL_MODE) {
    hideLogin(); sess = { role: "admin", nama: "Mode lokal", token: "" };
    $("wtxt").textContent = "Mode lokal (tanpa server)"; $("who").hidden = false; $("wout").hidden = true;
    return;
  }
  var saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(SK)); } catch (e) {}
  if (saved && saved.token) {
    startSession(saved);
    pull().then(enter).catch(function (e) {
      if (e.auth) expired();
      else { stat("Offline, memakai data di perangkat ini"); enter(); }
    });
  } else {
    showLogin(C.GAS_URL ? "" : "Server belum disetel. Isi GAS_URL di js/config.js (lihat README).");
  }
})();
