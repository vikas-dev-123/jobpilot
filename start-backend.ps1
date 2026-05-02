# JobPilot AI — start backend (double-click or: powershell -ExecutionPolicy Bypass -File start-backend.ps1)
Set-Location $PSScriptRoot
& "$PSScriptRoot\backend\venv\Scripts\Activate.ps1"
Write-Host "Starting JobPilot API at http://127.0.0.1:8000/docs (Ctrl+C to stop)" -ForegroundColor Cyan
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
