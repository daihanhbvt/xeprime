#!/usr/bin/env bash
# Dựng kho sao lưu + lối SFTP CHỈ-ĐỌC để máy tại công ty kéo bản dump về.
# Chạy MỘT LẦN trên VPS, bằng root, từ gốc repo:
#
#   sudo ./deploy/scripts/setup-backup-user.sh
#   sudo ./deploy/scripts/setup-backup-user.sh --pubkey "ssh-ed25519 AAAA... backup-pull"
#
# Vì sao máy công ty PULL chứ không phải VPS PUSH:
# VPS là thứ dễ bị chiếm nhất trong hệ thống — nó nằm trên Internet công khai. Nếu nó cầm khoá
# ghi được vào mạng công ty thì kẻ chiếm nó xoá luôn bản sao lưu, đúng kịch bản ransomware.
# Chiều pull thì VPS không cầm bí mật nào của phía bên kia, và công ty không phải mở cổng vào.
#
# Và khoá pull bị giới hạn ở CẤP MÁY CHỦ, không phải cấp thoả thuận: `ForceCommand
# internal-sftp -R` khiến khoá đó chỉ tải file xuống được — không mở shell, không xoá, không
# dùng VPS làm bàn đạp. Khoá rò rỉ vẫn là chuyện xấu, nhưng nó không leo thang được.
#
# Script idempotent: chạy lại nhiều lần không hỏng gì.
set -euo pipefail

cd "$(dirname "$0")/../.."

APP_USER="${APP_USER:-xeprime}"
BACKUP_USER="${BACKUP_USER:-xpbackup}"
# `ChrootDirectory` yêu cầu thư mục gốc và MỌI thư mục cha thuộc root và không cho group/other
# ghi. Vì vậy gốc chroot là /var/backups (root:root 0755), còn dữ liệu nằm một cấp dưới.
CHROOT_ROOT="${CHROOT_ROOT:-/var/backups}"
BACKUP_ROOT="$CHROOT_ROOT/xeprime"
ENVS=(production staging)
SSHD_CONF=/etc/ssh/sshd_config.d/xeprime-backup.conf
PUBKEY=''

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pubkey) PUBKEY="${2:-}"; shift 2 ;;
    *) echo "Tham số không hiểu: $1" >&2; exit 1 ;;
  esac
done

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || fail 'Phải chạy bằng root (sudo).'
id "$APP_USER" >/dev/null 2>&1 || fail "Chưa có user '$APP_USER'. Chạy deploy/scripts/vps-bootstrap.sh trước."

# --- User chỉ để tải file ---------------------------------------------------
# `--shell /usr/sbin/nologin` là lớp thứ hai sau ForceCommand: kể cả khi khối Match bị ai đó gỡ
# khỏi sshd_config, tài khoản này vẫn không có shell để rơi vào.
if id "$BACKUP_USER" >/dev/null 2>&1; then
  log "User $BACKUP_USER đã có"
else
  log "Tạo user $BACKUP_USER"
  useradd --system --create-home --home-dir "/home/$BACKUP_USER" \
          --shell /usr/sbin/nologin --comment 'XePrime backup pull (read-only SFTP)' "$BACKUP_USER"
fi

# --- Kho sao lưu ------------------------------------------------------------
log "Dựng $BACKUP_ROOT"
install -d -o root -g root -m 0755 "$CHROOT_ROOT"

# setgid (chữ số 2 đầu) là mấu chốt: `backup-db.sh` chạy bằng user $APP_USER, nên file nó tạo ra
# mặc định thuộc nhóm $APP_USER và $BACKUP_USER KHÔNG đọc được. setgid làm mọi file/thư mục sinh
# ra bên trong thừa kế nhóm $BACKUP_USER. Thiếu bit này thì pull báo "permission denied" ở đúng
# ngày cần dùng, và nguyên nhân không hề hiện ra trong thông báo lỗi.
install -d -o "$APP_USER" -g "$BACKUP_USER" -m 2750 "$BACKUP_ROOT"
for e in "${ENVS[@]}"; do
  install -d -o "$APP_USER" -g "$BACKUP_USER" -m 2750 "$BACKUP_ROOT/$e"
  install -d -o "$APP_USER" -g "$BACKUP_USER" -m 2750 "$BACKUP_ROOT/$e/daily"
done

# Sửa nhóm cho các file đã tồn tại từ trước lần chạy này (ví dụ đã backup vài hôm rồi mới cài).
chgrp -R "$BACKUP_USER" "$BACKUP_ROOT" 2>/dev/null || true
find "$BACKUP_ROOT" -type f -name '*.dump*' -exec chmod 0640 {} + 2>/dev/null || true

# --- Khoá SSH ---------------------------------------------------------------
AUTH_DIR="/home/$BACKUP_USER/.ssh"
AUTH_FILE="$AUTH_DIR/authorized_keys"
install -d -o "$BACKUP_USER" -g "$BACKUP_USER" -m 0700 "$AUTH_DIR"
touch "$AUTH_FILE"
chown "$BACKUP_USER:$BACKUP_USER" "$AUTH_FILE"
chmod 0600 "$AUTH_FILE"

if [[ -n "$PUBKEY" ]]; then
  # `restrict` (OpenSSH 7.4+) tắt sẵn port/agent/X11 forwarding, PTY, tunnel và ~/.ssh/rc.
  # Đây là lớp giới hạn ĐỘC LẬP với khối Match bên dưới — hai lớp, không phải một lớp viết hai chỗ.
  LINE="restrict $PUBKEY"
  if grep -qxF "$LINE" "$AUTH_FILE" 2>/dev/null; then
    log 'Khoá đã có trong authorized_keys'
  else
    log 'Thêm khoá vào authorized_keys'
    printf '%s\n' "$LINE" >> "$AUTH_FILE"
  fi
else
  log "Chưa truyền --pubkey. Thêm tay sau vào $AUTH_FILE, LUÔN kèm tiền tố 'restrict '."
fi

# --- sshd: chroot + chỉ đọc -------------------------------------------------
log "Ghi $SSHD_CONF"
install -d -o root -g root -m 0755 /etc/ssh/sshd_config.d
{
  printf '# XePrime — lối SFTP CHỈ-ĐỌC cho máy tại công ty kéo bản sao lưu về.\n'
  printf '# Sinh bởi deploy/scripts/setup-backup-user.sh — sửa tay thì nhớ chạy `sshd -t` trước khi reload.\n'
  printf '#\n'
  printf '# `-R` = read-only Ở CẤP MÁY CHỦ. Không phải quy ước, không phải kỳ vọng vào phía client:\n'
  printf '# sshd từ chối mọi thao tác ghi/xoá của phiên này, kể cả khi khoá bị đánh cắp.\n'
  printf 'Match User %s\n' "$BACKUP_USER"
  printf '    ChrootDirectory %s\n' "$CHROOT_ROOT"
  printf '    ForceCommand internal-sftp -R -d /xeprime\n'
  printf '    PermitTTY no\n'
  printf '    AllowTcpForwarding no\n'
  printf '    AllowAgentForwarding no\n'
  printf '    X11Forwarding no\n'
  printf '    PermitTunnel no\n'
  printf '    PasswordAuthentication no\n'
} > "$SSHD_CONF"
chmod 0644 "$SSHD_CONF"

# `sshd -t` TRƯỚC khi reload. Một file config sai làm sshd không khởi động lại được, và nếu bạn
# đang ngồi trên chính phiên SSH đó thì đây là cách tự khoá mình ra khỏi máy.
log 'Kiểm tra cấu hình sshd'
sshd -t || fail "Cấu hình sshd không hợp lệ — ĐÃ KHÔNG reload. Sửa $SSHD_CONF rồi chạy lại."

log 'Nạp lại sshd'
systemctl reload ssh 2>/dev/null || systemctl reload sshd

log 'Xong.'
cat <<'NEXT'

Kiểm tra ngay từ máy tại công ty (PowerShell):

  # 1. PHẢI bị từ chối — nếu chạy được thì ForceCommand chưa có hiệu lực, dừng lại và sửa:
  ssh -i $env:USERPROFILE\.ssh\xeprime_pull xpbackup@<ip> "whoami"

  # 2. PHẢI vào được, và `rm` bên trong phải báo lỗi permission:
  sftp -i $env:USERPROFILE\.ssh\xeprime_pull xpbackup@<ip>
  sftp> ls /xeprime/production/daily

NEXT
