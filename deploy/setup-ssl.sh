#!/bin/bash
# Выпуск и установка Let's Encrypt SSL для control-app.ru
# Запуск на сервере из корня репозитория:
#   sudo CERTBOT_EMAIL=admin@control-app.ru bash deploy/setup-ssl.sh
#
# Перед запуском:
#   1. DNS: A-запись control-app.ru → IP сервера
#   2. DNS: A или CNAME www.control-app.ru → тот же IP / control-app.ru
#   3. Порты 80 и 443 открыты в файрволе Reg.ru / ufw

set -e

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DOMAIN="control-app.ru"
NGINX_SITE="control-app"
EMAIL="${CERTBOT_EMAIL:-}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Запустите с sudo: sudo CERTBOT_EMAIL=you@$DOMAIN bash deploy/setup-ssl.sh"
  exit 1
fi

if [ -z "$EMAIL" ]; then
  echo "Укажите email для Let's Encrypt:"
  echo "  sudo CERTBOT_EMAIL=admin@$DOMAIN bash deploy/setup-ssl.sh"
  exit 1
fi

echo "==> Домен: $DOMAIN"
echo "==> Email: $EMAIL"

if ! command -v nginx >/dev/null 2>&1; then
  echo "Ошибка: nginx не установлен"
  exit 1
fi

echo "==> Проверка DNS (control-app.ru)..."
if command -v dig >/dev/null 2>&1; then
  dig +short A "$DOMAIN" || true
  dig +short A "www.$DOMAIN" || true
else
  echo "    (dig не найден — проверьте DNS вручную в панели Reg.ru)"
fi

echo "==> Certbot..."
if ! command -v certbot >/dev/null 2>&1; then
  apt-get update
  apt-get install -y certbot python3-certbot-nginx
fi

mkdir -p /var/www/certbot

echo "==> Nginx-конфиг с доменом..."
cp "$APP_DIR/deploy/nginx-control-app.conf" "/etc/nginx/sites-available/${NGINX_SITE}"
ln -sf "/etc/nginx/sites-available/${NGINX_SITE}" "/etc/nginx/sites-enabled/${NGINX_SITE}"
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl reload nginx

echo "==> Выпуск сертификата (Let's Encrypt)..."
certbot --nginx \
  -d "$DOMAIN" \
  -d "www.$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  --redirect \
  --non-interactive

echo "==> Проверка автообновления..."
systemctl enable certbot.timer 2>/dev/null || true
systemctl start certbot.timer 2>/dev/null || true
certbot renew --dry-run

nginx -t
systemctl reload nginx

echo ""
echo "Готово."
echo "  Сайт:     https://$DOMAIN"
echo "  Сертификат обновляется автоматически (certbot.timer)."
echo "  Проверка: curl -I https://$DOMAIN"
echo ""
echo "Откройте в браузере https://$DOMAIN и включите Push (нужен HTTPS)."
