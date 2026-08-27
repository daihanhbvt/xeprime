#!/usr/bin/env bash
# Sao lưu PostgreSQL của XePrime. Chạy từ GỐC REPO trên VPS.
#
#   ./deploy/scripts/backup-db.sh                  # production (mặc định)
#   ./deploy/scripts/backup-db.sh --env staging
#
# `deploy.sh` gọi script này TRƯỚC mỗi lần migrate, và cron gọi nó hằng đêm (xem
# docs/deployment.md §6). Định dạng `-Fc` (custom) chứ không phải SQL thô: nó đã nén sẵn,
# và `pg_restore` khôi phục được từng bảng thay vì phải nuốt cả file.
#
# Backup tuần của nhà cung cấp KHÔNG thay được việc này: nó chụp cả máy ảo mỗi 7 ngày, tức là
# trong trường hợp xấu nhất bạn mất 7 ngày đơn thuê, phiếu thu chi và hợp đồng.
set -euo pipefail

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
DEST_DIR="${BACKUP_DIR:-$HOME/xeprime-backups}"
# Giờ Việt Nam trong tên file: khi cần lùi về "sáng thứ Ba" thì phải đọc được ngay tên file,
# không phải quy đổi múi giờ trong đầu. Tên môi trường cũng nằm trong tên file — hai dump của
# hai môi trường trông giống hệt nhau là cách khôi phục nhầm staging đè lên production.
STAMP="$(TZ=Asia/Ho_Chi_Minh date +%Y%m%d-%H%M%S)"
OUT="$DEST_DIR/xeprime-$XP_ENV-$STAMP.dump"

mkdir -p "$DEST_DIR"

echo "==> pg_dump [$XP_ENV] -> $OUT"
# `-T` tắt cấp TTY: có TTY thì docker chèn ký tự điều khiển vào stdout và file dump hỏng
# theo cách chỉ lộ ra lúc restore.
docker compose -p "xeprime-$XP_ENV" -f docker-compose.prod.yml --env-file "$ENV_FILE" \
  exec -T db pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "$OUT"

# Một file 0 byte vẫn là "thành công" với `set -e` vì lỗi nằm ở phía pg_dump chứ không ở
# redirect. Kiểm kích thước là cách duy nhất biết mình vừa sao lưu cái gì.
SIZE=$(wc -c < "$OUT")
(( SIZE > 1024 )) || { echo "✗ Dump chỉ $SIZE byte — coi như thất bại." >&2; rm -f "$OUT"; exit 1; }
echo "    $(( SIZE / 1024 / 1024 )) MB"

# --- Đẩy ra ngoài máy ------------------------------------------------------
# Bản sao nằm cùng ổ đĩa với dữ liệu gốc thì không phải bản sao lưu: đĩa hỏng là mất cả hai.
if [[ -n "${BACKUP_RCLONE_REMOTE:-}" ]]; then
  if command -v rclone >/dev/null 2>&1; then
    echo "==> rclone copy -> $BACKUP_RCLONE_REMOTE"
    rclone copy "$OUT" "$BACKUP_RCLONE_REMOTE" --no-traverse
  else
    echo '⚠ BACKUP_RCLONE_REMOTE đã đặt nhưng chưa cài rclone — bản sao chỉ nằm trên VPS.' >&2
  fi
else
  echo '⚠ BACKUP_RCLONE_REMOTE trống — bản sao CHỈ nằm trên chính VPS này.' >&2
fi

# --- Dọn bản cũ ------------------------------------------------------------
# Chỉ dọn dump CỦA MÔI TRƯỜNG NÀY. Nếu có ngày hai môi trường chung một máy, một lệnh find
# quét chung sẽ xoá bản sao lưu của môi trường kia theo hạn giữ của môi trường này.
find "$DEST_DIR" -name "xeprime-$XP_ENV-*.dump" -mtime "+$KEEP_DAYS" -print -delete
echo '==> Xong.'
