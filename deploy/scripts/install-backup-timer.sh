#!/usr/bin/env bash
# Cài systemd timer sao lưu hằng ngày. Chạy trên VPS bằng root, từ gốc repo:
#
#   sudo ./deploy/scripts/install-backup-timer.sh                  # production
#   sudo ./deploy/scripts/install-backup-timer.sh --env staging
#
# Vì sao systemd timer chứ không phải một dòng crontab — bốn thứ cron không cho sẵn:
#   • Persistent=true  — máy tắt qua giờ hẹn thì chạy bù. Cron im lặng bỏ qua.
#   • OnFailure=       — gọi thẳng unit cảnh báo. Cron phải tự viết trap trong script.
#   • RuntimeMaxSec=   — trần thời gian ở cấp hệ thống, phủ cả chỗ `timeout` không với tới.
#   • journalctl       — log có sẵn, có xoay vòng. Cron phải tự quản một file và tự logrotate.
#
# Script idempotent: chạy lại chỉ ghi đè unit rồi nạp lại.
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

UNIT_DIR=/etc/systemd/system
SRC=deploy/systemd

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || fail 'Phải chạy bằng root (sudo).'
[[ -f ".env.$XP_ENV" ]] || fail ".env.$XP_ENV chưa có — cài timer cho một môi trường chưa cấu hình là hẹn giờ cho một job chắc chắn đỏ."

# Unit trỏ tuyệt đối vào /opt/xeprime. Repo nằm chỗ khác thì timer chạy vào hư không, và triệu
# chứng là "job xanh nhưng không có file dump" — kiểu lỗi tốn nhiều thời gian nhất để lần ra.
[[ "$PWD" == /opt/xeprime ]] || fail "Repo đang ở $PWD nhưng unit trỏ vào /opt/xeprime. Di chuyển repo hoặc sửa deploy/systemd/*.service."

log 'Chép unit'
for f in xeprime-backup@.service xeprime-backup@.timer xeprime-backup-alert@.service; do
  [[ -f "$SRC/$f" ]] || fail "Thiếu $SRC/$f"
  install -o root -g root -m 0644 "$SRC/$f" "$UNIT_DIR/$f"
done

log 'daemon-reload'
systemctl daemon-reload

log "Bật timer cho môi trường: $XP_ENV"
systemctl enable --now "xeprime-backup@$XP_ENV.timer"

log 'Trạng thái'
systemctl list-timers "xeprime-backup@$XP_ENV.timer" --no-pager || true

cat <<'NEXT'

Chạy thử NGAY một lượt (không chờ tới 03:00) rồi đọc log:

  systemctl start xeprime-backup@production
  journalctl -u xeprime-backup@production -n 50 --no-pager

Một bản sao lưu chưa từng được khôi phục thử thì chưa phải bản sao lưu — xem
docs/backup-and-restore.md để diễn tập một lần trên staging.

NEXT
