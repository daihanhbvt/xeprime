#!/usr/bin/env bash
# Triển khai XePrime lên VPS. Chạy từ GỐC REPO trên máy chủ, bằng user thường (trong nhóm docker).
#
#   ./deploy/scripts/deploy.sh                     # production (mặc định) — BUILD tại chỗ
#   ./deploy/scripts/deploy.sh --env staging       # staging — BUILD tại chỗ
#   ./deploy/scripts/deploy.sh --env staging --no-pull --image ghcr.io/…/xeprime:staging-<sha>
#
# `--image <ref>` đổi nguồn image từ "build tại chỗ" sang "pull từ registry". GitHub Actions đi
# đường này (.github/workflows/deploy.yml): build trên runner rồi VPS chỉ pull, nên `next build`
# không còn ăn 3,5GB RAM và 15 phút CPU của chính máy đang phục vụ người dùng. Không truyền
# --image thì đường build tại chỗ không bị đụng tới.
#
# `--env <tên>` chọn ĐỒNG THỜI ba thứ, và chúng phải khớp nhau nếu không stack sẽ tách đôi
# trong im lặng (volume mới, database rỗng, không ai báo lỗi):
#   • file cấu hình   `.env.<tên>`
#   • tên project     `xeprime-<tên>`  (quyết định tên volume và tên container)
#   • biến XP_ENV_FILE mà docker-compose.prod.yml dùng cho `env_file:`
#
# Thứ tự các bước KHÔNG được đổi:
#   sao lưu → build HOẶC pull → migrate → khởi động lại app
# Migrate chạy TRƯỚC khi container app mới lên: một migration thêm cột mà code cũ chưa biết thì
# vô hại, còn code mới đọc một cột chưa tồn tại thì gãy ngay từ request đầu tiên.
set -euo pipefail

cd "$(dirname "$0")/../.."

XP_ENV=production
PULL=1
XP_IMAGE=''

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      XP_ENV="${2:-}"
      [[ -n "$XP_ENV" ]] || { echo '--env cần một tên môi trường, ví dụ: --env staging' >&2; exit 1; }
      shift 2
      ;;
    --no-pull) PULL=0; shift ;;
    --image)
      XP_IMAGE="${2:-}"
      [[ -n "$XP_IMAGE" ]] || { echo '--image cần một tham chiếu image, ví dụ: --image ghcr.io/owner/xeprime:staging-abc123' >&2; exit 1; }
      shift 2
      ;;
    *) echo "Tham số không hiểu: $1" >&2; exit 1 ;;
  esac
done

ENV_FILE=".env.$XP_ENV"
# `env_file:` trong compose đọc biến này. Export chứ không truyền qua --env-file: --env-file chỉ
# phục vụ NỘI SUY `${...}` trong file compose, nó không quyết định file nào được nạp vào container.
export XP_ENV_FILE="$ENV_FILE"
# `docker-compose.prod.yml` nội suy biến này qua neo `x-app-image` cho cả bốn service dùng chung
# image (migrate/api/web/worker). Rỗng ⇒ compose rơi về `xeprime-app:latest` dựng tại chỗ.
export XP_IMAGE

# `--profile tools` khai TƯỜNG MINH: service `migrate` nằm sau `profiles: ['tools']`. Compose
# đời mới tự bật profile khi bạn gọi đích danh service, nhưng đó là hành vi phụ thuộc phiên
# bản — và phiên bản ở đây là thứ cài trên VPS, không phải thứ bạn test trên máy mình.
COMPOSE=(docker compose -p "xeprime-$XP_ENV" -f docker-compose.prod.yml --profile tools --env-file "$ENV_FILE")

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[[ -f "$ENV_FILE" ]] || fail "$ENV_FILE chưa có. Chép từ deploy/env.production.example."

# 600 nghĩa là chỉ chủ file đọc được. File này chứa mật khẩu DB, secret phiên, khoá SMTP/eSMS.
chmod 600 "$ENV_FILE"

log "Môi trường: $XP_ENV  (project xeprime-$XP_ENV · $ENV_FILE)"
log "Nguồn image: ${XP_IMAGE:-build tại chỗ (xeprime-app:latest)}"

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

# --- Lấy image --------------------------------------------------------------
if [[ -n "$XP_IMAGE" ]]; then
  # Pull TRƯỚC khi migrate chạy. `migrate` dùng chung image với api/web/worker, nên tag sai (gõ
  # nhầm sha, image chưa đẩy xong) sẽ hỏng Ở ĐÂY — trước khi có gì chạm vào database. Phát hiện
  # muộn hơn nghĩa là đã migrate xong rồi mới biết không có gì để chạy.
  log "Pull image: $XP_IMAGE"
  "${COMPOSE[@]}" pull migrate api web worker \
    || fail "Không pull được $XP_IMAGE — kiểm tra tag có tồn tại và đã đăng nhập ghcr.io chưa."
else
  # Chỉ service `api` khai `build`, nhưng image sinh ra dùng chung cho cả web/worker/migrate
  # (xem docker-compose.prod.yml).
  log 'Build image (10–20 phút cho lần đầu, sau đó nhanh hơn nhiều nhờ cache)'
  "${COMPOSE[@]}" build api
fi

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

# --- Dọn image cũ -----------------------------------------------------------
# `docker image prune -f` CHỈ xoá layer mồ côi (dangling). Khi còn build tại chỗ thì mỗi lần
# build ghi đè `xeprime-app:latest` và bỏ lại đúng một image mồ côi — prune dọn được.
#
# Nhưng khi PULL từ GHCR thì mỗi lần deploy để lại một image CÓ TAG ĐẦY ĐỦ (~2GB), và prune
# không bao giờ chạm tới nó. Đĩa 50GB đầy sau khoảng 15 lần deploy. Thứ hỏng ĐẦU TIÊN không
# phải app mà là `backup-db.sh`: nó từ chối chạy khi còn dưới 2GB — tức là mất sao lưu
# TRƯỚC khi mất dịch vụ, và đó là thứ tự tệ nhất có thể.
log 'Dọn image cũ'
if [[ -n "$XP_IMAGE" ]]; then
  # `docker images` liệt kê mới nhất trước. Giữ 3 tag gần nhất để một lần rollback vẫn còn
  # image sẵn ở local (khỏi tải lại ~2GB), và không bao giờ đụng tag đang chạy.
  docker images --filter "reference=${XP_IMAGE%:*}" --format '{{.Repository}}:{{.Tag}}' \
    | grep -v ':<none>$' | tail -n +4 | { grep -vxF "$XP_IMAGE" || true; } \
    | xargs -r docker rmi >/dev/null 2>&1 || true
fi
docker image prune -f >/dev/null

# `if` chứ không phải `grep ... && fail`: dưới `set -e`, một grep KHÔNG khớp (tức là mọi thứ
# đều khoẻ) trả exit 1 và làm script chết ngay ở dòng cuối của một lần deploy thành công.
if "${COMPOSE[@]}" ps --format '{{.Service}} {{.Health}}' | grep -qE 'unhealthy'; then
  fail "Có service unhealthy. Xem: docker compose -p xeprime-$XP_ENV -f docker-compose.prod.yml logs --tail 100"
fi

log 'Xong.'
