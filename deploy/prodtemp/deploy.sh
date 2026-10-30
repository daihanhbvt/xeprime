#!/usr/bin/env bash
# Deploy PRODUCTION TẠM lên máy staging. Chạy từ GỐC REPO (/opt/xeprime), bằng user `xeprime`:
#
#   ./deploy/prodtemp/deploy.sh --image ghcr.io/daihanhbvt/xeprime:prodtemp-<sha>
#
# Đường thường: push nhánh `prodtemp` → .github/workflows/deploy-prodtemp.yml build, chạy thử rồi
# SSH vào đây gọi đúng lệnh trên. Chạy tay cũng được (rollback: truyền tag của lần trước).
#
# Thứ tự giống deploy/scripts/deploy.sh và vì cùng lý do — sao lưu → pull → migrate → app — cộng
# thêm bước cuối riêng của bản tạm: cài khối site vào Caddy của STAGING.
#
# File compose/script đọc từ checkout CỦA STAGING (/opt/xeprime); code chạy nằm trong IMAGE.
# Vì vậy nhánh `prodtemp` luôn đi SAU `staging` (merge staging → prodtemp), không bao giờ trước.
set -euo pipefail

cd "$(dirname "$0")/../.."

XP_ENV=prodtemp
XP_IMAGE=''
KEEP_RELEASES=3

while [[ $# -gt 0 ]]; do
  case "$1" in
    --image)
      XP_IMAGE="${2:-}"
      shift 2
      ;;
    *) echo "Tham số không hiểu: $1" >&2; exit 1 ;;
  esac
done

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[[ -n "$XP_IMAGE" ]] || fail '--image <tag gốc> là bắt buộc, ví dụ ghcr.io/daihanhbvt/xeprime:prodtemp-a1b2c3d'
# Image mang URL của ba site NHÚNG CỨNG (deployment.md §9.3): tag `staging-*` ở đây là mọi link
# khác site dẫn sang staging.
[[ "${XP_IMAGE##*:}" == prodtemp-* ]] || fail "Chỉ nhận tag prodtemp-*, nhận được: $XP_IMAGE"

ENV_FILE=".env.$XP_ENV"
[[ -f "$ENV_FILE" ]] || fail "$ENV_FILE chưa có. Chạy một lần: ./deploy/prodtemp/make-env.sh"
chmod 600 "$ENV_FILE"

export XP_IMAGE XP_ENV_FILE="$ENV_FILE"
COMPOSE=(docker compose -p "xeprime-$XP_ENV" --project-directory . -f deploy/prodtemp/docker-compose.yml
  --profile tools --env-file "$ENV_FILE")

# Caddy của staging là cửa vào duy nhất của bản tạm. Tìm theo nhãn compose, không theo tên đoán.
CADDY="$(docker ps -q --filter label=com.docker.compose.project=xeprime-staging \
  --filter label=com.docker.compose.service=caddy)"
[[ -n "$CADDY" ]] || fail 'Caddy của staging không chạy — bản tạm không có đường vào.'

log "Production tạm · image $XP_IMAGE"

# --- Sao lưu trước khi đụng vào gì ------------------------------------------
if [[ -n "$("${COMPOSE[@]}" ps -q db 2>/dev/null || true)" ]]; then
  log 'Sao lưu database (trước khi migrate)'
  ./deploy/scripts/backup-db.sh --env "$XP_ENV" \
    || fail 'Sao lưu thất bại — DỪNG. Không migrate khi chưa có bản lùi.'
fi

# --- Image (GHCR public — không cần đăng nhập) -------------------------------
log 'Pull image'
"${COMPOSE[@]}" pull migrate prod-api prod-web worker \
  || fail "Không pull được $XP_IMAGE-* — kiểm tra tag có tồn tại."

# --- Database ---------------------------------------------------------------
log 'PostgreSQL'
"${COMPOSE[@]}" up -d --wait --wait-timeout 120 db || fail 'db không lên.'

log 'Áp migration'
"${COMPOSE[@]}" run --rm migrate

# --- App --------------------------------------------------------------------
# `--wait` chờ đúng healthcheck của compose; worker không healthy = deploy đỏ (lý do ở
# deploy/scripts/deploy.sh, mục kiểm tra).
log 'Khởi động prod-api · prod-web · worker'
"${COMPOSE[@]}" up -d --remove-orphans --wait --wait-timeout 180 prod-api prod-web worker \
  || fail "App chưa healthy. Xem: docker compose -p xeprime-$XP_ENV logs --tail 100"

# --- Caddy ------------------------------------------------------------------
# Điền mẫu, VALIDATE trên chính Caddy đang chạy rồi mới reload. Validate đỏ thì trả file cũ về:
# một khối hỏng nằm lại trong `deploy/sites/` là lần Caddy khởi động lại kế tiếp sập MỌI site —
# staging và softrent.vn cùng đi (deployment.md §10 luật 2).
log 'Cài khối site vào Caddy của staging'
SITE=deploy/sites/xeprime-prodtemp.caddy
(
  set -a
  # shellcheck disable=SC1090
  . "./$ENV_FILE"
  set +a
  umask 077
  sed -e "s|__WEB_DOMAIN__|$WEB_DOMAIN|g" \
      -e "s|__PARTNER_DOMAIN__|$PARTNER_DOMAIN|g" \
      -e "s|__ADMIN_DOMAIN__|$ADMIN_DOMAIN|g" \
      -e "s|__API_DOMAIN__|$API_DOMAIN|g" \
      -e "s|__REALM_PROXY_SECRET__|$REALM_PROXY_SECRET|g" \
      deploy/prodtemp/xeprime-prodtemp.caddy.tmpl > "$SITE.new"
)
[[ -f "$SITE" ]] && cp -p "$SITE" "$SITE.prev"
mv "$SITE.new" "$SITE"
chmod 600 "$SITE"

if ! VALIDATE_OUT="$(docker exec "$CADDY" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1)"; then
  if [[ -f "$SITE.prev" ]]; then mv "$SITE.prev" "$SITE"; else rm -f "$SITE"; fi
  tail -20 <<<"$VALIDATE_OUT" >&2
  fail 'caddy validate đỏ — đã trả khối site về bản trước, Caddy KHÔNG reload.'
fi
docker exec "$CADDY" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
rm -f "$SITE.prev"

# --- Dọn image cũ -----------------------------------------------------------
log "Dọn image cũ (giữ $KEEP_RELEASES bản phát hành gần nhất của $XP_ENV)"
./deploy/scripts/prune-releases.sh "$XP_ENV" "$XP_IMAGE" "$KEEP_RELEASES"

"${COMPOSE[@]}" ps
log 'Xong.'
