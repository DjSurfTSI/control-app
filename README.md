# Контроль уборки банкоматов

Веб-приложение для планирования, исполнения и контроля уборки банкоматов.

## Возможности

- Роли: администратор, супервайзер, уборщик
- Заявки на уборку с фотоотчётом (слева, справа, спереди)
- Импорт/экспорт Excel
- Push-уведомления и PWA
- Integration API для ERP/CRM/1С

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

**Демо:** `supervisor@bank.ru` / `admin123`

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
```

Обновление на сервере:

```bash
git pull
npm install --prefix server
npm run build --prefix client
pm2 restart control-app
```

Подробнее: [ARCHITECTURE.md](./ARCHITECTURE.md) → раздел «Запуск и деплой».

## Документация

- [ARCHITECTURE.md](./ARCHITECTURE.md) — архитектура приложения
- [INTEGRATION_API.md](./INTEGRATION_API.md) — API для внешних систем

## Стек

React + Vite · Express · SQLite (`node:sqlite`) · JWT · web-push
