#!/usr/bin/env bash
# Triển khai XePrime lên VPS. Chạy từ GỐC REPO trên máy chủ, bằng user thường (trong nhóm docker).
#
#   ./deploy/scripts/deploy.sh                     # production (mặc định) — BUILD tại chỗ
#   ./deploy/scripts/deploy.sh --env staging       # staging — BUILD tại chỗ
#   ./deploy/scripts/deploy.sh --env staging --no-pull --image ghcr.io/…/xeprime:staging-<sha>
#
# Một bản phát hành là BỐN image cùng tag gốc (`…:staging-<sha>-web` · `-api` · `-worker` ·
# `-tools` — deploy/Dockerfile); `--image` nhận tag GỐC, không kèm hậu tố.
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
# Số bản phát hành giữ lại trên máy để rollback không phải tải lại (bản đang chạy tính là một).
KEEP_RELEASES=3

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
# `docker-compose.prod.yml` ghép biến này với hậu tố vai trò cho bốn service (migrate → `-tools`,
# api/web/worker). Rỗng ⇒ compose rơi về `xeprime-app:local-*` dựng tại chỗ.
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
log "Nguồn image: ${XP_IMAGE:-build tại chỗ (xeprime-app:local)}"

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
  # Cùng định nghĩa build với CI (deploy/docker-bake.hcl). Các `NEXT_PUBLIC_*` mà bake cần nằm
  # trong file env — nạp nó trong một SUBSHELL để secret không rò sang các bước sau của script.
  log 'Build image (10–20 phút cho lần đầu, sau đó nhanh hơn nhiều nhờ cache)'
  (
    set -a
    # shellcheck disable=SC1090
    . "./$ENV_FILE"
    set +a
    IMAGE=xeprime-app:local MOVING='' docker buildx bake -f deploy/docker-bake.hcl --load
  ) || fail 'Build image thất bại.'
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
#
# Ba service PHẢI báo `healthy`, không phải "không unhealthy".
#
# Khác biệt đó là một lỗi có thật: trước 11/09/2026 `worker` không khai `healthcheck` nào, nên cột
# Health của nó RỖNG — vòng chờ dưới đây không bao giờ đợi nó, và câu kiểm `unhealthy` ở cuối
# không bao giờ bắt được nó. Một worker chết ngay lúc boot vẫn cho ra một lần deploy "thành công",
# và hậu quả là hạn phản hồi yêu cầu thuê không chạy, chat không lên realtime, huy hiệu đứng im.
# Yêu cầu đích danh `healthy` làm cho việc một service MẤT healthcheck trở thành lỗi deploy, thay
# vì một khoảng mù im lặng.
REQUIRED_HEALTHY=(api web worker)

healthy_all() {
  local status service
  status="$("${COMPOSE[@]}" ps --format '{{.Service}} {{.Health}}' 2>/dev/null || true)"
  for service in "${REQUIRED_HEALTHY[@]}"; do
    grep -qE "^${service}[[:space:]]+healthy$" <<<"$status" || return 1
  done
  return 0
}

log 'Chờ health check (api, web, worker)'
for _ in $(seq 1 30); do
  if healthy_all; then break; fi
  sleep 5
done
"${COMPOSE[@]}" ps

if ! healthy_all; then
  fail "api/web/worker chưa báo healthy sau 150s. Xem: docker compose -p xeprime-$XP_ENV -f docker-compose.prod.yml logs --tail 100"
fi

# --- Dọn image cũ -----------------------------------------------------------
# `docker image prune -f` CHỈ xoá layer mồ côi (dangling). Khi còn build tại chỗ thì mỗi lần
# build ghi đè `xeprime-app:local-*` và bỏ lại image mồ côi — prune dọn được.
#
# Nhưng khi PULL từ GHCR thì mỗi lần deploy để lại bốn image CÓ TAG ĐẦY ĐỦ, và prune không bao
# giờ chạm tới chúng. Không dọn thì đĩa đầy dần, và thứ hỏng ĐẦU TIÊN không phải app mà là
# `backup-db.sh`: nó từ chối chạy khi còn dưới 2GB — tức là mất sao lưu TRƯỚC khi mất dịch vụ,
# và đó là thứ tự tệ nhất có thể.
log "Dọn image cũ (giữ $KEEP_RELEASES bản phát hành gần nhất của $XP_ENV)"
if [[ -n "$XP_IMAGE" ]]; then
  REPO="${XP_IMAGE%:*}"
  RELEASE="${XP_IMAGE##*:}"
  HISTORY=".deploy-releases.$XP_ENV"

  # Tag của bản phát hành mà không có hậu tố vai trò. Tag cũ (một image chung, trước 30/10/2026)
  # không có hậu tố nên giữ nguyên — nó vẫn được tính là một bản phát hành.
  release_of() { sed -E 's/-(web|api|worker|tools)$//'; }

  # Đếm THEO LỊCH SỬ DEPLOY, không theo ngày tạo image: một bản chỉ sửa api thì web/worker/tools
  # là đúng image cũ được gắn thêm tag mới, và "ngày tạo" của chúng là ngày của bản trước —
  # sắp theo đó là xoá nhầm bản vừa deploy. Lần đầu chưa có file thì mồi từ image đang có.
  if [[ ! -f "$HISTORY" ]]; then
    docker images --filter "reference=$REPO" --format '{{.Tag}}' \
      | grep -E "^${XP_ENV}-" | release_of | awk '!seen[$0]++' | head -n "$KEEP_RELEASES" \
      | tac > "$HISTORY" || true
  fi
  echo "$RELEASE" >> "$HISTORY"
  # N bản KHÁC NHAU gần nhất tính từ cuối: rollback về một bản cũ làm nó thành bản mới nhất.
  KEEP="$(tac "$HISTORY" | awk 'NF && !seen[$0]++' | head -n "$KEEP_RELEASES")"
  tac <<<"$KEEP" > "$HISTORY"

  # CHỈ tag của môi trường này (`<môi trường>-…`): hai môi trường ở chung một VPS dùng chung
  # repository image, và dọn theo repository là xoá bản rollback của môi trường kia.
  docker images --filter "reference=$REPO" --format '{{.Tag}}' \
    | grep -E "^${XP_ENV}-" \
    | while read -r tag; do
        grep -qxF "$(release_of <<<"$tag")" <<<"$KEEP" || echo "$REPO:$tag"
      done \
    | xargs -r docker rmi >/dev/null 2>&1 || true
else
  # Build tại chỗ để lại cache BuildKit (vài GB). Giữ một tuần cho lần build kế tiếp nhanh.
  docker builder prune -f --filter until=168h >/dev/null || true
fi
docker image prune -f >/dev/null

# `if` chứ không phải `grep ... && fail`: dưới `set -e`, một grep KHÔNG khớp (tức là mọi thứ
# đều khoẻ) trả exit 1 và làm script chết ngay ở dòng cuối của một lần deploy thành công.
if "${COMPOSE[@]}" ps --format '{{.Service}} {{.Health}}' | grep -qE 'unhealthy'; then
  fail "Có service unhealthy. Xem: docker compose -p xeprime-$XP_ENV -f docker-compose.prod.yml logs --tail 100"
fi

log 'Xong.'
