/* İstanbul Emlak Ağı — Hesabım (vatandaş ve emlakçı paneli) */
(function () {
  "use strict";
  var A = window.IEA_APP, CFG = window.IEA || {}, KOD = CFG.kod || {}, P = CFG.base || "/";
  var root = document.querySelector("[data-hesabim]");
  if (!A || !root) return;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var DURUM = { inceleniyor: ["İnceleniyor", "sari"], yayinda: ["Yayında", "yesil"], sonuclandi: ["Sonuçlandı", "gri"], iptal: ["İptal edildi", "gri"], arsiv: ["Arşivde", "gri"], reddedildi: ["Reddedildi", "kirmizi"] };
  var me = null;

  function yukle() {
    A.oturum().then(function (s) {
      if (!s) { location.replace(P + "giris.html?donus=hesabim.html"); return; }
      return A.rpc("profilim").then(function (p) { me = p; ciz(); });
    }).catch(function (e) { root.innerHTML = '<div class="empty"><p>' + esc(e.message) + '</p><a class="btn btn-gold" href="' + P + 'giris.html?donus=hesabim.html">Giriş yap</a></div>'; });
  }

  function rozet(d) { var x = DURUM[d] || [d, "gri"]; return '<span class="durum ' + x[1] + '">' + x[0] + "</span>"; }

  function ciz() {
    var p = me, emlakci = p.rol === "emlakci", html = "";
    html += '<div class="panel-head card"><div><p class="kicker">' + (p.rol === "yonetici" ? "Yönetici" : emlakci ? "Emlak danışmanı" : "Vatandaş") + "</p><h2>Merhaba" + (p.ad_soyad ? ", " + esc(p.ad_soyad) : "") + "</h2>" +
      '<p class="muted">' + esc(A.fmt.tel(p.telefon || "")) + (p.ofis_adi ? " · " + esc(p.ofis_adi) : "") + "</p></div>" +
      '<div class="actions">' + (p.rol === "yonetici" ? '<a class="btn btn-gold btn-sm" href="' + P + 'yonetici.html">Yönetici paneli</a>' : "") + '<button class="btn btn-ghost btn-sm" type="button" data-cikis>Çıkış yap</button></div></div>';

    if (emlakci) html += emlakciDurum(p);
    var yeniLink = emlakci ? (p.durum === "onayli" ? P + "portfoy-is-birligi.html#paylas" : "") : P + "talep-olustur.html";
    html += '<section class="panel-sec"><div class="sec-head row"><h2>' + (emlakci ? "İş birliği paylaşımlarım" : "Taleplerim") + "</h2>" +
      (yeniLink ? '<a class="btn btn-gold btn-sm" href="' + yeniLink + '">' + (emlakci ? "Yeni paylaşım" : "Yeni talep") + "</a>" : "") + '</div><div data-taleplerim class="liste-tablo"><p class="muted">Yükleniyor…</p></div></section>';
    if (emlakci) html += '<section class="panel-sec"><h2>Favorilerim</h2><div data-favoriler class="tgrid"><p class="muted">Yükleniyor…</p></div></section>';
    html += '<section class="panel-sec"><h2>Bilgilerim</h2>' + profilForm(p) + "</section>";
    html += '<section class="panel-sec danger-zone"><h2>Hesabı sil</h2><p class="muted">Hesabınız, talepleriniz ve onay kayıtlarınız kalıcı olarak silinir. Bu işlem geri alınamaz.</p><button class="btn btn-ghost btn-sm" type="button" data-hesap-sil>Hesabımı ve verilerimi sil</button></section>';
    root.innerHTML = html;
    taleplerim(); if (emlakci) favoriler();
    profilBagla();
  }

  function emlakciDurum(p) {
    var wa = "https://wa.me/" + CFG.wa + "?text=" + encodeURIComponent("Merhaba, İstanbul Emlak Ağı üyeliğim hakkında yazıyorum.\nAd soyad: " + (p.ad_soyad || "") + "\nEmlak ofisi: " + (p.ofis_adi || ""));
    if (p.durum === "beklemede") return '<div class="notice">' + "<p><strong>Başvurunuz inceleniyor.</strong> Yetki belgeniz kontrol edildikten sonra hesabınız onaylanacak. Onaylandığınızda iş birliği paylaşımı yapabilirsiniz.</p></div>";
    if (p.durum === "reddedildi") return '<div class="notice red"><p><strong>Başvurunuz onaylanmadı.</strong> ' + esc(p.red_nedeni || "") + ' Bilgilerinizi güncelleyip <a class="link-gold" href="' + P + 'emlakci-uyelik.html">tekrar başvurabilirsiniz</a>.</p></div>';
    if (p.durum === "engelli") return '<div class="notice red"><p><strong>Hesabınız askıya alındı.</strong> Bilgi için WhatsApp\'tan yazın.</p></div>';
    var s = '<div class="uyelik-kutu card"><div><p class="kicker">Ücretli üyelik</p>';
    if (p.uyelik_bitis) {
      var uyar = p.kalan_gun <= 3;
      s += "<h3>" + (uyar ? "Üyeliğiniz yakında bitiyor" : "Üyeliğiniz aktif") + '</h3><p>Bitiş: <strong>' + A.fmt.tarih(p.uyelik_bitis) + "</strong> · Kalan " + p.kalan_gun + " gün</p>" +
        (p.ucretli_erisim_aktif ? "" : '<p class="small muted">Vatandaş taleplerinin detay erişimi yönetim tarafından açıldığında kullanılabilir olacak.</p>') + "</div>" +
        (uyar ? '<a class="btn btn-gold" target="_blank" rel="noopener" href="' + wa + '">Üyeliği uzat</a>' : "");
      if (uyar) s = '<div class="notice"><p><strong>Üyeliğinizin bitmesine ' + p.kalan_gun + " gün kaldı.</strong> Süre dolduğunda vatandaş taleplerinin detay erişimi otomatik kapanır.</p></div>" + s;
    } else {
      s += "<h3>Aktif ücretli üyeliğiniz yok</h3><p>İş birliği paylaşımlarını ücretsiz kullanabilirsiniz. Vatandaş taleplerinin detay ve iletişim bilgisi için üyelik gerekir.</p></div>" +
        '<div class="actions"><a class="btn btn-line btn-sm" href="' + P + 'uyelik-paketleri.html">Paketler</a><a class="btn btn-gold btn-sm" target="_blank" rel="noopener" href="' + wa + '">WhatsApp\'tan üyelik al</a></div>';
    }
    return s + "</div>";
  }

  function taleplerim() {
    var box = $("[data-taleplerim]");
    A.rpc("taleplerim").then(function (list) {
      if (!list.length) { box.innerHTML = '<div class="empty"><p>Henüz kaydınız yok.</p></div>'; return; }
      box.innerHTML = list.map(function (t) {
        var acik = ["inceleniyor", "yayinda", "reddedildi"].indexOf(t.durum) > -1;
        return '<div class="satir card" data-id="' + t.id + '"><div class="satir-ana"><div class="satir-ust">' + rozet(t.durum) + '<span class="tcard-no">' + esc(t.no) + " · " + A.fmt.tarih(t.olusturma) + "</span></div>" +
          "<h3>" + esc(t.baslik) + '</h3><p class="muted small">' + esc([t.ilce, t.mahalle].filter(Boolean).join(" / ") || "İstanbul geneli") + " · " + esc(A.fmt.butce(t)) + "</p>" +
          (t.durum === "reddedildi" && t.red_nedeni ? '<p class="small red-text">Red nedeni: ' + esc(t.red_nedeni) + "</p>" : "") +
          (t.durum === "yayinda" ? '<p class="small muted">Yayın bitişi: ' + A.fmt.tarih(t.yayin_bitis) + " · İletişim bilgisi " + (t.goruntulenme || 0) + " kez görüntülendi</p>" : "") + "</div>" +
          '<div class="satir-btn">' + (acik ? '<button class="btn btn-line btn-sm" data-duzenle="' + t.id + '">Düzenle</button>' : "") +
          (t.durum === "inceleniyor" || t.durum === "yayinda" ? '<button class="btn btn-ghost btn-sm" data-kapat-talep="' + t.id + '" data-d="sonuclandi">Sonuçlandı</button><button class="btn btn-ghost btn-sm" data-kapat-talep="' + t.id + '" data-d="iptal">İptal et</button>' : "") +
          '<button class="btn btn-ghost btn-sm" data-sil="' + t.id + '">Sil</button></div></div>';
      }).join("");
      box._liste = list;
    }).catch(function (e) { box.innerHTML = '<p class="red-text">' + esc(e.message) + "</p>"; });
  }

  function favoriler() {
    var box = $("[data-favoriler]");
    A.sb().then(function (c) { return c.from("favoriler").select("talep_id").order("zaman", { ascending: false }); }).then(function (r) {
      var ids = (r.data || []).map(function (x) { return x.talep_id; });
      if (!ids.length) { box.innerHTML = '<p class="muted">Favori talebiniz yok. Talep kartlarındaki kalp simgesiyle ekleyebilirsiniz.</p>'; return; }
      return A.sb().then(function (c) { return c.from("talepler").select("id,no,tip,kategori,tur,islem,ilce,mahalle,butce_min,butce_max,m2,oda,baslik,ozet,yayin_tarihi,olusturma").in("id", ids); })
        .then(function (r2) { box.innerHTML = (r2.data || []).map(function (t) { return A.kart(t, false); }).join("") || '<p class="muted">Favorilerinizdeki talepler artık yayında değil.</p>'; if (window.__ieaFavSync) window.__ieaFavSync(); });
    }).catch(function () { box.innerHTML = ""; });
  }

  function profilForm(p) {
    var ilce = (CFG.ilceListesi || []).map(function (i) { return '<label class="check sm"><input type="checkbox" name="ilceler" value="' + esc(i) + '"' + ((p.hizmet_ilceleri || []).indexOf(i) > -1 ? " checked" : "") + "><span>" + esc(i) + "</span></label>"; }).join("");
    return '<form class="card form" data-profil-form><div class="form-grid">' +
      '<div class="field"><label for="p-ad">Ad soyad</label><input id="p-ad" name="ad_soyad" maxlength="80" value="' + esc(p.ad_soyad || "") + '"></div>' +
      '<div class="field"><label for="p-eposta">E-posta</label><input id="p-eposta" name="eposta" type="email" maxlength="120" value="' + esc(p.eposta || "") + '"></div>' +
      (p.rol === "emlakci" ? '<div class="field span2"><label for="p-ofis">Emlak ofisi</label><input id="p-ofis" name="ofis_adi" maxlength="100" value="' + esc(p.ofis_adi || "") + '"></div>' : "") +
      "</div>" + (p.rol === "emlakci" ? '<fieldset class="ilce-set"><legend>Hizmet verdiğiniz ilçeler</legend><div class="ilce-checks">' + ilce + "</div></fieldset>" +
      '<div class="foto-alan">' + (p.foto_url ? '<img src="' + esc(p.foto_url) + '" alt="Profil fotoğrafı" width="72" height="72">' : '<span class="foto-bos">Fotoğraf yok</span>') +
      '<div class="field"><label for="p-foto">Profil fotoğrafı (isteğe bağlı, en fazla 2 MB)</label><input id="p-foto" type="file" accept="image/jpeg,image/png,image/webp" data-foto></div></div>' : "") +
      '<p class="form-err" hidden data-err></p><p class="form-ok" hidden data-ok>Bilgileriniz kaydedildi.</p><button class="btn btn-gold" type="submit">Kaydet</button></form>';
  }

  function profilBagla() {
    var f = $("[data-profil-form]"); if (!f) return;
    f.addEventListener("submit", function (ev) {
      ev.preventDefault(); $("[data-err]", f).hidden = true; $("[data-ok]", f).hidden = true;
      var veri = { ad_soyad: f.ad_soyad.value.trim() || null, eposta: f.eposta.value.trim() || null };
      if (f.ofis_adi) veri.ofis_adi = f.ofis_adi.value.trim() || null;
      if (me.rol === "emlakci") veri.hizmet_ilceleri = $$('input[name="ilceler"]:checked', f).map(function (x) { return x.value; });
      var dosya = $("[data-foto]", f) && $("[data-foto]", f).files[0];
      A.sb().then(function (c) {
        var once = Promise.resolve();
        if (dosya) {
          if (dosya.size > 2097152) throw new Error("Fotoğraf en fazla 2 MB olmalı.");
          var yol = me.id + "/profil-" + Date.now() + "." + (dosya.type.split("/")[1] || "jpg");
          once = c.storage.from("profil").upload(yol, dosya, { upsert: true, contentType: dosya.type }).then(function (u) {
            if (u.error) throw new Error("Fotoğraf yüklenemedi: " + u.error.message);
            veri.foto_url = c.storage.from("profil").getPublicUrl(yol).data.publicUrl;
          });
        }
        return once.then(function () { return c.from("profiller").update(veri).eq("id", me.id); });
      }).then(function (r) { if (r && r.error) throw new Error(r.error.message); $("[data-ok]", f).hidden = false; return A.rpc("profilim").then(function (p) { me = p; }); })
        .catch(function (e) { var x = $("[data-err]", f); x.textContent = e.message; x.hidden = false; });
    });
  }

  function talepFormu(t) {
    var kat = (t.tip === "emlakci" ? KOD.emlakci_kategorileri : KOD.vatandas_kategorileri) || {};
    var opt = function (obj, sec) { return Object.keys(obj).map(function (k) { return '<option value="' + k + '"' + (k === sec ? " selected" : "") + ">" + esc(obj[k]) + "</option>"; }).join(""); };
    var ilceOpt = '<option value="">' + (t.tip === "emlakci" ? "İstanbul geneli" : "İlçe seçin") + "</option>" + (CFG.ilceListesi || []).map(function (i) { return "<option" + (i === t.ilce ? " selected" : "") + ">" + esc(i) + "</option>"; }).join("");
    return '<h2>' + esc(t.no) + " · Düzenle</h2><p class=\"small muted\">Değişiklikler kontrol edildikten sonra yeniden yayınlanır.</p>" +
      '<form class="form-stack" data-duzenle-form><div class="form-grid">' +
      '<div class="field span2"><label>Talep türü</label><input value="' + esc(kat[t.kategori] || t.kategori) + '" disabled></div>' +
      '<div class="field"><label for="d-ilce">İlçe</label><select id="d-ilce" name="ilce" data-ilce>' + ilceOpt + "</select></div>" +
      '<div class="field"><label for="d-mah">Mahalle</label><select id="d-mah" name="mahalle" data-mahalle data-want="' + esc(t.mahalle || "") + '"><option value="">Seçin</option></select></div>' +
      '<div class="field"><label for="d-tur">Gayrimenkul türü</label><select id="d-tur" name="tur">' + opt(KOD.turler, t.tur) + "</select></div>" +
      '<div class="field"><label for="d-islem">Satılık / kiralık</label><select id="d-islem" name="islem">' + opt(KOD.islemler, t.islem) + "</select></div>" +
      '<div class="field"><label for="d-bmin">En az (TL)</label><input id="d-bmin" name="butce_min" inputmode="numeric" value="' + (t.butce_min || "") + '"></div>' +
      '<div class="field"><label for="d-bmax">En fazla (TL)</label><input id="d-bmax" name="butce_max" inputmode="numeric" value="' + (t.butce_max || "") + '"></div>' +
      '<div class="field"><label for="d-m2">Metrekare</label><input id="d-m2" name="m2" inputmode="numeric" value="' + (t.m2 || "") + '"></div>' +
      '<div class="field"><label for="d-oda">Oda sayısı</label><input id="d-oda" name="oda" maxlength="20" value="' + esc(t.oda || "") + '"></div>' +
      '<div class="field span2"><label for="d-baslik">Başlık</label><input id="d-baslik" name="baslik" maxlength="120" required value="' + esc(t.baslik) + '"></div>' +
      '<div class="field span2"><label for="d-ozet">Kısa açıklama (herkese açık)</label><input id="d-ozet" name="ozet" maxlength="200" required value="' + esc(t.ozet) + '"></div>' +
      '<div class="field span2"><label for="d-aciklama">Detaylı açıklama (yalnızca yetkili üyeler görür)</label><textarea id="d-aciklama" name="aciklama" rows="4" maxlength="2000">' + esc(t.aciklama || "") + "</textarea></div>" +
      '</div><p class="form-err" hidden data-err></p><button class="btn btn-gold" type="submit">Kaydet</button></form>';
  }

  root.addEventListener("click", function (ev) {
    var b;
    if ((b = ev.target.closest("[data-duzenle]"))) {
      var id = +b.getAttribute("data-duzenle"), t = ($("[data-taleplerim]")._liste || []).filter(function (x) { return x.id === id; })[0];
      var d = A.modal(talepFormu(t), { genis: true });
      var ilceSel = $("[data-ilce]", d), mahSel = $("[data-mahalle]", d);
      var doldur = function () { var l = (window.IEA_ILCELER || {})[ilceSel.value] || [], w = mahSel.getAttribute("data-want"); mahSel.innerHTML = '<option value="">Seçin</option>' + l.map(function (m) { return "<option" + (m === w ? " selected" : "") + ">" + esc(m) + "</option>"; }).join(""); mahSel.removeAttribute("data-want"); };
      ilceSel.addEventListener("change", doldur); doldur();
      $("[data-duzenle-form]", d).addEventListener("submit", function (e2) {
        e2.preventDefault(); var f = e2.target, dg = function (s) { return String(s || "").replace(/\D+/g, ""); };
        A.rpc("talep_guncelle", { p_id: id, p: { ilce: f.ilce.value || null, mahalle: f.mahalle.value || null, tur: f.tur.value, islem: f.islem.value, butce_min: dg(f.butce_min.value) || null, butce_max: dg(f.butce_max.value) || null, m2: dg(f.m2.value) || null, oda: f.oda.value || null, baslik: f.baslik.value, ozet: f.ozet.value, aciklama: f.aciklama.value } })
          .then(function () { A.kapat(); taleplerim(); })
          .catch(function (er) { var x = $("[data-err]", f); x.textContent = er.message; x.hidden = false; });
      });
    } else if ((b = ev.target.closest("[data-kapat-talep]"))) {
      var d2 = b.getAttribute("data-d");
      if (!confirm(d2 === "sonuclandi" ? "Talebi 'Sonuçlandı' olarak kapatmak istiyor musunuz? Yayından kaldırılır." : "Talebi iptal etmek istiyor musunuz? Yayından kaldırılır.")) return;
      A.rpc("talep_kapat", { p_id: +b.getAttribute("data-kapat-talep"), p_durum: d2 }).then(taleplerim).catch(function (e) { alert(e.message); });
    } else if ((b = ev.target.closest("[data-sil]"))) {
      if (!confirm("Bu kayıt ve içindeki kişisel bilgiler kalıcı olarak silinecek. Emin misiniz?")) return;
      A.rpc("talep_sil", { p_id: +b.getAttribute("data-sil") }).then(taleplerim).catch(function (e) { alert(e.message); });
    } else if (ev.target.closest("[data-hesap-sil]")) {
      if (!confirm("Hesabınız ve tüm verileriniz kalıcı olarak silinecek. Bu işlem geri alınamaz. Devam edilsin mi?")) return;
      A.rpc("hesabimi_sil").then(function () { return A.sb().then(function (c) { return c.auth.signOut(); }); }).finally(function () { try { localStorage.clear(); } catch (e) {} location.replace(P + "index.html"); });
    }
  });

  yukle();
})();
