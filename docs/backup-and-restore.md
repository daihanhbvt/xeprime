# Sao lưu và khôi phục XePrime

> Đọc file này **trước** khi cần, không phải lúc đang cần.
> Phần cài đặt: `docs/deployment.md` §6. Phần máy Windows: `tools/backup-pull/README.md`.

---

## 0. Cần khôi phục NGAY? → nhảy tới §5

---

## 1. Dữ liệu đang nằm ở đâu

| Kho | Nội dung | Được sao lưu? |
| --- | --- | --- |
| **PostgreSQL** — volume `xeprime-<env>_pgdata` ở `/var/lib/docker/volumes/…/_data` trên VPS | Toàn bộ nghiệp vụ: gian hàng, xe, đơn thuê, phiếu thu chi, hợp đồng, người dùng | ✅ file này |
| **Cloudflare R2** — bucket public + private | Ảnh xe, ảnh gian hàng, giấy tờ | ❌ **chưa** — bật Object Versioning ở R2 |
| **Firestore** | Projection chat ~30–50 tin gần nhất | ❌ không cần: PostgreSQL là source of truth (ADR 0009), đẩy lại được |

Database **không** publish cổng ra host — nó chỉ sống trong network `internal` của compose.
Mọi thao tác đi qua `docker compose exec db`.

---

## 2. Kiến trúc sao lưu

```
        VPS Vietnix                                Máy tại công ty (Windows)
 ┌─────────────────────────────────┐        ┌──────────────────────────────────┐
 │ systemd timer — 03:00 VN, hằng ngày│      │ Task Scheduler — CN 04:00, hằng tuần│
 │   flock (chống trùng deploy.sh)  │        │   chạy bù nếu lỡ giờ hẹn          │
 │   kiểm df TRƯỚC khi ghi          │        │                                   │
 │   dọn retention TRƯỚC khi dump   │        │   sftp PULL ────────────────┐    │
 │   timeout 30m · nice trong container│ SSH │   (chỉ đọc, chroot)         │    │
 │   pg_dump -Fc -Z6  ──────────────┼────────┼───◄─────────────────────────┘    │
 │   pg_restore --list  (xác minh)  │ chỉ    │   so SHA-256 · retry 3 lần       │
 │   sha256sum → .sha256            │ đọc    │   thư mục tuần ISO · giữ 12 tuần │
 │   mv .tmp → .dump  (nguyên tử)   │        │   dead-man: mới nhất > 8 ngày     │
 │   giữ 14 ngày                    │        │                                   │
 │   THẤT BẠI → Telegram            │        │   THẤT BẠI → Telegram            │
 └─────────────────────────────────┘        └──────────────────────────────────┘
                                                       │ hằng tháng
                                                       ▼
                                          docker run postgres:16-alpine
                                          pg_restore THẬT + đếm bản ghi
```

### Năm quyết định và lý do

**1. Máy công ty PULL, VPS không PUSH.** VPS là thứ dễ bị chiếm nhất trong hệ thống — nó nằm
trên Internet công khai. Nếu nó cầm khoá ghi được vào mạng công ty thì kẻ chiếm nó xoá luôn bản
sao lưu, đúng kịch bản ransomware. Chiều pull thì VPS **không cầm bí mật nào** của phía bên kia,
và công ty không phải mở cổng vào.

**2. Khoá pull bị khoá cứng ở CẤP MÁY CHỦ**, không phải ở cấp thoả thuận: `ForceCommand
internal-sftp -R` + `ChrootDirectory` trong `sshd_config.d`, cộng thêm tiền tố `restrict` trong
`authorized_keys` — hai lớp độc lập. Khoá rò rỉ vẫn chỉ tải được đúng thư mục dump: không mở
được shell, không xoá được gì, không dùng VPS làm bàn đạp.

**3. VPS giữ 14 ngày ĐỘC LẬP, không chờ máy công ty xác nhận.** Nối retention của VPS vào xác
nhận của máy công ty đòi máy công ty phải *ghi ngược* vào VPS — đúng thứ quyết định 1 và 2 tồn
tại để cấm. Con số đã đủ đệm: pull mỗi 7 ngày, giữ 14 ngày = **hai chu kỳ**. Lỡ một tuần vẫn
còn nguyên bản để lấy tuần sau.

**4. Cảnh báo phát từ HAI phía.** Cảnh báo phát từ VPS không bao giờ bắt được trường hợp chính
VPS đó chết. Nên máy công ty còn kiểm **tuổi của bản mới nhất**: quá 8 ngày là báo, bất kể VPS
có nói gì hay không. Đây là lớp duy nhất bắt được "cron chết lặng ba tuần rồi".

**5. Ghi `.tmp` rồi `mv`.** Máy công ty có thể pull đúng lúc VPS đang dump. `mv` trong cùng
filesystem là thao tác nguyên tử, nên file mang đuôi `.dump` **luôn** là file đã hoàn chỉnh và
đã xác minh — thay cho việc phải đồng bộ khoá giữa hai máy.

### Ba mức xác minh

| Mức | Khi nào | Trả lời câu gì |
| --- | --- | --- |
| Kích thước > 1 KB | mỗi đêm | file có nội dung không |
| `pg_restore --list` | mỗi đêm | **archive đọc được không** — file cụt do hết đĩa lộ ra ở đây |
| SHA-256 | mỗi lần pull + mỗi lần restore | đường truyền/đĩa có làm hỏng không |
| `pg_restore` thật + đếm bản ghi | **hằng tháng**, ở máy công ty | **dữ liệu dựng lại được không** |

Ba mức đầu chỉ nói về *file*. Chỉ mức cuối nói về *dữ liệu*, và đó là thứ bạn thực sự cần.

---

## 3. Điều phải biết trước: RPO 24 giờ

`pg_dump` chạy 03:00 hằng đêm. **Sự cố lúc 22h làm mất 19 giờ ghi** — đơn thuê, phiếu thu chi,
hợp đồng của trọn một ngày làm việc.

Đây là **đánh đổi đã chấp nhận**, không phải chuyện bị bỏ sót: PITR (WAL archiving) thêm một
thành phần phải vận hành, và ở lượng đơn hiện tại nó chưa đáng. Khi 19 giờ trở thành không chấp
nhận được: `pgBackRest` archive WAL vào chính `/var/backups`, máy công ty vẫn pull như cũ —
kiến trúc này không cản đường nó.

---

## 4. Kiểm tra định kỳ

**Hằng tuần** (2 phút):

```powershell
Get-Content D:\XePrimeBackups\last-success.txt
Get-ChildItem D:\XePrimeBackups\production -Recurse -Filter *.dump |
    Sort-Object LastWriteTime -Descending | Select-Object -First 3 Name, Length, LastWriteTime
```

**Hằng tháng** (10 phút) — diễn tập khôi phục thật:

```powershell
cd D:\Softrent\Xeprime\tools\backup-pull
powershell -NoProfile -ExecutionPolicy Bypass -File .\Test-XePrimeRestore.ps1
```

Đạt = `pg_restore` không lỗi **và** `tenants`/`users`/`vehicles`/`bookings` đều khác 0.

**Trên VPS bất cứ lúc nào:**

```bash
systemctl list-timers 'xeprime-backup@*'
journalctl -u xeprime-backup@production -n 50 --no-pager
cat /var/backups/xeprime/production/backup-status.json
df -h /
```

---

## 5. KHÔI PHỤC

### 5.1 Trước khi gõ bất cứ lệnh nào

Trả lời ba câu, theo thứ tự:

1. **Mất tới đâu?** Một bảng bị xoá nhầm, hay cả database, hay cả máy?
2. **Cần lùi về thời điểm nào?** Tên file mang giờ Việt Nam:
   `xeprime-production-20260901-030000.dump` = 03:00 ngày 01/09/2026.
3. **Có ai đang ghi vào hệ thống không?** Nếu có, báo họ dừng. `restore-db.sh` tự dừng
   api/web/worker, nhưng người dùng đang thao tác dở sẽ thấy lỗi giữa chừng.

> ⚠️ Khôi phục **GHI ĐÈ** dữ liệu hiện có. Mọi thứ ghi vào sau thời điểm của bản dump sẽ **mất**.
> Nếu chỉ hỏng một bảng thì §5.4 khôi phục đúng bảng đó, đừng ghi đè cả database.

### 5.2 Khôi phục cả database từ dump trên VPS

Đường nhanh nhất, dùng khi VPS còn sống và dump 14 ngày còn đó.

```bash
ssh xeprime@<ip-vps>
cd /opt/xeprime
ls -lh /var/backups/xeprime/production/daily/          # chọn bản cần lùi về

./deploy/scripts/restore-db.sh \
  /var/backups/xeprime/production/daily/xeprime-production-<stamp>.dump
```

Script sẽ: xác minh SHA-256 → hỏi gõ `YES` → dừng api/web/worker → `pg_restore --clean
--if-exists --single-transaction` → chạy migration còn thiếu (dump có thể cũ hơn code) → khởi
động lại → in `ps`.

Kiểm ngay sau đó:

```bash
curl -fsS https://api.xeprime.vn/health
docker compose -p xeprime-production -f docker-compose.prod.yml --env-file .env.production \
  exec -T db psql -U xeprime -d xeprime -c \
  "select (select count(*) from bookings) as bookings, (select count(*) from vehicles) as vehicles;"
```

### 5.3 Khôi phục từ bản giữ ở công ty

Dùng khi VPS mất sạch (đĩa hỏng, bị chiếm, nhà cung cấp xoá nhầm).

```powershell
# 1. Chọn bản, xác minh checksum TRƯỚC khi đưa lên
cd D:\XePrimeBackups\production
Get-ChildItem -Recurse -Filter *.dump | Sort-Object Name -Descending | Select-Object -First 5 FullName

$dump = "D:\XePrimeBackups\production\2026-W36\xeprime-production-20260901-030000.dump"
$expected = ((Get-Content "$dump.sha256" -Raw) -split '\s+')[0]
$actual   = (Get-FileHash $dump -Algorithm SHA256).Hash
if ($expected -ne $actual) { Write-Host "CHECKSUM LỆCH — chọn bản khác" -ForegroundColor Red }

# 2. Đưa lên máy mới (dùng khoá deploy, KHÔNG phải khoá xpbackup — khoá đó chỉ đọc)
scp -i "$env:USERPROFILE\.ssh\xeprime_deploy" $dump "$dump.sha256" xeprime@<ip-moi>:/tmp/
```

Trên máy mới, dựng lại theo `docs/deployment.md` §3 (bootstrap → deploy để có schema và
container), rồi:

```bash
cd /opt/xeprime
./deploy/scripts/restore-db.sh /tmp/xeprime-production-<stamp>.dump
```

### 5.4 Chỉ khôi phục MỘT bảng

Đây là lý do dùng định dạng `-Fc` chứ không phải SQL thô.

```bash
cd /opt/xeprime
C="docker compose -p xeprime-production -f docker-compose.prod.yml --env-file .env.production"
D=/var/backups/xeprime/production/daily/xeprime-production-<stamp>.dump

# Xem trong dump có gì
$C exec -T db pg_restore --list < "$D" | grep -i ' payments'

# Khôi phục đúng một bảng. --data-only giữ nguyên cấu trúc và các FK đang tồn tại.
$C exec -T db pg_restore -U xeprime -d xeprime --data-only --table=payments \
  --no-owner --single-transaction < "$D"
```

> Bảng có khoá ngoại trỏ tới nó thì `--data-only` có thể vi phạm ràng buộc. Khi đó: khôi phục
> cả database vào một database TẠM rồi `INSERT ... SELECT` phần cần lấy sang. Chậm hơn nhưng
> không làm hỏng thứ đang đúng.

### 5.5 Khôi phục vào database tạm để so sánh

Khi bạn chưa chắc bản dump nào chứa dữ liệu cần, hoặc muốn lấy vài dòng mà không đụng production:

```bash
C="docker compose -p xeprime-production -f docker-compose.prod.yml --env-file .env.production"
$C exec -T db createdb -U xeprime xeprime_tam
$C exec -T db pg_restore -U xeprime -d xeprime_tam --no-owner < "$D"
$C exec -T db psql -U xeprime -d xeprime_tam -c "select count(*) from bookings;"
# ... lấy xong thì dọn:
$C exec -T db dropdb -U xeprime xeprime_tam
```

Cách này **không rủi ro** — production không bị chạm tới. Nếu còn phân vân thì luôn bắt đầu ở đây.

---

## 6. Bao lâu thì xong

| Việc | Thời gian |
| --- | --- |
| `pg_dump` hằng đêm | 30–90 giây |
| Khôi phục §5.2 (dump có sẵn trên VPS) | *chưa đo — điền sau lần diễn tập đầu* |
| Khôi phục §5.3 (dựng máy mới từ đầu) | *chưa đo — cộng thêm 20–40 phút dựng máy* |
| Tải một bản từ VPS về (≈400 MB, 30 Mbps) | ~2 phút |

> **Bấm giờ lần diễn tập đầu tiên và điền vào bảng này.** Khi sự cố thật xảy ra, câu hỏi đầu
> tiên bạn phải trả lời được là "bao lâu thì xong" — và lúc đó không phải lúc đi đo.

---

## 7. Sự cố thường gặp

| Triệu chứng | Nguyên nhân gần như chắc chắn |
| --- | --- |
| Timer xanh nhưng không có file dump mới | Repo trên VPS không nằm ở `/opt/xeprime` — unit trỏ đường dẫn tuyệt đối |
| `Thiếu lệnh flock` | `apt-get install -y util-linux`. Đây là lỗi CỨNG có chủ đích: thiếu flock mà bỏ qua thì sao lưu ngừng chạy trong im lặng |
| `Chỉ còn N MB trống — KHÔNG sao lưu` | Đĩa đầy. `docker image prune -a`, rồi kiểm `du -sh /var/lib/docker /var/backups` |
| `Archive không đọc được` | Dump hỏng giữa chừng, gần như luôn là hết đĩa. File đã bị xoá, không giữ lại rác |
| `pg_dump vượt quá timeout` | Database lớn hơn dự tính hoặc I/O nghẽn. Tăng `BACKUP_TIMEOUT`, nhưng kiểm `docker stats` trước |
| Không nhận được cảnh báo Telegram nào, kể cả khi cố tình làm hỏng | Chưa khai `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`, hoặc chưa nhắn cho bot lần nào (bot không nhắn trước được cho người chưa từng nhắn nó) |
| Pull báo `Permission denied (publickey)` | Xem `tools/backup-pull/README.md` §9 |
| `ssh xpbackup@<ip> "whoami"` CHẠY ĐƯỢC | `ForceCommand` chưa có hiệu lực — chạy lại `setup-backup-user.sh` và kiểm `sshd -t` |
| Restore xong nhưng thiếu cột / API lỗi | Dump cũ hơn code. `restore-db.sh` đã tự chạy `migrate` sau restore — kiểm log bước đó |
| Restore báo lỗi role không tồn tại | Thiếu `--no-owner`. Dump mang thông tin chủ sở hữu của database gốc |
| Tiếng Việt trong script PowerShell thành ký tự lạ | File `.ps1` mất BOM UTF-8 — xem `.gitattributes` |
