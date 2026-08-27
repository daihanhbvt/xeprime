# Kéo bản sao lưu XePrime về máy tại công ty

Máy tại công ty **PULL**, VPS **không** push.

VPS là thứ dễ bị chiếm nhất trong hệ thống — nó nằm trên Internet công khai. Nếu nó cầm khoá
ghi được vào mạng công ty thì kẻ chiếm nó xoá luôn bản sao lưu, đúng kịch bản ransomware.
Chiều pull thì VPS **không cầm bí mật nào** của phía bên kia, và công ty không phải mở cổng vào.

| Ở đâu | Giữ bao lâu | Ai chạy |
| --- | --- | --- |
| VPS `/var/backups/xeprime/<env>/daily` | 14 ngày | systemd timer, 03:00 giờ VN hằng ngày |
| Máy công ty `D:\XePrimeBackups` | 12 tuần | Task Scheduler, Chủ Nhật 04:00 |

14 ngày trên VPS = **hai chu kỳ pull**. Lỡ một tuần vẫn còn nguyên bản để lấy ở tuần sau.

> **Vì sao VPS không chờ máy công ty xác nhận rồi mới xoá:** làm vậy đòi máy công ty phải *ghi
> ngược* vào VPS, và đó chính là thứ cả thiết kế này tồn tại để cấm. Cửa sổ hai chu kỳ là cách
> mua sự an toàn đó mà không mở một đường ghi.

---

## 0. Có gì trong thư mục này

| File | Vai trò |
| --- | --- |
| `Pull-XePrimeBackup.ps1` | Kéo bản sao lưu về — chạy hằng tuần |
| `Test-XePrimeRestore.ps1` | Diễn tập khôi phục thật — chạy hằng tháng |
| `Common.ps1` | Hàm dùng chung. **Không chạy trực tiếp.** Chứa `Invoke-Native` — lớp bọc bắt buộc cho mọi lệnh ngoài, xem §9 |
| `config.example.json` | Mẫu cấu hình |
| `config.json` | Cấu hình thật của bạn — bị `.gitignore` chặn |

---

## 1. Yêu cầu

- **Windows 10/11** với **OpenSSH Client** (Settings → Apps → Optional features → thêm nếu
  chưa có). Kiểm: `Get-Command sftp.exe`
- **Docker Desktop** — chỉ cần cho `Test-XePrimeRestore.ps1`
- Ổ đích **khác ổ hệ điều hành**. Máy này vừa là máy dev vừa là nơi giữ bản sao; ổ `C:` hỏng
  hoặc bị mã hoá thì mất cả hai.

> ⚠️ Đây là bước đầu, không phải đích đến. Một máy trạm đang dùng hằng ngày không phải nơi lý
> tưởng để giữ bản sao lưu duy nhất ngoài VPS. Trong 1–2 tháng nên chuyển sang NAS, hoặc thêm
> một ổ ngoài quay vòng cất ngoài phòng máy.

---

## 2. Tạo khoá SSH

Khoá **riêng** cho việc này, không dùng lại khoá cá nhân hay khoá deploy của GitHub Actions —
để thu hồi được độc lập.

```powershell
ssh-keygen -t ed25519 -C "xeprime-backup-pull" -f "$env:USERPROFILE\.ssh\xeprime_pull" -N '""'

# ssh từ chối khoá mà tài khoản khác đọc được — Windows thừa kế ACL rất rộng theo mặc định.
icacls "$env:USERPROFILE\.ssh\xeprime_pull" /inheritance:r /grant:r "$($env:USERNAME):(R)"

# Ghim host key. Bỏ bước này thì phải dùng StrictHostKeyChecking=no, tức là chấp nhận bất kỳ
# máy nào trả lời ở địa chỉ đó.
ssh-keyscan -H <ip-vps> | Out-File -Append -Encoding ascii "$env:USERPROFILE\.ssh\known_hosts"

Get-Content "$env:USERPROFILE\.ssh\xeprime_pull.pub"
```

Trên VPS, bằng root, dán khoá công khai vừa in ra:

```bash
cd /opt/xeprime
sudo ./deploy/scripts/setup-backup-user.sh --pubkey "ssh-ed25519 AAAA... xeprime-backup-pull"
```

Script đó tạo user `xpbackup`, dựng `/var/backups` đúng quyền, và khoá phiên SSH của user này
lại thành **SFTP chỉ đọc**.

---

## 3. Kiểm tra giới hạn ĐÃ có hiệu lực

Làm ngay, trước khi đi tiếp. Đây là phần bảo vệ thật, không phải phần trang trí.

```powershell
# 1. PHẢI bị từ chối. Chạy được nghĩa là ForceCommand chưa có hiệu lực — DỪNG LẠI và sửa.
ssh -i "$env:USERPROFILE\.ssh\xeprime_pull" xpbackup@<ip> "whoami"

# 2. PHẢI vào được:
sftp -i "$env:USERPROFILE\.ssh\xeprime_pull" xpbackup@<ip>
sftp> ls /xeprime/production/daily
sftp> rm /xeprime/production/daily/<một-file>     # PHẢI báo lỗi permission
sftp> bye
```

Lệnh 1 chạy được, hoặc lệnh `rm` thành công, thì lối này **không** chỉ-đọc và cả mô hình chống
ransomware ở trên vô nghĩa.

---

## 4. Cấu hình

```powershell
Copy-Item config.example.json config.json
notepad config.json
```

`config.json` bị `.gitignore` chặn — nó chứa IP máy chủ và token bot.

---

## 5. Chạy tay lần đầu

```powershell
cd D:\Softrent\Xeprime\tools\backup-pull
powershell -NoProfile -ExecutionPolicy Bypass -File .\Pull-XePrimeBackup.ps1
```

Kết quả mong đợi: tải về mọi bản có trên VPS, mỗi bản được đối chiếu SHA-256 và ghi kèm một file
`.verified`. Log ở `D:\XePrimeBackups\pull.log`.

Script tải **mọi bản còn thiếu**, không chỉ bản mới nhất — máy tắt hai tuần thì lần chạy sau tự
bù, không cần can thiệp.

---

## 6. Hẹn giờ hằng tuần

```powershell
# Chạy PowerShell bằng quyền Administrator
$exe = "powershell.exe"
$arg = '-NoProfile -ExecutionPolicy Bypass -File "D:\Softrent\Xeprime\tools\backup-pull\Pull-XePrimeBackup.ps1"'

$action  = New-ScheduledTaskAction -Execute $exe -Argument $arg
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 4:00AM

# StartWhenAvailable = "chạy bù nếu lỡ giờ hẹn". Đây chính là cơ chế trả lời "máy công ty
# offline thì retry lần sau" — có sẵn trong Task Scheduler, không phải thứ phải tự viết.
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -WakeToRun `
    -DontStopIfGoingOnBatteries `
    -AllowStartIfOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName 'XePrime - keo ban sao luu' `
    -Action $action -Trigger $trigger -Settings $settings `
    -Description 'Keo ban sao luu PostgreSQL tu VPS ve, moi Chu Nhat 04:00' `
    -RunLevel Limited
```

Kiểm:

```powershell
Get-ScheduledTask -TaskName 'XePrime - keo ban sao luu' | Get-ScheduledTaskInfo
Start-ScheduledTask -TaskName 'XePrime - keo ban sao luu'   # chạy thử ngay
```

---

## 7. Diễn tập khôi phục — hằng tháng

`backup-db.sh` chạy `pg_restore --list` mỗi đêm, nhưng đó chỉ nói **file đọc được**. Script này
trả lời câu hỏi thật: **dữ liệu có dựng lại được không**.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Test-XePrimeRestore.ps1
```

Nó dựng một `postgres:16-alpine` dùng-một-lần, `pg_restore` bản mới nhất vào đó, đếm bản ghi ở
7 bảng lõi, rồi xoá container. Không đụng tới VPS, không đụng tới staging — và nó xác minh đúng
**bản mà công ty đang giữ**, tức là bản sẽ dùng khi thảm hoạ xảy ra.

**Tiêu chí đạt:** `pg_restore` không lỗi **và** `tenants` / `users` / `vehicles` / `bookings`
đều khác 0. `pg_restore` trả 0 mà database rỗng vẫn là một bản sao lưu vô dụng.

Hẹn giờ hằng tháng bằng cùng cách ở §6 (`-Monthly -DaysOfMonth 1 -At 5:00AM`).

---

## 8. Khi cần khôi phục thật

Xem `docs/backup-and-restore.md`. Đọc nó **trước** khi cần, không phải lúc đang cần.

---

## 9. Sự cố thường gặp

| Triệu chứng | Nguyên nhân gần như chắc chắn |
| --- | --- |
| `Permission denied (publickey)` | Khoá công khai chưa vào `authorized_keys` của `xpbackup`, hoặc ACL khoá riêng quá rộng — chạy lại lệnh `icacls` ở §2 |
| `Host key verification failed` | Chưa chạy `ssh-keyscan`, hoặc VPS đã cài lại và đổi host key |
| `sftp.exe` không tồn tại | Chưa bật OpenSSH Client trong Optional features |
| Liệt kê ra rỗng | Timer trên VPS chưa chạy: `systemctl list-timers xeprime-backup@production` |
| Checksum lệch liên tục | Đường truyền hỏng, hoặc đĩa VPS đang lỗi — kiểm `dmesg` trên VPS trước khi nghi mạng |
| Task Scheduler xanh nhưng không có file mới | Task chạy bằng tài khoản khác không đọc được khoá SSH. Đăng ký task bằng chính tài khoản đã tạo khoá |
| Tiếng Việt trong log thành ký tự lạ | File `.ps1` mất BOM. PowerShell 5.1 đọc file không BOM theo ANSI — ba script này **phải** là UTF-8 **có** BOM (`.gitattributes` giữ điều đó) |
| `NativeCommandError`, script chết giữa chừng không rõ lý do | Một lệnh ngoài (`docker`, `sftp`) được gọi thẳng thay vì qua `Invoke-Native`. Trong PowerShell 5.1, `$ErrorActionPreference='Stop'` cộng với `2>&1` trên lệnh ngoài sẽ NÉM ngay cả khi lệnh trả về 0 — mà `sftp` và `pg_isready` đều ghi stderr trong lúc chạy bình thường |
| Task Scheduler xanh nhưng sao lưu đã ngừng từ lâu | Không xảy ra nữa: dead-man switch thoát mã 1 chứ không chỉ gửi Telegram. Nếu vẫn thấy, kiểm `staleAfterDays` trong `config.json` |
