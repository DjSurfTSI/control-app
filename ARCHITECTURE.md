# Архитектура приложения «Контроль уборки банкоматов»

Документ описывает устройство системы и даёт рекомендации по адаптации под другие проекты: выездное обслуживание, контроль уборки, инспекции объектов и т.п.

---

## 1. Общая схема

Приложение построено по схеме **SPA + REST API + Integration Layer**. Три канала доступа к данным:

| Канал | Аутентификация | Потребители |
|-------|----------------|-------------|
| **Internal API** `/api/*` | JWT Bearer | Веб-интерфейс (React) |
| **Integration API** `/api/integration/v1/*` | API Key (`X-API-Key`) | ERP, CRM, 1С, Service Desk |
| **Webhooks** (исходящие) | HMAC-SHA256 подпись | Системы-подписчики |

```mermaid
flowchart TB
    subgraph Client["Frontend (React + Vite)"]
        UI[Страницы и компоненты]
        AuthCtx[AuthContext — JWT]
        API_Client[api.js]
        SW[Service Worker]
    end

    subgraph Server["Backend (Express.js)"]
        Internal["Internal API /api/*"]
        Integration["Integration API /api/integration/v1/*"]
        AdminInt["Admin API /api/integration/clients"]
        MW_JWT[middleware.js — JWT + роли]
        MW_Key[integration/middleware.js — API Key + scopes]
        WH[integration/webhooks.js]
        DB[(SQLite)]
        FS[uploads/]
        Push[web-push]
    end

    subgraph External["Внешние системы"]
        Browser[Браузер / PWA]
        ERP[ERP / 1С / SAP / CRM]
        Excel[Excel .xlsx]
        HookURL[Webhook endpoint]
    end

    Browser --> UI --> API_Client
    API_Client -->|JWT| Internal --> MW_JWT --> DB
    ERP -->|API Key| Integration --> MW_Key --> DB
    AdminInt --> MW_JWT
    Internal --> WH
    Integration --> WH
    WH -->|POST + HMAC| HookURL
    Internal --> FS
    Internal --> Push
    SW --> Internal
    Internal --> Excel
```

> Полный контракт Integration API: **[INTEGRATION_API.md](./INTEGRATION_API.md)**

---

## 2. Структура репозитория

```
atm-cleaning-control/
├── client/                     # Frontend
│   ├── public/
│   │   ├── manifest.json       # PWA-манифест
│   │   ├── sw.js               # Service Worker (push)
│   │   └── icon.svg
│   └── src/
│       ├── api.js              # Единая точка всех HTTP-запросов
│       ├── context/
│       │   └── AuthContext.jsx # Глобальное состояние авторизации
│       ├── components/         # Переиспользуемые UI-блоки
│       ├── pages/              # Экраны (маршруты)
│       │   ├── Settings.jsx    # Настройки CV (только bizadmin)
│       ├── offline/
│       │   ├── store.js            # IndexedDB: кэш заявок/фото, очередь
│       │   ├── sync.js             # Синхронизация очереди при online
│       │   └── registerSw.js       # Регистрация Service Worker
│       ├── hooks/
│       │   ├── useCvStatus.js      # Статус CV (enabled) для UI
│       │   ├── useOffline.js       # Статус сети и очереди
│       │   └── useNotifications.js
│       ├── utils/
│       │   └── compressImage.js    # Сжатие фото в браузере
│       └── utils.js                # Константы, роли, проверка фото
│
├── deploy/
│   ├── setup-server.sh
│   ├── build-client.sh         # Сборка фронта (мало-RAM VPS)
│   ├── ensure-swap.sh          # Swap перед vite build
│   ├── ecosystem.config.cjs
│   └── nginx-control-app.conf
│
├── server/                     # Backend
│   ├── db.js                   # Схема БД, сиды, миграции
│   ├── roles.js                # Роли: bizadmin, isManager, hasRoleAccess
│   ├── middleware.js           # JWT, проверка ролей
│   ├── push.js                 # Push-уведомления (web-push)
│   ├── index.js                # Точка входа Express
│   ├── integration/            # Слой интеграции с внешними АС
│   │   ├── middleware.js       # API Key, scopes, логирование
│   │   ├── schemas.js          # Форматы ответов для v1 API
│   │   └── webhooks.js         # Исходящие webhook-события
│   ├── cv/                     # CV-проверка фотоотчётов
│   │   ├── atmDetector.js      # CLIP zero-shot: банкомат Сбербанка на фото
│   │   ├── settings.js         # Настройки CV (cv_settings в БД)
│   │   └── validatePhotos.js   # Проверка ракурсов и сохранение результата
│   ├── utils/
│   │   └── optimizePhoto.js    # Сжатие на сервере (sharp) или passthrough
│   ├── middleware/
│   │   └── errorHandler.js     # Обработка ошибок API
│   ├── routes/
│   │   ├── auth.js
│   │   ├── users.js
│   │   ├── atms.js
│   │   ├── tasks.js
│   │   ├── photos.js
│   │   ├── settings.js         # GET/PATCH /api/settings/cv (bizadmin)
│   │   ├── notifications.js
│   │   └── integration.js      # v1 API + admin endpoints
│   └── uploads/                # Фотоотчёты (файловое хранилище)
│
├── package.json
├── ARCHITECTURE.md             # Этот документ
└── INTEGRATION_API.md          # Контракт для внешних систем
```

### Стек технологий

| Слой | Технология | Назначение |
|------|------------|------------|
| UI | React 19 + Vite | Интерфейс, быстрая разработка |
| Маршрутизация | React Router 7 | Экраны и защита по ролям |
| API | Express 4 | REST без лишней сложности |
| БД | SQLite (`node:sqlite`) | Файл `atm-cleaning.db`, без отдельного сервера СУБД |
| Авторизация | JWT + bcryptjs | Stateless-сессии |
| Файлы | Multer + **sharp** | Загрузка, сжатие и ресайз фото на диск |
| Отчёты | SheetJS (`xlsx`) | Импорт и экспорт Excel |
| Push | web-push + Service Worker | Фоновые уведомления |
| PWA | manifest.json + sw.js | Установка на мобильный экран |
| CV | CLIP (`@xenova/transformers`) | Банкомат Сбербанка (зелёный/серый) на фото |
| Интеграция | API Key + Webhooks | Обмен данными с ERP/CRM/1С |

---

## 3. Модель данных

```mermaid
erDiagram
    users ||--o{ cleaning_tasks : "assigned_to"
    users ||--o{ push_subscriptions : "user_id"
    atms ||--o{ cleaning_tasks : "atm_id"
    cleaning_tasks ||--o{ task_photos : "task_id"
    users ||--o{ task_photos : "uploaded_by"
    api_clients ||--o{ webhook_endpoints : "api_client_id"
    api_clients ||--o{ integration_log : "api_client_id"

    users {
        int id PK
        string email UK
        string password_hash
        string full_name
        string role "bizadmin | admin | supervisor | cleaner"
        string phone
        int active
        datetime created_at
    }

    atms {
        int id PK
        string serial_number UK
        string bank_name
        string address
        string zone
        string notes
        string external_id UK
        int active
    }

    cleaning_tasks {
        int id PK
        int atm_id FK
        int assigned_to FK
        date scheduled_date
        string status
        string priority
        string external_id UK
        string source_system
        datetime created_at
        datetime updated_at
    }

    task_photos {
        int id PK
        int task_id FK
        string filename
        string photo_type "left | right | front"
        int cv_detected "0 | 1"
        float cv_confidence
        datetime cv_checked_at
        int uploaded_by FK
        datetime created_at
    }

    push_subscriptions {
        int id PK
        int user_id FK
        string endpoint UK
    }

    api_clients {
        int id PK
        string name
        string api_key_hash UK
        string scopes "JSON array"
        int active
    }

    webhook_endpoints {
        int id PK
        int api_client_id FK
        string url
        string secret
        string events "JSON array"
    }

    integration_log {
        int id PK
        string direction "inbound | outbound"
        int status_code
        datetime created_at
    }

    cv_settings {
        int id PK "singleton id=1"
        int enabled
        real threshold
        real margin
        datetime updated_at
        int updated_by FK
    }
```

### Универсальные аналоги для других проектов

| Сущность сейчас | Универсальный аналог |
|-----------------|----------------------|
| `atms` | Объекты: офисы, магазины, оборудование |
| `cleaning_tasks` | Заявки, наряды, тикеты |
| `users` (cleaner) | Исполнители, техники, курьеры |
| `task_photos` | Доказательства выполнения |
| `push_subscriptions` | Подписки на события |
| `api_clients` | Внешние системы с API-ключами |
| `cv_settings` | Параметры CV (вкл/выкл, порог, запас) — управление через bizadmin |
| `external_id` | Связь записей между АС |

---

## 4. Слой интеграции (Integration Layer)

### 4.1 Два направления обмена

```mermaid
flowchart LR
    subgraph Inbound["Inbound — внешняя АС → приложение"]
        ERP1[ERP] -->|POST /v1/tasks| API1[Integration API]
        API1 --> DB1[(SQLite)]
    end

    subgraph Outbound["Outbound — приложение → внешняя АС"]
        App[Internal/Integration API] -->|событие| WH[webhooks.js]
        WH -->|POST + HMAC| ERP2[Webhook URL]
    end
```

### 4.2 Integration API v1 (входящий)

| Endpoint | Scope | Описание |
|----------|-------|----------|
| `GET /v1/health` | любой ключ | Проверка доступности |
| `GET /v1/tasks` | `tasks:read` | Список заявок |
| `POST /v1/tasks` | `tasks:write` | Создание заявки |
| `POST /v1/tasks/batch` | `tasks:write` | Массовое создание |
| `PATCH /v1/tasks/:id` | `tasks:write` | Обновление статуса |
| `GET /v1/atms` | `atms:read` | Список банкоматов |
| `POST /v1/atms` | `atms:write` | Upsert банкомата |
| `GET /v1/stats` | `tasks:read` | Агрегированная статистика |

### 4.3 Webhooks (исходящий)

При любом изменении заявки (UI, Excel, Integration API) вызывается `dispatchWebhooks()`:

| Событие | Триггер |
|---------|---------|
| `task.created` | Создание заявки |
| `task.updated` | Изменение полей |
| `task.completed` | status → completed |
| `task.cancelled` | Отмена |
| `atm.created` / `atm.updated` | Синхронизация объектов |

### 4.4 Admin API (управление интеграцией)

Только для роли `admin` (JWT):

| Endpoint | Описание |
|----------|----------|
| `POST /api/integration/clients` | Создать API-ключ |
| `GET /api/integration/clients` | Список подключённых систем |
| `POST /api/integration/webhooks` | Зарегистрировать webhook URL |
| `GET /api/integration/logs` | Журнал запросов |

### 4.5 Демо-ключ для разработки

```
X-API-Key: atk_dev_integration_key_2026
```

---

## 5. Роли и доступ к Internal API

Роли определены в `server/roles.js`. Роль **`bizadmin`** (бизнес-администратор) автоматически проходит любую проверку `requireRole(...)` и объединяет права **admin** и **supervisor**. Дополнительно доступны только ей:

- UI: `/settings` — включение CV, порог (`threshold`) и запас (`margin`)
- API: `GET/PATCH /api/settings/cv`

Администратор (`admin`) не может создавать, редактировать или удалять учётные записи `bizadmin`.

```mermaid
flowchart LR
    Request[HTTP запрос] --> Auth{JWT валиден?}
    Auth -->|Нет| E401[401 Unauthorized]
    Auth -->|Да| Role{Роль подходит?}
    Role -->|Нет| E403[403 Forbidden]
    Role -->|Да| Handler[Обработчик маршрута]
    Handler --> DB[(SQLite)]
```

| Маршрут | bizadmin | admin | supervisor | cleaner | Описание |
|---------|:--------:|:-----:|:----------:|:-------:|----------|
| `POST /api/auth/login` | ✓ | ✓ | ✓ | ✓ | Вход |
| `GET /api/auth/me` | ✓ | ✓ | ✓ | ✓ | Текущий пользователь |
| `GET /api/tasks` | все | все | все | только свои | Список заявок |
| `POST /api/tasks` | ✓ | ✓ | ✓ | — | Создание заявки |
| `POST /api/tasks/import` | ✓ | ✓ | ✓ | — | Импорт из Excel |
| `GET /api/tasks/export` | ✓ | ✓ | ✓ | — | Экспорт в Excel |
| `PATCH /api/tasks/:id` | ✓ | ✓ | ✓ | свои | Изменение / завершение |
| `GET /api/atms` | ✓ | ✓ | ✓ | ✓ | Список банкоматов |
| `POST /api/atms` | ✓ | ✓ | ✓ | — | Добавление банкомата |
| `GET /api/users` | все | все | только cleaner | — | Список пользователей |
| `POST /api/users` | все роли | admin/supervisor/cleaner | только cleaner | — | Создание учётной записи |
| `DELETE /api/users/:id` | ✓ | ✓* | cleaner | — | Удаление / деактивация |
| `POST /api/photos/:taskId` | ✓ | ✓ | ✓ | свои | Загрузка → сжатие → CV в фоне |
| `GET /api/photos/:taskId` | ✓ | ✓ | ✓ | свои* | Список фото (`cv_detected`, `cv_confidence`) |
| `GET/PATCH /api/settings/cv` | ✓ | — | — | — | Полные настройки CV (bizadmin) |
| `GET /api/settings/cv/status` | ✓ | ✓ | ✓ | ✓ | Статус CV вкл/выкл (для UI) |
| `POST /api/notifications/subscribe` | ✓ | ✓ | ✓ | ✓ | Подписка на push |

\* admin не управляет учётными записями `bizadmin`

Проверка ролей: `server/middleware.js` (`requireRole`, `requireBizAdmin`).

---

## 6. Бизнес-процессы

### 6.1 Жизненный цикл заявки

```mermaid
stateDiagram-v2
    [*] --> pending: UI / Excel / Integration API
    pending --> in_progress: Уборщик нажимает «Начать»
    in_progress --> completed: 3 фото + CV OK + отчёт
    in_progress --> in_progress: CV отклонил фото
    pending --> overdue: Дата прошла
    in_progress --> overdue: Дата прошла
    pending --> cancelled: Отмена менеджером
    in_progress --> cancelled: Отмена менеджером
    completed --> [*]
    cancelled --> [*]
    overdue --> in_progress: Уборщик начинает
    overdue --> completed: Выполнение с фото
```

### 6.2 Фотоотчёт (обязательные ракурсы)

Перед завершением заявки уборщик обязан загрузить три фото:

| `photo_type` | Подпись в UI |
|--------------|--------------|
| `left` | Слева |
| `right` | Справа |
| `front` | Спереди |

### 6.2.1 Сжатие и оптимизация разрешения

Двухэтапный пайплайн (v1.2.0):

| Этап | Где | Описание |
|------|-----|----------|
| 1. Браузер | `client/src/utils/compressImage.js` | Ресайз до `PHOTO_MAX_EDGE` (1280px), JPEG ~82% **до** отправки на сервер |
| 2. Сервер | `server/utils/optimizePhoto.js` | sharp — только если файл > `PHOTO_PASSTHROUGH_MAX_BYTES`; иначе **passthrough** (сохранение как есть) |

| Параметр | По умолчанию | Описание |
|----------|--------------|----------|
| `PHOTO_MAX_EDGE` | `1280` | Макс. длинная сторона (браузер и sharp) |
| `PHOTO_JPEG_QUALITY` | `82` | Качество JPEG |
| `PHOTO_UPLOAD_MAX_MB` | `12` | Лимит multer до сжатия |
| `PHOTO_PASSTHROUGH_MAX_BYTES` | `1800000` | Файлы меньше этого на сервере не обрабатываются sharp |
| `PHOTO_SKIP_SHARP` | `false` | `true` — всегда passthrough (рекомендуется на VPS < 1 GB RAM) |

Типичный размер после сжатия в браузере: **150–500 КБ** вместо 3–8 МБ с камеры.

### 6.2.2 CV-проверка банкомата на фото

Модуль `server/cv/` использует **CLIP zero-shot** (`Xenova/clip-vit-base-patch32`). Модель **не предзагружается** при старте — загрузка при первой проверке (экономия RAM на VPS).

| Этап | Действие |
|------|----------|
| Настройки | `cv_settings` в БД; UI bizadmin — `/settings`; статус для всех ролей — `GET /api/settings/cv/status` |
| CV выключена | UI без текстов про CV; завершение заявки — только 3 фото; сервер не запускает CLIP |
| CV включена | Загрузка фото → CV **в фоне** → `cv_detected`, `cv_confidence` |
| Завершение (cleaner) | Синхронная проверка всех ракурсов; при отказе — `in_progress`, код `cv_rejected` |

Проверка **обязательна только для роли `cleaner`** и **только если CV включена**. Менеджеры завершают заявку без CV.

Переменные окружения задают **начальные** значения CV. Бизнес-администратор может изменить `enabled`, `threshold` и `margin` через UI — они сохраняются в `cv_settings` и применяются без перезапуска (приоритет у БД).

```mermaid
sequenceDiagram
    participant C as Уборщик
    participant API as /api/photos
    participant IMG as optimizePhoto.js
    participant CV as atmDetector.js
    participant FS as uploads/
    participant DB as SQLite

    C->>API: POST фото + photo_type
    API->>IMG: resize + JPEG
    IMG->>FS: Сохранить ~1280px
    API-->>C: 201 OK (cv_pending)
    API->>CV: detectAtmInPhoto() в фоне
    CV->>DB: cv_detected, cv_confidence

    C->>API: PATCH /tasks/:id status=completed
    API->>CV: validateTaskPhotos() — все ракурсы
    alt Банкомат на всех фото
        API->>DB: status=completed
        API-->>C: 200 OK
    else Банкомат не обнаружен
        API->>DB: status=in_progress
        API-->>C: 400 cv_rejected
    end
```

### 6.3 Импорт заявок из Excel

**Шаблон** (`GET /api/tasks/import-template`) содержит столбцы:

| Столбец | Обязательный | Формат |
|---------|:------------:|--------|
| Банкомат | да | `ATM-001` (serial_number) |
| Дата | да | `ГГГГ-ММ-ДД` или `ДД.ММ.ГГГГ` |
| Email уборщика | нет | email или ФИО |
| Приоритет | нет | низкий / обычный / высокий |
| Примечание | нет | текст |

```mermaid
sequenceDiagram
    participant M as Менеджер
    participant API as /api/tasks/import
    participant XLSX as SheetJS
    participant DB as SQLite
    participant Push as web-push

    M->>API: POST .xlsx (multipart)
    API->>XLSX: Парсинг первого листа
    loop Каждая строка
        API->>DB: Найти банкомат по serial_number
        API->>DB: Найти уборщика по email / ФИО
        API->>DB: INSERT cleaning_tasks
        API->>Push: Уведомить уборщика (если назначен)
    end
    API-->>M: { total, created, failed, errors[] }
```

### 6.4 Push-уведомления

| Событие | Кому | Триггер |
|---------|------|---------|
| Новая заявка | Уборщик | Создание / назначение |
| CV отклонил фото | Уборщик | Банкомат не обнаружен при завершении |
| Просрочка | admin, supervisor | Автоматически при запросе stats/tasks |
| Уборка выполнена | admin, supervisor | status → completed |

---

## 7. Frontend

```mermaid
flowchart TB
    main[main.jsx] --> AuthProvider
    AuthProvider --> Router[BrowserRouter]
    Router --> App[App.jsx]

    App --> Login[Login.jsx]
    App --> Layout[Layout.jsx]

    Layout --> Dashboard[Dashboard.jsx]
    Layout --> Tasks[Tasks.jsx]
    Layout --> Atms[Atms.jsx]
    Layout --> Users[Users.jsx]
    Layout --> Settings[Settings.jsx — bizadmin]

    Tasks --> PhotoUpload
    Tasks --> ImportTasksModal
    Tasks --> TaskCard
    Layout --> useNotifications
```

### Ключевые файлы

| Файл | Назначение | При адаптации |
|------|------------|---------------|
| `src/api.js` | Все HTTP-запросы | Добавить/изменить endpoints |
| `src/utils.js` | Статусы, роли, типы фото | Вынести в `domain.config.js` |
| `src/context/AuthContext.jsx` | JWT, текущий пользователь | Обычно не меняется |
| `src/App.jsx` | Маршруты + `PrivateRoute` | Добавить страницы, роли |
| `src/pages/Settings.jsx` | Вкл/выкл CV, порог и запас | Только роль `bizadmin` |
| `src/hooks/useCvStatus.js` | Статус CV для PhotoUpload и завершения заявки | — |
| `src/utils/compressImage.js` | Сжатие JPEG в браузере перед upload | `PHOTO_MAX_EDGE` |
| `src/components/PhotoUpload.jsx` | Слоты фото, бейджи CV (если включена) | Зависит от `useCvStatus` |
| `src/components/ImportTasksModal.jsx` | UI импорта Excel | Обновить описание столбцов |
| `src/index.css` | Тема, анимации | Брендинг через CSS-переменные |

### Мобильная версия и PWA

- Пункт «Заявки» в нижней навигации на экранах < 768px (`Layout.jsx`)
- Карточки заявок вместо таблицы (`TaskCard.jsx`)
- `manifest.json` — установка на домашний экран
- `public/sw.js` — кэш app shell и статики, push-события

### Офлайн-режим и устойчивая загрузка (v1.3.0+)

```mermaid
flowchart LR
    UI[Tasks / Dashboard] --> API[api.js]
    API -->|online| REST["/api/*"]
    API -->|cache read| IDB[(IndexedDB)]
    API -->|cache write| IDB
    API -->|offline ops| Queue[очередь sync]
    Queue -->|online| REST
    SW[Service Worker] -->|shell| UI
```

| Компонент | Назначение |
|-----------|------------|
| `offline/store.js` | Кэш заявок и фото, очередь PATCH/upload |
| `offline/sync.js` | Сброс очереди при `online`, событие `offline-synced` |
| `api.js` | Офлайн-fallback: при ошибке сети — данные из IndexedDB |
| `AuthContext.jsx` | Кэш `offline_user` в localStorage при сетевых сбоях |

**v1.3.1 — защита от зависания UI:**

| Механизм | Значение | Эффект |
|----------|----------|--------|
| Таймаут HTTP | 20 с (`REQUEST_TIMEOUT_MS`) | Зависший сервер не блокирует экран навсегда |
| Запись в IndexedDB | в фоне (`void cacheTasks(...)`) | Успешный ответ API сразу отображается в UI |
| Таймаут IndexedDB | 5 с | Повреждённая БД не подвешивает загрузку |
| `Tasks.jsx` | заявки отдельно от `getAtms`/`getUsers` | Список заявок виден даже при сбое справочников |
| Ошибки загрузки | `loadError` в UI | Вместо пустого списка и «Загрузка...» — текст ошибки |

---

## 8. Запуск и деплой

### Разработка

```bash
# Установка
npm install --prefix server
npm install --prefix client

# Запуск (два процесса)
# Терминал 1
cd server && npm run dev    # http://localhost:3001

# Терминал 2
cd client && npm run dev    # http://localhost:5173 (proxy /api → 3001)
```

### Production (локально)

```bash
npm run build --prefix client   # → client/dist/
npm run start --prefix server   # Express отдаёт API + статику с :3001
```

### Production (VPS / Reg.ru)

В репозитории есть готовые конфиги в `deploy/`:

| Файл | Назначение |
|------|------------|
| `deploy/setup-server.sh` | Автонастройка: сборка, pm2, nginx |
| `deploy/build-client.sh` | Сборка фронта с подсказками по swap |
| `deploy/ensure-swap.sh` | Создание swap на мало-RAM VPS |
| `deploy/ecosystem.config.cjs` | Конфиг pm2 для `control-app` |
| `deploy/nginx-control-app.conf` | Nginx reverse proxy, таймауты загрузки фото |
| `server/.env.example` | Шаблон переменных (`PHOTO_SKIP_SHARP` и др.) |

```bash
sudo bash deploy/setup-server.sh
```

Схема на сервере:

```mermaid
flowchart LR
    Browser["Браузер / IP / домен"] --> Nginx["Nginx :80"]
    Nginx --> PM2["pm2: control-app"]
    PM2 --> Express["Express :3001"]
    Express --> Static["client/dist/"]
    Express --> API["/api/*"]
    Express --> DB[(atm-cleaning.db)]
    Express --> Uploads[uploads/]
```

Управление процессом:

```bash
pm2 status
pm2 restart control-app
pm2 logs control-app
```

> Не запускайте второй экземпляр через `npm start`, если pm2 уже держит порт 3001 (`EADDRINUSE`).

При включённой CV-проверке (`CV_ENABLED=true`) при первом запуске скачивается модель CLIP в `.cache/transformers` (~150 MB). Рекомендуется **≥1 GB RAM**.

```mermaid
flowchart LR
    subgraph Dev["Разработка"]
        Vite["Vite :5173"] -->|proxy /api| Express1["Express :3001"]
    end

    subgraph Prod["Production"]
        Browser2["Браузер"] --> Nginx2["Nginx"]
        Nginx2 --> Express2["Express :3001"]
        Express2 --> Static2["client/dist/"]
        Express2 --> API2["/api/*"]
        Express2 --> DB2[(atm-cleaning.db)]
        Express2 --> Uploads2[uploads/]
    end
```

### Демо-аккаунты

| Email | Роль | Пароль |
|-------|------|--------|
| bizadmin@bank.ru | Бизнес-администратор | admin123 |
| admin@bank.ru | Администратор | admin123 |
| supervisor@bank.ru | Супервайзер | admin123 |
| cleaner1@bank.ru | Уборщик | admin123 |

---

## 9. Адаптация под другой проект

### Минимальный чеклист

| # | Что менять | Где |
|---|------------|-----|
| 1 | Название сущности «объект» | `atms` → `locations`, `server/routes/atms.js`, `pages/Atms.jsx` |
| 2 | Роли пользователей | `db.js` CHECK, `middleware.js`, `utils.js` |
| 3 | Статусы заявок | `db.js`, `utils.js`, `routes/tasks.js` |
| 4 | Обязательные фото | `REQUIRED_PHOTO_TYPES` в `db.js`, `PHOTO_TYPES` в `utils.js` |
| 4a | Сжатие фото | `server/utils/optimizePhoto.js`, `PHOTO_MAX_EDGE`, `PHOTO_JPEG_QUALITY` |
| 4b | CV-модель, порог и margin | `server/cv/atmDetector.js`, `CV_ATM_THRESHOLD`, `CV_ATM_MARGIN` |
| 5 | Excel-шаблон | `routes/tasks.js` → `/import-template` и `/import` |
| 6 | Тексты push | `server/push.js` |
| 7 | Брендинг | `manifest.json`, `index.html`, CSS-переменные в `index.css` |
| 8 | Integration API | `routes/integration.js`, `INTEGRATION_API.md` |
| 9 | Webhook-события | `integration/webhooks.js`, `WEBHOOK_EVENTS` |
| 10 | Scopes | `api_clients.scopes` при создании ключей |

### Что можно не менять

- JWT-авторизация (`middleware.js`, `AuthContext.jsx`)
- Integration Layer (`integration/*`) — меняются только scopes и события
- Структура `api.js`
- PWA (manifest + service worker)
- Паттерн импорта/экспорта Excel
- Мобильная навигация и анимации
- Разграничение доступа через `PrivateRoute` и `requireRole`
- Паттерн `external_id` для синхронизации с внешними АС

### Масштабирование

```mermaid
flowchart LR
    subgraph Now["Текущая версия"]
        A1[React SPA] --> B1[Express]
        B1 --> C1[SQLite файл]
        B1 --> D1[uploads/ локально]
    end

    subgraph Later["При росте нагрузки"]
        A2[React SPA] --> B2[Express / NestJS]
        B2 --> C2[PostgreSQL]
        B2 --> D2[S3 / MinIO]
        B2 --> E2[Redis + очередь задач]
    end

    Now -.->|Замена слоя за слоем| Later
```

| Компонент | Сейчас | Возможная замена |
|-----------|--------|------------------|
| БД | SQLite (`node:sqlite`) | PostgreSQL — тот же SQL, другой драйвер |
| Файлы | `server/uploads/` | S3 / MinIO — меняется `routes/photos.js` и `cv/` |
| CV | CLIP on-node | Отдельный GPU-сервис / облачный Vision API |
| Push | web-push (VAPID) | FCM, OneSignal — меняется `push.js` |
| Auth | JWT в localStorage | OAuth2, Keycloak — меняется `middleware.js` |
| Очереди | Синхронно в HTTP | BullMQ / Redis для импорта и уведомлений |

---

## 10. Переменные окружения

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `PORT` | `3001` | Порт сервера (pm2 / `server/.env`) |
| `JWT_SECRET` | dev-секрет | Ключ подписи JWT |
| `VAPID_PUBLIC` | встроенный | Публичный ключ web-push |
| `VAPID_PRIVATE` | встроенный | Приватный ключ web-push |
| `CV_ENABLED` | `true` | Начальное значение «CV включена» (далее — `cv_settings`) |
| `CV_ATM_THRESHOLD` | `0.30` | Начальный порог уверенности «банкомат Сбербанк» (0–1) |
| `CV_ATM_MARGIN` | `0.12` | Начальный запас над метками «пол/стена» |
| `CV_TIMEOUT_MS` | `45000` | Таймаут одной CV-проверки (мс) |
| `PHOTO_MAX_EDGE` | `1280` | Макс. длинная сторона фото после сжатия (px) |
| `PHOTO_JPEG_QUALITY` | `82` | Качество JPEG при сохранении |
| `PHOTO_UPLOAD_MAX_MB` | `12` | Лимит исходника до сжатия (МБ) |
| `PHOTO_PASSTHROUGH_MAX_BYTES` | `1800000` | Порог passthrough без sharp (~1.8 МБ) |
| `PHOTO_SKIP_SHARP` | `false` | `true` — не использовать sharp на сервере |

Шаблон для production: `server/.env.example` → скопировать в `server/.env`.

Для production задайте собственные `JWT_SECRET` и VAPID-ключи:

```bash
npx web-push generate-vapid-keys
```

---

## 11. Резюме

Приложение — **шаблон системы полевого контроля с Integration Layer**:

1. **Менеджер** планирует заявки (UI, Excel, внешние АС через API).
2. **Исполнитель** выполняет на объекте (статусы + сжатые фото + CV-подтверждение банкомата Сбербанка).
3. **Система** отслеживает просрочки, шлёт push и webhook-события.
4. **Внешние АС** (ERP, 1С, CRM) синхронизируют данные через Integration API v1.
5. **Бизнес-администратор** управляет параметрами CV без перезапуска сервера.

### Документация

| Файл | Содержание |
|------|------------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Архитектура, модель данных, процессы |
| [INTEGRATION_API.md](./INTEGRATION_API.md) | Контракт API, webhooks, примеры кода |

Архитектура модульная: доменная логика в `routes/`, интеграция изолирована в `integration/`, UI в `client/src/pages/`.

---

## 12. История версий

| Версия | Дата | Изменения |
|--------|------|-----------|
| v1.3.1 | 2026-06-06 | Таймаут API 20 с, неблокирующий IndexedDB, раздельная загрузка заявок/справочников, fallback `offline_user` при сетевых ошибках |
| v1.3.0 | 2026-06-13 | Офлайн-режим: Service Worker, IndexedDB, очередь синхронизации, баннер сети |
| v1.2.0 | 2026-06-13 | Сжатие фото в браузере, `PHOTO_SKIP_SHARP`/passthrough, UI зависит от CV status, ленивая загрузка CLIP, `ensure-swap`/`build-client`, исправления 502 и модала заявок |
| v1.1.0 | 2026-06-12 | Роль `bizadmin`, настройки CV в UI (`/settings`, `cv_settings`), CLIP-проверка Сбербанка |
| v1.0.0 | 2026-06-10 | Первый релиз: заявки, банкоматы, Excel, push, Integration API v1 |
