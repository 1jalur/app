/* ============ LAMPIRAN PENAWARAN (PDF) — menu "Daftar Project" ============
   Menambah kolom "Penawaran (PDF)" tepat di samping "Total Project" (form & tabel).
   Backend otomatis mengikuti config.js:
     • GAS_URL terisi        → file disimpan di Google Drive (folder "JALUR-penawaran"), lewat gas/Penawaran.gs. Maks. 5 MB.
     • SUPABASE_* terisi     → file disimpan di Supabase Storage (bucket privat "penawaran"). Maks. 10 MB.
   Data project hanya menyimpan info singkat: project.pdf = { id | path, nama, size, tgl }.
   Admin: unggah / ganti / hapus.  Staff: hanya melihat.
   Tidak mengubah logika menu lain; ditempelkan lewat DOM setelah menu Daftar Project tampil. */
(function () {
  "use strict";
  if (window.__jalurPenawaran) return;   // cegah termuat dua kali
  window.__jalurPenawaran = true;
  var C = window.JALUR_CONFIG || {}, BUCKET = "penawaran";
  var SBU = (C.SUPABASE_URL || "").replace(/\/+$/, ""), SBK = C.SUPABASE_ANON_KEY || "", GAS = C.GAS_URL || "";
  var MODE = C.LOCAL_MODE ? "" : (SBU && SBK ? "sb" : (GAS ? "gas" : ""));
  var ON = !!MODE, MAX = MODE === "gas" ? 5 * 1024 * 1024 : 10 * 1024 * 1024, MAXTXT = MODE === "gas" ? "5 MB" : "10 MB";
  var mn = document.getElementById("mn");
  if (!mn) return;
  var pending = null;   // PDF yang dipilih; diunggah saat tombol Simpan/Update ditekan

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function isAdmin() { var s = window.JALUR && window.JALUR.session; return !!(s && s.role === "admin"); }
  function sz(n) { return n >= 1048576 ? (n / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
  function uid() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2); }
  function keyOf(p) { return (p && (p.path || p.id)) || ""; }
  function today() { return new Date().toISOString().slice(0, 10); }
  function token() {
    if (!window.JALUR || !window.JALUR.token) return Promise.reject(new Error("Belum login"));
    return window.JALUR.token().then(function (t) { if (!t) throw new Error("Belum login"); return t; });
  }

  // ---------- Backend A: Google Drive (lewat Apps Script) ----------
  function gas(action, body) {
    return token().then(function (t) {
      return fetch(GAS, { method: "POST", redirect: "follow", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(Object.assign({ action: action, token: t }, body)) });
    }).then(function (r) {
      if (!r.ok) throw new Error("Server menjawab " + r.status);
      return r.json();
    }).then(function (j) {
      if (!j.ok) throw new Error(j.code === "auth" ? "Sesi habis, muat ulang halaman lalu masuk lagi." : (j.error || "Gagal"));
      return j;
    });
  }
  function b64Of(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(String(fr.result).split(",")[1] || ""); };
      fr.onerror = function () { rej(new Error("File tidak bisa dibaca")); };
      fr.readAsDataURL(file);
    });
  }
  var G = {
    up: function (file) {
      return b64Of(file).then(function (d) { return gas("pdfUpload", { name: file.name, data: d }); })
        .then(function (j) { return { id: j.id, nama: file.name, size: file.size, tgl: today() }; });
    },
    rm: function (key) { return gas("pdfDelete", { id: key }).catch(function () {}); },
    view: function (key, w) {
      return gas("pdfGet", { id: key }).then(function (j) {
        var bin = atob(j.data), n = bin.length, u8 = new Uint8Array(n);
        for (var i = 0; i < n; i++) u8[i] = bin.charCodeAt(i);
        var url = URL.createObjectURL(new Blob([u8], { type: "application/pdf" }));
        if (w) w.location.href = url; else alert("Pop-up diblokir browser. Izinkan pop-up untuk situs ini lalu coba lagi.");
        setTimeout(function () { URL.revokeObjectURL(url); }, 180000);
      });
    }
  };

  // ---------- Backend B: Supabase Storage ----------
  function sb(method, path, body, headers) {
    return token().then(function (t) {
      var h = Object.assign({ apikey: SBK, Authorization: "Bearer " + t }, headers || {});
      return fetch(SBU + "/storage/v1" + path, { method: method, headers: h, body: body });
    });
  }
  function fail(r) {
    return r.text().then(function (t) {
      var m = ""; try { var j = JSON.parse(t); m = j.message || j.error || ""; } catch (e) {}
      if (r.status === 404 || /bucket not found/i.test(m)) m = "Bucket 'penawaran' belum dibuat. Jalankan supabase/penawaran.sql.";
      else if (r.status === 401 || r.status === 403 || /row-level security/i.test(m)) m = "Tidak punya izin (hanya admin yang boleh mengunggah).";
      throw new Error(m || ("HTTP " + r.status));
    });
  }
  var B = {
    up: function (file) {
      var path = uid() + ".pdf";
      return sb("POST", "/object/" + BUCKET + "/" + path, file, { "Content-Type": "application/pdf", "x-upsert": "false" })
        .then(function (r) { if (!r.ok) return fail(r); return { path: path, nama: file.name, size: file.size, tgl: today() }; });
    },
    rm: function (key) { return sb("DELETE", "/object/" + BUCKET + "/" + key).catch(function () {}); },
    view: function (key, w) {
      return sb("POST", "/object/sign/" + BUCKET + "/" + key, JSON.stringify({ expiresIn: 300 }), { "Content-Type": "application/json" })
        .then(function (r) { return r.ok ? r.json() : fail(r); })
        .then(function (j) {
          var s = j.signedURL || j.signedUrl || "";
          var u = /^https?:/.test(s) ? s : (s.indexOf("/storage/v1") === 0 ? SBU + s : SBU + "/storage/v1" + s);
          if (w) w.location.href = u; else alert("Pop-up diblokir browser. Izinkan pop-up untuk situs ini lalu coba lagi.");
        });
    }
  };

  // ---------- Antarmuka seragam ----------
  function BE() { return MODE === "gas" ? G : B; }
  function upload(file) { return BE().up(file); }
  function removeFile(key) { return BE().rm(key); }
  function openPdf(key) {
    var w = window.open("", "_blank");   // dibuka dulu (sinkron) agar tidak diblokir pop-up
    BE().view(key, w).catch(function (e) { if (w) w.close(); alert("Gagal membuka PDF: " + e.message); });
  }

  // ---------- Tampilan ----------
  function curNow() { try { return cur; } catch (e) { return ""; } }
  function fieldInfo() {
    if (!ON) return "Server belum disetel (config.js)";
    if (pending) return "Dipilih: " + esc(pending.name) + " (" + sz(pending.size) + ") · diunggah saat disimpan";
    var p = (typeof form === "object" && form) ? form.pdf : null;
    if (p && p.nama) return "Saat ini: " + esc(p.nama) + " · pilih file baru untuk mengganti";
    return "Maks. " + MAXTXT + ", format PDF";
  }
  function cellHtml(r, i) {
    var p = r && r.pdf;
    if (!p || !keyOf(p)) return '<span style="color:var(--mu)">—</span>';
    return '<a href="#" data-pdfv="' + esc(keyOf(p)) + '" title="' + esc(p.nama) + '" style="color:#2563eb;font-weight:600;text-decoration:none">📄 Lihat</a>' +
      '<div style="font-size:11px;color:var(--mu);max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(p.nama) + '</div>' +
      (isAdmin() ? '<a href="#" data-pdfx="' + i + '" title="Hapus file ini" style="font-size:11px;color:#dc2626;text-decoration:none">hapus file</a>' : "");
  }
  function inject() {
    if (curNow() !== "projects") { pending = null; return; }
    var fm = document.getElementById("fm");
    if (fm && !fm.querySelector(".pdf-fld")) {
      var bud = fm.querySelector('input[data-k="budget"]'), lab = bud && bud.closest("label");
      if (lab) {
        var n = document.createElement("label"); n.className = "pdf-fld";
        n.innerHTML = 'Penawaran (PDF)<input type="file" accept="application/pdf,.pdf" data-pdfin' + (ON ? "" : " disabled") + '>' +
          '<small class="pdf-info" style="color:var(--mu);font-size:11px">' + fieldInfo() + '</small>';
        lab.insertAdjacentElement("afterend", n);
      }
    }
    var tb = mn.querySelector(".tw table");
    if (tb && !tb.classList.contains("pdf-done")) {
      tb.classList.add("pdf-done");
      var hr = tb.rows[0], at = -1;
      for (var c = 0; c < hr.cells.length; c++) if (/^Total Project/.test(hr.cells[c].textContent.trim())) { at = c; break; }
      if (at < 0) return;
      var th = document.createElement("th"); th.textContent = "Penawaran (PDF)"; hr.cells[at].insertAdjacentElement("afterend", th);
      for (var i = 1; i < tb.rows.length; i++) {
        var row = tb.rows[i];
        if (row.cells.length <= at || row.cells[0].classList.contains("em")) continue;
        var td = document.createElement("td"); td.innerHTML = cellHtml(S.projects[i - 1], i - 1);
        row.cells[at].insertAdjacentElement("afterend", td);
      }
    }
  }
  function info() { var e = mn.querySelector(".pdf-info"); if (e) e.innerHTML = fieldInfo(); }
  new MutationObserver(inject).observe(mn, { childList: true, subtree: true });
  inject();

  // ---------- Aksi ----------
  mn.addEventListener("change", function (e) {
    var t = e.target; if (!t || !t.matches || !t.matches("[data-pdfin]")) return;
    var f = t.files && t.files[0]; pending = null;
    if (f) {
      if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") { alert("File harus berformat PDF."); t.value = ""; }
      else if (f.size > MAX) { alert("Ukuran file maksimal " + MAXTXT + " (file ini " + sz(f.size) + ")."); t.value = ""; }
      else pending = f;
    }
    info();
  });

  mn.addEventListener("click", function (e) {
    var t = e.target; if (!t || !t.closest) return;
    var v = t.closest("[data-pdfv]");
    if (v) { e.preventDefault(); openPdf(v.dataset.pdfv); return; }
    if (curNow() !== "projects") return;

    var x = t.closest("[data-pdfx]");
    if (x) {
      e.preventDefault();
      var i = +x.dataset.pdfx, p = S.projects[i];
      if (!p || !p.pdf || !isAdmin()) return;
      if (!confirm("Hapus file penawaran \"" + p.pdf.nama + "\"?")) return;
      var key = keyOf(p.pdf); p.pdf = ""; if (ei === i) form.pdf = "";
      save(); removeFile(key); render(); return;
    }
    if (t.closest("#cn,[data-e]")) pending = null;   // batal / pindah ke data lain → buang pilihan file

    var del = t.closest("[data-d]");   // hapus project → hapus juga file PDF-nya bila benar-benar terhapus
    if (del) {
      var pj = S.projects[+del.dataset.d];
      if (pj && keyOf(pj.pdf)) setTimeout(function () { if (S.projects.indexOf(pj) < 0) removeFile(keyOf(pj.pdf)); }, 0);
      return;
    }

    var sv = t.closest("#sv");
    if (sv && !sv.dataset.pdfok && pending) {
      e.stopImmediatePropagation(); e.preventDefault();
      var kd = (form.kode || "").trim(), nm = (form.nama || "").trim();
      if (!kd || !nm || form.budget === "" || form.budget == null) { alert("Kode ID, Nama Customer, dan Total Project wajib diisi"); return; }
      if (S.projects.some(function (p, j) { return j !== ei && p.kode === kd; })) { alert("Kode ID sudah dipakai"); return; }
      if (S.projects.some(function (p, j) { return j !== ei && p.nama === nm; })) { alert("Nama customer sudah ada"); return; }
      var old = (ei >= 0 && S.projects[ei] && S.projects[ei].pdf) || null;
      sv.disabled = true; var si = mn.querySelector(".pdf-info"); if (si) si.textContent = "Mengunggah PDF…";
      upload(pending).then(function (meta) {
        form.pdf = meta; pending = null; sv.disabled = false; sv.dataset.pdfok = "1";
        sv.click();   // lanjutkan penyimpanan normal
        if (keyOf(old) && keyOf(old) !== keyOf(meta) && S.projects.some(function (p) { return keyOf(p.pdf) === keyOf(meta); })) removeFile(keyOf(old));
      }).catch(function (err) { sv.disabled = false; info(); alert("Gagal mengunggah PDF: " + err.message + "\n\nData project belum disimpan."); });
    }
  }, true);
})();
