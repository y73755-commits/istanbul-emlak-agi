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
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      document.body.style.overflow = open ? "hidden" : "";
    });
    nav.addEventListener("click", function (ev) {
      if (ev.target.closest("a")) { nav.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); document.body.style.overflow = ""; }
    });
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
    var cards = $$("[data-talep]", list), empty = $("[data-empty]"), count = $("[data-count]");
    var apply = function () {
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
    window.__ieaFilter = apply;
    var box = $("[data-filters-box]");
    if (box && window.innerWidth < 700 && !location.search) box.open = false;
    fForm.addEventListener("change", apply);
    fForm.addEventListener("input", function (ev) { if (ev.target.matches("[data-money]")) apply(); });
    fForm.addEventListener("reset", function () {
      setTimeout(function () { var m = fForm.elements.mahalle; m.innerHTML = '<option value="">Tüm mahalleler</option>'; m.disabled = true; apply(); }, 0);
    });
    initIlce(); apply();
  } else {
    $$("form[data-wa-form], form[data-ilce-form]").forEach(prefill);
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
  $$("form[data-wa-form]").forEach(function (form) {
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

  /* ---------- formdan WhatsApp mesajı ---------- */
  function txt(el) { if (!el) return ""; if (el.tagName === "SELECT") return el.value ? el.options[el.selectedIndex].text : ""; return (el.value || "").trim(); }
  function code(p) {
    var d = new Date(), z = function (n) { return (n < 10 ? "0" : "") + n; };
    return p + "-" + d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + "-" + Math.floor(1000 + Math.random() * 9000);
  }
  function stamp() {
    var d = new Date(), z = function (n) { return (n < 10 ? "0" : "") + n; };
    return z(d.getDate()) + "." + z(d.getMonth() + 1) + "." + d.getFullYear() + " " + z(d.getHours()) + ":" + z(d.getMinutes());
  }
  function fail(form, msg, el) {
    var box = $("[data-err]", form);
    box.textContent = msg; box.hidden = false;
    $$(".field.bad", form).forEach(function (f) { f.classList.remove("bad"); });
    if (el) { var f = el.closest(".field"); if (f) f.classList.add("bad"); el.focus({ preventScroll: false }); }
    return false;
  }
  function talepSatirlari(f) {
    var L = [];
    L.push("Talep: " + txt(f.kategori));
    L.push("İlçe / Mahalle: " + (txt(f.ilce) || "İstanbul geneli") + (f.mahalle.value ? " / " + f.mahalle.value : ""));
    L.push("Tür: " + txt(f.tur) + " · " + txt(f.islem));
    var a = digits(f.bmin.value), b = digits(f.bmax.value);
    var bl = (f.kategori.value === "satmak" || f.kategori.value === "kiraya-vermek" || f.kategori.value === "portfoyum-var") ? "İstenen fiyat" : "Bütçe";
    if (a || b) L.push(bl + ": " + (a ? fmtMoney(a) : "…") + (b ? " – " + fmtMoney(b) : "") + " TL");
    var m2 = digits(f.m2.value), oda = f.oda ? f.oda.value : "";
    if (m2 || oda) L.push((m2 ? "m²: " + m2 : "") + (m2 && oda ? " · " : "") + (oda ? "Oda: " + oda : ""));
    L.push("Açıklama: " + txt(f.aciklama));
    return L;
  }
  $$("form[data-wa-form]").forEach(function (form) {
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var f = form.elements, kind = form.getAttribute("data-wa-form");
      $("[data-err]", form).hidden = true;
      $$(".field.bad", form).forEach(function (x) { x.classList.remove("bad"); });
      var req = $$("[required]", form).filter(function (el) { return el.type !== "checkbox" && !el.closest("[hidden]"); });
      for (var i = 0; i < req.length; i++) {
        if (!String(req[i].value || "").trim()) {
          var lab = req[i].closest(".field") ? req[i].closest(".field").querySelector("label").textContent : "Bu alan";
          return fail(form, "Lütfen “" + lab.trim() + "” alanını doldurun.", req[i]);
        }
      }
      if (f.bmin && f.bmax) {
        var a = +digits(f.bmin.value), b = +digits(f.bmax.value);
        if (a && b && a > b) return fail(form, "En az bütçe, en fazla bütçeden büyük olamaz.", f.bmin);
      }
      var tel = normPhone(f.tel.value);
      if (!/^5\d{9}$/.test(tel)) return fail(form, "Lütfen 05 ile başlayan 11 haneli cep telefonu numaranızı yazın.", f.tel);
      if (f.eposta && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.eposta.value.trim())) return fail(form, "Lütfen geçerli bir e-posta adresi yazın.", f.eposta);
      var ilceler = $$('input[name="ilceler"]:checked', form).map(function (x) { return x.value; });
      if (kind === "emlakci" && !ilceler.length) return fail(form, "Lütfen hizmet verdiğiniz en az bir ilçe seçin.", $('input[name="ilceler"]', form));
      if (!f.onay.checked) return fail(form, "Devam etmek için onay kutusunu işaretleyin.", f.onay);

      var L = [], kod;
      if (kind === "vatandas") {
        kod = code("T");
        L.push("YENİ VATANDAŞ TALEBİ — İstanbul Emlak Ağı", "Form kodu: " + kod, "");
        L = L.concat(talepSatirlari(f));
        L.push("", "Ad soyad: " + txt(f.ad), "Telefon: " + fmtPhone(tel), "",
          "Onay (" + stamp() + "): İletişim bilgilerimin, platformun ücretli üyesi olan emlak danışmanlarıyla paylaşılmasına onay veriyorum. KVKK aydınlatma metnini okudum.");
      } else if (kind === "emlakci") {
        kod = code("B");
        var avrupa = $$('input[data-yaka="Avrupa Yakası"]', form), anadolu = $$('input[data-yaka="Anadolu Yakası"]', form);
        var hepsi = function (arr) { return arr.every(function (x) { return x.checked; }); };
        var ilceTxt = (hepsi(avrupa) && hepsi(anadolu)) ? "Tüm İstanbul" : ilceler.join(", ");
        L.push("EMLAKÇI ÜYELİK BAŞVURUSU — İstanbul Emlak Ağı", "Başvuru kodu: " + kod, "",
          "Ad soyad: " + txt(f.ad), "Emlak ofisi: " + txt(f.ofis), "Telefon: " + fmtPhone(tel), "E-posta: " + txt(f.eposta),
          "Yetki belgesi no: " + txt(f.yetki), "Hizmet ilçeleri: " + ilceTxt, "",
          "Onay (" + stamp() + "): KVKK aydınlatma metnini okudum, kullanım koşullarını kabul ediyorum.");
      } else {
        kod = code("E");
        L.push("EMLAKÇI İŞ BİRLİĞİ TALEBİ — İstanbul Emlak Ağı", "Form kodu: " + kod, "");
        L = L.concat(talepSatirlari(f));
        L.push("", "Ad soyad: " + txt(f.ad), "Emlak ofisi: " + txt(f.ofis), "Telefon: " + fmtPhone(tel), "",
          "Onay (" + stamp() + "): Talep özetimin yayınlanmasını ve iletişim bilgilerimin onaylı emlakçı üyelerle paylaşılmasını kabul ediyorum.");
      }
      var url = WA + "?text=" + encodeURIComponent(L.join("\n"));
      var w = window.open(url, "_blank", "noopener");
      track("form_gonderildi", { form: kind });
      var done = form.parentElement.querySelector("[data-done]");
      if (done) {
        $("[data-done-link]", done).href = url;
        form.hidden = true; done.hidden = false; done.focus();
        done.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      if (!w) location.href = url;
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

  /* ---------- uygulama gibi kullanım (PWA) ---------- */
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", function () { navigator.serviceWorker.register(CFG.base + "sw.js", { scope: CFG.base }).catch(function () {}); });
  }
})();
