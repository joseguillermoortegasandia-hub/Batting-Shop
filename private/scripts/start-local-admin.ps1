$ErrorActionPreference = 'Stop'
$adminRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
Set-Location -LiteralPath $adminRoot
node --env-file=.env.local build-panel.mjs
if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar el panel local.' }
$adminUrl = 'http://localhost:8081/'
$adminHealthUrl = 'http://127.0.0.1:8081/'
$adminReady = $false
try {
    $response = Invoke-WebRequest -Uri $adminHealthUrl -TimeoutSec 2 -NoProxy
    $adminReady = $response.StatusCode -eq 200 -and $response.Content.Contains('id="adminEmail"')
} catch {}
if (-not $adminReady) {
    $pythonPath = (Get-Command python -CommandType Application | Select-Object -First 1).Source
    $serverPath = Join-Path $adminRoot 'private\scripts\preview-server.py'
    $outputPath = Join-Path $adminRoot 'dist-panel'
    $logPath = Join-Path $adminRoot 'artifacts\local-admin'
    New-Item -ItemType Directory -Path $logPath -Force | Out-Null
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $arguments = @('-u',('"'+$serverPath+'"'),'--port','8081','--directory',('"'+$outputPath+'"'))
    $child = Start-Process -FilePath $pythonPath -ArgumentList $arguments -WorkingDirectory $adminRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logPath "$stamp.out.log") -RedirectStandardError (Join-Path $logPath "$stamp.err.log")
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    while (-not $adminReady -and [DateTime]::UtcNow -lt $deadline) {
        Start-Sleep -Milliseconds 200
        try {
            $response = Invoke-WebRequest -Uri $adminHealthUrl -TimeoutSec 1 -NoProxy
            $adminReady = $response.StatusCode -eq 200 -and $response.Content.Contains('id="adminEmail"')
        } catch {}
        if ($child.HasExited -and -not $adminReady) { throw "No se pudo iniciar el admin. Revisa $logPath; el puerto puede estar ocupado." }
    }
    if (-not $adminReady) { throw "El admin no respondió. Revisa $logPath." }
}
Write-Output "Admin disponible en $adminUrl. Puedes cerrar esta ventana."
Start-Process $adminUrl
