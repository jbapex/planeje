#!/bin/bash

# Script de Deploy para VPS
# Uso: ./deploy-vps.sh

set -e  # Parar em caso de erro

echo "🚀 Iniciando deploy na VPS..."

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar se está na pasta correta
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Erro: package.json não encontrado. Execute este script na raiz do projeto.${NC}"
    exit 1
fi

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js não encontrado. Instale Node.js 18+ primeiro.${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${YELLOW}⚠️  Node.js versão $NODE_VERSION detectada. Recomendado Node.js 18+.${NC}"
fi

echo -e "${GREEN}✅ Node.js $(node -v) encontrado${NC}"

# Instalar dependências
echo ""
echo "📦 Instalando dependências..."
npm install

# Fazer build
echo ""
echo "🔨 Fazendo build de produção..."
npm run build

# Verificar se o build foi bem-sucedido
if [ ! -d "dist" ]; then
    echo -e "${RED}❌ Erro: Pasta dist não foi criada. Verifique os erros acima.${NC}"
    exit 1
fi

if [ ! -f "dist/index.html" ]; then
    echo -e "${RED}❌ Erro: dist/index.html não encontrado. Build falhou.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build concluído com sucesso!${NC}"
echo ""

# Verificar estrutura do build
echo "📁 Estrutura do build:"
ls -lh dist/ | head -10

echo ""
echo -e "${GREEN}✅ Deploy concluído!${NC}"
echo ""
echo "📋 Próximos passos:"
echo "1. Configure o nginx para apontar para: $(pwd)/dist"
echo "2. Use o arquivo: deploy/nginx-site.conf como referência"
echo "3. Certifique-se de que o nginx tem permissão para ler os arquivos"
echo ""
echo "Para configurar nginx:"
echo "  sudo cp deploy/nginx-site.conf /etc/nginx/sites-available/planeje"
echo "  sudo nano /etc/nginx/sites-available/planeje  # Edite o server_name e root"
echo "  sudo ln -s /etc/nginx/sites-available/planeje /etc/nginx/sites-enabled/"
echo "  sudo nginx -t"
echo "  sudo systemctl reload nginx"
echo ""
echo "Para verificar permissões:"
echo "  sudo chown -R www-data:www-data $(pwd)/dist"
echo "  sudo chmod -R 755 $(pwd)/dist"

