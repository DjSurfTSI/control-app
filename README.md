# Контроль уборки банкоматов

Веб-приложение для планирования, исполнения и контроля уборки банкоматов.

**Текущая версия:** v1.2.0 — bizadmin и настройки CV, сжатие фото в браузере, стабильная загрузка на слабых VPS, UI зависит от вкл/выкл CV.

## Возможности

- **Роли:** бизнес-администратор, администратор, супервайзер, уборщик
- Заявки на уборку с фотоотчётом (слева, справа, спереди)
- **Сжатие фото в браузере** — до 1280px JPEG перед отправкой (снижает нагрузку на сервер)
- **Сжатие на сервере** (опционально, sharp) — для крупных файлов; на VPS рекомендуется `PHOTO_SKIP_SHARP=true`
- **CV-проверка фото** (вкл/выкл) — CLIP определяет банкомат Сбербанка; при отключении достаточно трёх фото без CV
- **Настройки CV** (бизнес-администратор) — включение/отключение модели, порог и запас точности; UI заявок подстраивается под статус CV
- Импорт/экспорт Excel
- Push-уведомления и PWA
- Integration API для ERP/CRM/1С

### Роли

| Роль | Код | Основные права |
|------|-----|----------------|
| Бизнес-администратор | `bizadmin` | Все права админа и супервайзера + раздел «Настройки» (CV) |
| Администратор | `admin` | Заявки, банкоматы, все пользователи (кроме bizadmin), интеграция |
| Супервайзер | `supervisor` | Заявки, банкоматы, управление уборщиками |
| Уборщик | `cleaner` | Свои заявки, фотоотчёт; CV при завершении только если CV включена |

## Быстрый старт (разработка)

```bash
npm install --prefix server
npm install --prefix client

# Терминал 1
cd server && npm run dev

# Терминал 2
cd client && npm run dev
```

- UI: http://localhost:5173
- API: http://localhost:3001

### Демо-аккаунты (пароль `admin123`)

| Email | Роль |
|-------|------|
| bizadmin@bank.ru | Бизнес-администратор |
| admin@bank.ru | Администратор |
| supervisor@bank.ru | Супервайзер |
| cleaner1@bank.ru | Уборщик |

## Деплой на VPS (Reg.ru и др.)

Приложение — **Node.js 22+** + Express. На production один процесс отдаёт API и собранный React.

```bash
git clone https://github.com/DjSurfTSI/control-app.git
cd control-app
sudo bash deploy/setup-server.sh
```

Скрипт установит зависимости, соберёт фронтенд, запустит **pm2** (`control-app` на порту `3001`) и настроит **nginx** как reverse proxy (в том числе по IP сервера).

Переменные окружения — `server/.env` (шаблон: `server/.env.example`):

```env
PORT=3001
JWT_SECRET=длинный-случайный-секрет
VAPID_PUBLIC=...
VAPID_PRIVATE=...
CV_ENABLED=true
CV_ATM_THRESHOLD=0.30
CV_ATM_MARGIN=0.12
PHOTO_MAX_EDGE=1280
PHOTO_JPEG_QUALITY=82
PHOTO_SKIP_SHARP=true
PHOTO_PASSTHROUGH_MAX_BYTES=1800000
```

> **CV:** модель CLIP (~150 MB) загружается при первой проверке, не при старте сервера. Рекомендуется **≥1 GB RAM** или swap + `PHOTO_SKIP_SHARP=true`.
>
> **Настройки CV** (`enabled`, `threshold`, `margin`) — в UI (bizadmin) и БД `cv_settings`. Статус для UI: `GET /api/settings/cv/status`.

Обновление на сервере:

```bash
git pull
npm install --prefix server
bash deploy/build-client.sh
pm2 restart control-app
```

### Сборка падает с «Killed»

Сообщение `Killed` при `vite build` — **нехватка RAM** на VPS (OOM killer). Уязвимости `npm audit` в `concurrently` на это не влияют (это dev-зависимость корня репозитория, не production).

**Вариант 1 — включить swap на сервере (рекомендуется):**

```bash
sudo bash deploy/ensure-swap.sh
bash deploy/build-client.sh
pm2 restart control-app
```

**Вариант 2 — собрать на своём ПК и залить только `dist`:**

```bash
# на локальной машине
npm run build --prefix client
scp -r client/dist root@IP_СЕРВЕРА:~/control-app/client/
# на сервере
pm2 restart control-app
```

Проверка памяти: `free -h`

### Ошибка 502 при загрузке фото

Причина — нехватка RAM на VPS. С **v1.2.0** фото сжимаются в браузере; на сервере sharp часто не вызывается (`optimizePhoto passthrough`).

**Обязательно на сервере:**

```bash
cd ~/control-app
git pull
npm install --prefix server
bash deploy/build-client.sh

# В server/.env добавьте (или раскомментируйте):
# PHOTO_SKIP_SHARP=true

pm2 delete control-app
pm2 start deploy/ecosystem.config.cjs
pm2 save
sudo bash deploy/ensure-swap.sh
```

Логи при загрузке: `pm2 logs control-app --lines 30` — должна быть строка `optimizePhoto passthrough`.

Дополнительно: отключите CV в «Настройки» (bizadmin), если RAM < 1 ГБ.

## История версий

| Версия | Дата | Основные изменения |
|--------|------|-------------------|
| v1.2.0 | 2026-06-13 | Сжатие фото в браузере, `PHOTO_SKIP_SHARP`, UI/CV-связность, исправления 502 и модала заявок, деплой swap |
| v1.1.0 | 2026-06-12 | Роль `bizadmin`, настройки CV, CLIP-проверка Сбербанка |
| v1.0.0 | 2026-06-10 | Первый релиз |

Подробнее: [ARCHITECTURE.md](./ARCHITECTURE.md) → раздел «Запуск и деплой».

## Документация

- [ARCHITECTURE.md](./ARCHITECTURE.md) — архитектура приложения
- [INTEGRATION_API.md](./INTEGRATION_API.md) — API для внешних систем

## Стек

React + Vite · Express · SQLite (`node:sqlite`) · JWT · web-push · sharp · CLIP (`@xenova/transformers`)
