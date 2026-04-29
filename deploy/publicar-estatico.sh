#!/usr/bin/env bash
# Publica o build de produção na pasta que o Nginx serve.
# Rode na VPS, na raiz do repositório (onde está package.json), com Node instalado.
#
# Uso:
#   chmod +x deploy/publicar-estatico.sh
#   ./deploy/publicar-estatico.sh
#
# Se o Nginx usa root .../dist (nginx-site.conf), defina o destino:
#   PLANEJE_WWW=/var/www/planeje/dist ./deploy/publicar-estatico.sh
#
# Padrão PLANEJE_WWW=/var/www/planeje (conteúdo de dist/ copiado para a raiz do site, como em nginx-planeje-proxy.conf)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${PLANEJE_WWW:-/var/www/planeje}"

cd "$ROOT"

if [[ ! -f package.json ]]; then
  echo "Erro: execute na raiz do projeto (package.json não encontrado)." >&2
  exit 1
fi

echo ">>> Build em $ROOT"
npm run build

if [[ ! -f dist/index.html ]]; then
  echo "Erro: dist/index.html não existe após o build." >&2
  exit 1
fi

echo ">>> Copiando dist/ -> $DEST (requer sudo se a pasta for do www-data)"
sudo mkdir -p "$DEST"
sudo rsync -a --delete "$ROOT/dist/" "$DEST/"

echo ">>> Permissões para o Nginx (www-data)"
sudo chown -R www-data:www-data "$DEST"
sudo find "$DEST" -type d -exec chmod 755 {} \;
sudo find "$DEST" -type f -exec chmod 644 {} \;

echo ">>> Concluído. Recarregue o Nginx se alterou a config: sudo nginx -t && sudo systemctl reload nginx"
