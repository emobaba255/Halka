# Okul

Topluluk ve kurs platformu: akış, sınıf (kurslar), takvim, üyeler, puan/seviye sıralaması, özel mesajlar ve bildirimler.

## Çalıştırma

Node.js 22.13 veya üstü gerekir.

```bash
npm install
npm start
```

Ardından tarayıcıda `http://localhost:3000` adresini aç. İlk çalıştırmada örnek veriler oluşturulur; `demo@okul.app` / `demo1234` ile girebilirsin.

## Ayarlar (ortam değişkenleri)

| Değişken | Ne işe yarar |
| --- | --- |
| `PORT` | Sunucunun dinlediği port (varsayılan 3000) |
| `DB_PATH` | SQLite veritabanı dosyasının yolu (varsayılan `okul.db`) |
| `UPLOAD_DIR` | Yüklenen görsellerin klasörü (varsayılan `uploads/`) |
| `BASE_URL` | Sitenin adresi; şifre sıfırlama bağlantılarında kullanılır |
| `SMTP_URL` | E-posta sunucusu, örn. `smtps://kullanici:sifre@smtp.ornek.com`. Tanımlı değilse e-postalar gönderilmez, sunucu günlüğüne yazılır |
| `MAIL_FROM` | Gönderen adresi, örn. `Okul <bilgi@ornek.com>` |

Yayına alırken veritabanı dosyası ile `uploads/` klasörünün kalıcı bir diskte durduğundan emin ol.

## Ücretli topluluklar

Kart ile otomatik ödeme yoktur. Yönetici bir ücret ve ödeme bilgisi (IBAN, ödeme bağlantısı) yazar; katılmak isteyen kişi istek gönderir, ödemeyi görünce yönetici isteği onaylar.
