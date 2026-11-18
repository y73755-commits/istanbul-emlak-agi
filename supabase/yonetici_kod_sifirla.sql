-- YÖNETİCİ KURTARMA (yalnızca Supabase panelinden, proje sahibi çalıştırır)
-- Ne zaman: yönetici panelinde iki adımlı doğrulamayı açtıysanız ve telefonunuzu/kurulum anahtarınızı kaybettiyseniz.
-- Nerede: supabase.com > istanbul-emlak-agi > SQL Editor > New query > bu satırı yapıştır > Run.
-- Sonuç: hesap, talepler ve diğer veriler OLDUĞU GİBİ kalır; yalnızca telefon kodu kaydı silinir.
-- Ardından panele Google ile girersiniz; isterseniz "İki adımlı doğrulamayı aç" ile yeni telefona kurarsınız.
delete from auth.mfa_factors
where user_id = (select id from auth.users where email = 'y73755@gmail.com');
