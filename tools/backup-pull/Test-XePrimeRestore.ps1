<#
.SYNOPSIS
    Diễn tập khôi phục: dựng lại bản dump XePrime vào một PostgreSQL dùng-một-lần và đếm dữ liệu.

.DESCRIPTION
    Một bản sao lưu chưa từng được khôi phục thử thì chưa phải bản sao lưu.

    `backup-db.sh` chạy `pg_restore --list` mỗi đêm — nhưng đó chỉ nói FILE ĐỌC ĐƯỢC. Script này
    trả lời câu hỏi thật: DỮ LIỆU CÓ DỰNG LẠI ĐƯỢC KHÔNG. Nó chạy hằng tháng, trên chính máy tại
    công ty, với chính bản mà công ty đang giữ — tức là bản sẽ dùng khi thảm hoạ xảy ra.

    Không đụng tới VPS, không đụng tới staging. Chỉ cần Docker Desktop.
    Windows PowerShell 5.1 — không `&&`, không ternary, không `??`.

.PARAMETER Environment
    Môi trường của bản dump cần thử. Mặc định: production.

.PARAMETER DumpPath
    Thử một file cụ thể. Bỏ trống = tự lấy bản MỚI NHẤT đã xác minh checksum.

.EXAMPLE
    .\Test-XePrimeRestore.ps1
    .\Test-XePrimeRestore.ps1 -DumpPath D:\XePrimeBackups\production\2026-W36\xeprime-production-20260901-030000.dump
#>
[CmdletBinding()]
param(
    [string] $ConfigPath,
    [string] $Environment = 'production',
    [string] $DumpPath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $ScriptDir 'Common.ps1')
if (-not $ConfigPath) { $ConfigPath = Join-Path $ScriptDir 'config.json' }

$Container = 'xp-restore-test'
$PgImage   = 'postgres:16-alpine'   # phải khớp ADR 0001 — bản khác xử lý extension khác đi
$script:Cfg = $null

# Dọn container dù thoát bằng đường nào. Bỏ sót nó là để lại một PostgreSQL chứa BẢN SAO DỮ LIỆU
# THẬT chạy nền trên máy trạm — thứ không ai muốn phát hiện ra ba tháng sau.
#
# Qua `Invoke-Native`: `docker rm -f` ghi stderr khi container không tồn tại, và dưới
# `$ErrorActionPreference='Stop'` của PS 5.1 điều đó NÉM. Hàm này nằm trên đường xử lý lỗi, nên
# nếu nó ném thì cảnh báo thất bại không bao giờ gửi được.
function Remove-TestContainer {
    Invoke-Native { & docker rm -f $Container } | Out-Null
}

function Fail {
    param([string] $Message)
    Write-Log $Message 'ERROR'
    Remove-TestContainer
    Send-XpAlert $script:Cfg 'test-restore' "❌ Diễn tập khôi phục THẤT BẠI`n$Message"
    exit 1
}

# --- Config + tìm bản dump --------------------------------------------------
if (Test-Path -LiteralPath $ConfigPath) {
    $script:Cfg = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
}

if (-not $DumpPath) {
    $destIn = Get-CfgValue $script:Cfg 'destRoot'
    if (-not $destIn) {
        Write-Host 'Cần config.json (khoá destRoot) hoặc tham số -DumpPath.' -ForegroundColor Red
        exit 1
    }
    $destRoot = [Environment]::ExpandEnvironmentVariables($destIn)
    Set-XpLogFile (Join-Path $destRoot 'restore-test.log')
    $envDest = Join-Path $destRoot $Environment

    # Chỉ nhận bản CÓ .verified: bản tải dở hoặc lệch checksum không phải thứ đem ra diễn tập.
    $candidate = Get-ChildItem -LiteralPath $envDest -Recurse -Filter '*.dump' -File -ErrorAction SilentlyContinue |
                 Where-Object { Test-Path -LiteralPath ($_.FullName + '.verified') } |
                 Sort-Object Name -Descending | Select-Object -First 1
    if (-not $candidate) { Fail "Không tìm thấy bản dump đã xác minh nào trong $envDest." }
    $DumpPath = $candidate.FullName
}

if (-not (Test-Path -LiteralPath $DumpPath)) { Fail "Không tìm thấy file: $DumpPath" }
$dumpItem = Get-Item -LiteralPath $DumpPath
Write-Log ("=== Diễn tập khôi phục: {0} ({1:N1} MB) ===" -f $dumpItem.Name, ($dumpItem.Length / 1MB))

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Fail 'Không tìm thấy docker. Bật Docker Desktop.' }

# Checksum lại TẠI ĐÂY. Đĩa hỏng âm thầm là có thật, và cái `.verified` ghi lúc tải về không nói
# gì về tình trạng HIỆN TẠI của một file đã nằm trên ổ vài tuần.
$sumFile = "$DumpPath.sha256"
if (Test-Path -LiteralPath $sumFile) {
    $expected = ((Get-Content -LiteralPath $sumFile -Raw -Encoding ASCII) -split '\s+')[0]
    $actual = (Get-FileHash -LiteralPath $DumpPath -Algorithm SHA256).Hash
    if ($expected.ToLowerInvariant() -ne $actual.ToLowerInvariant()) {
        Fail 'Checksum LỆCH — file trên đĩa đã hỏng kể từ lúc tải về. Tải lại từ VPS.'
    }
    Write-Log 'Checksum khớp.'
}
else { Write-Log 'Không có file .sha256 — bỏ qua kiểm checksum.' 'WARN' }

# --- Dựng PostgreSQL dùng một lần -------------------------------------------
Remove-TestContainer
Write-Log "Khởi động $PgImage (container $Container)"
# Không publish cổng ra host: container này chứa bản sao dữ liệu thật, và mở 5432 ra máy trạm
# chỉ để chạy vài câu đếm là mở rộng bề mặt tấn công không vì lý do gì.
$run = Invoke-Native {
    & docker run -d --name $Container -e POSTGRES_PASSWORD=restore-test -e POSTGRES_DB=xeprime $PgImage
}
if ($run.ExitCode -ne 0) { Fail ("Không khởi động được container PostgreSQL:`n" + ($run.Output -join "`n")) }

Write-Log 'Chờ PostgreSQL sẵn sàng'
$ready = $false
for ($i = 1; $i -le 60 -and -not $ready; $i++) {
    # `pg_isready` ghi stderr suốt lúc Postgres còn đang khởi động — chính là trường hợp
    # `Invoke-Native` sinh ra để xử lý.
    $probe = Invoke-Native { & docker exec $Container pg_isready -U postgres -d xeprime }
    if ($probe.ExitCode -eq 0) { $ready = $true } else { Start-Sleep -Seconds 2 }
}
if (-not $ready) { Fail 'PostgreSQL không sẵn sàng sau 120 giây.' }

# --- Khôi phục ---------------------------------------------------------------
# Dump sinh bằng `pg_dump -Fc` từ database của user `xeprime`; ở đây khôi phục vào user
# `postgres`, nên `--no-owner` là bắt buộc và `--no-privileges` bỏ luôn GRANT trỏ tới role không
# tồn tại trong container này.
#
# KHÔNG dùng `--single-transaction` (khác `restore-db.sh` trên VPS): ở đây ta MUỐN nhìn thấy
# từng lỗi pg_restore gặp, chứ không phải một transaction rollback nuốt hết rồi báo đúng một dòng.
Write-Log 'pg_restore (có thể mất vài phút)'
$restoreLog = Join-Path $env:TEMP 'xp-restore-test.log'
$restore = Invoke-Native {
    & cmd /c "docker exec -i $Container pg_restore -U postgres -d xeprime --no-owner --no-privileges --clean --if-exists < `"$DumpPath`" > `"$restoreLog`" 2>&1"
}

$errLines = @()
if (Test-Path -LiteralPath $restoreLog) {
    $errLines = @(Get-Content -LiteralPath $restoreLog | Where-Object { $_ -match 'error:' })
}
if ($restore.ExitCode -ne 0 -and $errLines.Count -gt 0) {
    Write-Log ("pg_restore trả mã {0} với {1} dòng lỗi:" -f $restore.ExitCode, $errLines.Count) 'WARN'
    $errLines | Select-Object -First 15 | ForEach-Object { Write-Log ('  ' + $_) 'WARN' }
}

# --- Đếm ---------------------------------------------------------------------
# ĐÂY mới là tiêu chí đạt. `pg_restore` trả 0 mà database rỗng vẫn là một bản sao lưu vô dụng.
$tables = @('tenants', 'users', 'vehicles', 'bookings', 'payments', 'receipts', 'vehicle_occupancies')
$counts = @{}
$emptyCore = @()

foreach ($t in $tables) {
    $q = Invoke-Native { & docker exec $Container psql -U postgres -d xeprime -tAc "select count(*) from $t;" }
    if ($q.ExitCode -ne 0) {
        Fail ("Không truy vấn được bảng '$t' — khôi phục KHÔNG thành công.`n" + ($q.Output -join "`n"))
    }
    $n = 0
    [void][int]::TryParse((($q.Output | Select-Object -First 1) -as [string]).Trim(), [ref] $n)
    $counts[$t] = $n
    Write-Log ('  {0,-22} {1,8:N0}' -f $t, $n)
    # `receipts` và `vehicle_occupancies` có thể rỗng hợp lệ ở giai đoạn đầu; bốn bảng còn lại
    # mà rỗng thì bản dump này không dùng được cho việc gì.
    if ($n -eq 0 -and @('tenants', 'users', 'vehicles', 'bookings') -contains $t) { $emptyCore += $t }
}

Remove-TestContainer

if ($emptyCore.Count -gt 0) {
    Fail ('Khôi phục xong nhưng các bảng lõi RỖNG: {0}. Bản dump này không dùng được.' -f ($emptyCore -join ', '))
}

$summary = ($tables | ForEach-Object { "$_=$($counts[$_])" }) -join ' · '
Write-Log "=== ĐẠT === $summary"
Send-XpAlert $script:Cfg 'test-restore' "✅ Diễn tập khôi phục ĐẠT — $($dumpItem.Name)`n$summary"
exit 0
