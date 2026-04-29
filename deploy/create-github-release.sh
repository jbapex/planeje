#!/usr/bin/env bash
# Cria ou atualiza um GitHub Release. Requer: gh autenticado (gh auth login).
#
# Notas automáticas em português:
#   Crie o arquivo deploy/release-notes/<tag>.md (ex.: v1.0.1.md) ANTES de rodar.
#   Se existir, o conteúdo vira a descrição do release (substitui só --generate-notes).
#   Se não existir, usa --generate-notes (lista curta do GitHub).
#
# Uso:
#   ./deploy/create-github-release.sh v1.0.2 "Planeje v1.0.2"
#
# Se o release <tag> já existir, apenas atualiza título e/ou notas (útil para corrigir descrição).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! gh auth status &>/dev/null; then
  echo "GitHub CLI (gh) não está autenticado."
  echo "Execute: gh auth login -h github.com"
  exit 1
fi

TAG="${1:?Uso: $0 <tag> [título]}"
TITLE="${2:-Planeje ${TAG}}"
REPO="jbapex/planeje"
NOTES_FILE="$ROOT/deploy/release-notes/${TAG}.md"

if gh release view "$TAG" --repo "$REPO" &>/dev/null; then
  echo "Release $TAG já existe — atualizando título e notas..."
  if [[ -f "$NOTES_FILE" ]]; then
    gh release edit "$TAG" --repo "$REPO" --title "$TITLE" --notes-file "$NOTES_FILE"
  else
    gh release edit "$TAG" --repo "$REPO" --title "$TITLE"
    echo "Aviso: não encontrado $NOTES_FILE — título atualizado; descrição não alterada."
  fi
else
  if [[ -f "$NOTES_FILE" ]]; then
    gh release create "$TAG" \
      --repo "$REPO" \
      --title "$TITLE" \
      --target main \
      --notes-file "$NOTES_FILE"
  else
    echo "Aviso: sem $NOTES_FILE — usando notas geradas pelo GitHub."
    gh release create "$TAG" \
      --repo "$REPO" \
      --title "$TITLE" \
      --target main \
      --generate-notes
  fi
fi

echo "OK: https://github.com/${REPO}/releases/tag/${TAG}"
