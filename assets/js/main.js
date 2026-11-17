/* İstanbul Emlak Ağı — site betiği */
(function () {
  "use strict";
  var CFG = window.IEA || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var WA = "https://wa.me/" + (CFG.wa || "");
  var params = new URLSearchParams(location.search);

  /* ---------- menü ---------- */
  var toggle = $("[data-nav-toggle]"), nav = $("[data-nav]");
  if (toggle && nav) {
    var mobilMenu = function () { return getComputedStyle(toggle).display !== "none"; };
    var menuKapat = function (odak) {
      if (!nav.classList.contains("open")) return;
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Menüyü aç");
      document.body.style.overflow = "";
      document.body.classList.remove("menu-acik");
      if (odak) toggle.focus();
    };
    var menuAc = function () {
      nav.classList.add("open");
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", "Menüyü kapat");
      document.body.style.overflow = "hidden";
      document.body.classList.add("menu-acik");
      var ilk = $("a", nav); if (ilk) setTimeout(function () { ilk.focus(); }, 60);
    };
    toggle.addEventListener("click", function () { nav.classList.contains("open") ? menuKapat(false) : menuAc(); });
    nav.addEventListener("click", function (ev) { if (ev.target.closest("a")) menuKapat(false); });
    document.addEventListener("keydown", function (ev) {
      if (!nav.classList.contains("open")) return;
      if (ev.key === "Escape") { ev.preventDefault(); menuKapat(true); return; }
      if (ev.key === "Tab") { // odak menü içinde dönsün
        var odaklar = [toggle].concat($$("a, button", nav)), i = odaklar.indexOf(document.activeElement);
        if (ev.shiftKey && i <= 0) { ev.preventDefault(); odaklar[odaklar.length - 1].focus(); }
        else if (!ev.shiftKey && i === odaklar.length - 1) { ev.preventDefault(); odaklar[0].focus(); }
      }
    });
    window.addEventListener("resize", function () { if (!mobilMenu()) menuKapat(false); });
  }

  /* ---------- WhatsApp menüsü ---------- */
  var waT = $("[data-wa-toggle]"), waM = $("[data-wa-menu]");
  if (waT && waM) {
    waT.addEventListener("click", function (ev) {
      ev.preventDefault();
      var open = waM.hidden;
      waM.hidden = !open;
      waT.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("click", function (ev) {
      if (!waM.hidden && !ev.target.closest("[data-wa]")) { waM.hidden = true; waT.setAttribute("aria-expanded", "false"); }
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && !waM.hidden) { waM.hidden = true; waT.setAttribute("aria-expanded", "false"); waT.focus(); }
    });
  }

  /* ---------- WhatsApp düğmesi hiçbir bağlantı, düğme veya form alanının üstüne binmesin ---------- */
  var waBox = $("[data-wa]");
  if (waBox) {
    var ETKILESIM = "a[href], button, input, select, textarea, label, summary, [role=button], [tabindex]:not([tabindex='-1'])";
    var ticking = false;
    var altindaVarMi = function (r) {
      // Düğmenin çevresiyle (8 px pay) kesişen, görünür her bağlantı/düğme/form alanı çakışma sayılır.
      var pad = 8, L = r.left - pad, R = r.right + pad, T = r.top - pad, B = r.bottom + pad;
      var els = document.querySelectorAll(ETKILESIM);
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (waBox.contains(el)) continue;
        var q = el.getBoundingClientRect();
        if (!q.width || !q.height || q.right <= L || q.left >= R || q.bottom <= T || q.top >= B) continue;
        if (getComputedStyle(el).visibility === "hidden") continue;
        return true;
      }
      return false;
    };
    var checkOverlap = function () {
      ticking = false;
      var btn = $(".wa-btn", waBox);
      if (!btn || (waM && !waM.hidden)) { waBox.classList.remove("away"); return; }
      if (document.body.classList.contains("menu-acik") || $("dialog.modal[open]")) { waBox.classList.add("away"); return; }
      // Gizliyken düğme küçültülmüş (scale) olur; ölçümü gerçek boyutla yap, yoksa göster/gizle arasında gidip gelir.
      var g = btn.getBoundingClientRect(), cx = g.left + g.width / 2, cy = g.top + g.height / 2, w = btn.offsetWidth / 2, h = btn.offsetHeight / 2;
      waBox.classList.toggle("away", altindaVarMi({ left: cx - w, right: cx + w, top: cy - h, bottom: cy + h }));
    };
    var schedule = function () { if (!ticking) { ticking = true; requestAnimationFrame(checkOverlap); } };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("load", schedule);
    document.addEventListener("toggle", schedule, true);
    document.addEventListener("click", function () { setTimeout(schedule, 50); }, true);
    if (window.MutationObserver) new MutationObserver(schedule).observe(document.body, { attributes: true, attributeFilter: ["class", "open", "hidden"], subtree: false });
    window.__ieaWaCheck = schedule;
    schedule();
  }

  /* ---------- yerel depolama (favoriler) ---------- */
  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(key) || "null");
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
  }
  var favs = store("iea-fav") || [];
  function syncFavs() {
    $$("[data-fav]").forEach(function (b) {
      var on = favs.indexOf(b.getAttribute("data-fav")) > -1;
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.title = on ? "Favorilerden çıkar" : "Favorilere ekle";
    });
  }
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-fav]");
    if (!b) return;
    var no = b.getAttribute("data-fav"), i = favs.indexOf(no);
    if (i > -1) favs.splice(i, 1); else favs.push(no);
    store("iea-fav", favs); syncFavs();
    if (window.__ieaFilter) window.__ieaFilter();
  });
  syncFavs();
  window.__ieaFavSync = function () { favs = store("iea-fav") || []; syncFavs(); };

  /* ---------- para ve telefon biçimi ---------- */
  function digits(s) { return String(s || "").replace(/\D+/g, ""); }
  function fmtMoney(s) { var d = digits(s).replace(/^0+(?=\d)/, ""); return d ? d.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : ""; }
  $$("[data-money]").forEach(function (inp) {
    inp.addEventListener("input", function () {
      var pos = inp.value.length - inp.selectionStart;
      inp.value = fmtMoney(inp.value);
      try { var p = Math.max(0, inp.value.length - pos); inp.setSelectionRange(p, p); } catch (e) {}
    });
  });
  function normPhone(s) {
    var d = digits(s);
    if (d.indexOf("90") === 0 && d.length === 12) d = d.slice(2);
    if (d.charAt(0) === "0") d = d.slice(1);
    return d;
  }
  function fmtPhone(d) { return d.length === 10 ? "0" + d.slice(0, 3) + " " + d.slice(3, 6) + " " + d.slice(6, 8) + " " + d.slice(8) : d; }
  $$("[data-phone]").forEach(function (inp) {
    inp.addEventListener("blur", function () { var d = normPhone(inp.value); if (d.length === 10) inp.value = fmtPhone(d); });
  });

  /* ---------- ilçe → mahalle ---------- */
  function fillMahalle(ilceSel) {
    var scope = ilceSel.closest("form") || document;
    var mSel = $("[data-mahalle]", scope);
    if (!mSel) return;
    var data = window.IEA_ILCELER || {};
    var list = data[ilceSel.value] || [];
    var first = mSel.closest("[data-filters]") ? "Tüm mahalleler" : (mSel.closest(".search") ? "Tüm mahalleler" : "Mahalle seçin (isteğe bağlı)");
    var keep = mSel.getAttribute("data-want") || "";
    mSel.innerHTML = "";
    var o = document.createElement("option"); o.value = ""; o.textContent = ilceSel.value ? first : "Önce ilçe seçin"; mSel.appendChild(o);
    list.forEach(function (m) { var op = document.createElement("option"); op.value = m; op.textContent = m; mSel.appendChild(op); });
    mSel.disabled = !ilceSel.value;
    if (keep && list.indexOf(keep) > -1) mSel.value = keep;
    mSel.removeAttribute("data-want");
  }
  function initIlce() {
    $$("[data-ilce]").forEach(function (sel) {
      sel.addEventListener("change", function () { fillMahalle(sel); });
      if (sel.value) fillMahalle(sel);
    });
  }

  /* ---------- URL'den ön doldurma ---------- */
  function prefill(form) {
    if (!form) return;
    ["kategori", "ilce", "islem", "sira"].forEach(function (k) {
      var v = params.get(k), el = form.elements[k];
      if (v && el && el.tagName === "SELECT" && $$("option", el).some(function (o) { return o.value === v; })) el.value = v;
    });
    var tur = params.get("tur"), grup = params.get("grup"), tEl = form.elements.tur;
    if (tEl) {
      var want = grup ? "g:" + grup : tur;
      if (want && $$("option", tEl).some(function (o) { return o.value === want; })) tEl.value = want;
    }
    var m = params.get("mahalle"), mEl = form.elements.mahalle;
    if (m && mEl) mEl.setAttribute("data-want", m);
    var b = params.get("butce");
    if (b && form.elements.bmin) {
      var p = b.split("-");
      form.elements.bmin.value = fmtMoney(p[0] || ""); form.elements.bmax.value = fmtMoney(p[1] || "");
    }
    ["bmin", "bmax"].forEach(function (k) { var v = params.get(k); if (v && form.elements[k]) form.elements[k].value = fmtMoney(v); });
    if (params.get("fav") && form.elements.fav) form.elements.fav.checked = true;
  }

  /* ---------- talep listesi filtreleri ---------- */
  var today = new Date(); today.setHours(0, 0, 0, 0);
  function expired(card) {
    if (card.getAttribute("data-ornek") === "1") return false;
    var t = new Date(card.getAttribute("data-tarih") + "T00:00:00");
    return (today - t) / 864e5 > (CFG.yayinGun || 60);
  }
  $$("[data-talep]").forEach(function (c) { if (expired(c)) c.remove(); });

  var fForm = $("[data-filters]"), list = $("[data-list]");
  if (fForm && list) {
    prefill(fForm);
    var empty = $("[data-empty]"), count = $("[data-count]");
    var apply = function () {
      var cards = $$("[data-talep]", list);
      var f = fForm.elements;
      var kat = f.kategori.value, ilce = f.ilce.value, mah = f.mahalle.value, tur = f.tur.value, islem = f.islem.value;
      var bmin = +digits(f.bmin.value) || 0, bmax = +digits(f.bmax.value) || 0, onlyFav = f.fav.checked;
      var shown = [];
      cards.forEach(function (c) {
        var d = c.dataset, ok = true;
        if (kat && d.kategori !== kat) ok = false;
        if (ilce && d.ilce !== ilce) ok = false;
        if (mah && d.mahalle !== mah) ok = false;
        if (tur) { if (tur.indexOf("g:") === 0 ? d.grup !== tur.slice(2) : d.tur !== tur) ok = false; }
        if (islem && d.islem !== islem) ok = false;
        if (bmin || bmax) {
          var cmin = +d.bmin || 0, cmax = +d.bmax || 0;
          if (!cmin && !cmax) ok = false;
          else {
            if (bmax && cmin > bmax) ok = false;
            if (bmin && (cmax || cmin) < bmin) ok = false;
          }
        }
        if (onlyFav && favs.indexOf(d.no) < 0) ok = false;
        c.hidden = !ok;
        if (ok) shown.push(c);
      });
      var sira = f.sira.value;
      var key = function (c) { return sira.indexOf("butce") === 0 ? (+c.dataset.bmax || +c.dataset.bmin || 0) : c.dataset.tarih; };
      shown.sort(function (a, b) {
        var x = key(a), y = key(b), r = x < y ? -1 : x > y ? 1 : 0;
        return (sira === "yeni" || sira === "butce-azalan") ? -r : r;
      }).forEach(function (c) { list.appendChild(c); });
      if (empty) empty.hidden = shown.length > 0;
      if (count) count.textContent = shown.length + " talep listeleniyor";
      var q = new URLSearchParams();
      ["kategori", "ilce", "mahalle", "tur", "islem", "sira"].forEach(function (k) { var v = f[k].value; if (v && !(k === "sira" && v === "yeni")) q.set(k, v); });
      if (bmin) q.set("bmin", bmin); if (bmax) q.set("bmax", bmax); if (onlyFav) q.set("fav", "1");
      var qs = q.toString();
      try { history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "")); } catch (e) {}
    };
    window.__ieaFilter = apply; window.__ieaFilterInit = apply;
    var box = $("[data-filters-box]");
    if (box && window.innerWidth < 700 && !location.search) box.open = false;
    fForm.addEventListener("change", apply);
    fForm.addEventListener("input", function (ev) { if (ev.target.matches("[data-money]")) apply(); });
    fForm.addEventListener("reset", function () {
      setTimeout(function () { var m = fForm.elements.mahalle; m.innerHTML = '<option value="">Tüm mahalleler</option>'; m.disabled = true; apply(); }, 0);
    });
    initIlce(); apply();
  } else {
    $$("form[data-db-form], form[data-ilce-form]").forEach(prefill);
    initIlce();
  }

  /* ---------- formlara göre alan davranışı ---------- */
  var KONUT = ["daire", "rezidans", "villa", "mustakil"];
  var KAT2 = {
    "satilik-konut": ["satilik", "daire"], "kiralik-konut": ["kiralik", "daire"], "satilik-arsa": ["satilik", "arsa"],
    "tarla": ["", "tarla"], "villa": ["", "villa"], "kat-karsiligi": ["kat-karsiligi", "arsa"], "satmak": ["satilik", ""],
    "kiraya-vermek": ["kiralik", ""], "satilik-portfoy": ["satilik", ""], "kiralik-portfoy": ["kiralik", ""],
    "alici": ["satilik", ""], "kiraci": ["kiralik", ""], "arsa-tarla": ["", "arsa"]
  };
  $$("form[data-db-form]").forEach(function (form) {
    var kat = form.elements.kategori, tur = form.elements.tur, islem = form.elements.islem, oda = form.elements.oda;
    var bl = $("[data-butce-label]", form);
    function sync() {
      if (oda) { var f = oda.closest(".field"); var show = !tur.value || KONUT.indexOf(tur.value) > -1; f.hidden = !show; if (!show) oda.value = ""; }
      if (bl && kat) bl.textContent = (kat.value === "satmak" || kat.value === "kiraya-vermek" || kat.value === "portfoyum-var") ? "İstenen fiyat (TL)" : "Bütçe aralığı (TL)";
    }
    if (kat) kat.addEventListener("change", function () {
      var m = KAT2[kat.value];
      if (m) { if (m[0] && islem) islem.value = m[0]; if (m[1] && tur && (!tur.value || kat.value !== "satmak")) tur.value = m[1]; }
      sync();
    });
    if (tur) tur.addEventListener("change", sync);
    if (kat && kat.value && KAT2[kat.value]) kat.dispatchEvent(new Event("change"));
    sync();
  });
  $$("[data-select-all]").forEach(function (b) {
    b.addEventListener("click", function () {
      var y = b.getAttribute("data-select-all"), boxes = $$('input[data-yaka="' + y + '"]');
      var all = boxes.every(function (x) { return x.checked; });
      boxes.forEach(function (x) { x.checked = !all; });
      b.textContent = all ? "Tümünü seç" : "Seçimi kaldır";
    });
  });

  /* ---------- ölçüm (yalnızca kimlik girilmişse ve izinle) ---------- */
  function track(name, data) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(Object.assign({ event: name }, data || {}));
    if (window.gtag) window.gtag("event", name, data || {});
  }
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest("[data-track]");
    if (a) track(a.getAttribute("data-track") + "_tiklamasi", { konum: a.getAttribute("data-ctx") || "" });
  });
  if (CFG.ga4) {
    var choice = store("iea-cerez");
    var loadGA = function () {
      var s = document.createElement("script"); s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + CFG.ga4; document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag("js", new Date()); window.gtag("config", CFG.ga4, { anonymize_ip: true });
    };
    if (choice === "evet") loadGA();
    else if (choice !== "hayir") {
      var bar = document.createElement("div");
      bar.className = "consent-bar"; bar.setAttribute("role", "dialog"); bar.setAttribute("aria-label", "Çerez tercihi");
      bar.innerHTML = '<p>Siteyi geliştirmek için ziyaret istatistiklerini (Google Analytics) kullanmak istiyoruz. İzin vermezseniz hiçbir ölçüm aracı yüklenmez. <a class="link-gold" href="' + CFG.base + 'cerez-politikasi.html">Çerez politikası</a></p><div class="actions"><button class="btn btn-gold btn-sm" type="button" data-c="evet">Kabul et</button><button class="btn btn-ghost btn-sm" type="button" data-c="hayir">Reddet</button></div>';
      document.body.appendChild(bar);
      bar.addEventListener("click", function (ev) {
        var c = ev.target.getAttribute("data-c"); if (!c) return;
        store("iea-cerez", c); bar.remove(); if (c === "evet") loadGA();
      });
    }
  }

  /* ---------- harita: ilçe adı üzerine gelince / dokununca ---------- */
  $$(".imap-wrap").forEach(function (wrap) {
    var tip = $(".imap-tip", wrap); if (!tip) return;
    var secili = null, dokunma = false;
    var goster = function (a, x, y, tik) {
      var r = wrap.getBoundingClientRect();
      tip.innerHTML = "<strong>" + a.getAttribute("data-ad") + "</strong><small>" + a.getAttribute("data-bilgi") + "</small>" +
        (tik ? '<br><a href="' + a.getAttribute("href") + '">İlçe sayfasına git →</a>' : "");
      tip.hidden = false; tip.classList.toggle("tik", !!tik);
      var w = tip.offsetWidth, h = tip.offsetHeight;
      var left = Math.min(Math.max(x - r.left, w / 2 + 4), r.width - w / 2 - 4);
      var top = Math.max(y - r.top, h + 16);
      tip.style.left = left + "px"; tip.style.top = top + "px";
    };
    var gizle = function () { tip.hidden = true; if (secili) secili.classList.remove("secili"); secili = null; };
    var merkez = function (a) { var b = a.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; };
    $$("a[data-ad]", wrap).forEach(function (a) {
      a.addEventListener("pointerenter", function (ev) { if (ev.pointerType === "mouse") goster(a, ev.clientX, ev.clientY); });
      a.addEventListener("pointermove", function (ev) { if (ev.pointerType === "mouse" && !tip.classList.contains("tik")) goster(a, ev.clientX, ev.clientY); });
      a.addEventListener("pointerleave", function (ev) { if (ev.pointerType === "mouse" && !tip.classList.contains("tik")) tip.hidden = true; });
      a.addEventListener("pointerdown", function (ev) { dokunma = ev.pointerType !== "mouse"; });
      a.addEventListener("focus", function () { var c = merkez(a); goster(a, c[0], c[1]); });
      a.addEventListener("blur", function () { if (!tip.classList.contains("tik")) tip.hidden = true; });
      a.addEventListener("click", function (ev) {
        if (!dokunma) return;                       // fare/klavye: doğrudan ilçe sayfası
        if (secili === a) return;                   // ikinci dokunuş: sayfaya git
        ev.preventDefault();
        if (secili) secili.classList.remove("secili");
        secili = a; a.classList.add("secili");
        goster(a, ev.clientX || merkez(a)[0], ev.clientY || merkez(a)[1], true);
      });
    });
    document.addEventListener("click", function (ev) { if (secili && !wrap.contains(ev.target)) gizle(); });
  });

  /* ---------- uygulama gibi kullanım (PWA) ---------- */
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", function () { navigator.serviceWorker.register(CFG.base + "sw.js", { scope: CFG.base }).catch(function () {}); });
  }
})();
