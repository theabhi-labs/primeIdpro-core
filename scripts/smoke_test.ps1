# ==============================================================================
# PrimeIdPro Live Backend End-to-End Smoke Test
# ==============================================================================
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/smoke_test.ps1
# ==============================================================================

$ErrorActionPreference = "Continue"

$Port = if ($env:PORT) { $env:PORT } else { "10000" }
$BaseUrl = "http://127.0.0.1:$Port"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..")
$BackendDir = Join-Path $RepoRoot "backend"

$TempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("primeid_smoke_" + [System.IO.Path]::GetRandomFileName().Substring(0,6))
New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

$ServerProcess = $null
$SpawnedServer = $false

Write-Host ""
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host " PRIMEIDPRO LIVE BACKEND END-TO-END SMOKE TEST (Port: $Port)" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# 1. Ensure Backend is Running
# ------------------------------------------------------------------------------
function Test-ServerHealth {
    try {
        $res = Invoke-RestMethod -Uri "$BaseUrl/health" -Method Get -TimeoutSec 2 -ErrorAction SilentlyContinue
        return ($res -ne $null -and $res.status -eq "healthy")
    } catch {
        return $false
    }
}

if (-not (Test-ServerHealth)) {
    Write-Host "[1/4] Starting backend server on $BaseUrl..." -ForegroundColor Yellow
    $PythonExe = Join-Path $BackendDir ".venv\Scripts\python.exe"
    if (-not (Test-Path $PythonExe)) {
        $PythonExe = "python"
    }

    $ServerScript = Join-Path $BackendDir "run_server.py"
    $env:PORT = $Port
    $ServerProcess = Start-Process -FilePath $PythonExe -ArgumentList $ServerScript -WorkingDirectory $BackendDir -PassThru -NoNewWindow
    $SpawnedServer = $true

    $Retries = 25
    $IsUp = $false
    while ($Retries -gt 0) {
        Start-Sleep -Milliseconds 800
        if (Test-ServerHealth) {
            $IsUp = $true
            break
        }
        $Retries--
    }

    if (-not $IsUp) {
        Write-Host "[FAIL] Failed to start backend server on port $Port." -ForegroundColor Red
        if ($ServerProcess) { Stop-Process -Id $ServerProcess.Id -Force -ErrorAction SilentlyContinue }
        exit 1
    }
    Write-Host "[OK] Backend server is online and healthy." -ForegroundColor Green
} else {
    Write-Host "[1/4] Backend server is already online on $BaseUrl." -ForegroundColor Green
}

# ------------------------------------------------------------------------------
# 2. Check Background Engine Diagnostics
# ------------------------------------------------------------------------------
Write-Host "`n[2/4] Querying /api/v1/health/bg diagnostic health..." -ForegroundColor Yellow
try {
    $bgHealth = Invoke-RestMethod -Uri "$BaseUrl/api/v1/health/bg" -Method Get
    Write-Host "  * Status:             $($bgHealth.status)" -ForegroundColor White
    Write-Host "  * ONNX Runtime:       $($bgHealth.onnxruntime_version)" -ForegroundColor White
    Write-Host "  * Quality Mode:       $($bgHealth.quality_mode)" -ForegroundColor White
    Write-Host "  * Active Chain:       $($bgHealth.active_model_chain -join ' -> ')" -ForegroundColor White
    Write-Host "  * Dummy Latency:      $($bgHealth.dummy_test.latency_ms) ms" -ForegroundColor White
} catch {
    Write-Host "  * Could not query /api/v1/health/bg: $($_.Exception.Message)" -ForegroundColor DarkYellow
}

# ------------------------------------------------------------------------------
# 3. Generate 3 Synthetic Test Images
# ------------------------------------------------------------------------------
Write-Host "`n[3/4] Generating 3 test images..." -ForegroundColor Yellow

$PythonExe = Join-Path $BackendDir ".venv\Scripts\python.exe"
if (-not (Test-Path $PythonExe)) { $PythonExe = "python" }

$GenScriptPath = Join-Path $TempDir "gen_samples.py"
$GenCode = "import numpy as np, cv2, os; from PIL import Image; d = r'$TempDir'
a1 = np.full((400, 500, 3), 220, dtype=np.uint8); cv2.ellipse(a1, (250, 260), (120, 160), 0, 0, 360, (60, 45, 30), -1); Image.fromarray(a1).save(os.path.join(d, 'sample1_portrait.png'))
a2 = np.full((800, 1000, 3), 240, dtype=np.uint8); cv2.ellipse(a2, (500, 520), (240, 320), 0, 0, 360, (70, 80, 110), -1); Image.fromarray(a2).save(os.path.join(d, 'sample2_medium.jpg'), quality=90)
a3 = np.full((350, 420, 3), 200, dtype=np.uint8); cv2.ellipse(a3, (210, 220), (160, 180), 0, 0, 360, (40, 50, 60), -1); Image.fromarray(a3).save(os.path.join(d, 'sample3_tight.png'))
"
[System.IO.File]::WriteAllText($GenScriptPath, $GenCode)
& $PythonExe $GenScriptPath

$TestFiles = @(
    @{ Name = "sample1_portrait.png"; Path = (Join-Path $TempDir "sample1_portrait.png") },
    @{ Name = "sample2_medium.jpg";   Path = (Join-Path $TempDir "sample2_medium.jpg") },
    @{ Name = "sample3_tight.png";    Path = (Join-Path $TempDir "sample3_tight.png") }
)

# ------------------------------------------------------------------------------
# 4. Upload via /api/v1/upload/single, Poll Status & Validate
# ------------------------------------------------------------------------------
Write-Host "`n[4/4] Uploading samples and polling processing status..." -ForegroundColor Yellow

$SummaryTable = @()
Add-Type -AssemblyName System.Net.Http
$HttpClient = New-Object System.Net.Http.HttpClient

foreach ($item in $TestFiles) {
    $fName = $item.Name
    $fPath = $item.Path
    $fileBytes = [System.IO.File]::ReadAllBytes($fPath)

    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

    $content = New-Object System.Net.Http.MultipartFormDataContent
    $byteContent = New-Object System.Net.Http.ByteArrayContent($fileBytes, 0, $fileBytes.Length)
    $content.Add($byteContent, "file", $fName)
    $content.Add((New-Object System.Net.Http.StringContent("india")), "country_code")
    $content.Add((New-Object System.Net.Http.StringContent("white")), "bg_color")

    $uploadUrl = "$BaseUrl/api/v1/upload/single"
    $response = $HttpClient.PostAsync($uploadUrl, $content).Result
    $respBody = $response.Content.ReadAsStringAsync().Result

    $jsonUpload = $respBody | ConvertFrom-Json
    $imageId = $jsonUpload.data.image_id

    # Poll status
    $statusUrl = "$BaseUrl/api/v1/process/status/$imageId"
    $finalStatus = "pending"
    $pollRetries = 40
    $isComplete = $false
    $errMessage = ""

    while ($pollRetries -gt 0) {
        Start-Sleep -Milliseconds 600
        $statusResp = Invoke-RestMethod -Uri $statusUrl -Method Get -ErrorAction SilentlyContinue
        if ($statusResp -and $statusResp.success) {
            $finalStatus = $statusResp.data.status
            if ($finalStatus -eq "completed") {
                $isComplete = $true
                break
            } elseif ($finalStatus -eq "failed") {
                $errMessage = $statusResp.data.error
                break
            }
        }
        $pollRetries--
    }

    $stopwatch.Stop()
    $latencySec = [Math]::Round($stopwatch.Elapsed.TotalSeconds, 2)
    $verdict = if ($isComplete) { "PASS" } else { "FAIL" }

    $SummaryTable += [PSCustomObject]@{
        SampleFile  = $fName
        ImageId     = $imageId
        FinalStatus = $finalStatus
        Latency     = "$latencySec s"
        Verdict     = $verdict
        Error       = $errMessage
    }
}

# ------------------------------------------------------------------------------
# 5. Output Summary Table & Cleanup
# ------------------------------------------------------------------------------
Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " SMOKE TEST SUMMARY RESULTS" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

$SummaryTable | Format-Table -AutoSize

$FailedCount = ($SummaryTable | Where-Object { $_.Verdict -ne "PASS" }).Count
$AllPassed = ($FailedCount -eq 0)

if ($AllPassed) {
    Write-Host "[OK] ALL SMOKE TESTS PASSED SUCCESSFULLY!`n" -ForegroundColor Green
} else {
    Write-Host "[FAIL] ONE OR MORE SMOKE TESTS FAILED!`n" -ForegroundColor Red
}

if ($SpawnedServer -and $ServerProcess) {
    Write-Host "Stopping spawned server process..." -ForegroundColor Gray
    Stop-Process -Id $ServerProcess.Id -Force -ErrorAction SilentlyContinue
}

try {
    Remove-Item -Path $TempDir -Recurse -Force -ErrorAction SilentlyContinue
} catch {}

if (-not $AllPassed) {
    exit 1
}
