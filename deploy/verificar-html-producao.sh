#!/usr/bin/env bash
# Uso: ./deploy/verificar-html-producao.sh [URL]
# Sai com código 1 se o HTML for de Vite dev (tela branca comum com Nginx errado).

set -euo pipefail
URL="${1:-https://planeje.jbapex.com.br}"
HTML=$(curl -fsS "$URL/" || true)

if echo "$HTML" | grep -q '@vite/client'; then
  echo "ERRO: $URL está servindo modo DESENVOLVIMENTO do Vite (/@vite/client)."
  echo "       O Nginx não deve fazer proxy para 'npm run dev' em produção."
  echo "       Corrija: root .../planeje/dist; sem proxy_pass para a porta do Vite."
  echo "       Depois: cd .../planeje && npm run build && sudo nginx -t && sudo systemctl reload nginx"
  exit 1
fi

if echo "$HTML" | grep -q '/src/main.jsx'; then
  echo "ERRO: HTML referencia /src/main.jsx (entrada de dev, não de dist/)."
  exit 1
fi

if ! echo "$HTML" | grep -q '/assets/index\.'; then
  echo "AVISO: Não encontrado script /assets/index.* — confira se é o index.html do build (npm run build)."
  exit 1
fi

echo "OK: HTML parece build de produção (assets com hash)."
