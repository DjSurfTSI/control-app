#!/bin/bash
# Включает swap на VPS с малым объёмом RAM (vite build часто падает с «Killed» без swap).
# Запуск: sudo bash deploy/ensure-swap.sh

set -e

SWAP_FILE="${SWAP_FILE:-/swapfile}"
SWAP_SIZE_MB="${SWAP_SIZE_MB:-2048}"
MIN_RAM_MB="${MIN_RAM_MB:-1536}"

if swapon --show 2>/dev/null | grep -q .; then
  echo "Swap уже включён:"
  swapon --show
  free -h
  exit 0
fi

total_ram_mb=$(free -m | awk '/^Mem:/{print $2}')
echo "ОЗУ: ${total_ram_mb} МБ"

if [ "$total_ram_mb" -ge "$MIN_RAM_MB" ]; then
  echo "Достаточно RAM, swap не требуется."
  exit 0
fi

if [ -f "$SWAP_FILE" ]; then
  echo "Файл swap существует, активируем: $SWAP_FILE"
  chmod 600 "$SWAP_FILE"
  mkswap "$SWAP_FILE" >/dev/null 2>&1 || true
  swapon "$SWAP_FILE"
else
  echo "Создаём swap ${SWAP_SIZE_MB} МБ: $SWAP_FILE"
  if fallocate -l "${SWAP_SIZE_MB}M" "$SWAP_FILE" 2>/dev/null; then
    :
  else
    dd if=/dev/zero of="$SWAP_FILE" bs=1M count="$SWAP_SIZE_MB" status=progress
  fi
  chmod 600 "$SWAP_FILE"
  mkswap "$SWAP_FILE"
  swapon "$SWAP_FILE"
fi

if ! grep -qF "$SWAP_FILE" /etc/fstab 2>/dev/null; then
  echo "$SWAP_FILE none swap sw 0 0" >> /etc/fstab
  echo "Добавлено в /etc/fstab"
fi

echo "Swap включён:"
swapon --show
free -h
