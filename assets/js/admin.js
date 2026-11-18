/* İstanbul Emlak Ağı — Yönetici paneli (rol = yönetici + iki adımlı doğrulama) */
(function () {
  "use strict";
  var A = window.IEA_APP, CFG = window.IEA || {}, KOD = CFG.kod || {}, P = CFG.base || "/";
  var root = document.querySelector("[data-yonetici]");
  if (!A || !root) return;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var dg = function (s) { return String(s || "").replace(/\D+/g, ""); };
  var gun = function (s) { return s ? new Date(s).toLocaleDateString("tr-TR") : "—"; };
  var saat = function (s) { return s ? new Date(s).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "—"; };
  var c = null;
  var DURUM_T = { inceleniyor: "İnceleniyor", yayinda: "Yayında", sonuclandi: "Sonuçlandı", iptal: "İptal", arsiv: "Arşiv", reddedildi: "Reddedildi" };
  var DURUM_K = { aktif: "Aktif", beklemede: "Onay bekliyor", onayli: "Onaylı", reddedildi: "Reddedildi", engelli: "Engelli" };
  function msg(t, hata) { var m = $("[data-admin-msg]"); if (!m) return; m.textContent = t; m.className = "admin-msg " + (hata ? "hata" : "ok"); m.hidden = false; clearTimeout(msg._t); msg._t = setTimeout(function () { m.hidden = true; }, 5000); }
  function hataGoster(e) { msg((e && e.message) || String(e), true); }

  /* ---------------- giriş + iki adımlı doğrulama ---------------- */
  function girisFormu(not) {
    root.innerHTML = '<div class="card form admin-giris"><h2>Yönetici girişi</h2>' + (not ? '<p class="notice">' + esc(not) + "</p>" : "") +
      '<button class="btn btn-google btn-lg btn-block" type="button" data-a-google>' + (CFG.googleG || "") + '<span>Google ile giriş yap</span></button>' +
      '<p class="form-err" hidden data-err></p>' +
      '<p class="small muted">Yalnızca yönetici yetkisi verilmiş Google hesabı panele girebilir. Girişten sonra telefonunuzdaki doğrulama uygulamasından (Google Authenticator, Microsoft Authenticator vb.) 6 haneli kod istenir.</p></div>';
    var btn = $("[data-a-google]");
    btn.addEventListener("click", function () {
      btn.disabled = true;
      A.googleGiris("yonetici").catch(function (e) { btn.disabled = false; var x = $("[data-err]", root); x.textContent = e.message; x.hidden = false; });
    });
  }
  function rolKontrol() {
    A.rpc("profilim").then(function (p) {
      if (!p || p.rol !== "yonetici") {
        return c.auth.signOut().then(function () { try { localStorage.removeItem("sb-" + CFG.sbUrl.replace(/^https:\/\//, "").split(".")[0] + "-auth-token"); } catch (e) {} girisFormu("Bu hesap yönetici yetkisine sahip değil. Yönetici hesabıyla giriş yapın."); });
      }
      mfa();
    }).catch(hataGoster);
  }
  function mfa() {
    c.auth.mfa.getAuthenticatorAssuranceLevel().then(function (r) {
      var d = r.data || {};
      if (d.currentLevel === "aal2") return panelAc();
      return c.auth.mfa.listFactors().then(function (lf) {
        var totp = ((lf.data || {}).totp || []).filter(function (f) { return f.status === "verified"; })[0];
        if (totp) return kodSor(totp.id);
        return kur();
      });
    }).catch(hataGoster);
  }
  function kodSor(factorId, ek) {
    root.innerHTML = '<form class="card form admin-giris" data-a-kod><h2>İki adımlı doğrulama</h2>' + (ek || "") +
      '<div class="field"><label for="a-kod">Doğrulama uygulamasındaki 6 haneli kod</label><input id="a-kod" name="kod" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></div>' +
      '<p class="form-err" hidden data-err></p><button class="btn btn-gold btn-block" type="submit">Doğrula</button></form>';
    $("[data-a-kod]").addEventListener("submit", function (ev) {
      ev.preventDefault(); var f = ev.target;
      c.auth.mfa.challengeAndVerify({ factorId: factorId, code: dg(f.kod.value) }).then(function (r) {
        if (r.error) { var x = $("[data-err]", f); x.textContent = "Kod hatalı. Telefonunuzun saatinin doğru olduğundan emin olun."; x.hidden = false; return; }
        panelAc();
      });
    });
  }
  function kur() {
    c.auth.mfa.listFactors().then(function (lf) {
      var eski = ((lf.data || {}).all || []).filter(function (f) { return f.status !== "verified"; });
      return Promise.all(eski.map(function (f) { return c.auth.mfa.unenroll({ factorId: f.id }); }));
    }).then(function () { return c.auth.mfa.enroll({ factorType: "totp", friendlyName: "Yönetici " + Date.now() }); }).then(function (r) {
      if (r.error) throw r.error;
      var t = r.data.totp, qr = String(t.qr_code || ""), m = qr.match(/^data:image\/svg\+xml;[^,]*,([\s\S]*)$/);
      if (m && m[1].trim().charAt(0) === "<") qr = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(m[1]);
      kodSor(r.data.id, '<p>Hesabınızı korumak için iki adımlı doğrulamayı bir kez kurmanız gerekiyor. Telefonunuzdaki doğrulama uygulamasıyla bu kodu okutun:</p>' +
        '<div class="qr"><img src="' + esc(qr) + '" alt="İki adımlı doğrulama QR kodu" width="264" height="264"></div>' +
        (t.uri ? '<p class="small"><a class="btn btn-ghost btn-sm" href="' + esc(t.uri) + '">Bu telefondaysanız: doğrulama uygulamasında aç</a></p>' : "") +
        '<p class="small muted">QR okutamıyorsanız uygulamada “Kurulum anahtarı gir” seçip bu anahtarı yazın (tür: zamana dayalı):</p>' +
        '<p class="totp-anahtar"><code data-anahtar>' + esc(String(t.secret || "").replace(/(.{4})/g, "$1 ").trim()) + '</code> <button class="btn btn-ghost btn-sm" type="button" data-kopyala>Kopyala</button></p>' +
        '<p class="small"><strong>Kurtarma için:</strong> Bu kurulum anahtarını kâğıda yazıp evde güvenli bir yerde saklayın; fotoğrafını çekmeyin, kimseyle paylaşmayın. Telefonunuz kaybolursa yeni telefondaki doğrulama uygulamasına bu anahtarı girerek aynı kodları yeniden alırsınız.</p>');
      var kb = $("[data-kopyala]");
      if (kb) kb.addEventListener("click", function () {
        var yaz = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t.secret) : Promise.reject();
        yaz.then(function () { kb.textContent = "Kopyalandı"; }, function () { kb.textContent = "Elle seçip kopyalayın"; });
      });
    }).catch(hataGoster);
  }

  /* ---------------- panel ---------------- */
  var SEKMELER = [["ozet", "Özet"], ["emlakcilar", "Emlakçılar"], ["talepler", "Talepler"], ["uyelikler", "Üyelikler"], ["kullanicilar", "Kullanıcılar"],
    ["sikayetler", "Şikâyetler"], ["paketler", "Paketler"], ["ayarlar", "Ayarlar"], ["mahalleler", "Mahalleler"], ["kayitlar", "Kayıtlar"]];
  function panelAc() {
    A.rpc("profilim").then(function (p) {
      if (!p || !p.yonetici_aal2) { c.auth.signOut(); return girisFormu("Bu hesap yönetici yetkisine sahip değil."); }
      root.innerHTML = '<div class="admin-ust"><p class="muted small">' + esc(p.ad_soyad || p.eposta || "Yönetici") + ' olarak giriş yapıldı</p><button class="btn btn-ghost btn-sm" type="button" data-a-cikis>Çıkış</button></div>' +
        '<nav class="admin-tabs" role="tablist">' + SEKMELER.map(function (s, i) { return '<button role="tab" type="button" data-sekme="' + s[0] + '" aria-selected="' + (i === 0) + '">' + s[1] + "</button>"; }).join("") + "</nav>" +
        '<p class="admin-msg" hidden data-admin-msg role="status"></p><div data-sekme-icerik></div>';
      $("[data-a-cikis]").addEventListener("click", function () { c.auth.signOut().then(function () { location.reload(); }); });
      $$("[data-sekme]").forEach(function (b) { b.addEventListener("click", function () { $$("[data-sekme]").forEach(function (x) { x.setAttribute("aria-selected", x === b); }); sekme(b.getAttribute("data-sekme")); }); });
      sekme(location.hash.slice(1) || "ozet");
    }).catch(hataGoster);
  }
  function icerik(html) { var el = $("[data-sekme-icerik]"); el.innerHTML = html; return el; }
  function sekme(ad) {
    var t = $('[data-sekme="' + ad + '"]'); if (t) $$("[data-sekme]").forEach(function (x) { x.setAttribute("aria-selected", x === t); });
    history.replaceState(null, "", "#" + ad);
    icerik('<p class="muted">Yükleniyor…</p>');
    ({ ozet: ozet, emlakcilar: emlakcilar, talepler: talepler, uyelikler: uyelikler, kullanicilar: kullanicilar, sikayetler: sikayetler, paketler: paketler, ayarlar: ayarlar, mahalleler: mahalleler, kayitlar: kayitlar }[ad] || ozet)();
  }

  function ozet() {
    A.rpc("admin_ozet").then(function (o) {
      var k = [["Vatandaş", o.vatandas], ["Emlakçı", o.emlakci], ["Onay bekleyen emlakçı", o.onay_bekleyen, "emlakcilar"], ["Aktif ücretli üye", o.aktif_ucretli, "uyelikler"],
        ["Süresi biten üye", o.suresi_biten, "uyelikler"], ["Yayındaki vatandaş talebi", o.yayindaki_vatandas, "talepler"], ["Yayındaki emlakçı paylaşımı", o.yayindaki_emlakci, "talepler"],
        ["İncelenecek talep", o.incelenecek, "talepler"], ["Açık şikâyet", o.acik_sikayet, "sikayetler"]];
      var ilce = Object.keys(o.ilce_dagilimi || {}).sort(function (a, b) { return o.ilce_dagilimi[b] - o.ilce_dagilimi[a]; });
      icerik('<div class="stat-grid">' + k.map(function (x) { return '<button type="button" class="stat card"' + (x[2] ? ' data-git="' + x[2] + '"' : "") + "><strong>" + (x[1] || 0) + "</strong><span>" + x[0] + "</span></button>"; }).join("") + "</div>" +
        '<h3 class="admin-h">İlçe bazında yayındaki talepler</h3>' + (ilce.length ? '<table class="admin-tablo"><thead><tr><th>İlçe</th><th>Talep</th></tr></thead><tbody>' + ilce.map(function (i) { return "<tr><td>" + esc(i) + "</td><td>" + o.ilce_dagilimi[i] + "</td></tr>"; }).join("") + "</tbody></table>" : '<p class="muted">Henüz yayında talep yok.</p>'));
      $$("[data-git]").forEach(function (b) { b.addEventListener("click", function () { sekme(b.getAttribute("data-git")); }); });
    }).catch(hataGoster);
  }

  function kullaniciSatir(u, emlakci) {
    var btn = [];
    if (emlakci && u.durum !== "onayli") btn.push('<button class="btn btn-gold btn-sm" data-k-durum="onayli" data-id="' + u.id + '">Onayla</button>');
    if (emlakci && u.durum === "beklemede") btn.push('<button class="btn btn-ghost btn-sm" data-k-durum="reddedildi" data-id="' + u.id + '">Reddet</button>');
    if (emlakci && u.durum === "onayli") btn.push('<button class="btn btn-line btn-sm" data-uyelik-ekle="' + u.id + '" data-ad="' + esc(u.ad_soyad || "") + '">Üyelik tanımla</button>');
    if (u.durum !== "engelli") btn.push('<button class="btn btn-ghost btn-sm" data-k-durum="engelli" data-id="' + u.id + '">Engelle</button>');
    else btn.push('<button class="btn btn-ghost btn-sm" data-k-durum="' + (emlakci ? "beklemede" : "aktif") + '" data-id="' + u.id + '">Engeli kaldır</button>');
    btn.push('<button class="btn btn-ghost btn-sm" data-k-sil="' + u.id + '">Sil</button>');
    return '<div class="satir card"><div class="satir-ana"><div class="satir-ust"><span class="durum ' + ({ onayli: "yesil", beklemede: "sari", reddedildi: "kirmizi", engelli: "kirmizi" }[u.durum] || "gri") + '">' + (DURUM_K[u.durum] || u.durum) + "</span>" +
      (u.uyelik_bitis ? '<span class="durum yesil">Ücretli · ' + gun(u.uyelik_bitis) + "</span>" : (u.son_uyelik_bitis ? '<span class="durum gri">Üyelik bitti · ' + gun(u.son_uyelik_bitis) + "</span>" : "")) + "</div>" +
      "<h3>" + esc(u.ad_soyad || "(adsız)") + (u.ofis_adi ? " · " + esc(u.ofis_adi) : "") + "</h3>" +
      '<p class="small muted">' + esc(A.fmt.tel(u.telefon || "")) + (u.eposta ? " · " + esc(u.eposta) : "") + (u.yetki_belge_no ? " · Yetki belgesi: " + esc(u.yetki_belge_no) : "") + " · Kayıt: " + gun(u.olusturma) + " · " + (u.talep_sayisi || 0) + " talep</p>" +
      (u.hizmet_ilceleri && u.hizmet_ilceleri.length ? '<p class="small muted">İlçeler: ' + esc(u.hizmet_ilceleri.join(", ")) + "</p>" : "") +
      (u.red_nedeni ? '<p class="small red-text">Red nedeni: ' + esc(u.red_nedeni) + "</p>" : "") + '</div><div class="satir-btn">' + btn.join("") + "</div></div>";
  }
  function emlakcilar() {
    var el = icerik('<div class="admin-filtre"><select data-f-durum><option value="beklemede">Onay bekleyenler</option><option value="onayli">Onaylılar</option><option value="reddedildi">Reddedilenler</option><option value="engelli">Engelliler</option><option value="">Tümü</option></select><input type="search" placeholder="Ad, telefon, ofis ara" data-f-ara></div><div data-liste></div>');
    var yukle = function () {
      A.rpc("admin_kullanicilar", { p_arama: $("[data-f-ara]", el).value.trim() || null, p_rol: "emlakci", p_durum: $("[data-f-durum]", el).value || null }).then(function (l) {
        $("[data-liste]", el).innerHTML = l.length ? l.map(function (u) { return kullaniciSatir(u, true); }).join("") : '<p class="muted">Kayıt yok.</p>';
      }).catch(hataGoster);
    };
    $("[data-f-durum]", el).addEventListener("change", yukle); $("[data-f-ara]", el).addEventListener("input", debounce(yukle)); yukle(); el._yukle = yukle;
  }
  function kullanicilar() {
    var el = icerik('<div class="admin-filtre"><select data-f-rol><option value="">Tüm roller</option><option value="vatandas">Vatandaş</option><option value="emlakci">Emlakçı</option><option value="yonetici">Yönetici</option></select><input type="search" placeholder="Ad, telefon, e-posta ara" data-f-ara></div><div data-liste></div>');
    var yukle = function () {
      A.rpc("admin_kullanicilar", { p_arama: $("[data-f-ara]", el).value.trim() || null, p_rol: $("[data-f-rol]", el).value || null, p_durum: null }).then(function (l) {
        $("[data-liste]", el).innerHTML = l.length ? l.map(function (u) { return u.rol === "yonetici" ? '<div class="satir card"><div class="satir-ana"><h3>' + esc(u.ad_soyad || u.eposta || "Yönetici") + '</h3><p class="small muted">Yönetici</p></div></div>' : kullaniciSatir(u, u.rol === "emlakci"); }).join("") : '<p class="muted">Kayıt yok.</p>';
      }).catch(hataGoster);
    };
    $("[data-f-rol]", el).addEventListener("change", yukle); $("[data-f-ara]", el).addEventListener("input", debounce(yukle)); yukle(); el._yukle = yukle;
  }

  function talepSatir(t) {
    var b = [];
    if (t.durum !== "yayinda") b.push('<button class="btn btn-gold btn-sm" data-t-durum="yayinda" data-id="' + t.id + '">Yayınla</button>');
    if (t.durum === "inceleniyor") b.push('<button class="btn btn-ghost btn-sm" data-t-durum="reddedildi" data-id="' + t.id + '">Reddet</button>');
    if (t.durum === "yayinda") b.push('<button class="btn btn-ghost btn-sm" data-t-durum="arsiv" data-id="' + t.id + '">Arşivle</button><button class="btn btn-ghost btn-sm" data-t-durum="sonuclandi" data-id="' + t.id + '">Sonuçlandı</button>');
    b.push('<button class="btn btn-line btn-sm" data-t-duzenle="' + t.id + '">Düzenle</button><button class="btn btn-ghost btn-sm" data-t-goruntuleme="' + t.id + '">Görüntülemeler (' + (t.goruntulenme || 0) + ')</button><button class="btn btn-ghost btn-sm" data-t-sil="' + t.id + '">Sil</button>');
    var kat = (t.tip === "emlakci" ? KOD.emlakci_kategorileri : KOD.vatandas_kategorileri)[t.kategori] || t.kategori;
    return '<div class="satir card"><div class="satir-ana"><div class="satir-ust"><span class="durum ' + ({ yayinda: "yesil", inceleniyor: "sari", reddedildi: "kirmizi" }[t.durum] || "gri") + '">' + (DURUM_T[t.durum] || t.durum) + '</span><span class="badge">' + esc(kat) + "</span>" + (t.sikayet ? '<span class="durum kirmizi">' + t.sikayet + " şikâyet</span>" : "") + '<span class="tcard-no">' + esc(t.no) + " · " + saat(t.olusturma) + "</span></div>" +
      "<h3>" + esc(t.baslik) + '</h3><p class="small muted">' + esc([t.ilce, t.mahalle].filter(Boolean).join(" / ") || "İstanbul geneli") + " · " + esc(A.fmt.butce(t)) + " · " + esc([KOD.turler[t.tur], KOD.islemler[t.islem], t.oda, t.m2 ? t.m2 + " m²" : ""].filter(Boolean).join(" · ")) + "</p>" +
      '<p class="small"><strong>Özet:</strong> ' + esc(t.ozet) + '</p><p class="small"><strong>Detay:</strong> ' + esc(t.aciklama || "") + "</p>" +
      '<p class="small muted">' + esc(t.ad_soyad || "") + (t.ofis_adi ? " · " + esc(t.ofis_adi) : "") + " · " + esc(A.fmt.tel(t.telefon || "")) + (t.yayin_bitis ? " · Yayın bitişi: " + gun(t.yayin_bitis) : "") + "</p>" +
      (t.red_nedeni ? '<p class="small red-text">Red nedeni: ' + esc(t.red_nedeni) + "</p>" : "") + '</div><div class="satir-btn">' + b.join("") + "</div></div>";
  }
  function talepler() {
    var el = icerik('<div class="admin-filtre"><select data-f-durum><option value="inceleniyor">İncelenecekler</option><option value="yayinda">Yayında</option><option value="reddedildi">Reddedilenler</option><option value="arsiv">Arşiv</option><option value="sonuclandi">Sonuçlananlar</option><option value="iptal">İptaller</option><option value="">Tümü</option></select>' +
      '<select data-f-tip><option value="">Vatandaş + emlakçı</option><option value="vatandas">Vatandaş talepleri</option><option value="emlakci">Emlakçı paylaşımları</option></select><input type="search" placeholder="No, başlık, ad, telefon ara" data-f-ara></div><div data-liste></div>');
    var yukle = function () {
      A.rpc("admin_talepler", { p_durum: $("[data-f-durum]", el).value || null, p_tip: $("[data-f-tip]", el).value || null, p_arama: $("[data-f-ara]", el).value.trim() || null }).then(function (l) {
        el._liste = l;
        $("[data-liste]", el).innerHTML = l.length ? l.map(talepSatir).join("") : '<p class="muted">Kayıt yok.</p>';
      }).catch(hataGoster);
    };
    ["[data-f-durum]", "[data-f-tip]"].forEach(function (s) { $(s, el).addEventListener("change", yukle); }); $("[data-f-ara]", el).addEventListener("input", debounce(yukle)); yukle(); el._yukle = yukle;
  }

  function waHatirlat(u) {
    var t = A.e164(u.telefon || ""); if (!t) return "";
    var m = "Merhaba " + (u.ad_soyad || "") + ", İstanbul Emlak Ağı üyeliğiniz " + gun(u.bitis) + " tarihinde sona eriyor. Uzatmak isterseniz bu mesaja yanıt verebilirsiniz.";
    return '<a class="btn btn-gold btn-sm" target="_blank" rel="noopener" href="https://wa.me/' + t + "?text=" + encodeURIComponent(m) + '">WhatsApp ile hatırlat</a>';
  }
  function uyelikler() {
    var el = icerik('<div data-yaklasan></div><div class="admin-filtre"><select data-f><option value="aktif">Aktif üyelikler</option><option value="biten">Süresi bitenler</option><option value="">Tüm kayıtlar</option></select></div><div data-liste></div>');
    var yukle = function () {
      A.rpc("admin_uyelikler", { p_emlakci: null }).then(function (l) {
        var f = $("[data-f]", el).value, simdi = Date.now();
        l = l.filter(function (u) { return !f || (f === "aktif" ? u.aktif_mi : (!u.aktif_mi)); });
        $("[data-liste]", el).innerHTML = l.length ? l.map(function (u) {
          var kalan = Math.ceil((new Date(u.bitis) - simdi) / 864e5);
          return '<div class="satir card"><div class="satir-ana"><div class="satir-ust"><span class="durum ' + (u.durum === "iptal" ? "kirmizi" : u.aktif_mi ? "yesil" : "gri") + '">' + (u.durum === "iptal" ? "İptal" : u.aktif_mi ? "Aktif · " + kalan + " gün" : (new Date(u.baslangic) > simdi ? "Başlamadı" : "Süresi bitti")) + "</span>" +
            '<span class="durum ' + (u.odeme_durumu === "odendi" ? "yesil" : "sari") + '">' + (u.odeme_durumu === "odendi" ? "Ödendi" : "Ödeme bekleniyor") + "</span></div>" +
            "<h3>" + esc(u.ad_soyad || "") + (u.ofis_adi ? " · " + esc(u.ofis_adi) : "") + " — " + esc(u.paket_ad || u.paket_id || "") + "</h3>" +
            '<p class="small muted">' + gun(u.baslangic) + " → " + gun(u.bitis) + (u.tutar ? " · " + A.fmt.tl(u.tutar) + " TL" : "") + (u.odeme_tarihi ? " · Ödeme: " + gun(u.odeme_tarihi) : "") + " · " + esc(A.fmt.tel(u.telefon || "")) + "</p>" +
            (u.notlar ? '<p class="small">Not: ' + esc(u.notlar) + "</p>" : "") + '</div><div class="satir-btn">' +
            '<button class="btn btn-line btn-sm" data-u-uzat="' + u.id + '" data-bitis="' + u.bitis + '">Uzat / bitiş değiştir</button>' +
            (u.odeme_durumu !== "odendi" ? '<button class="btn btn-gold btn-sm" data-u-odendi="' + u.id + '">Ödendi işaretle</button>' : "") +
            (u.durum !== "iptal" ? '<button class="btn btn-ghost btn-sm" data-u-iptal="' + u.id + '">İptal et</button>' : "") +
            '<button class="btn btn-ghost btn-sm" data-u-gecmis="' + u.id + '">Geçmiş</button></div></div>';
        }).join("") : '<p class="muted">Kayıt yok.</p>';
      }).catch(hataGoster);
    };
    $("[data-f]", el).addEventListener("change", yukle); yukle(); el._yukle = yukle;
    A.rpc("admin_hatirlatmalar").then(function (l) {
      $("[data-yaklasan]", el).innerHTML = l.length ? '<div class="notice"><p><strong>Bitişi 7 gün içinde olan ' + l.length + " üyelik.</strong> Ücretli SMS kullanılmadığı için hatırlatmayı WhatsApp ile siz gönderirsiniz.</p></div>" +
        l.map(function (u) { return '<div class="satir card"><div class="satir-ana"><div class="satir-ust"><span class="durum ' + (u.kalan_gun <= 3 ? "kirmizi" : "sari") + '">' + u.kalan_gun + " gün kaldı</span></div><h3>" + esc(u.ad_soyad || "") + (u.ofis_adi ? " · " + esc(u.ofis_adi) : "") + '</h3><p class="small muted">Bitiş: ' + gun(u.bitis) + " · " + esc(A.fmt.tel(u.telefon || "")) + '</p></div><div class="satir-btn">' + waHatirlat(u) + "</div></div>"; }).join("") : "";
    }).catch(function () {});
  }

  function sikayetler() {
    var el = icerik("<div data-liste></div>");
    var yukle = function () {
      A.rpc("admin_sikayetler").then(function (l) {
        $("[data-liste]", el).innerHTML = l.length ? l.map(function (s) {
          return '<div class="satir card"><div class="satir-ana"><div class="satir-ust"><span class="durum ' + (s.durum === "acik" ? "sari" : "gri") + '">' + (s.durum === "acik" ? "Açık" : "İncelendi") + '</span><span class="tcard-no">' + saat(s.zaman) + "</span></div><h3>" + esc(s.neden) + " — " + esc(s.talep_no || "") + '</h3><p class="small muted">' + esc(s.talep_baslik || "") + " (" + (DURUM_T[s.talep_durum] || s.talep_durum || "") + ")</p>" + (s.aciklama ? '<p class="small">' + esc(s.aciklama) + "</p>" : "") +
            '</div><div class="satir-btn">' + (s.durum === "acik" ? '<button class="btn btn-gold btn-sm" data-s-incelendi="' + s.id + '">İncelendi</button>' : "") + '<button class="btn btn-ghost btn-sm" data-s-talep="' + esc(s.talep_no || "") + '">Talebi aç</button></div></div>';
        }).join("") : '<p class="muted">Şikâyet yok.</p>';
      }).catch(hataGoster);
    };
    yukle(); el._yukle = yukle;
  }

  function paketler() {
    var el = icerik('<p class="small muted">Fiyatı boş bırakılan paket sitede “Fiyat için yazın” olarak görünür. Ücretli paketlerin sitede satın alınabilir görünmesi için Ayarlar’dan ücretli erişimi açın.</p><div data-liste></div><button class="btn btn-line btn-sm" type="button" data-p-yeni>Yeni paket</button>');
    var yukle = function () {
      c.from("paketler").select("*").order("sira").then(function (r) {
        if (r.error) throw r.error;
        $("[data-liste]", el).innerHTML = '<div class="table-wrap"><table class="admin-tablo"><thead><tr><th>Kod</th><th>Ad</th><th>Süre (gün)</th><th>Fiyat (TL)</th><th>Açıklama</th><th>Yayında</th><th>Öne çıkan</th><th>Sıra</th><th></th></tr></thead><tbody>' +
          r.data.map(function (p) {
            return '<tr data-paket="' + esc(p.id) + '"><td>' + esc(p.id) + '</td><td><input name="ad" value="' + esc(p.ad) + '"></td><td><input name="sure_gun" inputmode="numeric" value="' + p.sure_gun + '" size="4"></td><td><input name="fiyat" inputmode="decimal" value="' + (p.fiyat == null ? "" : p.fiyat) + '" size="7"></td>' +
              '<td><input name="aciklama" value="' + esc(p.aciklama || "") + '"></td><td><input type="checkbox" name="aktif"' + (p.aktif ? " checked" : "") + '></td><td><input type="checkbox" name="one_cikan"' + (p.one_cikan ? " checked" : "") + '></td><td><input name="sira" inputmode="numeric" value="' + p.sira + '" size="2"></td><td><button class="btn btn-gold btn-sm" data-p-kaydet>Kaydet</button></td></tr>';
          }).join("") + "</tbody></table></div>";
      }).catch(hataGoster);
    };
    el.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-p-kaydet]");
      if (b) {
        var tr = b.closest("tr"), g = function (n) { return tr.querySelector('[name="' + n + '"]'); };
        var v = { id: tr.getAttribute("data-paket"), ad: g("ad").value.trim(), sure_gun: +dg(g("sure_gun").value) || 30, fiyat: g("fiyat").value.trim() ? +g("fiyat").value.replace(",", ".") : null, aciklama: g("aciklama").value.trim(), aktif: g("aktif").checked, one_cikan: g("one_cikan").checked, sira: +dg(g("sira").value) || 0 };
        c.from("paketler").upsert(v).then(function (r) { if (r.error) throw r.error; msg("Paket kaydedildi."); sessionStorage.removeItem("iea-ayar"); }).catch(hataGoster);
      }
      if (ev.target.closest("[data-p-yeni]")) {
        var id = prompt("Yeni paket kodu (küçük harf, tire ile; ör. uc-aylik):"); if (!id) return;
        c.from("paketler").insert({ id: id.toLowerCase().replace(/[^a-z0-9-]/g, "-"), ad: "Yeni paket", sure_gun: 30, aktif: false, sira: 9 }).then(function (r) { if (r.error) throw r.error; yukle(); }).catch(hataGoster);
      }
    });
    yukle();
  }

  function ayarlar() {
    c.from("ayarlar").select("*").then(function (r) {
      if (r.error) throw r.error;
      var a = {}; r.data.forEach(function (x) { a[x.anahtar] = x.deger; });
      var w = a.whatsapp || {}, ana = a.ana_sayfa || {}, m = a.metinler || {}, acik = a.ucretli_erisim_aktif === true;
      var el = icerik('<form class="card form" data-ayar-form><h3 class="admin-h">İletişim</h3><div class="form-grid">' +
        '<div class="field"><label for="ay-wa">WhatsApp numarası (90 ile, boşluksuz)</label><input id="ay-wa" name="wa" inputmode="numeric" value="' + esc(w.numara || "") + '"></div>' +
        '<div class="field"><label for="ay-wag">Sitede görünen yazım</label><input id="ay-wag" name="wag" value="' + esc(w.gosterim || "") + '"></div></div>' +
        '<h3 class="admin-h">Üyelik ve talepler</h3><label class="check"><input type="checkbox" name="ucretli"' + (a.ucretli_erisim_aktif === true ? " checked" : "") + '><span><strong>Ücretli erişim açık</strong> — açıkken aktif ücretli üyeler vatandaş taleplerinin detayını ve iletişim bilgisini görür; kapalıyken kimse göremez (lansman dönemi).</span></label>' +
        erisimTablosu(acik) +
        '<label class="check"><input type="checkbox" name="otomatik"' + (a.talep_otomatik_yayin === true ? " checked" : "") + '><span>Yeni talepler onay beklemeden yayınlansın</span></label>' +
        '<div class="form-grid"><div class="field"><label for="ay-gun">Talep yayın süresi (gün)</label><input id="ay-gun" name="gun" inputmode="numeric" value="' + esc(a.talep_yayin_gun || 60) + '"></div></div>' +
        '<h3 class="admin-h">Ana sayfa metinleri</h3><div class="field"><label for="ay-b">Başlık</label><input id="ay-b" name="baslik" value="' + esc(ana.baslik || "") + '"></div>' +
        '<div class="field"><label for="ay-a">Alt açıklama</label><textarea id="ay-a" name="alt" rows="2">' + esc(ana.alt_aciklama || "") + "</textarea></div>" +
        '<h3 class="admin-h">Yasal metinler</h3><p class="small muted">Boş bırakılırsa sitedeki mevcut metin kullanılır. Başlık için satır başına “## ”, madde için “- ” yazın.</p>' +
        '<div class="field"><label for="ay-kvkk">KVKK aydınlatma metni</label><textarea id="ay-kvkk" name="kvkk" rows="8">' + esc(m.kvkk || "") + "</textarea></div>" +
        '<div class="field"><label for="ay-kul">Kullanım koşulları</label><textarea id="ay-kul" name="kullanim" rows="8">' + esc(m.kullanim || "") + "</textarea></div>" +
        '<button class="btn btn-gold" type="submit">Ayarları kaydet</button></form>');
      var kutu = $('[name="ucretli"]', el);
      kutu.addEventListener("change", function () { var t = $("[data-erisim-tablosu]", el); t.outerHTML = erisimTablosu(kutu.checked, true); });
      $("[data-ayar-form]", el).addEventListener("submit", function (ev) {
        ev.preventDefault(); var f = ev.target, wa = dg(f.wa.value);
        if (!/^90\d{10}$/.test(wa)) return msg("WhatsApp numarası 90 ile başlamalı ve 12 haneli olmalı (ör. 905520928085).", true);
        var isler = [["whatsapp", { numara: wa, gosterim: f.wag.value.trim() }], ["ucretli_erisim_aktif", f.ucretli.checked], ["talep_otomatik_yayin", f.otomatik.checked],
          ["talep_yayin_gun", +dg(f.gun.value) || 60], ["ana_sayfa", { baslik: f.baslik.value.trim(), alt_aciklama: f.alt.value.trim() }],
          ["metinler", { kvkk: f.kvkk.value, kullanim: f.kullanim.value }]];
        Promise.all(isler.map(function (x) { return A.rpc("admin_ayar_kaydet", { p_anahtar: x[0], p_deger: x[1] }); }))
          .then(function () { sessionStorage.removeItem("iea-ayar"); msg("Ayarlar kaydedildi. Sitede birkaç dakika içinde görünür."); }).catch(hataGoster);
      });
    }).catch(hataGoster);
  }

  // Kim neyi görür: ücretli erişim kapalı/açık durumunda gerçek sistem kuralları (talep_detay fonksiyonuyla aynı)
  function erisimTablosu(acik, onizleme) {
    var V = "✓ Görür", X = "✗ Göremez";
    var satir = [
      ["Ziyaretçi (giriş yapmamış)", "Talep özetleri", X, X],
      ["Vatandaş (kendi talebi)", "Kendi talebinin tamamı", V + " (yalnız kendi talebi)", X],
      ["Onay bekleyen emlakçı", "Talep özetleri", X, X],
      ["Onaylı emlakçı, ücretli üyeliği yok", "Özetler + iş birliği paylaşımlarının tamamı", X, V],
      ["Onaylı emlakçı, aktif ücretli üye", "Özetler + iş birliği paylaşımları", acik ? V : X, V],
      ["Üyeliği bitmiş emlakçı", "Özetler + iş birliği paylaşımları", X, V],
      ["Yönetici", "Her şey", V, V]
    ];
    return '<div data-erisim-tablosu><p class="small"><strong>Şu anki durum' + (onizleme ? " (kaydetmeden önce önizleme)" : "") + ": ücretli erişim " + (acik ? "AÇIK" : "KAPALI") + "</strong></p>" +
      '<div class="table-wrap" tabindex="0" role="region" aria-label="Rol ve erişim tablosu"><table class="admin-tablo"><thead><tr><th>Rol</th><th>Her zaman görür</th><th>Vatandaşın adı, telefonu, tam açıklaması</th><th>Emlakçı paylaşımlarının iletişim bilgisi</th></tr></thead><tbody>' +
      satir.map(function (r) { return "<tr><th scope=\"row\">" + r[0] + "</th><td>" + r[1] + "</td><td>" + r[2] + "</td><td>" + r[3] + "</td></tr>"; }).join("") + "</tbody></table></div></div>";
  }

  function mahalleler() {
    var el = icerik('<div class="admin-filtre"><select data-f-ilce>' + (CFG.ilceListesi || []).map(function (i) { return "<option>" + esc(i) + "</option>"; }).join("") + '</select><input placeholder="Yeni mahalle adı" data-yeni-mah><button class="btn btn-gold btn-sm" type="button" data-mah-ekle>Ekle</button></div><div data-liste></div>');
    var yukle = function () {
      c.from("mahalleler").select("*").eq("ilce", $("[data-f-ilce]", el).value).order("ad").then(function (r) {
        if (r.error) throw r.error;
        $("[data-liste]", el).innerHTML = '<div class="mah-list">' + r.data.map(function (m) { return '<div class="mah" data-mah="' + m.id + '"><input value="' + esc(m.ad) + '" aria-label="Mahalle adı"><label class="check sm"><input type="checkbox"' + (m.aktif ? " checked" : "") + '><span>Aktif</span></label><button class="btn btn-ghost btn-sm" data-mah-kaydet>Kaydet</button></div>'; }).join("") + "</div>";
      }).catch(hataGoster);
    };
    $("[data-f-ilce]", el).addEventListener("change", yukle);
    el.addEventListener("click", function (ev) {
      if (ev.target.closest("[data-mah-ekle]")) {
        var ad = $("[data-yeni-mah]", el).value.trim(); if (!ad) return;
        c.from("mahalleler").insert({ ilce: $("[data-f-ilce]", el).value, ad: ad }).then(function (r) { if (r.error) throw r.error; $("[data-yeni-mah]", el).value = ""; msg("Mahalle eklendi."); yukle(); }).catch(hataGoster);
      }
      var k = ev.target.closest("[data-mah-kaydet]");
      if (k) {
        var row = k.closest("[data-mah]");
        c.from("mahalleler").update({ ad: row.querySelector("input").value.trim(), aktif: row.querySelector("[type=checkbox]").checked }).eq("id", +row.getAttribute("data-mah")).then(function (r) { if (r.error) throw r.error; msg("Kaydedildi."); }).catch(hataGoster);
      }
    });
    yukle();
  }

  function kayitlar() {
    var el = icerik('<h3 class="admin-h">İletişim bilgisi görüntülemeleri (son 500)</h3><div data-g></div><h3 class="admin-h">Yönetici işlemleri</h3><div data-y></div>');
    A.rpc("admin_goruntulemeler", { p_talep: null }).then(function (l) {
      $("[data-g]", el).innerHTML = l.length ? '<div class="table-wrap"><table class="admin-tablo"><thead><tr><th>Zaman</th><th>Emlakçı</th><th>Talep</th></tr></thead><tbody>' + l.map(function (g) { return "<tr><td>" + saat(g.zaman) + "</td><td>" + esc(g.emlakci || "") + (g.ofis_adi ? " · " + esc(g.ofis_adi) : "") + "<br><small>" + esc(A.fmt.tel(g.telefon || "")) + "</small></td><td>" + esc(g.talep_no || "") + " · " + esc(g.talep_baslik || "") + "</td></tr>"; }).join("") + "</tbody></table></div>" : '<p class="muted">Kayıt yok.</p>';
    }).catch(hataGoster);
    c.from("yonetici_kayitlari").select("*").order("zaman", { ascending: false }).limit(200).then(function (r) {
      $("[data-y]", el).innerHTML = (r.data || []).length ? '<div class="table-wrap"><table class="admin-tablo"><thead><tr><th>Zaman</th><th>İşlem</th><th>Hedef</th><th>Ayrıntı</th></tr></thead><tbody>' + r.data.map(function (k) { return "<tr><td>" + saat(k.zaman) + "</td><td>" + esc(k.islem) + "</td><td>" + esc(k.hedef || "") + "</td><td><small>" + esc(JSON.stringify(k.detay || "")).slice(0, 160) + "</small></td></tr>"; }).join("") + "</tbody></table></div>" : '<p class="muted">Kayıt yok.</p>';
    });
  }

  /* ---------------- işlemler ---------------- */
  function yenile() { var el = $("[data-sekme-icerik]"); if (el && el.firstElementChild) { var y = el._yukle; } var aktif = $('[data-sekme][aria-selected="true"]'); sekme(aktif ? aktif.getAttribute("data-sekme") : "ozet"); }
  function debounce(fn) { var t; return function () { clearTimeout(t); t = setTimeout(fn, 300); }; }
  root.addEventListener("click", function (ev) {
    var b;
    if ((b = ev.target.closest("[data-k-durum]"))) {
      var d = b.getAttribute("data-k-durum"), neden = null;
      if (d === "reddedildi") { neden = prompt("Red nedeni (emlakçıya gösterilir):"); if (neden === null) return; }
      if (d === "engelli" && !confirm("Kullanıcı engellensin mi? Yayındaki talepleri arşive alınır.")) return;
      A.rpc("admin_kullanici_durum", { p_id: b.getAttribute("data-id"), p_durum: d, p_neden: neden }).then(function () { msg("Kullanıcı durumu güncellendi."); yenile(); }).catch(hataGoster);
    } else if ((b = ev.target.closest("[data-k-sil]"))) {
      if (!confirm("Kullanıcı ve tüm verileri kalıcı olarak silinecek. Emin misiniz?")) return;
      A.rpc("admin_kullanici_sil", { p_id: b.getAttribute("data-k-sil") }).then(function () { msg("Kullanıcı silindi."); yenile(); }).catch(hataGoster);
    } else if ((b = ev.target.closest("[data-uyelik-ekle]"))) {
      uyelikModal(b.getAttribute("data-uyelik-ekle"), b.getAttribute("data-ad"));
    } else if ((b = ev.target.closest("[data-t-durum]"))) {
      var td = b.getAttribute("data-t-durum"), tn = null;
      if (td === "reddedildi") { tn = prompt("Red nedeni (talep sahibine gösterilir):"); if (tn === null) return; }
      A.rpc("admin_talep_durum", { p_id: +b.getAttribute("data-id"), p_durum: td, p_neden: tn }).then(function () { msg("Talep güncellendi."); yenile(); }).catch(hataGoster);
    } else if ((b = ev.target.closest("[data-t-sil]"))) {
      if (!confirm("Talep ve içindeki kişisel bilgiler kalıcı olarak silinecek. Emin misiniz?")) return;
      A.rpc("talep_sil", { p_id: +b.getAttribute("data-t-sil") }).then(function () { msg("Talep silindi."); yenile(); }).catch(hataGoster);
    } else if ((b = ev.target.closest("[data-t-duzenle]"))) {
      talepDuzenle(+b.getAttribute("data-t-duzenle"));
    } else if ((b = ev.target.closest("[data-t-goruntuleme]"))) {
      A.rpc("admin_goruntulemeler", { p_talep: +b.getAttribute("data-t-goruntuleme") }).then(function (l) {
        A.modal("<h2>İletişim bilgisi görüntülemeleri</h2>" + (l.length ? '<table class="admin-tablo"><tbody>' + l.map(function (g) { return "<tr><td>" + saat(g.zaman) + "</td><td>" + esc(g.emlakci || "") + (g.ofis_adi ? " · " + esc(g.ofis_adi) : "") + "</td></tr>"; }).join("") + "</tbody></table>" : '<p class="muted">Henüz görüntülenmedi.</p>'));
      }).catch(hataGoster);
    } else if ((b = ev.target.closest("[data-u-uzat]"))) {
      var mevcut = new Date(b.getAttribute("data-bitis"));
      A.modal('<h2>Üyeliği uzat</h2><form class="form-stack" data-uzat-form><div class="actions"><button type="button" class="btn btn-line btn-sm" data-ekle-gun="30">+30 gün</button><button type="button" class="btn btn-line btn-sm" data-ekle-gun="90">+90 gün</button><button type="button" class="btn btn-line btn-sm" data-ekle-gun="365">+365 gün</button></div>' +
        '<div class="field"><label for="u-bitis">Yeni bitiş tarihi</label><input id="u-bitis" name="bitis" type="date" required value="' + mevcut.toISOString().slice(0, 10) + '"></div><div class="field"><label for="u-not">Not</label><input id="u-not" name="notlar"></div><button class="btn btn-gold" type="submit">Kaydet</button></form>');
      var f = $("[data-uzat-form]"), id = +b.getAttribute("data-u-uzat");
      $$("[data-ekle-gun]", f).forEach(function (x) { x.addEventListener("click", function () { var d0 = new Date(Math.max(mevcut, new Date())); d0.setDate(d0.getDate() + +x.getAttribute("data-ekle-gun")); f.bitis.value = d0.toISOString().slice(0, 10); }); });
      f.addEventListener("submit", function (e2) {
        e2.preventDefault();
        var p = { bitis: f.bitis.value + "T23:59:00+03:00", islem: "uzatildi" }; if (f.notlar.value.trim()) p.notlar = f.notlar.value.trim();
        A.rpc("admin_uyelik_guncelle", { p_id: id, p: p }).then(function () { A.kapat(); msg("Üyelik bitişi güncellendi."); yenile(); }).catch(hataGoster);
      });
    } else if ((b = ev.target.closest("[data-u-odendi]"))) {
      A.modal('<h2>Ödeme kaydı</h2><form class="form-stack" data-odeme-form><div class="field"><label for="o-tutar">Tutar (TL)</label><input id="o-tutar" name="tutar" inputmode="decimal" required></div><div class="field"><label for="o-tarih">Ödeme tarihi</label><input id="o-tarih" name="tarih" type="date" required value="' + new Date().toISOString().slice(0, 10) + '"></div><div class="field"><label for="o-not">Not</label><input id="o-not" name="notlar"></div><button class="btn btn-gold" type="submit">Ödendi olarak kaydet</button></form>');
      var fo = $("[data-odeme-form]"), uid = +b.getAttribute("data-u-odendi");
      fo.addEventListener("submit", function (e3) {
        e3.preventDefault();
        A.rpc("admin_uyelik_guncelle", { p_id: uid, p: { odeme_durumu: "odendi", tutar: fo.tutar.value.replace(",", "."), odeme_tarihi: fo.tarih.value, notlar: fo.notlar.value || undefined, islem: "odendi" } })
          .then(function () { A.kapat(); msg("Ödeme kaydedildi."); yenile(); }).catch(hataGoster);
      });
    } else if ((b = ev.target.closest("[data-u-iptal]"))) {
      if (!confirm("Üyelik iptal edilsin mi? Detay erişimi hemen kapanır.")) return;
      A.rpc("admin_uyelik_guncelle", { p_id: +b.getAttribute("data-u-iptal"), p: { durum: "iptal", islem: "iptal" } }).then(function () { msg("Üyelik iptal edildi."); yenile(); }).catch(hataGoster);
    } else if ((b = ev.target.closest("[data-u-gecmis]"))) {
      c.from("uyelik_hareketleri").select("*").eq("uyelik_id", +b.getAttribute("data-u-gecmis")).order("zaman").then(function (r) {
        A.modal("<h2>Üyelik geçmişi</h2>" + '<table class="admin-tablo"><tbody>' + (r.data || []).map(function (h) { return "<tr><td>" + saat(h.zaman) + "</td><td>" + esc(h.islem) + "</td><td><small>" + esc(JSON.stringify(h.detay || {})).slice(0, 200) + "</small></td></tr>"; }).join("") + "</tbody></table>", { genis: true });
      });
    } else if ((b = ev.target.closest("[data-s-incelendi]"))) {
      A.rpc("admin_sikayet_durum", { p_id: +b.getAttribute("data-s-incelendi"), p_durum: "incelendi" }).then(function () { msg("Şikâyet incelendi olarak işaretlendi."); yenile(); }).catch(hataGoster);
    } else if ((b = ev.target.closest("[data-s-talep]"))) {
      sekme("talepler"); setTimeout(function () { var s = $("[data-f-durum]"); if (s) s.value = ""; var a = $("[data-f-ara]"); if (a) { a.value = b.getAttribute("data-s-talep"); a.dispatchEvent(new Event("input")); } }, 50);
    }
  });

  function uyelikModal(emlakciId, ad) {
    c.from("paketler").select("*").order("sira").then(function (r) {
      var pk = r.data || [];
      A.modal("<h2>Üyelik tanımla — " + esc(ad) + '</h2><form class="form-stack" data-uyelik-form><div class="form-grid">' +
        '<div class="field span2"><label for="m-paket">Paket</label><select id="m-paket" name="paket">' + pk.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.ad) + " (" + p.sure_gun + " gün" + (p.fiyat ? ", " + A.fmt.tl(p.fiyat) + " TL" : "") + ")</option>"; }).join("") + "</select></div>" +
        '<div class="field"><label for="m-bas">Başlangıç</label><input id="m-bas" name="baslangic" type="date" value="' + new Date().toISOString().slice(0, 10) + '"><small class="hint">Aktif üyelik varsa onun bitişinden devam eder.</small></div>' +
        '<div class="field"><label for="m-bit">Bitiş (boşsa paket süresi)</label><input id="m-bit" name="bitis" type="date"></div>' +
        '<div class="field"><label for="m-tutar">Tutar (TL)</label><input id="m-tutar" name="tutar" inputmode="decimal"></div>' +
        '<div class="field"><label for="m-otarih">Ödeme tarihi</label><input id="m-otarih" name="odeme_tarihi" type="date" value="' + new Date().toISOString().slice(0, 10) + '"></div>' +
        '<div class="field"><label for="m-odurum">Ödeme durumu</label><select id="m-odurum" name="odeme_durumu"><option value="odendi">Ödendi</option><option value="bekliyor">Bekleniyor</option></select></div>' +
        '<div class="field"><label for="m-not">Not</label><input id="m-not" name="notlar"></div></div><button class="btn btn-gold" type="submit">Üyeliği başlat</button></form>', { genis: true });
      var f = $("[data-uyelik-form]");
      f.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var bugun = new Date().toISOString().slice(0, 10);
        var p = { emlakci_id: emlakciId, paket_id: f.paket.value, tutar: f.tutar.value.replace(",", "."), odeme_tarihi: f.odeme_tarihi.value, odeme_durumu: f.odeme_durumu.value, notlar: f.notlar.value };
        if (f.baslangic.value && f.baslangic.value !== bugun) p.baslangic = f.baslangic.value + "T00:00:00+03:00";
        if (f.bitis.value) p.bitis = f.bitis.value + "T23:59:00+03:00";
        A.rpc("admin_uyelik_ekle", { p: p }).then(function (r2) { A.kapat(); msg("Üyelik başlatıldı: " + gun(r2.baslangic) + " → " + gun(r2.bitis)); yenile(); }).catch(hataGoster);
      });
    });
  }

  function talepDuzenle(id) {
    var el = $("[data-sekme-icerik]"), t = (el._liste || []).filter(function (x) { return x.id === id; })[0]; if (!t) return;
    var o = function (obj, s) { return Object.keys(obj).map(function (k) { return '<option value="' + k + '"' + (k === s ? " selected" : "") + ">" + esc(obj[k]) + "</option>"; }).join(""); };
    A.modal("<h2>" + esc(t.no) + ' düzenle</h2><form class="form-stack" data-td-form><div class="form-grid">' +
      '<div class="field"><label>Tür</label><select name="tur">' + o(KOD.turler, t.tur) + '</select></div><div class="field"><label>İşlem</label><select name="islem">' + o(KOD.islemler, t.islem) + "</select></div>" +
      '<div class="field"><label>En az (TL)</label><input name="butce_min" value="' + (t.butce_min || "") + '"></div><div class="field"><label>En fazla (TL)</label><input name="butce_max" value="' + (t.butce_max || "") + '"></div>' +
      '<div class="field"><label>m²</label><input name="m2" value="' + (t.m2 || "") + '"></div><div class="field"><label>Oda</label><input name="oda" value="' + esc(t.oda || "") + '"></div>' +
      '<div class="field span2"><label>Başlık</label><input name="baslik" value="' + esc(t.baslik) + '"></div><div class="field span2"><label>Özet (herkese açık)</label><input name="ozet" value="' + esc(t.ozet) + '"></div>' +
      '<div class="field span2"><label>Detaylı açıklama</label><textarea name="aciklama" rows="4">' + esc(t.aciklama || "") + "</textarea></div>" +
      '<div class="field"><label>Yayın bitişi</label><input name="yayin_bitis" type="date" value="' + (t.yayin_bitis ? t.yayin_bitis.slice(0, 10) : "") + '"></div></div><button class="btn btn-gold" type="submit">Kaydet</button></form>', { genis: true });
    var f = $("[data-td-form]");
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var p = { tur: f.tur.value, islem: f.islem.value, butce_min: dg(f.butce_min.value) || "", butce_max: dg(f.butce_max.value) || "", m2: dg(f.m2.value) || "", oda: f.oda.value, baslik: f.baslik.value, ozet: f.ozet.value, aciklama: f.aciklama.value };
      if (f.yayin_bitis.value) p.yayin_bitis = f.yayin_bitis.value + "T23:59:00+03:00";
      A.rpc("admin_talep_guncelle", { p_id: id, p: p }).then(function () { A.kapat(); msg("Talep güncellendi."); yenile(); }).catch(hataGoster);
    });
  }

  /* ---------------- başlat ---------------- */
  A.sb().then(function (client) {
    c = client;
    return c.auth.getSession().then(function (r) { if (!r.data.session) return girisFormu(); rolKontrol(); });
  }).catch(function (e) { root.innerHTML = '<p class="red-text">' + esc(e.message) + "</p>"; });
})();
