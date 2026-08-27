#!/usr/bin/env bash
# Sao lưu PostgreSQL của XePrime. Chạy từ GỐC REPO trên VPS.
#
#   ./deploy/scripts/backup-db.sh                  # production (mặc định)
#   ./deploy/scripts/backup-db.sh --env staging
#
# HAI nơi gọi script này, và đó là lý do có `flock`:
#   • systemd timer `xeprime-backup@<env>.timer` — 03:00 giờ VN hằng ngày
#   • `deploy.sh` — ngay trước mỗi lần migrate
# Deploy rơi đúng 03:00 mà không có lock là hai `pg_dump` chạy song song trên máy 6GB.
#
# Định dạng `-Fc` (custom) chứ không phải SQL thô: nó nén sẵn, và `pg_restore` khôi phục được
# TỪNG BẢNG thay vì phải nuốt cả file.
#
# Backup tuần của nhà cung cấp KHÔNG thay được việc này: nó chụp cả máy ảo mỗi 7 ngày, tức là
# trong trường hợp xấu nhất bạn mất 7 ngày đơn thuê, phiếu thu chi và hợp đồng.
#
# ĐƯA BẢN SAO RA KHỎI MÁY: máy tại công ty PULL về qua SFTP chỉ-đọc — xem
# `tools/backup-pull/README.md` và `deploy/scripts/setup-backup-user.sh`. Script này CỐ Ý không
# đẩy đi đâu cả: một VPS bị chiếm mà cầm khoá ghi vào mạng công ty thì kẻ chiếm nó xoá luôn bản
# sao lưu. Chiều pull thì VPS không cầm bí mật nào của phía bên kia.
#
# `-E` để ERR trap chạy cả khi lỗi xảy ra BÊN TRONG một hàm. Không có nó, bash chỉ bắt lỗi ở
# thân script — tức là đúng những lỗi bất ngờ nhất lại đi lọt mà không ai được báo.
set -Eeuo pipefail

cd "$(dirname "$0")/../.."

XP_ENV=production
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      XP_ENV="${2:-}"
      [[ -n "$XP_ENV" ]] || { echo '--env cần một tên môi trường.' >&2; exit 1; }
      shift 2
      ;;
    *) echo "Tham số không hiểu: $1" >&2; exit 1 ;;
  esac
done

ENV_FILE=".env.$XP_ENV"
[[ -f "$ENV_FILE" ]] || { echo "$ENV_FILE chưa có." >&2; exit 1; }
set -a; . "./$ENV_FILE"; set +a
export XP_ENV_FILE="$ENV_FILE"

DB_USER="${POSTGRES_USER:-xeprime}"
DB_NAME="${POSTGRES_DB:-xeprime}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
TIMEOUT="${BACKUP_TIMEOUT:-30m}"
# `/var/backups` chuẩn FHS: gắn được một đĩa riêng sau này mà không phải sửa script, và
# `ChrootDirectory` của SFTP chỉ-đọc yêu cầu thư mục gốc thuộc root (setup-backup-user.sh).
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/xeprime}"
ENV_ROOT="$BACKUP_ROOT/$XP_ENV"
DEST_DIR="$ENV_ROOT/daily"
STATUS_FILE="$ENV_ROOT/backup-status.json"

# Giờ Việt Nam trong tên file: khi cần lùi về "sáng thứ Ba" thì phải đọc được ngay tên file,
# không phải quy đổi múi giờ trong đầu. Tên môi trường cũng nằm trong tên file — hai dump của
# hai môi trường trông giống hệt nhau là cách khôi phục nhầm staging đè lên production.
STAMP="$(TZ=Asia/Ho_Chi_Minh date +%Y%m%d-%H%M%S)"
STARTED_AT="$(TZ=Asia/Ho_Chi_Minh date +%Y-%m-%dT%H:%M:%S%z)"
BASE="xeprime-$XP_ENV-$STAMP.dump"
OUT="$DEST_DIR/$BASE"
TMP="$OUT.tmp"

COMPOSE=(docker compose -p "xeprime-$XP_ENV" -f docker-compose.prod.yml --env-file "$ENV_FILE")

log()  { printf '==> %s\n' "$*"; }
warn() { printf '⚠ %s\n' "$*" >&2; }

# --- Ghi trạng thái + cảnh báo ---------------------------------------------
# `backup-status.json` là thứ máy tại công ty đọc để biết lần chạy gần nhất ra sao mà không cần
# quyền chạy lệnh trên VPS — SFTP chỉ-đọc không mở được shell, nên một file là kênh duy nhất.
json_escape() { printf '%s' "${1:-}" | tr '\n\r\t' '   ' | sed 's/\\/\\\\/g; s/"/\\"/g'; }

write_status() {
  local result="$1" detail="$2" bytes="${3:-0}"
  mkdir -p "$ENV_ROOT" 2>/dev/null || return 0
  {
    printf '{\n'
    printf '  "env": "%s",\n'        "$(json_escape "$XP_ENV")"
    printf '  "result": "%s",\n'     "$(json_escape "$result")"
    printf '  "startedAt": "%s",\n'  "$STARTED_AT"
    printf '  "finishedAt": "%s",\n' "$(TZ=Asia/Ho_Chi_Minh date +%Y-%m-%dT%H:%M:%S%z)"
    printf '  "file": "%s",\n'       "$(json_escape "$BASE")"
    printf '  "bytes": %s,\n'        "$bytes"
    printf '  "detail": "%s"\n'      "$(json_escape "$detail")"
    printf '}\n'
  } > "$STATUS_FILE" 2>/dev/null || true
}

# `HANDLED` chặn ERR trap chạy hai lần: `fail` ghi trạng thái, cảnh báo, rồi `exit 1` — và cú
# exit đó lại kích hoạt chính trap nếu không có gì canh.
HANDLED=0

alert() { ./deploy/scripts/notify.sh --env "$XP_ENV" "$1" || true; }

fail() {
  HANDLED=1
  printf '✗ %s\n' "$1" >&2
  write_status failed "$1"
  alert "❌ Sao lưu THẤT BẠI — $1"
  exit 1
}

on_err() {
  local code=$?
  if [[ $HANDLED -eq 1 ]]; then exit "$code"; fi
  HANDLED=1
  local msg="Lỗi không lường trước ở dòng ${BASH_LINENO[0]} (mã $code). Xem: journalctl -u xeprime-backup@$XP_ENV"
  printf '✗ %s\n' "$msg" >&2
  write_status failed "$msg"
  alert "❌ Sao lưu THẤT BẠI — $msg"
  exit "$code"
}

trap on_err ERR
trap 'rm -f "$TMP" "$TMP.sha256" 2>/dev/null || true' EXIT

log "Sao lưu [$XP_ENV] → $DEST_DIR"

if ! mkdir -p "$DEST_DIR"; then
  fail "Không tạo được $DEST_DIR. Chạy 'sudo ./deploy/scripts/setup-backup-user.sh' một lần để dựng thư mục và quyền."
fi

# --- Chống chạy trùng -------------------------------------------------------
# Gặp lock thì THOÁT SẠCH (mã 0), không xếp hàng chờ: tiến trình đang giữ lock cũng đang dump
# đúng database này, nên bản sao lưu của phút này vẫn có. Xếp hàng chỉ tạo ra hai dump cách nhau
# vài giây và nhân đôi tải I/O đúng lúc máy đang bận nhất.
#
# `flock` nằm trong util-linux, luôn có trên Ubuntu. Kiểm tường minh vì nếu nó thiếu thì
# `! flock -n 9` thành ĐÚNG và script báo "đang chạy — bỏ qua" rồi thoát 0 mỗi đêm: sao lưu
# ngừng hẳn trong im lặng, đúng chế độ hỏng mà cả thiết kế này sinh ra để chặn.
command -v flock >/dev/null 2>&1 || fail 'Thiếu lệnh flock (util-linux). Cài: apt-get install -y util-linux'

# Lock nằm trong CHÍNH kho sao lưu, KHÔNG phải /var/lock. Trên Ubuntu `/var/lock` là symlink tới
# `/run/lock` với quyền 0755 root — user `xeprime` không ghi được, nên `exec 9>` sẽ hỏng và sao
# lưu không bao giờ chạy. `$ENV_ROOT` thì `setup-backup-user.sh` đã cấp quyền cho đúng user này,
# và nó nằm trên đĩa thật nên không bị xoá mỗi lần khởi động lại như tmpfs.
LOCK="${BACKUP_LOCK:-$ENV_ROOT/.backup.lock}"
exec 9>"$LOCK" || fail "Không mở được lock $LOCK"
if ! flock -n 9; then
  log "Một tiến trình sao lưu [$XP_ENV] đang chạy — bỏ qua lượt này."
  trap - ERR EXIT
  exit 0
fi

# --- Đĩa: kiểm TRƯỚC khi ghi ------------------------------------------------
# Một dump nửa vời tệ hơn không dump: nó chiếm chỗ, mang tên đúng, và chỉ lộ ra là rác vào đúng
# lúc bạn cần nó. Nên hết chỗ là DỪNG, không phải "cứ thử xem sao".
AVAIL_KB="$(df -Pk "$DEST_DIR" | awk 'NR==2 {print $4}')"
LAST_BYTES="$(find "$DEST_DIR" -maxdepth 1 -name "xeprime-$XP_ENV-*.dump" -printf '%s\n' 2>/dev/null | sort -n | tail -1)"
LAST_KB=$(( ${LAST_BYTES:-0} / 1024 ))
log "Đĩa trống: $(( AVAIL_KB / 1024 )) MB · dump gần nhất: $(( LAST_KB / 1024 )) MB"

if (( AVAIL_KB < 2 * 1024 * 1024 )); then
  fail "Chỉ còn $(( AVAIL_KB / 1024 )) MB trống trên $DEST_DIR — dưới ngưỡng 2 GB, KHÔNG sao lưu. Dọn đĩa: docker image prune -a"
fi
if (( AVAIL_KB < 5 * 1024 * 1024 )) || { (( LAST_KB > 0 )) && (( AVAIL_KB < LAST_KB * 2 )); }; then
  warn "Đĩa sắp đầy: còn $(( AVAIL_KB / 1024 )) MB. Vẫn sao lưu lượt này."
  alert "⚠️ Đĩa sắp đầy: còn $(( AVAIL_KB / 1024 )) MB trên $DEST_DIR (dump gần nhất $(( LAST_KB / 1024 )) MB)"
fi

# --- Dọn bản cũ TRƯỚC khi dump ---------------------------------------------
# Thứ tự này có chủ đích. Dọn SAU nghĩa là lúc ghi dump mới là lúc đĩa căng nhất trong cả chu kỳ.
# Đánh đổi đã biết: dump lỗi thì đã xoá mất bản thứ 14 — chấp nhận được khi còn 13 bản.
#
# Chỉ dọn dump CỦA MÔI TRƯỜNG NÀY: nếu có ngày hai môi trường chung một máy, một lệnh find quét
# chung sẽ xoá bản sao lưu của môi trường kia theo hạn giữ của môi trường này.
log "Dọn bản cũ hơn $KEEP_DAYS ngày"
find "$DEST_DIR" -maxdepth 1 -name "xeprime-$XP_ENV-*.dump*" -mtime "+$KEEP_DAYS" -print -delete

# --- Dump -------------------------------------------------------------------
# `-T` tắt cấp TTY: có TTY thì docker chèn ký tự điều khiển vào stdout và file dump hỏng theo
# cách chỉ lộ ra lúc restore.
#
# `nice` chạy bên TRONG container (busybox có sẵn). `nice` ở phía host chỉ hạ ưu tiên của tiến
# trình docker CLI, không phải của `pg_dump` đang chạy trong container `db`.
# Không dùng `ionice`: nó cần `util-linux`, không có trong `postgres:16-alpine`, và cài thêm
# một package chỉ để nhường I/O trong vài chục giây là không đáng.
#
# `pg_dump` KHÔNG khoá ghi — nó chụp một snapshot nhất quán trong một transaction. Nhưng
# transaction dài chặn VACUUM dọn bản ghi mới hơn snapshot, nên `timeout` không phải để cho vui:
# một dump treo hàng giờ sẽ làm phình bảng.
#
# Tên user/db truyền qua $0/$1 của `sh -c` chứ không nội suy vào chuỗi lệnh — chúng đến từ file
# env, và nội suy thẳng vào một chuỗi sẽ chạy là một chỗ tiêm lệnh.
log "pg_dump (timeout $TIMEOUT)"
set +e
timeout "$TIMEOUT" "${COMPOSE[@]}" exec -T db \
  sh -c 'nice -n 10 pg_dump -U "$0" -d "$1" -Fc -Z 6' "$DB_USER" "$DB_NAME" > "$TMP"
DUMP_RC=$?
set -e
if (( DUMP_RC == 124 )); then
  fail "pg_dump vượt quá timeout $TIMEOUT — database quá lớn hoặc máy đang nghẽn I/O."
fi
if (( DUMP_RC != 0 )); then
  fail "pg_dump thất bại (mã $DUMP_RC). Kiểm tra container db: docker compose -p xeprime-$XP_ENV -f docker-compose.prod.yml ps"
fi

# Một file 0 byte vẫn là "thành công" dưới `set -e`: lỗi nằm ở phía pg_dump, không ở redirect.
SIZE=$(wc -c < "$TMP")
(( SIZE > 1024 )) || fail "Dump chỉ $SIZE byte — coi như thất bại."

# --- Xác minh: ĐỌC ĐƯỢC, không chỉ tồn tại ----------------------------------
# `pg_restore --list` đọc mục lục của archive. File cụt (hết đĩa giữa chừng) hoặc hỏng sẽ lỗi Ở
# ĐÂY — chứ không phải vào lúc bạn cần khôi phục và không còn đường lùi nào khác.
#
# Đây là mức kiểm HẰNG NGÀY, và nó chỉ nói "file đọc được". Mức "dữ liệu dựng lại được" là việc
# của `tools/backup-pull/Test-XePrimeRestore.ps1`, chạy hằng tháng ở máy công ty.
log 'Xác minh archive (pg_restore --list)'
"${COMPOSE[@]}" exec -T db pg_restore --list > /dev/null < "$TMP" \
  || fail "Archive không đọc được — dump hỏng, KHÔNG giữ lại file này."

# --- Checksum ---------------------------------------------------------------
# Tên ghi trong file .sha256 phải là tên CUỐI CÙNG (sau `mv`), nếu không máy công ty tải về sẽ
# thấy `sha256sum -c` báo sai tên file.
# KHÔNG bọc trong subshell: với `set -E`, subshell thừa hưởng ERR trap, nên một lỗi ở đây
# kích hoạt `on_err` BÊN TRONG subshell rồi lại kích hoạt lần nữa ở tiến trình cha (biến
# HANDLED không đi ngược ra ngoài) — hai tin nhắn Telegram cho một sự cố.
sha256sum "$TMP" | awk -v n="$BASE" '{print $1 "  " n}' > "$TMP.sha256"

# --- Đổi tên: bước CUỐI, nguyên tử -----------------------------------------
# Máy tại công ty có thể pull đúng lúc VPS đang dump. `mv` trong cùng filesystem là thao tác
# nguyên tử, nên file mang đuôi `.dump` LUÔN là file đã hoàn chỉnh và đã xác minh. Đó là thứ
# thay cho việc phải đồng bộ khoá giữa hai máy.
mv "$TMP.sha256" "$OUT.sha256"
mv "$TMP" "$OUT"
chmod 640 "$OUT" "$OUT.sha256"

log "Xong: $BASE — $(( SIZE / 1024 / 1024 )) MB"
write_status ok "$(( SIZE / 1024 / 1024 )) MB" "$SIZE"
