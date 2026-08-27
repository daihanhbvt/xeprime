<#
.SYNOPSIS
    Kéo bản sao lưu PostgreSQL của XePrime từ VPS về máy tại công ty.

.DESCRIPTION
    Máy công ty PULL, VPS KHÔNG push. VPS là thứ dễ bị chiếm nhất trong hệ thống — nó nằm trên
    Internet công khai. Nếu nó cầm khoá ghi được vào mạng công ty thì kẻ chiếm nó xoá luôn bản
    sao lưu, đúng kịch bản ransomware. Chiều pull thì VPS không cầm bí mật nào của phía bên kia,
    và công ty không phải mở cổng vào.

    Tải MỌI bản còn thiếu, không chỉ bản mới nhất — máy tắt hai tuần thì lần chạy sau tự bù.
    Mỗi file được đối chiếu SHA-256 trước khi được coi là đã có.

    Chỉ dùng OpenSSH client có sẵn trên Windows 10/11 (sftp.exe). Không cài thêm gì.
    Windows PowerShell 5.1 — không `&&`, không ternary, không `??`.

.PARAMETER ConfigPath
    Đường dẫn config.json. Mặc định: config.json cạnh script này.

.PARAMETER Environment
    Môi trường cần kéo. Mặc định: production.

.EXAMPLE
    .\Pull-XePrimeBackup.ps1
    .\Pull-XePrimeBackup.ps1 -Environment staging
#>
[CmdletBinding()]
param(
    [string] $ConfigPath,
    [string] $Environment = 'production'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $ScriptDir 'Common.ps1')
if (-not $ConfigPath) { $ConfigPath = Join-Path $ScriptDir 'config.json' }

$script:Cfg = $null

function Fail {
    param([string] $Message)
    Write-Log $Message 'ERROR'
    Send-XpAlert $script:Cfg 'pull' "❌ Kéo bản sao lưu THẤT BẠI`n$Message"
    exit 1
}

# --- Config -----------------------------------------------------------------
if (-not (Test-Path -LiteralPath $ConfigPath)) {
    Write-Host "Không tìm thấy $ConfigPath. Chép config.example.json thành config.json rồi điền." -ForegroundColor Red
    exit 1
}
$script:Cfg = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json

$VpsHost  = Get-CfgValue $script:Cfg 'vpsHost'
$SftpUser = Get-CfgValue $script:Cfg 'sftpUser'
$SshKeyIn = Get-CfgValue $script:Cfg 'sshKeyPath'
$DestIn   = Get-CfgValue $script:Cfg 'destRoot'
foreach ($pair in @(@('vpsHost', $VpsHost), @('sftpUser', $SftpUser), @('sshKeyPath', $SshKeyIn), @('destRoot', $DestIn))) {
    if (-not $pair[1]) { Write-Host "config.json thiếu '$($pair[0])'." -ForegroundColor Red; exit 1 }
}

$SshKey    = [Environment]::ExpandEnvironmentVariables($SshKeyIn)
$DestRoot  = [Environment]::ExpandEnvironmentVariables($DestIn)
$SshPort   = [int] (Get-CfgValue $script:Cfg 'sshPort' 22)
$KeepWeeks = [int] (Get-CfgValue $script:Cfg 'keepWeeks' 12)
$StaleDays = [int] (Get-CfgValue $script:Cfg 'staleAfterDays' 8)

$EnvDest = Join-Path $DestRoot $Environment
if (-not (Test-Path -LiteralPath $EnvDest)) { New-Item -ItemType Directory -Path $EnvDest -Force | Out-Null }
Set-XpLogFile (Join-Path $DestRoot 'pull.log')

Write-Log "=== Bắt đầu kéo [$Environment] từ $SftpUser@$VpsHost ==="

if (-not (Test-Path -LiteralPath $SshKey)) { Fail "Không tìm thấy khoá SSH: $SshKey" }
if (-not (Get-Command sftp.exe -ErrorAction SilentlyContinue)) {
    Fail 'Không tìm thấy sftp.exe. Bật "OpenSSH Client" trong Settings → Apps → Optional features.'
}

$RemoteDir = "/xeprime/$Environment/daily"   # đường dẫn TRONG chroot của user xpbackup

# --- Chạy một batch sftp ----------------------------------------------------
# Dùng batch thay vì `ssh <lệnh>` vì khoá này bị `ForceCommand internal-sftp -R` khoá cứng ở
# phía máy chủ — nó KHÔNG mở được shell, và đó là chủ đích.
function Invoke-Sftp {
    param([string[]] $Commands)

    $batch = [System.IO.Path]::GetTempFileName()
    try {
        # ASCII + xuống dòng LF: sftp đọc file batch theo dòng, và một ký tự CR thừa đi thẳng
        # vào tên file nó đi tìm.
        [System.IO.File]::WriteAllText($batch, (($Commands -join "`n") + "`n"), [System.Text.Encoding]::ASCII)
        return Invoke-Native {
            & sftp.exe -b $batch -i $SshKey -P $SshPort -o BatchMode=yes -o StrictHostKeyChecking=yes "$SftpUser@$VpsHost"
        }
    }
    finally { Remove-Item -LiteralPath $batch -Force -ErrorAction SilentlyContinue }
}

# --- Liệt kê từ xa ----------------------------------------------------------
Write-Log "Liệt kê $RemoteDir"
$listing = Invoke-Sftp @("cd $RemoteDir", 'ls -1', 'bye')
if ($listing.ExitCode -ne 0) {
    Fail ("Không liệt kê được ${RemoteDir} (mã $($listing.ExitCode)):`n" + ($listing.Output -join "`n"))
}

$remoteFiles = @()
foreach ($line in $listing.Output) {
    $t = ([string] $line).Trim()
    # Lọc theo TÊN CƠ SỞ chứ không tin thứ tự dòng: `ls -1` in cả dòng nhắc "sftp> " và, tuỳ
    # phiên bản, cả đường dẫn đầy đủ.
    if ($t -match "(xeprime-$Environment-\d{8}-\d{6}\.dump)$") { $remoteFiles += $Matches[1] }
}
$remoteFiles = @($remoteFiles | Sort-Object -Unique)

if ($remoteFiles.Count -eq 0) {
    Fail "Không thấy file dump nào trong $RemoteDir. Kiểm tra timer trên VPS: systemctl list-timers xeprime-backup@$Environment"
}
Write-Log ("Trên VPS có {0} bản dump." -f $remoteFiles.Count)

# --- Bản đã có --------------------------------------------------------------
# Chỉ tính là "đã có" khi có cả file `.verified`. File tải dở hoặc lệch checksum phải được tải
# lại, không được coi như xong.
$have = @{}
Get-ChildItem -LiteralPath $EnvDest -Recurse -Filter '*.dump' -File -ErrorAction SilentlyContinue |
    ForEach-Object {
        if (Test-Path -LiteralPath ($_.FullName + '.verified')) { $have[$_.Name] = $_.FullName }
    }

$missing = @($remoteFiles | Where-Object { -not $have.ContainsKey($_) })
Write-Log ("Đã có {0} bản · cần tải {1} bản." -f $have.Count, $missing.Count)

# --- Thư mục tuần ISO --------------------------------------------------------
function Get-IsoWeekFolder {
    param([string] $FileName)

    if ($FileName -match '-(\d{4})(\d{2})(\d{2})-\d{6}\.dump$') {
        $d = Get-Date -Year ([int]$Matches[1]) -Month ([int]$Matches[2]) -Day ([int]$Matches[3]) `
                      -Hour 12 -Minute 0 -Second 0
        $cal = [System.Globalization.CultureInfo]::InvariantCulture.Calendar
        $dow = $cal.GetDayOfWeek($d)
        # Quy tắc tuần ISO: đẩy Thứ Hai–Thứ Tư sang Thứ Năm rồi mới lấy số tuần, nếu không tuần
        # đầu và tuần cuối năm bị lệch một.
        if ($dow -ge [DayOfWeek]::Monday -and $dow -le [DayOfWeek]::Wednesday) { $d = $d.AddDays(3) }
        $week = $cal.GetWeekOfYear($d, [System.Globalization.CalendarWeekRule]::FirstFourDayWeek, [DayOfWeek]::Monday)
        return ('{0}-W{1:D2}' -f $d.Year, $week)
    }
    return 'unsorted'
}

# --- Tải ---------------------------------------------------------------------
$downloaded = 0
$failed = @()

foreach ($name in $missing) {
    $week = Get-IsoWeekFolder $name
    $weekDir = Join-Path $EnvDest $week
    if (-not (Test-Path -LiteralPath $weekDir)) { New-Item -ItemType Directory -Path $weekDir -Force | Out-Null }

    $dest = Join-Path $weekDir $name
    $destSum = "$dest.sha256"
    $ok = $false

    for ($attempt = 1; $attempt -le 3 -and -not $ok; $attempt++) {
        Write-Log ("Tải {0} (lần {1}/3) → {2}" -f $name, $attempt, $week)
        Remove-Item -LiteralPath $dest, $destSum -Force -ErrorAction SilentlyContinue

        $r = Invoke-Sftp @(
            "cd $RemoteDir",
            "get $name `"$dest`"",
            "get $name.sha256 `"$destSum`"",
            'bye'
        )
        if ($r.ExitCode -ne 0) {
            Write-Log ("sftp trả mã $($r.ExitCode): " + ($r.Output -join ' ')) 'WARN'
            continue
        }
        if (-not (Test-Path -LiteralPath $dest) -or -not (Test-Path -LiteralPath $destSum)) {
            Write-Log 'Thiếu file sau khi tải.' 'WARN'
            continue
        }

        # Đây là lý do bước này tồn tại: một file tải dở vẫn có kích thước trông hợp lý, và chỉ
        # lộ ra là rác vào đúng lúc cần khôi phục.
        $expected = ((Get-Content -LiteralPath $destSum -Raw -Encoding ASCII) -split '\s+')[0]
        $actual = (Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash
        if ($expected -and $actual -and ($expected.ToLowerInvariant() -eq $actual.ToLowerInvariant())) {
            Set-Content -LiteralPath ($dest + '.verified') -Value $actual -Encoding ascii
            $ok = $true
            $downloaded++
            Write-Log ("OK {0} — {1:N1} MB" -f $name, ((Get-Item -LiteralPath $dest).Length / 1MB))
        }
        else {
            Write-Log "Checksum LỆCH cho $name (chờ $expected, được $actual) — xoá và thử lại." 'WARN'
            Remove-Item -LiteralPath $dest, $destSum -Force -ErrorAction SilentlyContinue
        }
    }

    if (-not $ok) { $failed += $name }
}

# --- Trạng thái backup phía VPS ---------------------------------------------
# `backup-status.json` là kênh DUY NHẤT để biết lần chạy gần nhất trên VPS ra sao: khoá này bị
# ForceCommand khoá cứng nên không chạy được lệnh nào trên đó.
$vpsBackupFailed = $false
$statusLocal = Join-Path $EnvDest 'backup-status.json'
$st = Invoke-Sftp @("cd /xeprime/$Environment", "get backup-status.json `"$statusLocal`"", 'bye')
if ($st.ExitCode -eq 0 -and (Test-Path -LiteralPath $statusLocal)) {
    try {
        $status = Get-Content -LiteralPath $statusLocal -Raw -Encoding UTF8 | ConvertFrom-Json
        $result = Get-CfgValue $status 'result' '?'
        $detail = Get-CfgValue $status 'detail' ''
        Write-Log ("Trạng thái backup trên VPS: {0} lúc {1} ({2})" -f `
            $result, (Get-CfgValue $status 'finishedAt' '?'), $detail)
        if ($result -ne 'ok') { $vpsBackupFailed = $true }
    }
    catch { Write-Log 'Không đọc được backup-status.json.' 'WARN' }
}

# --- Retention ---------------------------------------------------------------
# Dọn theo thư mục TUẦN, không theo từng file: một tuần là đơn vị nhỏ nhất mà việc mất nó có
# nghĩa gì đó, và xoá theo tuần thì không bao giờ để lại một tuần cụt nửa vời.
$cutoff = (Get-Date).AddDays(-7 * $KeepWeeks)
Get-ChildItem -LiteralPath $EnvDest -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^\d{4}-W\d{2}$' } |
    ForEach-Object {
        $newest = Get-ChildItem -LiteralPath $_.FullName -Filter '*.dump' -File -ErrorAction SilentlyContinue |
                  Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($newest -and $newest.LastWriteTime -lt $cutoff) {
            Write-Log ("Dọn thư mục quá hạn {0} tuần: {1}" -f $KeepWeeks, $_.Name)
            Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

# --- Dead-man switch ---------------------------------------------------------
# Lớp DUY NHẤT bắt được "sao lưu trên VPS chết lặng ba tuần rồi": cảnh báo phát TỪ VPS không bao
# giờ bắt được trường hợp chính VPS đó chết.
$stale = $null
$newestName = $remoteFiles[-1]
if ($newestName -match '-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.dump$') {
    $newestDate = Get-Date -Year ([int]$Matches[1]) -Month ([int]$Matches[2]) -Day ([int]$Matches[3]) `
                           -Hour ([int]$Matches[4]) -Minute ([int]$Matches[5]) -Second ([int]$Matches[6])
    $age = [int] ((Get-Date) - $newestDate).TotalDays
    Write-Log ("Bản mới nhất: {0} ({1} ngày tuổi)" -f $newestName, $age)
    if ($age -gt $StaleDays) { $stale = $age }
}

# --- Kết ---------------------------------------------------------------------
# Ba tình huống dưới đây đều `Fail` (thoát 1) chứ KHÔNG chỉ gửi Telegram. `Send-XpAlert` im lặng
# bỏ qua khi chưa khai token — mà token trống chính là giá trị mặc định trong
# config.example.json. Chỉ gửi cảnh báo thôi thì Task Scheduler vẫn báo XANH và không ai biết
# gì. Một kiểm tra sinh ra để bắt sự cố thì bản thân nó không được phép hỏng trong im lặng.
if ($failed.Count -gt 0) {
    Fail ("Không tải được {0} bản sau 3 lần thử: {1}" -f $failed.Count, ($failed -join ', '))
}
if ($null -ne $stale) {
    Fail "Bản sao lưu mới nhất của [$Environment] đã $stale ngày tuổi (ngưỡng $StaleDays ngày). Sao lưu trên VPS có thể đã ngừng chạy."
}
if ($vpsBackupFailed) {
    Fail "Lần sao lưu gần nhất trên VPS [$Environment] báo THẤT BẠI — đọc $statusLocal."
}

Set-Content -LiteralPath (Join-Path $DestRoot 'last-success.txt') `
            -Value (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') -Encoding ascii
Write-Log ("=== Xong: tải {0} bản mới, tổng {1} bản đang giữ ===" -f $downloaded, ($have.Count + $downloaded))
exit 0
