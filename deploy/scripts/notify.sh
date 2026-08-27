#!/usr/bin/env bash
# Gửi một dòng cảnh báo qua Telegram. Chạy từ GỐC REPO trên VPS.
#
#   ./deploy/scripts/notify.sh --env production "Backup thất bại: hết chỗ trên đĩa"
#   echo "nội dung dài" | ./deploy/scripts/notify.sh --env production
#
# Dùng `curl` — đã có sẵn từ `vps-bootstrap.sh`, nên không thêm service hay package nào chỉ để
# gửi được một dòng chữ.
#
# Script này KHÔNG BAO GIỜ trả mã khác 0. Nó nằm trên đường xử lý lỗi của backup-db.sh: một
# `notify.sh` thất bại (mất mạng, Telegram sập) mà làm chết luôn tiến trình gọi nó thì sự cố
# thật bị che sau một sự cố phụ, và `trap ... ERR` có thể gọi lại chính nó thành vòng lặp.
#
# Chưa khai TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID thì im lặng bỏ qua — máy staging không cần
# cảnh báo, và bắt nó phải có token là cách người ta chép token production sang máy test.
set -uo pipefail

cd "$(dirname "$0")/../.."

XP_ENV=production
MSG=''

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      XP_ENV="${2:-}"
      [[ -n "$XP_ENV" ]] || { echo 'notify: --env cần một tên môi trường.' >&2; exit 0; }
      shift 2
      ;;
    *) MSG="${MSG}${MSG:+ }$1"; shift ;;
  esac
done

# Không có tham số ⇒ đọc stdin. Cho phép `... 2>&1 | notify.sh --env production`.
if [[ -z "$MSG" ]] && [[ ! -t 0 ]]; then
  MSG="$(cat || true)"
fi
[[ -n "$MSG" ]] || exit 0

ENV_FILE=".env.$XP_ENV"
if [[ -f "$ENV_FILE" ]]; then
  # `set -a` chỉ bật quanh đúng lệnh source: file env chứa mật khẩu DB và secret phiên, không
  # có lý do gì để chúng thành biến môi trường của những tiến trình con sau đó.
  set -a; . "./$ENV_FILE"; set +a
fi

TOKEN="${TELEGRAM_BOT_TOKEN:-}"
CHAT="${TELEGRAM_CHAT_ID:-}"
if [[ -z "$TOKEN" || -z "$CHAT" ]]; then
  echo 'notify: chưa khai TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID — bỏ qua.' >&2
  exit 0
fi

# Tiền tố nói RÕ máy nào và môi trường nào. Khi có hai VPS thì một tin nhắn không nói được nó
# đến từ đâu là một tin nhắn phải đi tra cứu mới dùng được.
HEADER="XePrime [$XP_ENV @ $(hostname -s 2>/dev/null || echo '?')]"

# `--data-urlencode` chứ không nhét thẳng vào URL: nội dung cảnh báo là log lỗi, và log lỗi có
# dấu &, =, xuống dòng. Nối chuỗi tay ở đây là cách cắt cụt đúng phần thông tin cần đọc nhất.
#
# 4096 là trần một tin nhắn của Telegram; cắt ở 3500 để còn chỗ cho header và ký tự escape.
curl -fsS --max-time 20 --retry 2 --retry-delay 3 -o /dev/null \
  "https://api.telegram.org/bot${TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${CHAT}" \
  --data-urlencode "disable_web_page_preview=true" \
  --data-urlencode "text=${HEADER}
${MSG:0:3500}" \
  || echo 'notify: gửi Telegram thất bại (mạng hoặc token sai) — bỏ qua.' >&2

exit 0
