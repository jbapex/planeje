#!/bin/bash

# Script de Diagnóstico para VPS - Tela em Branco
# Uso: ./diagnostico-vps.sh

set -e

echo "🔍 DIAGNÓSTICO DE TELA EM BRANCO NA VPS"
echo "========================================"
echo ""

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 1. Verificar se está na pasta correta
echo -e "${BLUE}1. Verificando estrutura do projeto...${NC}"
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ package.json não encontrado. Execute na raiz do projeto.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ package.json encontrado${NC}"
echo ""

# 2. Verificar Node.js
echo -e "${BLUE}2. Verificando Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js não encontrado${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js $(node -v) encontrado${NC}"
echo ""

# 3. Verificar se build foi feito
echo -e "${BLUE}3. Verificando build...${NC}"
if [ ! -d "dist" ]; then
    echo -e "${YELLOW}⚠️  Pasta dist não encontrada. Execute: npm run build${NC}"
else
    echo -e "${GREEN}✅ Pasta dist encontrada${NC}"
    
    if [ ! -f "dist/index.html" ]; then
        echo -e "${RED}❌ dist/index.html não encontrado${NC}"
    else
        echo -e "${GREEN}✅ dist/index.html encontrado${NC}"
        
        # Verificar se index.html tem referências corretas
        if grep -q "/assets/" dist/index.html; then
            echo -e "${GREEN}✅ index.html tem referências a /assets/${NC}"
        else
            echo -e "${YELLOW}⚠️  index.html pode não ter referências corretas aos assets${NC}"
        fi
    fi
    
    # Verificar pasta assets
    if [ -d "dist/assets" ]; then
        ASSET_COUNT=$(find dist/assets -type f | wc -l)
        echo -e "${GREEN}✅ Pasta dist/assets encontrada com $ASSET_COUNT arquivos${NC}"
    else
        echo -e "${RED}❌ Pasta dist/assets não encontrada${NC}"
    fi
fi
echo ""

# 4. Verificar Nginx
echo -e "${BLUE}4. Verificando Nginx...${NC}"
if ! command -v nginx &> /dev/null; then
    echo -e "${YELLOW}⚠️  Nginx não encontrado${NC}"
else
    echo -e "${GREEN}✅ Nginx encontrado${NC}"
    
    # Verificar se nginx está rodando
    if systemctl is-active --quiet nginx; then
        echo -e "${GREEN}✅ Nginx está rodando${NC}"
    else
        echo -e "${RED}❌ Nginx não está rodando${NC}"
    fi
    
    # Verificar configuração
    if [ -f "/etc/nginx/sites-available/planeje" ]; then
        echo -e "${GREEN}✅ Configuração do nginx encontrada${NC}"
        
        # Verificar root path
        ROOT_PATH=$(grep -E "^\s*root\s+" /etc/nginx/sites-available/planeje | awk '{print $2}' | tr -d ';')
        if [ -n "$ROOT_PATH" ]; then
            echo -e "${BLUE}   Root path configurado: $ROOT_PATH${NC}"
            
            if [ -d "$ROOT_PATH" ]; then
                echo -e "${GREEN}   ✅ Diretório existe${NC}"
            else
                echo -e "${RED}   ❌ Diretório não existe!${NC}"
            fi
            
            if [ -f "$ROOT_PATH/index.html" ]; then
                echo -e "${GREEN}   ✅ index.html existe no diretório${NC}"
            else
                echo -e "${RED}   ❌ index.html não existe no diretório${NC}"
            fi
        fi
        
        # Verificar try_files
        if grep -q "try_files" /etc/nginx/sites-available/planeje; then
            echo -e "${GREEN}   ✅ try_files configurado${NC}"
        else
            echo -e "${RED}   ❌ try_files não configurado${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  Configuração do nginx não encontrada em /etc/nginx/sites-available/planeje${NC}"
    fi
fi
echo ""

# 5. Verificar permissões
echo -e "${BLUE}5. Verificando permissões...${NC}"
if [ -d "dist" ]; then
    DIST_OWNER=$(stat -c '%U:%G' dist 2>/dev/null || stat -f '%Su:%Sg' dist 2>/dev/null)
    echo -e "${BLUE}   Proprietário de dist: $DIST_OWNER${NC}"
    
    if [ -r "dist/index.html" ]; then
        echo -e "${GREEN}   ✅ dist/index.html é legível${NC}"
    else
        echo -e "${RED}   ❌ dist/index.html não é legível${NC}"
    fi
fi
echo ""

# 6. Testar servidor local
echo -e "${BLUE}6. Testando servidor local...${NC}"
if command -v curl &> /dev/null; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/ 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}✅ Servidor responde com HTTP 200${NC}"
        
        # Verificar conteúdo
        HTML_CONTENT=$(curl -s http://localhost/ | head -20)
        if echo "$HTML_CONTENT" | grep -q "root"; then
            echo -e "${GREEN}✅ HTML contém elemento root${NC}"
        else
            echo -e "${YELLOW}⚠️  HTML pode não estar correto${NC}"
        fi
    elif [ "$HTTP_CODE" = "000" ]; then
        echo -e "${RED}❌ Não foi possível conectar ao servidor${NC}"
    else
        echo -e "${YELLOW}⚠️  Servidor responde com HTTP $HTTP_CODE${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  curl não encontrado, pulando teste${NC}"
fi
echo ""

# 7. Verificar variáveis de ambiente
echo -e "${BLUE}7. Verificando variáveis de ambiente...${NC}"
if [ -f ".env" ] || [ -f ".env.production" ]; then
    echo -e "${GREEN}✅ Arquivo .env encontrado${NC}"
else
    echo -e "${YELLOW}⚠️  Arquivo .env não encontrado (pode ser normal se usando valores hardcoded)${NC}"
fi
echo ""

# 8. Verificar logs do nginx
echo -e "${BLUE}8. Últimos erros do nginx:${NC}"
if [ -f "/var/log/nginx/error.log" ]; then
    echo -e "${BLUE}   Últimas 5 linhas de erro:${NC}"
    tail -5 /var/log/nginx/error.log 2>/dev/null || echo "   Não foi possível ler o log"
else
    echo -e "${YELLOW}   Log de erro do nginx não encontrado${NC}"
fi
echo ""

# Resumo
echo ""
echo "========================================"
echo -e "${BLUE}📋 RESUMO DO DIAGNÓSTICO${NC}"
echo "========================================"
echo ""
echo "Para resolver tela em branco, verifique:"
echo "1. ✅ Build foi executado: npm run build"
echo "2. ✅ Nginx aponta para: $(pwd)/dist"
echo "3. ✅ Permissões corretas: sudo chown -R www-data:www-data dist"
echo "4. ✅ Nginx configurado com try_files para SPA"
echo "5. ✅ Teste no navegador: Abra DevTools (F12) → Console"
echo ""
echo "Para ver erros em tempo real:"
echo "  sudo tail -f /var/log/nginx/error.log"
echo ""

