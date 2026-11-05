$ErrorActionPreference = 'Stop'
$previewRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$previewLogs = Join-Path $previewRoot 'artifacts\preview-servers'
New-Item -ItemType Directory -Path $previewLogs -Force | Out-Null
$previewPython = (Get-Command python -CommandType Application | Select-Object -First 1).Source
$previewHandler = [Net.Http.HttpClientHandler]::new()
$previewHandler.UseProxy = $false
$previewClient = [Net.Http.HttpClient]::new($previewHandler)
$previewClient.Timeout = [TimeSpan]::FromSeconds(2)
$previewClient.DefaultRequestHeaders.ConnectionClose = $true

function Test-Preview([int]$Port, [string]$Marker) {
    try {
        $response = $previewClient.GetAsync("http://127.0.0.1:$Port/").GetAwaiter().GetResult()
        try {
            $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
            return ($response.StatusCode -eq 200 -and $body.Contains($Marker))
        } finally { $response.Dispose() }
    } catch { return $false }
}

$previewSites = @(
    @{ Name='tienda'; Port=8080; Directory='dist'; Marker='data-page="home"' },
    @{ Name='administrador'; Port=8081; Directory='dist-panel'; Marker='id="adminEmail"' }
)
$previewResults = @()
try {
    foreach ($site in $previewSites) {
        $directory = Join-Path $previewRoot $site.Directory
        if (-not (Test-Path -LiteralPath (Join-Path $directory 'index.html'))) {
            throw "Falta compilar $($site.Name). Ejecuta primero su build local."
        }
        if (-not (Test-Preview $site.Port $site.Marker)) {
            $listeners = @(Get-NetTCPConnection -LocalPort $site.Port -State Listen -ErrorAction SilentlyContinue)
            foreach ($owner in ($listeners | Select-Object -ExpandProperty OwningProcess -Unique)) {
                $process = Get-CimInstance Win32_Process -Filter "ProcessId=$owner"
                $portPattern = '-m\s+http\.server\s+' + $site.Port + '\b'
                $directoryPattern = '--directory\s+(?:"' + [regex]::Escape($directory) + '"|' + [regex]::Escape($directory) + ')(?:\s|$)'
                if ($process.Name -notmatch '^python(?:[0-9.]*)?\.exe$' -or
                    $process.CommandLine -notmatch $portPattern -or
                    $process.CommandLine -notmatch $directoryPattern -or
                    $process.CommandLine -notmatch '--bind\s+127\.0\.0\.1\b') {
                    throw "El puerto $($site.Port) pertenece a otro servicio. No se modificó ese proceso."
                }
                Stop-Process -Id $owner
            }
            $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
            $arguments = @('-u','-m','http.server',"$($site.Port)",'--bind','127.0.0.1','--directory',('"'+$directory+'"'))
            $child = Start-Process -FilePath $previewPython -ArgumentList $arguments -WorkingDirectory $previewRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $previewLogs "$($site.Name)-$stamp.out.log") -RedirectStandardError (Join-Path $previewLogs "$($site.Name)-$stamp.err.log")
            $deadline = [DateTime]::UtcNow.AddSeconds(10)
            while (-not (Test-Preview $site.Port $site.Marker)) {
                if ($child.HasExited -or [DateTime]::UtcNow -gt $deadline) {
                    if (-not $child.HasExited) { Stop-Process -Id $child.Id }
                    throw "No se pudo iniciar $($site.Name). Revisa $previewLogs."
                }
                Start-Sleep -Milliseconds 150
            }
        }
        $listener = Get-NetTCPConnection -LocalPort $site.Port -State Listen | Select-Object -First 1
        $previewResults += @{ Name=$site.Name; Port=$site.Port; ProcessId=$listener.OwningProcess }
        Write-Output "$($site.Name): http://localhost:$($site.Port)/ — HTTP 200"
    }
    $previewResults | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $previewLogs 'servers.json') -Encoding utf8
} finally {
    $previewClient.Dispose()
    $previewHandler.Dispose()
}
