# Starts the Cloudflare tunnel, extracts the public URL, and patches worker/.dev.vars

$devVars = "worker\.dev.vars"

Write-Host "Starting Cloudflare tunnel..." -ForegroundColor Cyan

# Run cloudflared as a background job so we can capture its output
$job = Start-Job -ScriptBlock {
    cmd /c "npx cloudflared tunnel --url http://localhost:8787 --protocol http2 2>&1"
}

# Wait up to 30 seconds for the tunnel URL to appear
$tunnelUrl = ""
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    $output = Receive-Job -Job $job -Keep 2>$null | Out-String
    if ($output -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
        $tunnelUrl = $Matches[0]
        break
    }
}

if (-not $tunnelUrl) {
    Write-Host "ERROR: Could not get tunnel URL." -ForegroundColor Red
    Stop-Job -Job $job
    Remove-Job -Job $job
    exit 1
}

Write-Host "Tunnel URL: $tunnelUrl" -ForegroundColor Green

# Update WORKER_URL in .dev.vars
$content = Get-Content $devVars
if ($content -match "^WORKER_URL=") {
    $content = $content -replace "^WORKER_URL=.*", "WORKER_URL=$tunnelUrl"
} else {
    $content += "WORKER_URL=$tunnelUrl"
}
$content | Set-Content $devVars

Write-Host ".dev.vars updated: WORKER_URL=$tunnelUrl" -ForegroundColor Green
Write-Host ""
Write-Host "Tunnel is running. Keep this terminal open." -ForegroundColor Yellow
Write-Host "Now restart wrangler dev in the worker terminal to pick up the new URL." -ForegroundColor Yellow

# Keep printing tunnel output and stay alive
while ($true) {
    Start-Sleep -Seconds 5
    Receive-Job -Job $job -Keep 2>$null | Select-Object -Last 2 | ForEach-Object { Write-Host $_ -ForegroundColor DarkGray }
    if ($job.State -eq 'Completed' -or $job.State -eq 'Failed') {
        Write-Host "Tunnel process ended." -ForegroundColor Red
        break
    }
}

Remove-Job -Job $job -Force
