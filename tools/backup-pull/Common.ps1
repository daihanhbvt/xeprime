<#
.SYNOPSIS
    Hàm dùng chung cho Pull-XePrimeBackup.ps1 và Test-XePrimeRestore.ps1.

.DESCRIPTION
    Dot-source từ cả hai script: . (Join-Path $PSScriptRoot 'Common.ps1')

    Viết cho Windows PowerShell 5.1 — không dùng `&&`, toán tử ternary, `??`, hay -AsHashtable.
#>

# ---------------------------------------------------------------------------
# Gọi chương trình ngoài (docker, sftp, ssh)
# ---------------------------------------------------------------------------
# LÝ DO TỒN TẠI, và nó là một lỗi thật đã đo chứ không phải đề phòng:
#
# Trong Windows PowerShell 5.1, `$ErrorActionPreference = 'Stop'` cộng với việc gộp stderr của
# một chương trình NGOÀI vào luồng thành công (`2>&1`) khiến PowerShell dựng một
# NativeCommandError và NÉM — kể cả khi chương trình đó trả về mã 0.
#
# Mọi lệnh ta cần gọi đều ghi stderr trong lúc chạy bình thường: `sftp` in tiến trình, `pg_isready`
# báo "đang khởi động", `docker rm -f` phàn nàn khi container không tồn tại. Nghĩa là nếu gọi
# thẳng thì `$LASTEXITCODE` không bao giờ được đọc tới — và tệ nhất là `docker rm -f` nằm trên
# ĐƯỜNG XỬ LÝ LỖI, nên script sẽ ném trước khi kịp gửi cảnh báo.
#
# (PowerShell 7.2+ có $PSNativeCommandUseErrorActionPreference để tắt hành vi này; 5.1 thì không.)
function Invoke-Native {
    param([Parameter(Mandatory = $true)][scriptblock] $Command)

    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $out = & $Command 2>&1
        return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = @($out) }
    }
    finally { $ErrorActionPreference = $prev }
}

# ---------------------------------------------------------------------------
# Đọc config an toàn
# ---------------------------------------------------------------------------
# `Set-StrictMode -Version 2.0` khiến việc đọc một thuộc tính KHÔNG TỒN TẠI ném lỗi. `config.json`
# do người viết tay, nên một khoá bị bỏ quên là chuyện bình thường — và nó không được phép làm
# chết cả lần chạy.
function Get-CfgValue {
    param($Config, [string] $Name, $Default = $null)

    if ($null -eq $Config) { return $Default }
    if (-not $Config.PSObject.Properties.Name.Contains($Name)) { return $Default }

    $v = $Config.$Name
    if ($null -eq $v) { return $Default }
    if (($v -is [string]) -and [string]::IsNullOrWhiteSpace($v)) { return $Default }
    return $v
}

# ---------------------------------------------------------------------------
# Log
# ---------------------------------------------------------------------------
$script:XpLogFile = $null

function Set-XpLogFile {
    param([string] $Path)
    $script:XpLogFile = $Path
}

function Write-Log {
    param(
        [string] $Message,
        [ValidateSet('INFO', 'WARN', 'ERROR')] [string] $Level = 'INFO'
    )
    $line = '{0} [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
    switch ($Level) {
        'ERROR' { Write-Host $line -ForegroundColor Red }
        'WARN'  { Write-Host $line -ForegroundColor Yellow }
        default { Write-Host $line }
    }
    if ($script:XpLogFile) {
        try { Add-Content -Path $script:XpLogFile -Value $line -Encoding utf8 } catch { }
    }
}

# ---------------------------------------------------------------------------
# Cảnh báo Telegram
# ---------------------------------------------------------------------------
# KHÔNG BAO GIỜ ném tiếp. Hàm này nằm trên đường xử lý lỗi: một lần gửi thất bại (mất mạng,
# token sai) mà làm chết script thì sự cố THẬT bị che sau một sự cố phụ.
#
# ⚠️ Cảnh báo là lớp PHỤ, không phải lớp chính. Nơi gọi phải tự thoát với mã khác 0 khi có sự
# cố, để Task Scheduler báo đỏ kể cả khi Telegram chưa được cấu hình.
function Send-XpAlert {
    param($Config, [string] $Tag, [string] $Text)

    $token = Get-CfgValue $Config 'telegramBotToken'
    $chat = Get-CfgValue $Config 'telegramChatId'
    if (-not $token -or -not $chat) {
        Write-Log 'Chưa khai telegramBotToken/telegramChatId — bỏ qua cảnh báo.' 'WARN'
        return
    }

    try {
        # TLS 1.2 phải bật tường minh: PowerShell 5.1 mặc định còn dùng TLS 1.0, mà API Telegram
        # đã từ chối nó. Triệu chứng là "Could not create SSL/TLS secure channel" — một thông báo
        # không nói gì về nguyên nhân.
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $body = @{
            chat_id                  = $chat
            text                     = "XePrime [$Tag @ $env:COMPUTERNAME]`n$Text"
            disable_web_page_preview = 'true'
        }
        Invoke-RestMethod -Method Post -TimeoutSec 20 `
            -Uri "https://api.telegram.org/bot$token/sendMessage" -Body $body | Out-Null
    }
    catch {
        Write-Log ('Gửi Telegram thất bại: ' + $_.Exception.Message) 'WARN'
    }
}
