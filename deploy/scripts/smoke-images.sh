#!/usr/bin/env bash
# Chạy thử BỐN image của một bản phát hành bằng CHÍNH docker-compose.prod.yml, trên một PostgreSQL
# thật, trong một project compose riêng (`xp-smoke-<pid>`) bị xoá sạch khi xong — không đụng stack
# nào đang chạy. KHÔNG chạy trên VPS: không cần, và nó dùng chung daemon với staging/production.
#
#   ./deploy/scripts/smoke-images.sh <tag gốc>        # vd xeprime-app:local
#
# Máy dev Windows (Git Bash): `docker.exe` không thấy `/tmp` của Git Bash và đường dẫn bị đổi
# ngầm — chạy kèm `TMPDIR=C:/Users/<bạn>/AppData/Local/Temp MSYS_NO_PATHCONV=1`.
#
# Vì sao cần: image `web` (Next standalone) và `api`/`worker` (cây production đã gỡ Prisma CLI) là
# cây phụ thuộc ĐÃ CẮT. Một file thiếu (Prisma Client, JSON i18n, asset tĩnh) không làm build đỏ —
# nó chỉ lộ ra lúc container khởi động. Chạy qua compose thật thì `working_dir`, `command`, env và
# healthcheck của từng service cũng được kiểm cùng lúc với image. CI gọi script này trước khi cho
# deploy (.github/workflows/ci.yml); máy dev gọi sau `docker buildx bake`.
#
# Đi đúng đường của `deploy.sh`: migrate → seed `system` → api/web/worker báo healthy, rồi tải một
# asset tĩnh của Next và một file `public/`. Env là bộ TỐI THIỂU để boot với NODE_ENV=production +
# APP_ENV=staging (cùng luật kiểm env của staging thật) — giá trị đều là đồ giả, không có bí mật.
set -euo pipefail

cd "$(dirname "$0")/../.."

IMAGE="${1:?Cần tag gốc của bản phát hành, ví dụ: xeprime-app:local}"
PROJECT="xp-smoke-$$"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

ENV_FILE="$(mktemp)"
export XP_IMAGE="$IMAGE" XP_ENV_FILE="$ENV_FILE"
COMPOSE=(docker compose -p "$PROJECT" -f docker-compose.prod.yml --profile tools --env-file "$ENV_FILE")

fail() {
  printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2
  # Log là thứ duy nhất nói được VÌ SAO — in ra trước khi trap xoá project.
  "${COMPOSE[@]}" ps -a >&2 || true
  "${COMPOSE[@]}" logs --tail 80 api web worker >&2 || true
  exit 1
}
cleanup() {
  "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -f "$ENV_FILE"
}
trap cleanup EXIT

# Khối đầu: biến compose NỘI SUY (db, caddy — caddy không được bật nhưng `:?` vẫn đòi giá trị).
# Khối sau: biến api/worker nạp qua `env_file`.
cat > "$ENV_FILE" <<'EOF'
POSTGRES_USER=xeprime
POSTGRES_PASSWORD=smoke
POSTGRES_DB=xeprime
WEB_DOMAIN=smoke.invalid
PARTNER_DOMAIN=partner.smoke.invalid
ADMIN_DOMAIN=admin.smoke.invalid
API_DOMAIN=api.smoke.invalid
ACME_EMAIL=smoke@smoke.invalid
APP_ENV=staging

DATABASE_URL=postgresql://xeprime:smoke@db:5432/xeprime
SESSION_JWT_SECRET=smoke-session-secret-0123456789abcdef
SESSION_COOKIE_SECURE=true
OTP_PEPPER=smoke-otp-pepper-0123456789
REALM_PROXY_SECRET=smoke-realm-proxy-secret-0123456789abcdef
APP_WEB_URL=https://smoke.invalid
WEB_PARTNER_URL=https://partner.smoke.invalid
WEB_ADMIN_URL=https://admin.smoke.invalid
API_PUBLIC_URL=https://api.smoke.invalid
CORS_ORIGINS=https://smoke.invalid
INSURANCE_PARTNER=none
EOF

log "Image: $IMAGE-{tools,api,web,worker} · project $PROJECT"
for role in tools api web worker; do
  docker image inspect "$IMAGE-$role" >/dev/null 2>&1 || fail "Không có image $IMAGE-$role"
done

log 'PostgreSQL'
"${COMPOSE[@]}" up -d --wait --wait-timeout 120 db || fail 'db không lên'

log 'migrate (image tools)'
"${COMPOSE[@]}" run --rm migrate || fail 'migrate thất bại'

# Cùng lệnh với docs/deployment.md §3.5 — seed chạy bằng tsx từ mã nguồn, nên đây là chỗ bắt
# được một file seed hay một `extends` tsconfig bị bỏ sót khỏi image.
log 'seed system (image tools)'
"${COMPOSE[@]}" run --rm -e SEED_MODE=system -e PLATFORM_ADMIN_PASSWORD='Smoke-Admin-Passw0rd!' \
  migrate node_modules/.bin/tsx ./src/seed.ts || fail 'seed system thất bại'

# `--wait` chờ healthcheck khai trong compose (api `/health` ping DB, worker `/health`, web `/`).
log 'api · web · worker'
"${COMPOSE[@]}" up -d --no-deps --wait --wait-timeout 180 api web worker \
  || fail 'api/web/worker không báo healthy'

# Trang lên mà không có `.next/static` là trang trắng không CSS/JS; không có `public/` là mất logo.
# Hai thư mục đó Next KHÔNG tự chép vào standalone — kiểm thẳng.
log 'asset tĩnh của web'
web_get() { "${COMPOSE[@]}" exec -T web curl -fsS "$@"; }
ASSET="$(web_get http://127.0.0.1:3000/ | grep -oE '/_next/static/[^"]+\.(js|css)' | head -1 || true)"
[[ -n "$ASSET" ]] || fail 'Trang chủ không tham chiếu asset /_next/static nào'
web_get -o /dev/null "http://127.0.0.1:3000$ASSET" \
  || fail "Không tải được $ASSET — thiếu .next/static trong image web"
web_get -o /dev/null http://127.0.0.1:3000/brands/bmw.webp \
  || fail 'Không tải được /brands/bmw.webp — thiếu public/ trong image web'

log 'Bốn image chạy được.'
