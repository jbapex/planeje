#!/bin/bash

# Script para sincronizar arquivos com a VPS
# Uso: ./sync-vps.sh

set -e

VPS_HOST="root@72.60.14.109"
VPS_PATH="/root/planeje"
LOCAL_PATH="/Users/josiasbonfimdefaria/Downloads/planeje"

echo "🔄 Sincronizando arquivos com a VPS..."
echo "Host: $VPS_HOST"
echo "Destino: $VPS_PATH"
echo ""

cd "$LOCAL_PATH"

rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'dist' \
  --exclude '.cache' \
  --exclude '.vscode' \
  --exclude '.DS_Store' \
  --exclude '*.log' \
  ./ "$VPS_HOST:$VPS_PATH/"

echo ""
echo "✅ Sincronização concluída!"
echo ""
echo "📋 Próximos passos na VPS:"
echo "1. ssh $VPS_HOST"
echo "2. cd $VPS_PATH"
echo "3. npm install"
echo "4. npm run build"
echo "5. ./diagnostico-vps.sh"

