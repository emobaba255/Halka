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
| `DATA_DIR` | Veritabanı ve yüklenen dosyaların duracağı klasör. Verilmezse ve `/var/data` yazılabilir bir diskse orası, yoksa proje klasörü kullanılır |
| `DB_PATH`, `UPLOAD_DIR` | Veritabanı dosyasını ya da yükleme klasörünü ayrı ayrı belirlemek için |
| `SEED_DEMO` | `0` yapılırsa örnek hesaplar ve topluluklar oluşturulmaz. Gerçek yayında `0` olmalı: örnek hesapların şifresi herkesçe bilinir |
| `BASE_URL` | Sitenin adresi; şifre sıfırlama bağlantılarında kullanılır |
| `SMTP_URL` | E-posta sunucusu, örn. `smtps://kullanici:sifre@smtp.ornek.com`. Tanımlı değilse e-postalar gönderilmez, sunucu günlüğüne yazılır |
| `MAIL_FROM` | Gönderen adresi, örn. `Okul <bilgi@ornek.com>` |
| `VIDEO_QUOTA_CAP_GB` | Tüm planlara uygulanan geçici video alanı üst sınırı (varsayılan 5). Plan kotaları: ücretsiz 5 GB, eğitim satan 50 GB; depolama ucuz bir hizmete taşınınca bu değer yükseltilir |
| `MAX_VIDEO_MB` | Derslere yüklenen tek bir videonun en büyük boyutu (varsayılan 300). Sunucudan izlenen her GB ücretli olduğu için düşük tutulur |

## Kalıcı veri (Render)

Ücretsiz planda disk kalıcı değildir: her yeniden başlatmada veritabanı ve yüklenen dosyalar sıfırlanır. Kalıcı olması için:

1. Hizmeti ücretli bir plana geçir.
2. Hizmetin **Disks** bölümünden bir disk ekle; **Mount Path** olarak `/var/data` yaz.
3. **Environment** bölümüne `SEED_DEMO=0` ekle (örnek hesaplar oluşmasın).

Uygulama `/var/data` klasörünü görünce veritabanını ve yüklemeleri kendiliğinden oraya yazar; başka ayar gerekmez.

## Güvenlik notları

- Oturum çerezi `HttpOnly` ve `SameSite=Lax`; https üzerinde `Secure`. Oturumlar 30 gün geçerlidir.
- İçerik güvenlik politikası (CSP) yalnızca sitenin kendi betiklerine, Google Fonts'a ve YouTube gömmelerine izin verir.
- Giriş, kayıt, mesaj ve genel yazma isteklerinde istek sınırı vardır.
- Yüklenen görsellerin türü dosya içeriğinden doğrulanır; belgeler tarayıcıda açılmaz, indirilir.

## Yönetim paneli

Topluluk yöneticileri menüde **Panel** sekmesini görür: istatistikler, davet bağlantısı, topluluk ayarları (ad, kapak görseli, kategoriler, görünen bölümler, kimlerin paylaşabileceği), üyelik türü ve ücreti, üyeler (onay, süre uzatma, yönetici atama, çıkarma) ve canlı yayın.

## Ücretli topluluklar

Üyelik ücretsiz, aylık ya da tek seferlik olabilir. Kartla otomatik tahsilat yoktur: yönetici ücreti ve ödeme bilgisini (IBAN, ödeme bağlantısı) yazar; katılmak isteyen kişi istek gönderir, ödemeyi görünce yönetici onaylar. Aylık üyelikte onay 30 gün erişim açar; süre dolunca üye yenileme isteği gönderir.

## Canlı yayın

Görüntü YouTube Live üzerinden yayınlanır; yönetici yayın bağlantısını panele yapıştırır. Üyeler yayını Okul içinde izler, sohbet Okul'da tutulur.
