# Định nghĩa build DUY NHẤT của XePrime — CI, deploy và build tại chỗ trên VPS đều đọc file này.
#
#   docker buildx bake -f deploy/docker-bake.hcl            # build 4 image, tag ${IMAGE}-<vai trò>
#   docker buildx bake -f deploy/docker-bake.hcl --push     # build + đẩy lên registry
#   docker buildx bake -f deploy/docker-bake.hcl web        # chỉ một image
#
# Mọi `variable` dưới đây đọc từ BIẾN MÔI TRƯỜNG cùng tên. Bốn image cùng một bản phát hành mang
# chung tag gốc và khác nhau ở hậu tố: `ghcr.io/<repo>:staging-a1b2c3d-web`, `…-api`, `…-worker`,
# `…-tools`. Rollback vẫn nhận tag gốc `staging-a1b2c3d` và tự ghép hậu tố.

# Tag gốc của bản phát hành. Mặc định là tên chỉ có ở máy đang build (không bao giờ đẩy đi).
variable "IMAGE" {
  default = "xeprime-app:local"
}

# Tag "trôi" (`ghcr.io/<repo>:staging`) — trỏ vào bản mới nhất. Rỗng = không gắn.
variable "MOVING" {
  default = ""
}

# `gha` = đọc/ghi cache BuildKit của GitHub Actions (chỉ CI đặt). Rỗng = cache local của máy build.
variable "CACHE" {
  default = ""
}

# `NEXT_PUBLIC_*` bị Next NHÚNG CỨNG vào bundle lúc build (đọc giải thích ở deploy/Dockerfile).
variable "NEXT_PUBLIC_API_URL" {
  default = "/api"
}
variable "NEXT_PUBLIC_XP_ZONE_MODE" {
  default = "host"
}
variable "NEXT_PUBLIC_WEB_MARKET_URL" {
  default = ""
}
variable "NEXT_PUBLIC_WEB_PARTNER_URL" {
  default = ""
}
variable "NEXT_PUBLIC_WEB_ADMIN_URL" {
  default = ""
}
variable "NEXT_PUBLIC_APP_NAME" {
  default = "XePrime"
}
variable "NEXT_PUBLIC_FIREBASE_API_KEY" {
  default = ""
}
variable "NEXT_PUBLIC_FIREBASE_PROJECT_ID" {
  default = ""
}
variable "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN" {
  default = ""
}
variable "NEXT_PUBLIC_FIREBASE_APP_ID" {
  default = ""
}
variable "SESSION_COOKIE_NAME" {
  default = "xp_session"
}

group "default" {
  targets = ["web", "api", "worker", "tools"]
}

# Một target cho mỗi vai trò, cùng context/Dockerfile/build-arg — BuildKit dựng stage `builder`
# MỘT lần rồi bốn image chỉ còn là bước chép đầu ra.
target "app" {
  name       = role
  matrix     = { role = ["web", "api", "worker", "tools"] }
  context    = "."
  dockerfile = "deploy/Dockerfile"
  target     = role
  tags       = compact(["${IMAGE}-${role}", notequal(MOVING, "") ? "${MOVING}-${role}" : ""])
  labels = {
    "org.opencontainers.image.source" = "https://github.com/daihanhbvt/xeprime"
  }
  # Cả bốn image đọc chung MỘT scope, và chỉ `web` ghi: đồ thị của bất kỳ target nào cũng chứa
  # trọn stage `builder` (phần tốn 15 phút), còn stage cuối chỉ là bước chép. Bốn target cùng ghi
  # một scope thì ghi đè lẫn nhau theo thứ tự xong trước.
  cache-from = equal(CACHE, "gha") ? ["type=gha,scope=xeprime"] : []
  cache-to   = equal(CACHE, "gha") && equal(role, "web") ? ["type=gha,scope=xeprime,mode=max"] : []
  args = {
    NEXT_PUBLIC_API_URL              = NEXT_PUBLIC_API_URL
    NEXT_PUBLIC_XP_ZONE_MODE         = NEXT_PUBLIC_XP_ZONE_MODE
    NEXT_PUBLIC_WEB_MARKET_URL       = NEXT_PUBLIC_WEB_MARKET_URL
    NEXT_PUBLIC_WEB_PARTNER_URL      = NEXT_PUBLIC_WEB_PARTNER_URL
    NEXT_PUBLIC_WEB_ADMIN_URL        = NEXT_PUBLIC_WEB_ADMIN_URL
    NEXT_PUBLIC_APP_NAME             = NEXT_PUBLIC_APP_NAME
    NEXT_PUBLIC_FIREBASE_API_KEY     = NEXT_PUBLIC_FIREBASE_API_KEY
    NEXT_PUBLIC_FIREBASE_PROJECT_ID  = NEXT_PUBLIC_FIREBASE_PROJECT_ID
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
    NEXT_PUBLIC_FIREBASE_APP_ID      = NEXT_PUBLIC_FIREBASE_APP_ID
    SESSION_COOKIE_NAME              = SESSION_COOKIE_NAME
  }
}
