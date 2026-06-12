# Контроль уборки банкоматов

Веб-приложение для планирования, исполнения и контроля уборки банкоматов.

## Возможности

- Роли: администратор, супервайзер, уборщик
- Задания на уборку с фотоотчётом (слева, справа, спереди)
- Импорт/экспорт Excel
- Push-уведомления и PWA
- Integration API для ERP/CRM/1С

## Быстрый старт

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

## Документация

- [ARCHITECTURE.md](./ARCHITECTURE.md) — архитектура приложения
- [INTEGRATION_API.md](./INTEGRATION_API.md) — API для внешних систем

## Стек

React + Vite · Express · SQLite · JWT · web-push
