# contact

Birden çok web sitesine hizmet eden contact form servisi. İki parça:

1. **Public API** — sitelerdeki formlardan mesaj alır, PostgreSQL'e kaydeder,
   SMTP ile bildirim maili atar.
2. **Admin paneli** — `/admin` altında, login korumalı; mesajları listeler,
   filtreler, okundu/sil aksiyonları.

**Stack:** Bun + Hono + zod + drizzle-orm (PostgreSQL) + pino · React + Vite + Tailwind · tek Docker imajı.

## Kurulum (lokal)

```bash
bun install
cd admin && bun install && cd ..

cp .env.example .env   # değerleri doldur (aşağıya bak)

# Migration'ları uygula (çalışan bir PostgreSQL gerekir)
bun run db:migrate

# Backend (http://localhost:3000)
bun run dev

# Admin paneli dev server (http://localhost:5173/admin/, /api'yi backend'e proxy'ler)
cd admin && bun run dev
```

Prod benzeri tek süreç istersen: `cd admin && bun run build && cd ..` sonrası
backend `./admin/dist`'i `/admin` altında kendisi sunar.

## Env değişkenleri

Şema [src/core/env.ts](src/core/env.ts)'de (zod) — geçersizse süreç başlamaz.

| Değişken | Açıklama |
| --- | --- |
| `PORT` | HTTP portu (default 3000) |
| `NODE_ENV` | `production`'da JSON log, cookie'ler `Secure` |
| `LOG_LEVEL` | pino seviyesi (default `info`) |
| `DATABASE_URL` | örn. `postgresql://contact:sifre@db:5432/contact` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | SMTP ayarları (port 465 ise implicit TLS) |
| `MAIL_FROM` / `MAIL_TO` | Bildirim mailinin gönderen/alıcısı |
| `ALLOWED_SITES` | Kabul edilen `site` değerleri, virgülle ayrılmış |
| `ALLOWED_ORIGINS` | `/api/submit` için CORS origin'leri, virgülle ayrılmış |
| `PAGEVIEW_ALLOWED_ORIGINS` | Pageview gönderebilecek host'lar (şemasız), virgülle ayrılmış. Default: `barisonurme.com,www.barisonurme.com,localhost,127.0.0.1` |
| `PAGEVIEW_ALLOWED_SITES` | Pageview için kabul edilen site id'leri. Boşsa `ALLOWED_SITES` |
| `SERVER_SECRET` | Günlük ziyaretçi-hash salt'ının kaynağı, min 16 karakter (`openssl rand -hex 32`) |
| `JWT_SECRET` | Session JWT imzası, min 32 karakter (`openssl rand -hex 32`) |
| `TRUSTED_PROXY_HOPS` | Önündeki güvenilir reverse-proxy sayısı (default `1`; Caddy). Client IP `X-Forwarded-For`'un sağdan N. değeri. `0` = proxy yok (lokal) |

### Admin girişi

Şifresiz. Login ekranında "E-posta ile kod gönder" → 6 haneli tek kullanımlık kod
`MAIL_TO` adresine gelir (10 dk geçerli, en fazla 5 deneme), kodu girince
HttpOnly session cookie set edilir. IP başına dakikada 5, tüm IP'ler toplamı 10
dakikada 15 deneme ile sınırlı; başarısız denemeler birikince `MAIL_TO`'ya uyarı
maili gider.

## API

| Endpoint | Açıklama |
| --- | --- |
| `POST /api/submit` | Form gönderimi (public, CORS + IP başına dakikada 3) |
| `POST /api/pageview` | Pageview kaydı (public, origin allowlist + IP başına dakikada 60). Başarıda ve doğrulama hatasında **her zaman 204**, gövde yok; rate limit'te 429. `navigator.sendBeacon` için `text/plain` gövde de kabul edilir. |
| `GET /api/health` | `{ "status": "ok" }` |
| `POST /api/admin/login/request` | 6 haneli kodu `MAIL_TO`'ya e-postalar (IP/dk 5 + global 10dk/15) |
| `POST /api/admin/login` | `{ code }` → HttpOnly session cookie (aynı limitler) |
| `POST /api/admin/logout` | Session'ı sonlandırır |
| `GET /api/admin/messages?page=&site=&unread=true` | Sayfalı liste (20/sayfa) |
| `PATCH /api/admin/messages/:id/read` | Okundu işaretle |
| `DELETE /api/admin/messages/:id` | Sil |
| `GET /api/admin/stats` | Site başına toplam/okunmamış |
| `GET /api/pageview/stats?site=&from=&to=&groupBy=` | Pageview özeti (admin session gerekir). `groupBy`: `path\|country\|referrer\|day`. Döner: `totalViews`, `uniqueVisitors`, `breakdown`. |

## Yeni bir siteye form ekleme

1. Sitenin adını `ALLOWED_SITES`'a, origin'ini `ALLOWED_ORIGINS`'a ekle, servisi yeniden başlat.
2. Sayfaya formu koy — `website` alanı **honeypot**: gizli tut, insanlar doldurmasın,
   bot doldurursa mesaj sessizce çöpe gider.

```html
<form id="contact-form">
  <input name="name" placeholder="Adınız" required maxlength="100" />
  <input name="email" type="email" placeholder="E-posta" required />
  <textarea name="message" placeholder="Mesajınız" required maxlength="5000"></textarea>
  <!-- honeypot: görünmez tut, doldurma -->
  <input name="website" tabindex="-1" autocomplete="off" aria-hidden="true"
         style="position:absolute;left:-9999px" />
  <button type="submit">Gönder</button>
</form>

<script>
  document.getElementById('contact-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    const res = await fetch('https://api.ornek.com/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site: 'portfolio', ...body }),
    });
    alert(res.ok ? 'Mesajınız gönderildi, teşekkürler!' : 'Bir hata oluştu, tekrar deneyin.');
  });
</script>
```

## Pageview analytics

`POST /api/pageview` — public, kimlik doğrulamasız yazma endpoint'i. Sitenin her
sayfa yüklemesinde çağrılır. İstemciden gelen gövde: `{ site, path, referrer?, screen? }`.
`timestamp`, `country`/`region` (edge header'ları), user agent **sunucu tarafında**
türetilir, istemciye güvenilmez.

Kötüye kullanıma karşı: origin allowlist (`PAGEVIEW_ALLOWED_ORIGINS`, POST-only),
~1 KB gövde limiti, katı şema (bilinmeyen alan reddedilir), IP başına dakikada 60,
bot filtresi (`bot|crawl|spider|slurp|headless|preview`), aynı ziyaretçi+path için
10 sn dedupe. Doğrulama hatasında bile **her zaman 204** döner — abuser'a geri bildirim yok.

Gizlilik (kayıtta PII yok): ham IP saklanmaz. Unique ziyaretçi sayımı için
`visitorHash = sha256(dailySalt + ip + ua)`, `dailySalt = sha256(SERVER_SECRET + UTC-tarih)`
— salt her gün döner, hash'ler günler arası ilişkilendirilemez. Saklanan: `site, path,
referrer, country, region, uaFamily, deviceType, visitorHash, ts`. Kendi tablosu
(`pageviews`), contact mesajlarından ayrı.

Saklama: ham satırlar 90 gün tutulur, sonra günlük servis içi bir job bunları
`pageview_daily` tablosuna (gün/site/path/country başına view + unique sayıları)
toplayıp ham satırları siler.

`GET /api/pageview/stats` admin session ister (contact admin paneli ile aynı).
Sorgu: `site` (zorunlu), `from`/`to` (`YYYY-MM-DD`, default son 30 gün),
`groupBy` (`path|country|referrer|day`). Ham + toplanmış veriyi birleştirir.

Yeni siteye pageview eklemek: site id'sini `PAGEVIEW_ALLOWED_SITES`'a (ya da
`ALLOWED_SITES`'a), host'unu `PAGEVIEW_ALLOWED_ORIGINS`'a ekle.

```html
<script>
  navigator.sendBeacon(
    'https://contact.barisonurme.com/api/pageview',
    JSON.stringify({
      site: 'portfolio',
      path: location.pathname,
      referrer: document.referrer,
      screen: `${screen.width}x${screen.height}`,
    }),
  );
</script>
```

## Veritabanı migration'ları

```bash
bun run db:generate   # şema değişince yeni migration üret (./drizzle)
bun run db:migrate    # bekleyen migration'ları uygula
```

## Docker & Deploy

Multi-stage [Dockerfile](Dockerfile): önce admin build edilir, dist backend
imajına kopyalanır; Hono hem API'yi hem statik paneli sunar.

```bash
docker build -t contact .
docker run --env-file .env -p 3000:3000 contact
```

`main`'e push'ta [deploy.yml](.github/workflows/deploy.yml) multi-arch
(amd64/arm64) imajı `ghcr.io/barisonurme/contact`'a basar,
[deploy/docker-compose.yml](deploy/docker-compose.yml)'ı sunucudaki
`/opt/contact`'a kopyalar ve servisi günceller (pull → migrate → up).
Sunucu mimarisi ve tek seferlik kurulum: [deploy/SERVER.md](deploy/SERVER.md).

Gerekli GitHub secrets: `SSH_HOST`, `SSH_USER`, `SSH_KEY`, `GHCR_PAT`
(packages:read yetkili PAT; imaj push'u `GITHUB_TOKEN` ile yapılır).
