#!/usr/bin/env bash
# Sinh `.env.prodtemp` cho PRODUCTION TẠM — chạy MỘT lần trên máy staging, từ GỐC REPO:
#
#   ./deploy/prodtemp/make-env.sh
#
# Lấy `.env.staging` làm nền (cùng tài khoản eSMS, SMTP, R2, Firebase, Vietmap, OAuth — quyết định
# 29/10/2026, runbook Phụ lục A.1) rồi THAY những gì production tạm phải khác:
#   • tên miền + mọi URL suy từ nó → xeprime.vn
#   • APP_ENV=production: SMS thật, không mã OTP test, đủ cổng kiểm env của production
#   • database RIÊNG và bộ secret RIÊNG (sinh ngẫu nhiên ngay tại đây)
#   • SePay BỎ TRỐNG: tạo tài khoản SePay mới gắn tài khoản ngân hàng KHÁC staging, rồi thêm bốn
#     dòng SEPAY_* bằng tay (Phụ lục A). Khoá SePay của staging không bao giờ được chép sang.
#   • MoMo/VNPAY TẮT: khoá sandbox của staging không có chỗ ở production
#   • xoá dấu vết "STG" mà người dùng nhìn thấy: tên app, tên người gửi email, tên cookie phiên
#   • đủ HAI scheme đăng nhập mạng xã hội của app native (khách + Partner)
#
# Secret sinh ra và nằm trên VPS — không đi qua máy ai, không in ra màn hình.
#
# KHÁC staging/production: file này KHÔNG do GitHub Actions sinh lại mỗi lần deploy. Sửa giá trị
# thì sửa tay trên VPS (chmod 600 giữ nguyên). Đã có file thì script từ chối chạy — sinh lại là đổi
# mật khẩu database trong khi volume vẫn mang mật khẩu cũ, và mọi phiên đăng nhập bị vô hiệu.
set -euo pipefail

cd "$(dirname "$0")/../.."

SRC=.env.staging
OUT=.env.prodtemp
DOMAIN="${PRODTEMP_DOMAIN:-xeprime.vn}"
# Địa chỉ gửi phải thuộc tên miền ĐÃ XÁC MINH ở nhà cung cấp SMTP (Resend: hiện mới có
# `stg.xeprime.vn`). Đổi sang `@xeprime.vn` sau khi xác minh tên miền gốc ở Resend.
SMTP_FROM_ADDR="${PRODTEMP_SMTP_FROM_ADDR:-no-reply@stg.xeprime.vn}"

fail() { printf '✗ %s\n' "$*" >&2; exit 1; }

[[ -f "$SRC" ]] || fail "$SRC chưa có — production tạm lấy cấu hình dịch vụ ngoài từ staging."
[[ ! -e "$OUT" ]] || fail "$OUT đã có. Sửa tay nếu cần đổi giá trị; xoá rồi chạy lại = mất khả năng đăng nhập vào database đang chạy."
command -v openssl >/dev/null || fail 'Thiếu openssl.'

secret() { openssl rand -hex 32; }

# Khoá KHÔNG chép từ staging: hoặc được thay bên dưới, hoặc cố ý bỏ trống.
DROP='^(WEB_DOMAIN|PARTNER_DOMAIN|ADMIN_DOMAIN|API_DOMAIN|ACME_EMAIL|APP_ENV|CORS_ORIGINS|API_PUBLIC_URL|APP_WEB_URL|WEB_PARTNER_URL|WEB_ADMIN_URL|NEXT_PUBLIC_WEB_MARKET_URL|NEXT_PUBLIC_WEB_PARTNER_URL|NEXT_PUBLIC_WEB_ADMIN_URL|POSTGRES_USER|POSTGRES_PASSWORD|POSTGRES_DB|DATABASE_URL|SESSION_JWT_SECRET|REALM_PROXY_SECRET|OTP_PEPPER|OTP_MODE|OTP_BYPASS_CODE|INSURANCE_PARTNER|NEXT_PUBLIC_APP_NAME|SMTP_FROM|SESSION_COOKIE_NAME|MOBILE_AUTH_REDIRECT_URIS|SEPAY_[A-Z_]+|MOMO_[A-Z_]+|VNPAY_[A-Z_]+|PAYMENT_GATEWAY_[A-Z_]+|XP_[A-Z_]+)$'

PG_PASS="$(secret)"

umask 077
TMP="$OUT.tmp"
trap 'rm -f "$TMP"' EXIT

{
  printf '# PRODUCTION TẠM — sinh bởi deploy/prodtemp/make-env.sh ngày %s.\n' "$(date +%d/%m/%Y)"
  printf '# KHÔNG do GitHub Actions sinh lại: sửa tay ở đây. Phần đầu chép từ %s.\n\n' "$SRC"

  # Lọc theo KHOÁ, không theo dòng: giá trị trong nháy đơn có thể trải nhiều dòng
  # (FIREBASE_PRIVATE_KEY), và các dòng nối tiếp phải đi theo quyết định của khoá đứng đầu.
  awk -v drop="$DROP" '
    !inval {
      if (match($0, /^[A-Z0-9_]+=/)) {
        key = substr($0, 1, RLENGTH - 1)
        keep = (key !~ drop)
        rest = substr($0, RLENGTH + 1)
        if (substr(rest, 1, 1) == "\047" && (length(rest) == 1 || substr(rest, length(rest), 1) != "\047")) inval = 1
      } else {
        keep = 0
      }
      if (keep) print
      next
    }
    {
      if (keep) print
      if (substr($0, length($0), 1) == "\047") inval = 0
    }
  ' "$SRC"

  cat <<EOF

# --- Riêng của production tạm ---------------------------------------------------
# Compose + tên service riêng — backup-db.sh / restore-db.sh đọc hai biến này.
XP_COMPOSE_FILE='deploy/prodtemp/docker-compose.yml'
XP_APP_SERVICES='prod-api prod-web worker'

WEB_DOMAIN='$DOMAIN'
PARTNER_DOMAIN='partner.$DOMAIN'
ADMIN_DOMAIN='admin.$DOMAIN'
API_DOMAIN='api.$DOMAIN'
APP_ENV='production'
CORS_ORIGINS='https://$DOMAIN,https://partner.$DOMAIN,https://admin.$DOMAIN'
API_PUBLIC_URL='https://api.$DOMAIN'
APP_WEB_URL='https://$DOMAIN'
WEB_PARTNER_URL='https://partner.$DOMAIN'
WEB_ADMIN_URL='https://admin.$DOMAIN'
NEXT_PUBLIC_WEB_MARKET_URL='https://$DOMAIN'
NEXT_PUBLIC_WEB_PARTNER_URL='https://partner.$DOMAIN'
NEXT_PUBLIC_WEB_ADMIN_URL='https://admin.$DOMAIN'

# Database RIÊNG — host \`db\` là service db của project xeprime-prodtemp.
POSTGRES_USER='xeprime'
POSTGRES_DB='xeprime'
POSTGRES_PASSWORD='$PG_PASS'
DATABASE_URL='postgresql://xeprime:$PG_PASS@db:5432/xeprime'

SESSION_JWT_SECRET='$(secret)'
REALM_PROXY_SECRET='$(secret)'
OTP_PEPPER='$(secret)'

OTP_MODE='esms'
INSURANCE_PARTNER='none'

# Thứ người dùng nhìn thấy — không mang chữ STG của nguồn.
NEXT_PUBLIC_APP_NAME='XePrime'
SMTP_FROM='XePrime <$SMTP_FROM_ADDR>'
SESSION_COOKIE_NAME='xp_session'
# Hai app native: XePrime (khách) và XePrime Partner — thiếu một scheme là đăng nhập
# Google/Facebook của app đó dừng ở trang web với SOCIAL_STATE_INVALID.
MOBILE_AUTH_REDIRECT_URIS='xeprime://auth/callback,xeprimepartner://auth/callback'
PAYMENT_GATEWAY_SUBSCRIPTION='off'
PAYMENT_GATEWAY_BOOKING_HOLD='off'

# SePay: thêm bốn dòng dưới (bỏ dấu #) sau khi tạo tài khoản SePay MỚI cho production tạm,
# webhook https://api.$DOMAIN/sepay/webhook — rồi chạy lại deploy để API nạp giá trị mới.
# SEPAY_API_KEY=''
# SEPAY_BANK_CODE=''
# SEPAY_ACCOUNT_NUMBER=''
# SEPAY_ACCOUNT_NAME=''
EOF
} > "$TMP"

# Kiểm cú pháp bằng đúng hai parser sẽ đọc nó: bash (backup-db.sh `source`) và compose.
( set -a; . "./$TMP" ) >/dev/null 2>&1 || fail 'File sinh ra không source được bằng bash — kiểm .env.staging.'

mv "$TMP" "$OUT"
chmod 600 "$OUT"
trap - EXIT

printf '✓ Đã tạo %s (%s khoá). Chưa có SePay — xem cuối file.\n' "$OUT" "$(grep -cE '^[A-Z0-9_]+=' "$OUT")"
