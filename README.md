# Okul

Topluluk ve kurs platformu: akış (görsel, dosya, anket), sınıf (kurslar), takvim, canlı yayın, üyeler, puan/seviye sıralaması, özel mesajlar, bildirimler ve topluluk sahipleri için yönetim paneli.

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
| `MAX_VIDEO_MB` | Derslere yüklenen bir videonun en büyük boyutu (varsayılan 2048) |
| `MAIL_FROM` | Gönderen adresi, örn. `Okul <bilgi@ornek.com>` |

Yayına alırken veritabanı dosyası ile `uploads/` klasörünün kalıcı bir diskte durduğundan emin ol.

## Yönetim paneli

Topluluk yöneticileri menüde **Panel** sekmesini görür: istatistikler, davet bağlantısı, topluluk ayarları (ad, kapak görseli, kategoriler, görünen bölümler, kimlerin paylaşabileceği), üyelik türü ve ücreti, üyeler (onay, süre uzatma, yönetici atama, çıkarma) ve canlı yayın.

## Ücretli topluluklar

Üyelik ücretsiz, aylık ya da tek seferlik olabilir. Kartla otomatik tahsilat yoktur: yönetici ücreti ve ödeme bilgisini (IBAN, ödeme bağlantısı) yazar; katılmak isteyen kişi istek gönderir, ödemeyi görünce yönetici onaylar. Aylık üyelikte onay 30 gün erişim açar; süre dolunca üye yenileme isteği gönderir.

## Canlı yayın

Görüntü YouTube Live üzerinden yayınlanır; yönetici yayın bağlantısını panele yapıştırır. Üyeler yayını Okul içinde izler, sohbet Okul'da tutulur.
