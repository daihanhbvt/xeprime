#!/usr/bin/env bash
# Triển khai XePrime lên VPS. Chạy từ GỐC REPO trên máy chủ, bằng user thường (trong nhóm docker).
#
#   ./deploy/scripts/deploy.sh                     # production (mặc định)
#   ./deploy/scripts/deploy.sh --env staging       # staging
#   ./deploy/scripts/deploy.sh --env staging --no-pull
#
# `--env <tên>` chọn ĐỒNG THỜI ba thứ, và chúng phải khớp nhau nếu không stack sẽ tách đôi
# trong im lặng (volume mới, database rỗng, không ai báo lỗi):
#   • file cấu hình   `.env.<tên>`
#   • tên project     `xeprime-<tên>`  (quyết định tên volume và tên container)
#   • biến XP_ENV_FILE mà docker-compose.prod.yml dùng cho `env_file:`
#
# Thứ tự các bước KHÔNG được đổi:
#   sao lưu → build → migrate → khởi động lại app
# Migrate chạy TRƯỚC khi container app mới lên: một migration thêm cột mà code cũ chưa biết thì
# vô hại, còn code mới đọc một cột chưa tồn tại thì gãy ngay từ request đầu tiên.
set -euo pipefail

cd "$(dirname "$0")/../.."

XP_ENV=production
PULL=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      XP_ENV="${2:-}"
      [[ -n "$XP_ENV" ]] || { echo '--env cần một tên môi trường, ví dụ: --env staging' >&2; exit 1; }
      shift 2
      ;;
    --no-pull) PULL=0; shift ;;
    *) echo "Tham số không hiểu: $1" >&2; exit 1 ;;
  esac
done

ENV_FILE=".env.$XP_ENV"
# `env_file:` trong compose đọc biến này. Export chứ không truyền qua --env-file: --env-file chỉ
# phục vụ NỘI SUY `${...}` trong file compose, nó không quyết định file nào được nạp vào container.
export XP_ENV_FILE="$ENV_FILE"

COMPOSE=(docker compose -p "xeprime-$XP_ENV" -f docker-compose.prod.yml --env-file "$ENV_FILE")

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[[ -f "$ENV_FILE" ]] || fail "$ENV_FILE chưa có. Chép từ deploy/env.production.example."

# 600 nghĩa là chỉ chủ file đọc được. File này chứa mật khẩu DB, secret phiên, khoá SMTP/eSMS.
chmod 600 "$ENV_FILE"

log "Môi trường: $XP_ENV  (project xeprime-$XP_ENV · $ENV_FILE)"

if [[ $PULL -eq 1 ]]; then
  log 'Kéo code mới'
  git pull --ff-only
fi

# --- Sao lưu trước khi đụng vào gì ------------------------------------------
# Chỉ sao lưu khi DB đang chạy: lần deploy ĐẦU TIÊN thì chưa có gì để mất.
if [[ -n "$("${COMPOSE[@]}" ps -q db 2>/dev/null || true)" ]]; then
  log 'Sao lưu database (trước khi migrate)'
  ./deploy/scripts/backup-db.sh --env "$XP_ENV" \
    || fail 'Sao lưu thất bại — DỪNG. Không migrate khi chưa có bản lùi.'
fi

# --- Build ------------------------------------------------------------------
# Chỉ service `api` khai `build`, nhưng tag `xeprime-app:latest` sinh ra dùng chung cho cả
# web/worker/migrate (xem docker-compose.prod.yml).
log 'Build image (10–20 phút cho lần đầu, sau đó nhanh hơn nhiều nhờ cache)'
"${COMPOSE[@]}" build api

# --- Database ---------------------------------------------------------------
log 'Khởi động PostgreSQL'
"${COMPOSE[@]}" up -d db

log 'Áp migration'
"${COMPOSE[@]}" run --rm migrate

# --- App --------------------------------------------------------------------
log 'Khởi động lại api / web / worker / caddy'
"${COMPOSE[@]}" up -d --remove-orphans api web worker caddy

# --- Kiểm tra ---------------------------------------------------------------
log 'Chờ health check'
for _ in $(seq 1 30); do
  status="$("${COMPOSE[@]}" ps --format '{{.Service}} {{.Health}}' 2>/dev/null || true)"
  if ! grep -qE '(starting|unhealthy)' <<<"$status"; then break; fi
  sleep 5
done
"${COMPOSE[@]}" ps

# Dọn image cũ — mỗi lần build để lại một lớp mồ côi ~2–3GB, và đĩa 50GB đầy trong khoảng
# mười lần deploy nếu không dọn.
log 'Dọn image mồ côi'
docker image prune -f >/dev/null

# `if` chứ không phải `grep ... && fail`: dưới `set -e`, một grep KHÔNG khớp (tức là mọi thứ
# đều khoẻ) trả exit 1 và làm script chết ngay ở dòng cuối của một lần deploy thành công.
if "${COMPOSE[@]}" ps --format '{{.Service}} {{.Health}}' | grep -qE 'unhealthy'; then
  fail "Có service unhealthy. Xem: docker compose -p xeprime-$XP_ENV -f docker-compose.prod.yml logs --tail 100"
fi

log 'Xong.'
