#!/bin/bash
# Настройка control-app на VPS Reg.ru (Ubuntu/Debian)
# Запуск: sudo bash deploy/setup-server.sh

set -e

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NGINX_SITE="control-app"
NGINX_AVAILABLE="/etc/nginx/sites-available/${NGINX_SITE}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${NGINX_SITE}"

echo "==> Проект: ${APP_DIR}"

if ! command -v node >/dev/null 2>&1; then
  echo "Ошибка: Node.js не установлен. Нужен Node.js 22+"
  exit 1
fi

NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Ошибка: Node.js $(node -v). Нужен 22+"
  exit 1
fi

echo "==> Node.js $(node -v)"

cd "$APP_DIR"

echo "==> Установка зависимостей..."
npm install --prefix server
npm install --prefix client
npm rebuild --prefix server sharp 2>/dev/null || true

echo "==> Сборка фронтенда..."
bash "$APP_DIR/deploy/build-client.sh"

if [ ! -f "$APP_DIR/client/dist/index.html" ]; then
  echo "Ошибка: client/dist/index.html не найден"
  exit 1
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "==> Установка pm2..."
  npm install -g pm2
fi

if [ ! -f "$APP_DIR/server/.env" ]; then
  cp "$APP_DIR/server/.env.example" "$APP_DIR/server/.env"
  echo "Создан server/.env — отредактируйте JWT_SECRET и VAPID-ключи"
fi

echo "==> Запуск приложения через pm2..."
pm2 delete control-app 2>/dev/null || true
pm2 start "$APP_DIR/deploy/ecosystem.config.cjs"
pm2 save

if command -v systemctl >/dev/null 2>&1; then
  pm2 startup systemd -u "${SUDO_USER:-root}" --hp "$(eval echo ~${SUDO_USER:-root})" 2>/dev/null || true
fi

echo "==> Настройка nginx..."
if ! command -v nginx >/dev/null 2>&1; then
  echo "Ошибка: nginx не установлен"
  exit 1
fi

cp "$APP_DIR/deploy/nginx-control-app.conf" "$NGINX_AVAILABLE"
ln -sf "$NGINX_AVAILABLE" "$NGINX_ENABLED"

# Убрать дефолтную страницу «Welcome to nginx»
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl reload nginx

echo ""
echo "Готово."
echo "  Приложение: pm2 status"
echo "  Логи:       pm2 logs control-app"
echo "  Проверка:   curl -I http://127.0.0.1:3001"
echo "  В браузере: http://IP_вашего_сервера"
echo ""
echo "Домен и SSL (control-app.ru):"
echo "  1. В Reg.ru: A-запись control-app.ru и www → IP сервера"
echo "  2. sudo CERTBOT_EMAIL=admin@control-app.ru bash deploy/setup-ssl.sh"
echo ""
echo "Переменные окружения (server/.env или pm2):"
echo "  JWT_SECRET, VAPID_PUBLIC, VAPID_PRIVATE"
