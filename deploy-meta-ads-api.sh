#!/bin/bash

# Script para fazer deploy da Edge Function meta-ads-api
# Execute: ./deploy-meta-ads-api.sh

set -e

echo "🚀 Deploy da Edge Function meta-ads-api"
echo ""

# Verificar se está no diretório correto
if [ ! -f "supabase/functions/meta-ads-api/index.ts" ]; then
    echo "❌ Erro: Arquivo supabase/functions/meta-ads-api/index.ts não encontrado"
    echo "   Execute este script na raiz do projeto"
    exit 1
fi

# Verificar se supabase CLI está instalado
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI não está instalado"
    echo "   Instale com: npm install -g supabase"
    exit 1
fi

# Verificar login
echo "📋 Verificando login no Supabase..."
if ! supabase projects list &> /dev/null; then
    echo "⚠️  Você precisa fazer login primeiro"
    echo ""
    echo "Execute:"
    echo "   supabase login"
    echo ""
    echo "Depois execute este script novamente"
    exit 1
fi

# Verificar se projeto está linkado
if [ ! -f "supabase/.temp/project-ref" ]; then
    echo "⚠️  Projeto não está linkado"
    echo ""
    read -p "Digite o Project Reference ID (encontrado em Settings → General): " PROJECT_REF
    
    if [ -z "$PROJECT_REF" ]; then
        echo "❌ Project Reference ID é obrigatório"
        exit 1
    fi
    
    echo "🔗 Linkando projeto..."
    supabase link --project-ref "$PROJECT_REF"
fi

# Fazer deploy
echo ""
echo "📦 Fazendo deploy da Edge Function..."
supabase functions deploy meta-ads-api

echo ""
echo "✅ Deploy concluído!"
echo ""
echo "📝 Próximos passos:"
echo "   1. Vá em: Supabase Dashboard → Edge Functions → Settings → Secrets"
echo "   2. Adicione: META_SYSTEM_USER_ACCESS_TOKEN = seu-token-aqui"
echo "   3. Adicione também: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (se ainda não tiver)"
echo "   4. Recarregue a página de Gestão de Tráfego"
echo ""

