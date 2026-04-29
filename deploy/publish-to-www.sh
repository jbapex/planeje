#!/usr/bin/env bash
# Copia dist/ para o path servido pelo Nginx (www-data). Rode após: npm run build
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)/dist"
DEST="/var/www/planeje"
if [[ ! -f "$SRC/index.html" ]]; then
  echo "ERRO: $SRC/index.html não existe. Rode: npm run build"
  exit 1
fi
sudo rsync -a --delete "$SRC/" "$DEST/"
sudo chown -R www-data:www-data "$DEST"
echo "OK: publicado em $DEST"
