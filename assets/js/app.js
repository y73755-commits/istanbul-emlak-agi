/* İstanbul Emlak Ağı — veritabanı, giriş ve panel işlemleri */
(function () {
  "use strict";
  var CFG = window.IEA || {};
  var SB_URL = CFG.sbUrl, SB_KEY = CFG.sbKey, KOD = CFG.kod || {};
  var STORE = "sb-" + (SB_URL || "").replace(/^https:\/\//, "").split(".")[0] + "-auth-token";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var digits = function (s) { return String(s || "").replace(/\D+/g, ""); };
  var P = CFG.base || "/";
  var IEA = window.IEA_APP = {};
  // Türkçe bulunma eki: Kadıköy'de, Beşiktaş'ta, Pendik'te, Kartal'da
  function ekDe(k) {
    var w = String(k || "").trim(), low = w.toLocaleLowerCase("tr");
    var v = (low.match(/[aıoueiöü](?=[^aıoueiöü]*$)/) || ["e"])[0];
    var son = low.slice(-1), sert = "çfhkpsşt".indexOf(son) > -1;
    return "'" + (sert ? "t" : "d") + ("aıou".indexOf(v) > -1 ? "a" : "e");
  }
  IEA.ekDe = ekDe;

  /* ---------------- bağlantı ---------------- */
  function rest(path, opt) {
    opt = opt || {};
    var h = { apikey: SB_KEY, Authorization: "Bearer " + (opt.token || SB_KEY) };
    if (opt.body) h["Content-Type"] = "application/json";
    return fetch(SB_URL + "/rest/v1/" + path, { method: opt.body ? "POST" : "GET", headers: h, body: opt.body ? JSON.stringify(opt.body) : undefined })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.message || "Bağlantı hatası"); return j; }); });
  }
  var sbPromise = null;
  function sb() {
    if (sbPromise) return sbPromise;
    sbPromise = new Promise(function (res, rej) {
      function make() { res(window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce", storageKey: STORE } })); }
      if (window.supabase && window.supabase.createClient) return make();
      var s = document.createElement("script"); s.src = P + "assets/js/supabase.min.js?v=" + (CFG.sbVer || "1");
      s.onload = make; s.onerror = function () { rej(new Error("Bağlantı kütüphanesi yüklenemedi")); };
      document.head.appendChild(s);
    });
    return sbPromise;
  }
  IEA.sb = sb;
  function oturumVarGibi() { try { return !!localStorage.getItem(STORE); } catch (e) { return false; } }
  IEA.oturum = function () { return sb().then(function (c) { return c.auth.getSession().then(function (r) { return r.data.session; }); }); };
  function rpc(name, args) {
    return sb().then(function (c) { return c.rpc(name, args || {}); }).then(function (r) {
      if (r.error) { var m = r.error.message || "İşlem yapılamadı"; if (/JWT|jwt/.test(m)) m = "Oturumunuzun süresi doldu, lütfen tekrar giriş yapın."; throw new Error(m); }
      return r.data;
    });
  }
  IEA.rpc = rpc;

  /* ---------------- biçimlendirme ---------------- */
  var AY = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  function tarih(s) { if (!s) return ""; var d = new Date(s); return d.getDate() + " " + AY[d.getMonth()] + " " + d.getFullYear(); }
  function tl(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
  function kisa(n) { if (n >= 1e6) { var v = (n / 1e6).toFixed(1).replace(/\.0$/, "").replace(".", ","); return v + " milyon"; } return tl(n); }
  function butce(t) {
    var a = t.butce_min, b = t.butce_max, ay = t.islem === "kiralik" ? "/ay" : "";
    if (a && b) return (a >= 1e6 && b >= 1e6 ? kisa(a).replace(" milyon", "") : kisa(a)) + " – " + kisa(b) + " TL" + ay;
    if (b) return "En fazla " + kisa(b) + " TL" + ay;
    if (a) return (["satmak", "kiraya-vermek", "portfoyum-var"].indexOf(t.kategori) > -1 ? "İstenen " : "En az ") + kisa(a) + " TL" + ay;
    return "Bütçe görüşülecek";
  }
  function telGoster(t) { var d = digits(t); if (d.indexOf("90") === 0) d = d.slice(2); return d.length === 10 ? "0" + d.slice(0, 3) + " " + d.slice(3, 6) + " " + d.slice(6, 8) + " " + d.slice(8) : t; }
  IEA.fmt = { tarih: tarih, butce: butce, tel: telGoster, tl: tl };
  var GRUP = { konut: ["daire", "rezidans", "villa", "mustakil"], arsa: ["arsa", "tarla"], ticari: ["ofis", "dukkan", "depo", "bina"] };
  function grupOf(tur) { for (var g in GRUP) if (GRUP[g].indexOf(tur) > -1) return g; return ""; }
  var I = CFG.ikon || {};

  /* ---------------- talep kartı ---------------- */
  function kart(t, ornek) {
    var tip = t.tip || "vatandas";
    var katMap = tip === "vatandas" ? KOD.vatandas_kategorileri : KOD.emlakci_kategorileri;
    var yer = [t.ilce || "İstanbul geneli", t.mahalle].filter(Boolean).join(" / ");
    var meta = [KOD.turler[t.tur], KOD.islemler[t.islem], t.oda, t.m2 ? t.m2 + " m²" : ""].filter(Boolean).map(esc).join(" · ");
    var bmin = t.butce_min || 0, bmax = t.butce_max || t.butce_min || 0;
    var no = t.no || "";
    return '<article class="tcard" data-talep data-id="' + (t.id || "") + '" data-no="' + esc(no) + '" data-tarih="' + esc((t.yayin_tarihi || t.olusturma || t.tarih || "").slice(0, 10)) +
      '" data-kategori="' + esc(t.kategori) + '" data-ilce="' + esc(t.ilce || "") + '" data-mahalle="' + esc(t.mahalle || "") + '" data-tur="' + esc(t.tur) +
      '" data-grup="' + grupOf(t.tur) + '" data-islem="' + esc(t.islem) + '" data-bmin="' + bmin + '" data-bmax="' + bmax + '" data-ornek="' + (ornek ? 1 : 0) + '">' +
      '<div class="tcard-top"><span class="badge">' + esc((katMap || {})[t.kategori] || "") + "</span>" + (ornek ? '<span class="badge badge-ornek">Örnek</span>' : "") +
      '<button class="fav" type="button" aria-pressed="false" data-fav="' + esc(no) + '" title="Favorilere ekle">' + (I.heart || "♥") + '<span class="sr">Favorilere ekle</span></button></div>' +
      '<h3 class="tcard-h">' + esc(t.baslik) + "</h3>" +
      '<p class="tcard-loc">' + (I.pin || "") + esc(yer) + "</p>" +
      '<div class="tcard-mid"><p class="tcard-price">' + esc(butce(t)) + '</p><p class="tcard-meta">' + meta + "</p></div>" +
      '<p class="tcard-sum">' + esc(t.ozet) + "</p>" +
      '<div class="tcard-foot"><span class="tcard-lock">' + (I.lock || "") + (tip === "vatandas" ? "İletişim ücretli üyelere açık" : "İletişim onaylı emlakçılara açık") + "</span>" +
      '<button class="btn btn-sm btn-line" type="button" data-detay="' + (ornek ? "ornek" : t.id) + '" data-tip="' + tip + '">Detay ve iletişim</button></div>' +
      '<div class="tcard-sub"><span class="tcard-no">' + esc(no) + " · " + esc(tarih(t.yayin_tarihi || t.olusturma || t.tarih)) + "</span>" +
      (ornek ? "" : '<button class="link-mini" type="button" data-sikayet="' + t.id + '">Şikâyet et</button>') + "</div></article>";
  }
  IEA.kart = kart;

  /* ---------------- ayarlar (WhatsApp, metinler) ---------------- */
  var ayarP = null;
  function ayarlar() {
    if (ayarP) return ayarP;
    try { var c = JSON.parse(sessionStorage.getItem("iea-ayar") || "null"); if (c && Date.now() - c.t < 300000) { ayarP = Promise.resolve(c.v); return ayarP; } } catch (e) {}
    ayarP = rest("ayarlar?select=anahtar,deger").then(function (rows) {
      var o = {}; rows.forEach(function (r) { o[r.anahtar] = r.deger; });
      try { sessionStorage.setItem("iea-ayar", JSON.stringify({ t: Date.now(), v: o })); } catch (e) {}
      return o;
    });
    return ayarP;
  }
  IEA.ayarlar = ayarlar;
  function ayarUygula(a) {
    var w = a.whatsapp;
    if (w && w.numara && w.numara !== CFG.wa) {
      $$('a[href^="https://wa.me/"]').forEach(function (el) { el.href = el.href.replace(/wa\.me\/\d+/, "wa.me/" + w.numara); });
      $$('a[href^="tel:"]').forEach(function (el) { el.href = "tel:+" + w.numara; });
      $$("[data-wa-gosterim]").forEach(function (el) { el.textContent = w.gosterim; });
      CFG.wa = w.numara;
    }
    var ana = a.ana_sayfa;
    if (ana) {
      var h = $("[data-ayar=ana_baslik]"), l = $("[data-ayar=ana_alt]");
      if (h && ana.baslik) h.textContent = ana.baslik;
      if (l && ana.alt_aciklama) l.textContent = ana.alt_aciklama;
    }
    var m = a.metinler || {};
    $$("[data-metin]").forEach(function (el) { var k = el.getAttribute("data-metin"); if (m[k] && m[k].trim()) el.innerHTML = md(m[k]); });
    CFG.ucretli = a.ucretli_erisim_aktif === true;
    $$("[data-ucretli]").forEach(function (el) { el.hidden = (el.getAttribute("data-ucretli") === "acik") !== CFG.ucretli; });
  }
  function md(t) {
    var out = [], list = [], para = [];
    var inl = function (s) { return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"); };
    var flush = function () { if (para.length) { out.push("<p>" + inl(para.join(" ")) + "</p>"); para = []; } if (list.length) { out.push("<ul>" + list.map(function (x) { return "<li>" + inl(x) + "</li>"; }).join("") + "</ul>"); list = []; } };
    t.split(/\r?\n/).forEach(function (line) {
      var s = line.trim();
      if (!s) return flush();
      if (s.indexOf("## ") === 0) { flush(); out.push("<h2>" + inl(s.slice(3)) + "</h2>"); }
      else if (s.indexOf("- ") === 0) { if (para.length) flush(); list.push(s.slice(2)); }
      else { if (list.length) flush(); para.push(s); }
    });
    flush(); return out.join("");
  }
  IEA.md = md;

  /* ---------------- modal ---------------- */
  var dlg;
  function modal(html, opt) {
    opt = opt || {};
    if (!dlg) {
      dlg = document.createElement("dialog"); dlg.className = "modal"; document.body.appendChild(dlg);
      dlg.addEventListener("click", function (ev) { if (ev.target === dlg || ev.target.closest("[data-kapat]")) dlg.close(); });
    }
    dlg.innerHTML = '<div class="modal-in' + (opt.genis ? " genis" : "") + '"><button class="modal-x" type="button" data-kapat aria-label="Kapat">×</button>' + html + "</div>";
    if (!dlg.open) dlg.showModal();
    var f = dlg.querySelector("input,select,textarea,button:not(.modal-x)"); if (f) f.focus();
    return dlg;
  }
  IEA.modal = modal;
  IEA.kapat = function () { if (dlg && dlg.open) dlg.close(); };
  function uyari(baslik, metin, butonlar) {
    return modal("<h2>" + esc(baslik) + "</h2><p>" + metin + "</p>" + (butonlar ? '<div class="actions">' + butonlar + "</div>" : ""));
  }
  IEA.uyari = uyari;
  function hata(e) { return esc((e && e.message) || e || "Bir hata oluştu"); }

  /* ---------------- detay ve iletişim ---------------- */
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-detay]");
    if (!b) return;
    var id = b.getAttribute("data-detay"), tip = b.getAttribute("data-tip");
    var kural = tip === "emlakci"
      ? "Bu iş birliği paylaşımının detayı ve paylaşan emlakçının iletişim bilgisi yalnızca onaylı emlakçı üyelere açıktır."
      : "Talep sahibinin adı, telefonu ve detaylı açıklaması yalnızca yönetici tarafından onaylanmış, aktif ücretli üyeliği olan emlakçılara açıktır.";
    if (id === "ornek") return uyari("Örnek kayıt", "Bu kart, platformun nasıl çalışacağını göstermek için hazırlanmış bir örnektir. " + kural);
    if (!oturumVarGibi()) {
      return uyari("Üyelere özel bilgi", kural + " Bu bilgiler sayfaya hiç gönderilmez; yetkiniz giriş yaptığınızda sunucuda kontrol edilir.",
        '<a class="btn btn-gold" href="' + P + "giris?donus=" + encodeURIComponent(location.pathname.replace(P, "") + location.search) + '">Giriş yap</a><a class="btn btn-line" href="' + P + 'uyelik-paketleri">Üyelik paketleri</a>');
    }
    modal('<h2>Detay ve iletişim</h2><p class="muted">Yetkiniz kontrol ediliyor…</p>');
    rpc("talep_detay", { p_id: +id }).then(function (d) {
      var tel = digits(d.telefon);
      modal("<h2>" + esc(d.no) + " · Detay ve iletişim</h2>" +
        '<dl class="dl">' +
        (d.ofis_adi ? "<dt>Emlak ofisi</dt><dd>" + esc(d.ofis_adi) + "</dd>" : "") +
        "<dt>" + (tip === "emlakci" ? "Emlak danışmanı" : "Talep sahibi") + "</dt><dd>" + esc(d.ad_soyad) + "</dd>" +
        '<dt>Telefon</dt><dd><a class="link-gold" href="tel:+' + tel + '">' + esc(telGoster(d.telefon)) + "</a></dd>" +
        "<dt>Detaylı açıklama</dt><dd class=\"pre\">" + esc(d.aciklama) + "</dd></dl>" +
        '<div class="actions"><a class="btn btn-gold" href="tel:+' + tel + '">Ara</a><a class="btn btn-line" target="_blank" rel="noopener" href="https://wa.me/' + tel + '">WhatsApp</a></div>' +
        '<p class="small muted">Bu görüntüleme kayıt altına alınmıştır. İletişim bilgisini yalnızca bu talep için kullanabilirsiniz.</p>');
    }).catch(function (e) {
      uyari("Erişim yok", hata(e), '<a class="btn btn-gold" href="' + P + 'uyelik-paketleri">Üyelik paketleri</a><a class="btn btn-line" href="' + P + 'hesabim">Hesabım</a>');
    });
  });

  /* ---------------- şikâyet ---------------- */
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-sikayet]");
    if (!b) return;
    var id = +b.getAttribute("data-sikayet");
    modal('<h2>Şikâyet et</h2><form class="form-stack" data-sikayet-form><div class="field"><label for="s-neden">Neden</label><select id="s-neden" name="neden" required>' +
      ["Sahte veya yanıltıcı talep", "Uygunsuz içerik", "Kişisel bilgi paylaşılmış", "Tekrarlanan talep", "Diğer"].map(function (x) { return "<option>" + x + "</option>"; }).join("") +
      '</select></div><div class="field"><label for="s-acik">Açıklama (isteğe bağlı)</label><textarea id="s-acik" name="aciklama" rows="3" maxlength="600"></textarea></div>' +
      '<p class="form-err" hidden data-err></p><button class="btn btn-gold" type="submit">Gönder</button></form>');
    $("[data-sikayet-form]").addEventListener("submit", function (e2) {
      e2.preventDefault();
      var f = e2.target;
      rest("rpc/sikayet_et", { body: { p_talep: id, p_neden: f.neden.value, p_aciklama: f.aciklama.value } })
        .then(function () { uyari("Teşekkürler", "Şikâyetiniz yönetime iletildi ve incelenecek."); })
        .catch(function (er) { var x = $("[data-err]", f); x.textContent = er.message; x.hidden = false; });
    });
  });

  /* ---------------- listeleri veritabanından doldur ---------------- */
  var SECIM = "id,no,tip,kategori,tur,islem,ilce,mahalle,butce_min,butce_max,m2,oda,baslik,ozet,yayin_tarihi,olusturma";
  function listeleriDoldur() {
    $$("[data-db-list]").forEach(function (box) {
      var tip = box.getAttribute("data-tip"), lim = +box.getAttribute("data-limit") || 300, ilce = box.getAttribute("data-ilce");
      var q = "talepler?select=" + SECIM + "&durum=eq.yayinda&order=yayin_tarihi.desc&limit=" + lim + (tip && tip !== "hepsi" ? "&tip=eq." + tip : "") + (ilce ? "&ilce=eq." + encodeURIComponent(ilce) : "");
      var bosKutu = box.parentElement.querySelector("[data-db-bos]");
      rest(q).then(function (rows) {
        if (ilce) $$('[data-db-sayi][data-ilce="' + ilce.replace(/"/g, "") + '"]').forEach(function (d) { d.textContent = rows.length; });
        if (!rows.length) { box.setAttribute("data-bos", "1"); return; }
        box.innerHTML = rows.map(function (t) { return kart(t, false); }).join("");
        if (bosKutu) bosKutu.hidden = true;
        $$("[data-ornek-not]").forEach(function (n) { if (box.parentElement.contains(n) || box.closest("section").contains(n)) n.hidden = true; });
        var empty = box.parentElement.querySelector("[data-empty-db]"); if (empty) empty.hidden = true;
        if (window.__ieaFilterInit) window.__ieaFilterInit();
        if (window.__ieaFavSync) window.__ieaFavSync();
        favDbYukle();
      }).catch(function () {});
    });
  }

  /* ---------------- üst menü: giriş durumu ---------------- */
  function menuGuncelle() {
    if (!oturumVarGibi()) return;
    $$(".nav-cta").forEach(function (a) { a.href = P + "hesabim"; var s = a.querySelector("span"); if (s) s.textContent = "Hesabım"; });
  }

  /* ---------------- paketler sayfası ---------------- */
  function paketleriDoldur() {
    var box = $("[data-db-paketler]"); if (!box) return;
    Promise.all([rest("paketler?select=*&aktif=eq.true&order=sira"), ayarlar()]).then(function (r) {
      var pk = r[0], ucretli = r[1].ucretli_erisim_aktif === true;
      var notice = $("[data-lansman]"); if (notice) notice.hidden = ucretli;
      $$("[data-paket-kart]").forEach(function (el) { el.remove(); });
      var html = pk.map(function (p) {
        var fiyat = p.fiyat ? tl(p.fiyat) + " TL" : "Fiyat için yazın";
        var msg = encodeURIComponent((ucretli ? "Merhaba, İstanbul Emlak Ağı " + p.ad + " (" + p.sure_gun + " gün) almak istiyorum." : "Merhaba, " + p.ad + " açıldığında haber almak istiyorum.") + "\nAd soyad: \nEmlak ofisi: ");
        return '<div class="plan' + (p.one_cikan ? " featured" : "") + '" data-paket-kart>' + (ucretli ? (p.one_cikan ? '<span class="ribbon">En avantajlı</span>' : "") : '<span class="ribbon soon">Yakında</span>') +
          "<h3>" + esc(p.ad) + '</h3><p class="plan-days">' + p.sure_gun + ' gün</p><p class="plan-price">' + fiyat + '</p><p class="plan-desc">' + esc(p.aciklama || "") + "</p>" +
          '<ul class="ticks">' + (CFG.ucretliOzellik || []).map(function (x) { return "<li>" + (I.check || "") + esc(x) + "</li>"; }).join("") + "</ul>" +
          '<a class="btn ' + (ucretli ? "btn-gold" : "btn-line") + ' btn-block" target="_blank" rel="noopener" href="https://wa.me/' + CFG.wa + "?text=" + msg + '">' + (I.wa || "") + "<span>" + (ucretli ? "Üyelik almak istiyorum" : "Açılınca haber ver") + "</span></a></div>";
      }).join("");
      box.insertAdjacentHTML("beforeend", html);
    }).catch(function () {});
  }

  /* ---------------- Google ile giriş (ücretsiz; SMS yok) ---------------- */
  function e164(tel) { var d = digits(tel); if (d.indexOf("90") === 0 && d.length === 12) d = d.slice(2); if (d.charAt(0) === "0") d = d.slice(1); return d.length === 10 && d.charAt(0) === "5" ? "90" + d : null; }
  IEA.e164 = e164;
  var TASLAK = "iea-taslak:" + location.pathname;
  function donusAdresi(sayfa) { return new URL(sayfa ? P + sayfa : location.pathname + location.search, location.href).href.replace(/[?&](code|error|error_code|error_description)=[^&]*/g, ""); }
  function googleGiris(sayfa) {
    return sb().then(function (c) {
      return c.auth.signInWithOAuth({ provider: "google", options: { redirectTo: donusAdresi(sayfa), queryParams: { prompt: "select_account" } } });
    }).then(function (r) { if (r && r.error) throw new Error("Google ile giriş başlatılamadı: " + r.error.message); });
  }
  IEA.googleGiris = googleGiris;
  function taslakKaydet(form) {
    if (!form) return;
    var v = {};
    $$("input, select, textarea", form).forEach(function (el) {
      if (!el.name || el.type === "password") return;
      if (el.type === "checkbox") { (v[el.name] = v[el.name] || []); if (el.checked) v[el.name].push(el.value); }
      else v[el.name] = el.value;
    });
    try { sessionStorage.setItem(TASLAK, JSON.stringify(v)); } catch (e) {}
  }
  function taslakGeriYukle(form) {
    var v; try { v = JSON.parse(sessionStorage.getItem(TASLAK) || "null"); } catch (e) {}
    if (!v || !form) return false;
    Object.keys(v).forEach(function (k) {
      var els = $$('[name="' + k + '"]', form);
      els.forEach(function (el) {
        if (el.type === "checkbox") el.checked = (v[k] || []).indexOf(el.value) > -1;
        else { el.value = v[k]; el.dispatchEvent(new Event("change", { bubbles: true })); }
      });
    });
    // mahalle listesi ilçe seçilince dolar; değeri sonra tekrar ver
    setTimeout(function () { if (v.mahalle && form.mahalle) form.mahalle.value = v.mahalle; }, 400);
    try { sessionStorage.removeItem(TASLAK); } catch (e) {}
    return true;
  }
  // Oturum gerekiyorsa formu saklayıp Google girişine yönlendirir. Oturum varsa hemen devam eder.
  function girisGerekli(form, metin) {
    return IEA.oturum().then(function (s) {
      if (s) return s;
      taslakKaydet(form);
      return new Promise(function (resolve, reject) {
        modal('<h2>Google ile devam edin</h2><p>' + esc(metin || "Göndermek için Google hesabınızla giriş yapın.") + ' Yazdıklarınız bu cihazda saklandı; girişten sonra bu sayfaya döner ve <strong>bir kez daha Gönder</strong>e basarsınız.</p>' +
          '<p class="small muted">Şifre ve SMS gerekmez. Google\'dan yalnızca adınız ve e-posta adresiniz alınır.</p>' +
          '<button class="btn btn-google btn-lg btn-block" type="button" data-google-git>' + (CFG.googleG || "") + '<span>Google ile giriş yap</span></button><p class="form-err" hidden data-err></p>');
        var b = $("[data-google-git]");
        b.addEventListener("click", function () {
          b.disabled = true;
          googleGiris().catch(function (e) { b.disabled = false; var x = $("dialog.modal [data-err]"); x.textContent = e.message; x.hidden = false; });
        });
        var err = new Error(""); err.yonlendirme = true;
        dlg.addEventListener("close", function onc() { dlg.removeEventListener("close", onc); reject(err); });
      });
    });
  }
  IEA.girisGerekli = girisGerekli;
  // Google'dan dönüş: kodu oturuma çevir, adresi temizle, taslağı geri yükle
  var donusVar = /[?&](code|error_description)=/.test(location.search);
  if (donusVar) {
    var hataMesaj = new URLSearchParams(location.search).get("error_description");
    sb().then(function (c) { return c.auth.getSession(); }).then(function (r) {
      history.replaceState(null, "", donusAdresi());
      if (hataMesaj) return modal("<h2>Giriş tamamlanamadı</h2><p>" + esc(hataMesaj) + "</p><p>Lütfen tekrar deneyin.</p>");
      if (r && r.data && r.data.session) {
        menuGuncelle();
        var f = $("form[data-db-form]");
        if (f && taslakGeriYukle(f)) {
          var box = $("[data-err]", f); box.textContent = "Giriş yapıldı. Bilgileriniz geri yüklendi; kontrol edip göndermek için düğmeye basın."; box.hidden = false; box.classList.add("form-ok");
          var gonder = $("[type=submit]", f); if (gonder) gonder.scrollIntoView({ block: "center" });
        }
        document.dispatchEvent(new CustomEvent("iea:giris"));
      }
    }).catch(function () {});
  }

  /* ---------------- formlar ---------------- */
  function formHata(form, msg, el) {
    var box = $("[data-err]", form); box.classList.remove("form-ok"); if (!msg) { box.hidden = true; return; } box.textContent = msg; box.hidden = false;
    $$(".field.bad", form).forEach(function (f) { f.classList.remove("bad"); });
    if (el) { var fl = el.closest(".field"); if (fl) fl.classList.add("bad"); el.focus(); }
  }
  function zorunlular(form) {
    var req = $$("[required]", form).filter(function (el) { return el.type !== "checkbox" && !el.closest("[hidden]") && !el.disabled; });
    for (var i = 0; i < req.length; i++) {
      if (!String(req[i].value || "").trim()) {
        var lab = req[i].closest(".field") ? req[i].closest(".field").querySelector("label").textContent : "Bu alan";
        formHata(form, "Lütfen “" + lab.trim() + "” alanını doldurun.", req[i]); return false;
      }
    }
    return true;
  }
  function talepVerisi(f) {
    return {
      kategori: f.kategori.value, tur: f.tur.value, islem: f.islem.value, ilce: f.ilce.value || null, mahalle: f.mahalle.value || null,
      butce_min: digits(f.bmin.value) || null, butce_max: digits(f.bmax.value) || null, m2: digits(f.m2.value) || null, oda: f.oda ? f.oda.value || null : null,
      baslik: f.baslik.value.trim(), ozet: f.ozet.value.trim(), aciklama: f.aciklama.value.trim()
    };
  }
  function basari(form, html) {
    var done = form.parentElement.querySelector("[data-done]");
    $("[data-done-icerik]", done).innerHTML = html;
    form.hidden = true; done.hidden = false; done.focus(); done.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function bekle(form, on) { var b = $("[type=submit]", form); if (b) { b.disabled = on; b.classList.toggle("yukleniyor", on); } }

  // Vatandaş talebi
  var fV = $("form[data-db-form=vatandas]");
  if (fV) fV.addEventListener("submit", function (ev) {
    ev.preventDefault(); var f = fV; $("[data-err]", f).hidden = true;
    if (!zorunlular(f)) return;
    var a = +digits(f.bmin.value), b = +digits(f.bmax.value);
    if (a && b && a > b) return formHata(f, "En az bütçe, en fazla bütçeden büyük olamaz.", f.bmin);
    var tel = e164(f.tel.value); if (!tel) return formHata(f, "Lütfen 05 ile başlayan 11 haneli cep telefonu numaranızı yazın.", f.tel);
    if (!f.onay.checked) return formHata(f, "Devam etmek için onay kutusunu işaretleyin.", f.onay);
    bekle(f, true);
    var veri = talepVerisi(f); veri.ad_soyad = f.ad.value.trim(); veri.telefon = tel; veri.riza = true;
    veri.riza_metni = "İletişim bilgilerimin, platformun ücretli üyesi olan emlak danışmanlarıyla paylaşılmasına onay veriyorum. KVKK aydınlatma metnini okudum.";
    girisGerekli(f, "Talebinizi göndermek için Google hesabınızla giriş yapın.").then(function () { return rpc("talep_olustur", { p: veri }); }).then(function (r) {
      if (!r || !r.no) throw new Error("Talep kaydedilemedi. Lütfen tekrar deneyin.");
      bekle(f, false);
      basari(f, "<h2>Talebiniz alındı: " + esc(r.no) + "</h2><p>" + (r.durum === "yayinda" ? "Talebiniz yayına alındı." : "Talebiniz kontrol edildikten sonra özet olarak yayınlanacak.") +
        ' Talebinizi <a class="link-gold" href="' + P + 'hesabim">Hesabım</a> sayfasından görüntüleyebilir, düzenleyebilir veya kapatabilirsiniz.</p>');
    }).catch(function (e) { bekle(f, false); formHata(f, e.yonlendirme ? "" : e.message); });
  });

  // Emlakçı başvurusu
  var fE = $("form[data-db-form=emlakci]");
  if (fE) fE.addEventListener("submit", function (ev) {
    ev.preventDefault(); var f = fE; $("[data-err]", f).hidden = true;
    if (!zorunlular(f)) return;
    var tel = e164(f.tel.value); if (!tel) return formHata(f, "Lütfen 05 ile başlayan 11 haneli cep telefonu numaranızı yazın.", f.tel);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.eposta.value.trim())) return formHata(f, "Lütfen geçerli bir e-posta adresi yazın.", f.eposta);
    var ilceler = $$('input[name="ilceler"]:checked', f).map(function (x) { return x.value; });
    if (!ilceler.length) return formHata(f, "Lütfen hizmet verdiğiniz en az bir ilçe seçin.", $('input[name="ilceler"]', f));
    if (!f.onay.checked) return formHata(f, "Devam etmek için onay kutusunu işaretleyin.", f.onay);
    bekle(f, true);
    girisGerekli(f, "Başvurunuzu göndermek için Google hesabınızla giriş yapın.").then(function () {
      return rpc("emlakci_basvur", { p: { ad_soyad: f.ad.value.trim(), ofis_adi: f.ofis.value.trim(), eposta: f.eposta.value.trim(), telefon: tel, yetki_belge_no: f.yetki.value.trim(), hizmet_ilceleri: ilceler, riza_metni: "KVKK aydınlatma metnini okudum, kullanım koşullarını kabul ediyorum." } });
    }).then(function (p) {
      if (!p || p.durum !== "beklemede") throw new Error("Başvuru kaydedilemedi. Lütfen tekrar deneyin.");
      bekle(f, false);
      basari(f, "<h2>Başvurunuz alındı</h2><p>Yetki belgeniz ve bilgileriniz kontrol edildikten sonra hesabınız onaylanacak. Durumu <a class=\"link-gold\" href=\"" + P + "hesabim\">Hesabım</a> sayfasından takip edebilirsiniz.</p>");
    }).catch(function (e) { bekle(f, false); formHata(f, e.yonlendirme ? "" : e.message); });
  });

  // Emlakçı iş birliği paylaşımı (yalnızca onaylı emlakçı)
  var fI = $("form[data-db-form=isbirligi]");
  if (fI) {
    var kilit = $("[data-isb-kilit]");
    var durumKontrol = function () {
      if (!oturumVarGibi()) { kilit.hidden = false; fI.hidden = true; return; }
      rpc("profilim").then(function (p) {
        if (p && p.rol === "emlakci" && p.durum === "onayli") { kilit.hidden = true; fI.hidden = false; $("[data-isb-kim]").textContent = (p.ad_soyad || "") + (p.ofis_adi ? " · " + p.ofis_adi : ""); }
        else { kilit.hidden = false; fI.hidden = true; $("[data-isb-mesaj]").textContent = p && p.rol === "emlakci" ? "Emlakçı hesabınız henüz onaylanmadı. Onaylandıktan sonra paylaşım yapabilirsiniz." : "Paylaşım yapmak için onaylı bir emlakçı hesabıyla giriş yapmanız gerekir."; }
      }).catch(function () { kilit.hidden = false; fI.hidden = true; });
    };
    durumKontrol();
    fI.addEventListener("submit", function (ev) {
      ev.preventDefault(); var f = fI; $("[data-err]", f).hidden = true;
      if (!zorunlular(f)) return;
      var a = +digits(f.bmin.value), b = +digits(f.bmax.value);
      if (a && b && a > b) return formHata(f, "En az bütçe, en fazla bütçeden büyük olamaz.", f.bmin);
      if (!f.onay.checked) return formHata(f, "Devam etmek için onay kutusunu işaretleyin.", f.onay);
      bekle(f, true);
      var veri = talepVerisi(f); veri.riza = true; veri.riza_metni = "Paylaşım özetinin yayınlanmasını ve iletişim bilgilerimin onaylı emlakçılarla paylaşılmasını kabul ediyorum.";
      rpc("talep_olustur", { p: veri }).then(function (r) {
        if (!r || !r.no) throw new Error("Paylaşım kaydedilemedi. Lütfen tekrar deneyin.");
        bekle(f, false);
        basari(f, "<h2>Paylaşımınız alındı: " + esc(r.no) + "</h2><p>Kontrol edildikten sonra emlakçı talepleri arasında yayınlanacak. <a class=\"link-gold\" href=\"" + P + "hesabim\">Hesabım</a></p>");
      }).catch(function (e) { bekle(f, false); formHata(f, e.message); });
    });
  }

  // Başlık önerisi: ilçe/mahalle/oda/tür değiştikçe başlığı doldur (kullanıcı değiştirmediyse)
  $$("form[data-db-form]").forEach(function (f) {
    if (!f.baslik) return;
    var elle = false;
    f.baslik.addEventListener("input", function () { elle = true; });
    var oner = function () {
      if (elle) return;
      var yer = [f.ilce.value, f.mahalle && f.mahalle.value].filter(Boolean).join(" ");
      var tur = f.tur.value ? (KOD.turler[f.tur.value] || "").toLowerCase() : "";
      var isl = f.islem.value ? (KOD.islemler[f.islem.value] || "").toLowerCase() : "";
      var oda = f.oda && f.oda.value ? f.oda.value + " " : "";
      var fiil = ["satmak", "kiraya-vermek", "portfoyum-var"].indexOf(f.kategori.value) > -1 ? "" : " arıyorum";
      if (f.kategori.value === "satmak") fiil = " satıyorum"; if (f.kategori.value === "kiraya-vermek") fiil = " kiraya veriyorum";
      var s = (yer ? yer + ekDe(yer) + " " : "") + (isl && isl !== "kat karşılığı" ? isl + " " : "") + oda + (tur || "gayrimenkul") + fiil;
      if (isl === "kat karşılığı") s = (yer ? yer + ekDe(yer) + " " : "") + "kat karşılığı " + (tur || "arsa") + fiil;
      f.baslik.value = s.charAt(0).toUpperCase() + s.slice(1);
    };
    ["change", "input"].forEach(function (evn) { ["kategori", "ilce", "mahalle", "tur", "islem", "oda"].forEach(function (n) { if (f[n]) f[n].addEventListener(evn, oner); }); });
  });

  // Giriş yapmış vatandaşın formunu doldur
  if (fV && oturumVarGibi()) {
    rpc("profilim").then(function (p) {
      if (!p) return;
      if (p.ad_soyad && !fV.ad.value) fV.ad.value = p.ad_soyad;
      if (p.telefon && !fV.tel.value) fV.tel.value = telGoster(p.telefon);
    }).catch(function () {});
  }

  /* ---------------- giriş sayfası ---------------- */
  var gBox = $("[data-giris]");
  if (gBox) {
    var donus = (new URLSearchParams(location.search).get("donus") || "hesabim").replace(/\.html(?=$|\?)/, "");
    if (!/^[a-z0-9\-\/]+(\?.*)?$/i.test(donus)) donus = "hesabim";
    if (oturumVarGibi() && !donusVar) IEA.oturum().then(function (s) { if (s) location.replace(P + donus); });
    document.addEventListener("iea:giris", function () { location.replace(P + donus); });
    $$("[data-google-giris]", gBox).forEach(function (btn) {
      btn.addEventListener("click", function () {
        btn.disabled = true; $("[data-err]", gBox).hidden = true;
        googleGiris(donus).catch(function (e) { btn.disabled = false; var x = $("[data-err]", gBox); x.textContent = e.message; x.hidden = false; });
      });
    });
  }

  /* ---------------- çıkış ---------------- */
  document.addEventListener("click", function (ev) {
    if (!ev.target.closest("[data-cikis]")) return;
    ev.preventDefault();
    sb().then(function (c) { return c.auth.signOut(); }).finally(function () { try { localStorage.removeItem(STORE); sessionStorage.clear(); } catch (e) {} location.replace(P + ""); });
  });

  /* ---------------- favoriler: giriş yapılmışsa veritabanında da tutulur ---------------- */
  function favDbYukle() {
    if (!oturumVarGibi()) return;
    sb().then(function (c) { return c.from("favoriler").select("talep_id"); }).then(function (r) {
      if (r.error || !r.data) return;
      var ids = r.data.map(function (x) { return String(x.talep_id); });
      var nos = $$("[data-talep]").filter(function (k) { return ids.indexOf(k.getAttribute("data-id")) > -1; }).map(function (k) { return k.getAttribute("data-no"); });
      try { var f = JSON.parse(localStorage.getItem("iea-fav") || "[]"); nos.forEach(function (n) { if (f.indexOf(n) < 0) f.push(n); }); localStorage.setItem("iea-fav", JSON.stringify(f)); } catch (e) {}
      if (window.__ieaFavSync) window.__ieaFavSync();
    }).catch(function () {});
  }
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-fav]"); if (!b || !oturumVarGibi()) return;
    var kartEl = b.closest("[data-talep]"), id = kartEl && +kartEl.getAttribute("data-id"); if (!id) return;
    setTimeout(function () {
      var on = b.getAttribute("aria-pressed") === "true";
      Promise.all([sb(), IEA.oturum()]).then(function (r) {
        var c = r[0], s = r[1]; if (!s) return;
        return on ? c.from("favoriler").upsert({ kullanici_id: s.user.id, talep_id: id }) : c.from("favoriler").delete().eq("talep_id", id).eq("kullanici_id", s.user.id);
      }).catch(function () {});
    }, 0);
  });

  /* ---------------- başlangıç ---------------- */
  menuGuncelle();
  if (SB_URL && SB_KEY) {
    ayarlar().then(ayarUygula).catch(function () {});
    listeleriDoldur();
    paketleriDoldur();
  }
})();
