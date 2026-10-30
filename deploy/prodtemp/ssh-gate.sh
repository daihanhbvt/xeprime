#!/usr/bin/env bash
# Lệnh BẮT BUỘC của khoá SSH deploy production tạm — dòng của khoá đó trong
# `~xeprime/.ssh/authorized_keys` có dạng:
#
#   restrict,command="/opt/xeprime/deploy/prodtemp/ssh-gate.sh" ssh-ed25519 AAAA… github-actions-prodtemp
#
# `restrict` tắt shell tương tác, port/agent/X11 forwarding; `command=` bắt MỌI phiên của khoá đi
# qua script này, bất kể bên kia gõ gì. Script chỉ nhận đúng một câu, kèm file env ở STDIN:
#
#   deploy ghcr.io/daihanhbvt/xeprime:prodtemp-<sha>   < .env.render
#
# File env do workflow dựng từ GitHub Environment `prodtemp` (render-env.mjs). Ghi ra file CHỜ —
# deploy.sh kiểm nó bằng bộ luật env production rồi mới thay `.env.prodtemp`.
#
# Vì sao không dùng chung khoá của staging: khoá đó mở shell đầy đủ của user `xeprime` (đọc được
# mọi file env, xoá được mọi volume). Khoá của bản tạm nằm ở một Environment GitHub KHÁC; lộ nó
# thì kẻ cầm chỉ deploy được image của chính repo này lên chính bản tạm. Thu hồi = xoá dòng.
set -euo pipefail

CMD="${SSH_ORIGINAL_COMMAND:-}"
PATTERN='^deploy (ghcr\.io/daihanhbvt/xeprime:prodtemp-[0-9a-f]{7,40})$'

if [[ ! "$CMD" =~ $PATTERN ]]; then
  echo 'Khoá này chỉ được chạy: deploy ghcr.io/daihanhbvt/xeprime:prodtemp-<sha>  (file env ở stdin)' >&2
  exit 1
fi
IMAGE="${BASH_REMATCH[1]}"

cd /opt/xeprime
INCOMING=.env.prodtemp.incoming
umask 077
# Trần 256KB: một file env thật vài KB. Không trần thì phiên này ghi được bao nhiêu tuỳ thích.
head -c 262144 > "$INCOMING"
[[ -s "$INCOMING" ]] || { rm -f "$INCOMING"; echo 'Thiếu file env ở stdin.' >&2; exit 1; }

exec ./deploy/prodtemp/deploy.sh --image "$IMAGE" --env-from "$INCOMING"
