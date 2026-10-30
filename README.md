# Kaixa: app pessoal de controle de gastos (PWA)

Produção: https://kaixa.tech

PWA instalável no iPhone com notificações push, integrada à Pluggy (Open Finance).

| Pasta | Conteúdo |
|---|---|
| `apps/api` | Fastify + Prisma (Postgres) + web-push |
| `apps/web` | React + Vite + vite-plugin-pwa (service worker próprio em `src/sw.ts`) |
| `packages/shared` | Dinheiro em centavos, datas no fuso de São Paulo, tipos de push |
| `deploy/` | Exemplo de Nginx da VPS |

**Funcionalidades:** PWA instalável com push; sincronização com o Meu Pluggy; Início, Cartões (fatura, despesas fixas, parcelamentos), Análise com relatórios (fluxo de caixa, saldo mês a mês, comparação, CSV), Orçamentos e Metas; Transações com busca, filtros, regras de categoria e revisão; Contas a pagar com baixa automática; notificações configuráveis com horário de silêncio; categorias personalizadas; login com senha ou Face ID (passkey).

## Rodar localmente

Pré-requisitos: Node 24, pnpm 11 e Docker Desktop.

```bash
pnpm install
cp .env.example .env          # ajuste os valores (veja abaixo)
pnpm gen-vapid                # copie as duas chaves para o .env
docker compose up -d --build  # db + api + web em http://localhost:8088
docker compose exec api node dist/cli/create-user.js   # cria seu usuário
```

No `.env` local use `NODE_ENV=development`, `APP_ORIGIN=http://localhost:8088` e `COOKIE_SECURE=false`.

### Desenvolvimento com hot reload

```bash
pnpm db:up                    # só o Postgres, exposto em localhost:5432
# no .env troque @db:5432 por @localhost:5432 no DATABASE_URL
pnpm db:migrate               # aplica/cria migrations
pnpm create-user
pnpm dev                      # API :3000 + Vite :5173 (proxy /api)
```

### Testes

```bash
pnpm test        # vitest em todos os pacotes
pnpm typecheck
```

## Chaves VAPID (web push)

```bash
pnpm gen-vapid
```

Coloque `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` no `.env` do servidor e **gere chaves próprias para produção**. Se as chaves mudarem, as inscrições antigas param de funcionar e é preciso reativar as notificações no iPhone.

`VAPID_SUBJECT` precisa ser `mailto:` com um e-mail real ou uma URL `https://`. O serviço de push da Apple recusa valores como `mailto:x@localhost`.

## Deploy na VPS (Hostinger, 2.24.114.161)

O app roda em `/opt/kaixa`. As portas 80/443 da VPS são atendidas pelo **proxy compartilhado** em `/opt/proxy` (um Nginx para todos os sites, com um arquivo por site em `/opt/proxy/sites/`; ver `/opt/proxy/README.md`).

**Atualizar o Kaixa** (a partir desta pasta, no seu PC):

```bash
tar czf - --exclude=node_modules --exclude=dist --exclude=dev-dist --exclude=.env --exclude=.git .   | ssh root@2.24.114.161 "tar xzf - -C /opt/kaixa"
ssh root@2.24.114.161 "cd /opt/kaixa && docker compose -p kaixa -f docker-compose.yml -f deploy/docker-compose.vps.yml up -d --build"
```

As migrations rodam sozinhas no start da API. O `.env` de produção fica só na VPS (`/opt/kaixa/.env`, permissão 600).

**Criar/redefinir o usuário de login:**

```bash
ssh -t root@2.24.114.161 "cd /opt/kaixa && docker compose -p kaixa exec api node dist/cli/create-user.js"
```

**Proxy:** o bloco do Kaixa está em `deploy/nginx.vps.conf`, instalado como `/opt/proxy/sites/kaixa.conf`. Depois de mudar, rode `docker exec proxy nginx -t && docker exec proxy nginx -s reload`. O certificado renova sozinho por webroot, sem derrubar o proxy.

## Instalar no iPhone (iOS 16.4+)

1. Abra `https://kaixa.tech` no **Safari** e faça login.
2. Toque em **Compartilhar** e depois em **Adicionar à Tela de Início**.
3. Abra o app **pelo ícone** criado. O push só funciona nesse modo.
4. Vá em **Ajustes › Notificações › Ativar notificações** e permita.
5. Toque em **Enviar notificação de teste**. Ao tocar na notificação, o app abre direto nessa tela (deep link).

Se aparecer "Bloqueadas", libere em **Ajustes do iPhone › Notificações › Kaixa**.

## Pluggy (Meu Pluggy)

1. Crie uma aplicação em [dashboard.pluggy.ai](https://dashboard.pluggy.ai) e coloque `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET` no `.env`. Elas ficam só no servidor.
2. Em [meu.pluggy.ai](https://meu.pluggy.ai), conecte seus bancos e copie o **ID de cada conexão** (itemId, um UUID).
3. No app: **Ajustes › Conexões bancárias › Adicionar conexão** e cole o ID. A primeira sincronização traz até 12 meses de histórico, que entram como já revisados.

A sincronização roda de três formas: pelo webhook (tempo real), por um job a cada hora (no minuto 7) e pelo botão **Sincronizar**. A tela de conexões mostra o status de cada banco e avisa 7 dias antes de o consentimento expirar. Renove pelo Meu Pluggy.

### Webhook

O endpoint é `POST https://kaixa.tech/api/webhooks/pluggy`. Ele é protegido pelo header `x-webhook-secret` e pela allowlist do IP `52.67.145.81` no Nginx.

```bash
openssl rand -hex 32          # cole em PLUGGY_WEBHOOK_SECRET no .env da VPS
docker compose up -d          # recarrega o .env
```

Depois, no app (já em HTTPS), toque em **Ajustes › Conexões bancárias › Registrar webhook**. O app cria o webhook na Pluggy com esse header. Sem webhook, o job de hora em hora continua funcionando.

## Backup do banco

`deploy/backup.sh` faz o dump diário do Postgres em `/opt/backups/kaixa/kaixa-AAAA-MM-DD.sql.gz` e mantém 14 dias.

```bash
chmod +x /opt/kaixa/deploy/backup.sh
( crontab -l; echo "0 4 * * * /opt/kaixa/deploy/backup.sh >> /var/log/kaixa-backup.log 2>&1" ) | crontab -
```

Para restaurar (substitui o conteúdo atual do banco):

```bash
cd /opt/kaixa
gunzip -c /opt/backups/kaixa/kaixa-AAAA-MM-DD.sql.gz | docker compose -p kaixa exec -T db psql -U kaixa -d kaixa
```

Os backups ficam na própria VPS. Para ter uma cópia fora dela, copie a pasta periodicamente (por exemplo `scp -r root@2.24.114.161:/opt/backups/kaixa .`).

## Notificações

Configuráveis em **Ajustes › Notificações**: nova transação (com valor mínimo), orçamento em 80% e 100%, contas e faturas vencendo (3 dias antes e no dia), saldo baixo, gasto incomum, resumo semanal (domingo 20h), fechamento do mês (dia 1º 9h) e problemas nas conexões. No horário de silêncio os avisos esperam na fila e chegam quando ele termina.

