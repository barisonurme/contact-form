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
| `ADMIN_PASSWORD_HASH` | Admin şifresinin bcrypt hash'i (aşağıya bak) |
| `JWT_SECRET` | Session JWT imzası, min 32 karakter (`openssl rand -hex 32`) |

### Admin şifre hash'i üretme

```bash
bun run hash 'cok-gizli-sifre'
# çıktıyı ADMIN_PASSWORD_HASH olarak .env'e koy
```

## API

| Endpoint | Açıklama |
| --- | --- |
| `POST /api/submit` | Form gönderimi (public, CORS + IP başına dakikada 3) |
| `GET /api/health` | `{ "status": "ok" }` |
| `POST /api/admin/login` | `{ password }` → HttpOnly session cookie (dakikada 5 deneme) |
| `POST /api/admin/logout` | Session'ı sonlandırır |
| `GET /api/admin/messages?page=&site=&unread=true` | Sayfalı liste (20/sayfa) |
| `PATCH /api/admin/messages/:id/read` | Okundu işaretle |
| `DELETE /api/admin/messages/:id` | Sil |
| `GET /api/admin/stats` | Site başına toplam/okunmamış |

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
(amd64/arm64) imajı `ghcr.io/barisonurme/contact`'a basar, ardından SSH ile
sunucudaki `/opt/expanse` stack'inde `contact` servisini günceller
(pull → migrate → up). Compose tanımı bu repoda değil, sunucuda yaşar.

Gerekli GitHub secrets: `SSH_HOST`, `SSH_USER`, `SSH_KEY`, `GHCR_PAT`
(packages:read yetkili PAT; imaj push'u `GITHUB_TOKEN` ile yapılır).
