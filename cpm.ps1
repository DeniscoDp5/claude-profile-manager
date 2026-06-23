# cpm - Claude Profile Manager - integrazione PowerShell
# ---------------------------------------------------------------------------
# Aggiungi questa riga al tuo profilo PowerShell ($PROFILE):
#
#     . "/percorso/assoluto/cpm.ps1"
#
# Modo rapido per scriverla automaticamente:
#
#     cpm setup
#
# Poi riapri il terminale (o esegui: . $PROFILE).
# ---------------------------------------------------------------------------

# Marker: segnala al binario Node che l'integrazione shell e' attiva.
$env:CPM_SHELL_INTEGRATION = "1"
$env:CPM_SHELL_TYPE = "powershell"

# All'avvio della shell: carica il profilo di default persistito da `cpm use`/
# `cpm login`, ma solo se CLAUDE_CONFIG_DIR non e' gia' impostata manualmente.
if (-not $env:CLAUDE_CONFIG_DIR) {
    $__cpmActiveFile = Join-Path $HOME ".claude_profiles\.active"
    if (Test-Path $__cpmActiveFile) {
        $__cpmActive = (Get-Content $__cpmActiveFile -Raw).Trim()
        if ($__cpmActive) {
            $__cpmProfileDir = Join-Path $HOME ".claude_profiles\$__cpmActive"
            if (Test-Path $__cpmProfileDir -PathType Container) {
                $env:CLAUDE_CONFIG_DIR = $__cpmProfileDir
            }
        }
        Remove-Variable __cpmActive -ErrorAction SilentlyContinue
        Remove-Variable __cpmProfileDir -ErrorAction SilentlyContinue
    }
    Remove-Variable __cpmActiveFile -ErrorAction SilentlyContinue
}

# Funzione che intercetta `use` (e il post-login) per modificare DAVVERO
# l'ambiente della shell corrente; tutto il resto e' delegato al bin Node.
function cpm {
    switch ($args[0]) {
        "use" {
            $profileArgs = $args[1..($args.Count - 1)]
            $out = & (Get-Command cpm -CommandType Application | Select-Object -First 1).Source use @profileArgs 2>&1
            $exitCode = $LASTEXITCODE
            $stdErr = ($out | Where-Object { $_ -is [System.Management.Automation.ErrorRecord] }) -join "`n"
            $stdOut = ($out | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] }) -join "`n"
            if ($stdErr) { Write-Host $stdErr }
            if ($exitCode -eq 0 -and $stdOut) {
                Invoke-Expression $stdOut
            }
            return
        }
        "login" {
            $profileArgs = $args[1..($args.Count - 1)]
            & (Get-Command cpm -CommandType Application | Select-Object -First 1).Source login @profileArgs
            if ($LASTEXITCODE -eq 0) {
                $out = & (Get-Command cpm -CommandType Application | Select-Object -First 1).Source use @profileArgs 2>&1
                $stdErr = ($out | Where-Object { $_ -is [System.Management.Automation.ErrorRecord] }) -join "`n"
                $stdOut = ($out | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] }) -join "`n"
                if ($stdErr) { Write-Host $stdErr }
                if ($LASTEXITCODE -eq 0 -and $stdOut) {
                    Invoke-Expression $stdOut
                }
            }
            return
        }
        default {
            & (Get-Command cpm -CommandType Application | Select-Object -First 1).Source @args
        }
    }
}
