#!/bin/bash
# Сборка client/dist с учётом мало-RAM VPS.
# Запуск из корня репозитория: bash deploy/build-client.sh

set -e

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

if [ "$(id -u)" -eq 0 ] && [ "$(swapon --show 2>/dev/null | wc -l)" -eq 0 ]; then
  bash "$APP_DIR/deploy/ensure-swap.sh" || true
elif [ "$(swapon --show 2>/dev/null | wc -l)" -eq 0 ]; then
  ram_mb=$(free -m | awk '/^Mem:/{print $2}')
  if [ "$ram_mb" -lt 1536 ]; then
    echo "Внимание: мало RAM (${ram_mb} МБ) и нет swap."
    echo "Запустите: sudo bash deploy/ensure-swap.sh"
    echo "Или соберите локально: npm run build --prefix client && scp -r client/dist user@server:~/control-app/client/"
  fi
fi

echo "==> Сборка фронтенда (vite)..."
# Ограничение heap снижает пиковое потребление RAM на слабых VPS
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=512}"
npm run build --prefix client

if [ ! -f "$APP_DIR/client/dist/index.html" ]; then
  echo "Ошибка: client/dist/index.html не найден"
  exit 1
fi

echo "==> Сборка завершена: client/dist/"
