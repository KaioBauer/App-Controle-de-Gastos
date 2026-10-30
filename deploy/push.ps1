# Envia uma notificação push para os aparelhos do Kaixa em produção, pelo PowerShell.
#   .\deploy\push.ps1 -Usuario kaio "Título" "Mensagem" [-Url /contas]
#   .\deploy\push.ps1 -Listar
# Usa o acesso SSH à VPS e roda o comando dentro do container da API (mesmo que deploy/push.sh).
param(
  [string]$Usuario,
  [string]$Url = '/',
  [switch]$Listar,
  [Parameter(Position = 0)][string]$Titulo,
  [Parameter(Position = 1)][string]$Mensagem
)

$HostName = if ($env:KAIXA_HOST) { $env:KAIXA_HOST } else { 'root@2.24.114.161' }

if ($Listar) {
  $argv = @('--listar')
  if ($Usuario) { $argv += @('--usuario', $Usuario) }
} else {
  if (-not $Usuario -or -not $Titulo -or -not $Mensagem) {
    Write-Error 'Uso: .\deploy\push.ps1 -Usuario kaio "Título" "Mensagem" [-Url /contas]   |   .\deploy\push.ps1 -Listar'
    exit 1
  }
  $argv = @('--usuario', $Usuario, '--url', $Url, $Titulo, $Mensagem)
}

# Os argumentos vão juntos, em JSON codificado em base64 (UTF-8): o PowerShell some com aspas ao
# chamar o ssh, e assim não há aspas nem acentos no caminho
$json = ConvertTo-Json -InputObject ([string[]]$argv) -Compress
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
$remote = "cd /opt/kaixa && docker compose -p kaixa exec -T api node dist/cli/send-push.js --args-b64 $b64"
ssh $HostName $remote
exit $LASTEXITCODE
