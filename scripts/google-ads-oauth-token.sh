#!/usr/bin/env bash
# Troca o authorization code OAuth por refresh_token (uso único na configuração).
# Uso:
#   export GOOGLE_ADS_CLIENT_ID="....apps.googleusercontent.com"
#   export GOOGLE_ADS_CLIENT_SECRET="...."
#   export GOOGLE_ADS_REDIRECT_URI="http://127.0.0.1:8080"
#   ./scripts/google-ads-oauth-token.sh
# Cole o CODE quando pedir.

set -euo pipefail

SCOPE="https://www.googleapis.com/auth/adwords https://www.googleapis.com/auth/datamanager"
REDIRECT_URI="${GOOGLE_ADS_REDIRECT_URI:-http://127.0.0.1:8080}"

if [[ -z "${GOOGLE_ADS_CLIENT_ID:-}" || -z "${GOOGLE_ADS_CLIENT_SECRET:-}" ]]; then
  echo "Defina GOOGLE_ADS_CLIENT_ID e GOOGLE_ADS_CLIENT_SECRET no ambiente."
  exit 1
fi

ENCODED_SCOPE=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$SCOPE', safe=''))")
ENCODED_REDIRECT=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$REDIRECT_URI', safe=''))")

AUTH_URL="https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_ADS_CLIENT_ID}&redirect_uri=${ENCODED_REDIRECT}&response_type=code&scope=${ENCODED_SCOPE}&access_type=offline&prompt=consent"

echo ""
echo "=== Passo 1: abra esta URL no navegador (conta com acesso ao Google Ads) ==="
echo ""
echo "$AUTH_URL"
echo ""
echo "Redirect URI usado: $REDIRECT_URI"
echo "(Deve estar cadastrado em Google Cloud → Credenciais → seu OAuth → URIs de redirecionamento)"
echo ""
read -r -p "=== Passo 2: cole o CODE da URL após autorizar: " CODE

if [[ -z "$CODE" ]]; then
  echo "Code vazio."
  exit 1
fi

RESP=$(curl -sS -X POST "https://oauth2.googleapis.com/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "code=${CODE}" \
  --data-urlencode "client_id=${GOOGLE_ADS_CLIENT_ID}" \
  --data-urlencode "client_secret=${GOOGLE_ADS_CLIENT_SECRET}" \
  --data-urlencode "redirect_uri=${REDIRECT_URI}" \
  --data-urlencode "grant_type=authorization_code")

echo ""
echo "=== Resposta do Google ==="
echo "$RESP" | python3 -m json.tool 2>/dev/null || echo "$RESP"
echo ""

REFRESH=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('refresh_token',''))" 2>/dev/null || true)

if [[ -n "$REFRESH" ]]; then
  echo "=== Cole no Supabase (Edge Functions → Secrets) ==="
  echo "GOOGLE_ADS_REFRESH_TOKEN = $REFRESH"
else
  echo "Não veio refresh_token. Use prompt=consent de novo ou revogue o app em https://myaccount.google.com/permissions"
  exit 1
fi
