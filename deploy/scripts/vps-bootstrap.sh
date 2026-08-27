#!/usr/bin/env bash
# Chuẩn bị một VPS Ubuntu 24.04 TRỐNG để chạy XePrime. Chạy MỘT LẦN, bằng root.
#
#   ssh root@<ip>
#   bash deploy/scripts/vps-bootstrap.sh
#
# Làm bốn việc, và mỗi việc đều idempotent (chạy lại không hỏng gì):
#   1. swap 4GB — `next build` là đỉnh RAM của cả quy trình và máy 6GB không có swap sẽ bị OOM
#      killer bắn giữa chừng, thường là bắn nhầm Postgres.
#   2. Docker CE + compose plugin.
#   3. Tường lửa: chỉ 22/80/443. Postgres KHÔNG bao giờ ra Internet.
#   4. Một user thường để chạy ứng dụng (không deploy bằng root).
set -euo pipefail

APP_USER="${APP_USER:-xeprime}"
# Tính bằng MB để `fallocate` và `dd` (đường lùi khi filesystem không hỗ trợ fallocate) không
# thể mô tả hai kích thước khác nhau.
SWAP_MB="${SWAP_MB:-4096}"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

[[ $EUID -eq 0 ]] || { echo 'Script này cần chạy bằng root.' >&2; exit 1; }

# --- 1. Swap ---------------------------------------------------------------
if swapon --show | grep -q '/swapfile'; then
  log "Swap đã có, bỏ qua"
else
  log "Tạo swap ${SWAP_MB}MB"
  fallocate -l "${SWAP_MB}M" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count="$SWAP_MB"
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Swap là lưới an toàn cho lúc build, KHÔNG phải chỗ để hệ điều hành đẩy Postgres xuống đĩa khi
# RAM vẫn còn. `swappiness=10` nói đúng điều đó.
log "Đặt vm.swappiness=10"
sysctl -w vm.swappiness=10 >/dev/null
grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf

# --- 2. Docker -------------------------------------------------------------
if command -v docker >/dev/null 2>&1; then
  log "Docker đã có: $(docker --version)"
else
  log "Cài Docker CE"
  apt-get update
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi

# Log container không xoay vòng sẽ ăn hết 50GB đĩa trong vài tháng — và triệu chứng đầu tiên
# là Postgres không ghi được nữa.
log "Giới hạn log Docker (10MB × 3 file mỗi container)"
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
JSON
systemctl restart docker

# --- 3. Tường lửa ----------------------------------------------------------
log "Cấu hình ufw: chỉ mở 22/80/443"
apt-get install -y ufw
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# --- 4. User ứng dụng ------------------------------------------------------
if id "$APP_USER" >/dev/null 2>&1; then
  log "User $APP_USER đã có"
else
  log "Tạo user $APP_USER"
  adduser --disabled-password --gecos '' "$APP_USER"
  # SSH key của root dùng lại cho user này để không phải sinh key mới.
  if [[ -f /root/.ssh/authorized_keys ]]; then
    install -d -m 700 -o "$APP_USER" -g "$APP_USER" "/home/$APP_USER/.ssh"
    install -m 600 -o "$APP_USER" -g "$APP_USER" /root/.ssh/authorized_keys "/home/$APP_USER/.ssh/authorized_keys"
  fi
fi
usermod -aG docker "$APP_USER"

log "Xong. Đăng nhập lại bằng: ssh $APP_USER@<ip>"
echo "Tiếp theo: docs/deployment.md mục 3 (clone repo + .env.production)."
