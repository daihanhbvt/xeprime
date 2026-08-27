#!/usr/bin/env bash
# Khôi phục PostgreSQL từ một file dump. Chạy từ GỐC REPO trên VPS.
#
#   ./deploy/scripts/restore-db.sh /var/backups/xeprime/production/daily/xeprime-production-20260901-030000.dump
#   ./deploy/scripts/restore-db.sh --env staging /var/backups/xeprime/staging/daily/xeprime-staging-….dump
#
# ⚠️ GHI ĐÈ dữ liệu hiện có. Script dừng api/web/worker trước để không có ai ghi vào giữa
# chừng — khôi phục trong lúc ứng dụng vẫn nhận đơn là cách tạo ra một database không khớp
# với chính nó.
#
# Một bản sao lưu chưa từng được khôi phục thử thì chưa phải bản sao lưu. Chạy thử ít nhất một
# lần trên môi trường staging trước khi tin nó.
set -euo pipefail

cd "$(dirname "$0")/../.."

XP_ENV=production
DUMP=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      XP_ENV="${2:-}"
      [[ -n "$XP_ENV" ]] || { echo '--env cần một tên môi trường.' >&2; exit 1; }
      shift 2
      ;;
    *) DUMP="$1"; shift ;;
  esac
done

[[ -f "$DUMP" ]] || { echo "Cách dùng: $0 [--env <tên>] <đường-dẫn-file.dump>" >&2; exit 1; }

ENV_FILE=".env.$XP_ENV"
[[ -f "$ENV_FILE" ]] || { echo "$ENV_FILE chưa có." >&2; exit 1; }
set -a; . "./$ENV_FILE"; set +a
export XP_ENV_FILE="$ENV_FILE"

DB_USER="${POSTGRES_USER:-xeprime}"
DB_NAME="${POSTGRES_DB:-xeprime}"
COMPOSE=(docker compose -p "xeprime-$XP_ENV" -f docker-compose.prod.yml --profile tools --env-file "$ENV_FILE")

# Tên môi trường nằm trong tên file dump (backup-db.sh đặt như vậy). Cảnh báo khi hai thứ lệch
# nhau — khôi phục dump staging đè lên production là loại tai nạn không có nút hoàn tác.
case "$(basename "$DUMP")" in
  "xeprime-$XP_ENV-"*) ;;
  *) echo "⚠ Tên file KHÔNG mang nhãn '$XP_ENV'. Đọc kỹ trước khi gõ YES." >&2 ;;
esac

# Xác minh checksum TRƯỚC khi dừng ứng dụng. `backup-db.sh` ghi kèm một file `.sha256`, và một
# dump đi qua đường truyền (máy công ty pull về rồi mang ngược lên) có thể hỏng mà kích thước
# vẫn đúng. Phát hiện ở đây thì mất 5 giây; phát hiện sau khi `--clean` đã xoá schema cũ thì
# database đang trống và bản dump trong tay là bản hỏng.
if [[ -f "$DUMP.sha256" ]]; then
  echo '==> Xác minh checksum'
  ( cd "$(dirname "$DUMP")" && sha256sum -c "$(basename "$DUMP").sha256" ) \
    || { echo '✗ Checksum KHÔNG khớp — file dump đã hỏng. DỪNG.' >&2; exit 1; }
else
  echo "⚠ Không có $(basename "$DUMP").sha256 — bỏ qua bước xác minh checksum." >&2
fi

read -rp "Ghi đè database '$DB_NAME' của môi trường '$XP_ENV' bằng $(basename "$DUMP")? Gõ 'YES': " CONFIRM
[[ "$CONFIRM" == 'YES' ]] || { echo 'Đã huỷ.'; exit 1; }

echo '==> Dừng api / web / worker'
"${COMPOSE[@]}" stop api web worker

echo '==> Khôi phục'
# `--clean --if-exists` xoá object cũ trước khi tạo lại, nên không cần drop cả database (drop
# sẽ mất luôn các extension btree_gist/pg_trgm/unaccent mà migration đã cài).
# `--single-transaction`: hỏng giữa chừng thì quay về nguyên trạng, không để lại nửa vời.
"${COMPOSE[@]}" exec -T db pg_restore \
  -U "$DB_USER" -d "$DB_NAME" \
  --clean --if-exists --no-owner --single-transaction < "$DUMP"

echo '==> Áp migration còn thiếu (dump có thể cũ hơn code)'
"${COMPOSE[@]}" run --rm migrate

echo '==> Khởi động lại'
"${COMPOSE[@]}" up -d api web worker
"${COMPOSE[@]}" ps
