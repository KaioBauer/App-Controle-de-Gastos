#!/bin/sh
# Backup diário do Postgres do Kaixa (roda na VPS, via cron).
#   0 4 * * * /opt/kaixa/deploy/backup.sh >> /var/log/kaixa-backup.log 2>&1
#
# Gera /opt/backups/kaixa/kaixa-AAAA-MM-DD.sql.gz e mantém os últimos KEEP_DAYS dias.
# Restaurar (apaga e recria o banco a partir do arquivo):
#   gunzip -c /opt/backups/kaixa/kaixa-AAAA-MM-DD.sql.gz | \
#     docker compose -p kaixa exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
set -eu

APP_DIR="${APP_DIR:-/opt/kaixa}"
BACKUP_DIR="${BACKUP_DIR:-/opt/backups/kaixa}"
KEEP_DAYS="${KEEP_DAYS:-14}"

cd "$APP_DIR"
# Usuário e banco vêm do .env de produção (sem imprimir senhas)
POSTGRES_USER=$(grep '^POSTGRES_USER=' .env | cut -d= -f2-)
POSTGRES_DB=$(grep '^POSTGRES_DB=' .env | cut -d= -f2-)

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
FILE="$BACKUP_DIR/kaixa-$(date +%F).sql.gz"
TMP="$FILE.tmp"

# --clean --if-exists: o arquivo restaura por cima de um banco existente
docker compose -p kaixa exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner | gzip -9 > "$TMP"

# Só substitui o backup do dia se o dump não veio vazio
if [ "$(gzip -dc "$TMP" | head -c 1000 | wc -c)" -lt 100 ]; then
  echo "$(date -Is) ERRO: dump vazio, mantendo backups anteriores" >&2
  rm -f "$TMP"
  exit 1
fi
mv "$TMP" "$FILE"
chmod 600 "$FILE"

find "$BACKUP_DIR" -name 'kaixa-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) OK $(du -h "$FILE" | cut -f1) $FILE"
