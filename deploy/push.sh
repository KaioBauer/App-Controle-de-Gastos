#!/bin/sh
# Envia uma notificação push para os aparelhos do Kaixa em produção, a partir do seu PC.
#   deploy/push.sh --usuario kaio "Título" "Mensagem" [--url /contas]
#   deploy/push.sh --listar
# Usa o acesso SSH à VPS (root@2.24.114.161) e roda o comando dentro do container da API.
set -eu

HOST="${KAIXA_HOST:-root@2.24.114.161}"
# No Git Bash do Windows, "/contas" viraria um caminho do Windows sem isso
export MSYS_NO_PATHCONV=1

# Repassa os argumentos com aspas seguras para o shell remoto
quoted=""
for arg in "$@"; do
  quoted="$quoted '$(printf '%s' "$arg" | sed "s/'/'\\\\''/g")'"
done

ssh "$HOST" "cd /opt/kaixa && docker compose -p kaixa exec -T api node dist/cli/send-push.js$quoted"
