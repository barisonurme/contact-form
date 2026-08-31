# Sunucu mimarisi

Sunucuda üç bağımsız compose stack'i yaşar; hepsi `proxy` adlı ortak docker
network'ü üzerinden konuşur. 80/443'ün tek sahibi `/opt/proxy`'deki Caddy'dir.

```
/opt/proxy     -> Caddy (80/443, TLS, tüm route'lar) — elle yönetilir
/opt/expanse   -> expenseai stack'i (kendi reposu yönetir)
/opt/contact   -> contact + kendi Postgres'i (bu repo yönetir)
```

## /opt/contact içeriği

- `docker-compose.yml` — bu repodaki `deploy/docker-compose.yml`'ın kopyası;
  her push'ta CI tarafından üzerine yazılır, sunucuda elle düzenleme.
- `contact.env` — uygulama env'i (repoda yok, sunucuda elle durur).
  Compose bu dosyayı `format: raw` ile okur: değerler `$` kaçışı olmadan
  olduğu gibi geçer. `SERVER_SECRET` (min 16 char, `openssl rand -hex 32`) ve
  `JWT_SECRET` (min 32 char) zorunlu — yoksa servis başlamaz. Admin girişi
  şifresiz (kod `MAIL_TO`'ya gelir). `TRUSTED_PROXY_HOPS` default `1` (Caddy);
  `PAGEVIEW_ALLOWED_ORIGINS` / `PAGEVIEW_ALLOWED_SITES` opsiyonel (bkz. `.env.example`).
- `.env` — sadece `POSTGRES_PASSWORD=...` (compose interpolation için;
  `contact.env` içindeki `DATABASE_URL`'in şifresiyle aynı olmalı).

## /opt/proxy içeriği (elle kuruldu, referans)

`docker-compose.yml`:

```yaml
services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - '80:80'
      - '443:443'
      - '443:443/udp'
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    networks:
      - proxy

volumes:
  caddy-data:
  caddy-config:

networks:
  proxy:
    external: true
```

`Caddyfile`:

```caddyfile
expense.barisonurme.com {
    reverse_proxy expanse-web:80
}

contact.barisonurme.com {
    reverse_proxy contact:3000
}
```

Yeni site eklemek = Caddyfile'a blok ekle + `docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile`.

## expenseai tarafındaki gereksinimler

expenseai reposundaki compose'da `web` servisi:
- 80/443 `ports` yayınlamaz (bloğu silinmiş olmalı),
- `SITE_ADDRESS=:80` (TLS'i front proxy yapar, web içerde düz HTTP sunar),
- `proxy` network'üne `expanse-web` alias'ıyla katılır:

```yaml
  web:
    networks:
      default:
      proxy:
        aliases: [expanse-web]

networks:
  proxy:
    external: true
```
