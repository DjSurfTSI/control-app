# Контроль уборки банкоматов

Веб-приложение для планирования, исполнения и контроля уборки банкоматов.

**Текущая версия:** v1.1.0 — роль бизнес-администратор, настройки CV в UI, сжатие фото, CLIP-проверка банкомата Сбербанка.

## Возможности

- **Роли:** бизнес-администратор, администратор, супервайзер, уборщик
- Заявки на уборку с фотоотчётом (слева, справа, спереди)
- **Автосжатие фото** — сервер уменьшает снимки с камеры до оптимального размера (sharp, до 1280px JPEG)
- **CV-проверка фото** — CLIP определяет банкомат Сбербанка (зелёный или серый); без подтверждения заявка не завершается (только для уборщика)
- **Настройки CV** (бизнес-администратор) — включение/отключение модели и управление точностью (порог и запас) без перезапуска сервера
- Импорт/экспорт Excel
- Push-уведомления и PWA
- Integration API для ERP/CRM/1С

### Роли

| Роль | Код | Основные права |
|------|-----|----------------|
| Бизнес-администратор | `bizadmin` | Все права админа и супервайзера + раздел «Настройки» (CV) |
| Администратор | `admin` | Заявки, банкоматы, все пользователи (кроме bizadmin), интеграция |
| Супервайзер | `supervisor` | Заявки, банкоматы, управление уборщиками |
| Уборщик | `cleaner` | Свои заявки, фотоотчёт, CV при завершении |

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
```

> При `CV_ENABLED=true` при первом запуске скачивается модель CLIP (~150 MB) в `.cache/transformers`. Рекомендуется **≥1 GB RAM** на сервере.
>
> Параметры `enabled`, `threshold` и `margin` можно менять в UI под учётной записью **бизнес-администратор** — значения сохраняются в БД (`cv_settings`) и применяются без перезапуска.

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

Причина — нехватка RAM на VPS (sharp / CLIP). С v1.1.1+ фото **сжимаются в браузере** до отправки, sharp на сервере часто не вызывается.

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

Подробнее: [ARCHITECTURE.md](./ARCHITECTURE.md) → раздел «Запуск и деплой».

## Документация

- [ARCHITECTURE.md](./ARCHITECTURE.md) — архитектура приложения
- [INTEGRATION_API.md](./INTEGRATION_API.md) — API для внешних систем

## Стек

React + Vite · Express · SQLite (`node:sqlite`) · JWT · web-push · sharp · CLIP (`@xenova/transformers`)
