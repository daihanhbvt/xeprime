#!/usr/bin/env bash
# Lệnh BẮT BUỘC của khoá SSH deploy production tạm — dòng của khoá đó trong
# `~xeprime/.ssh/authorized_keys` có dạng:
#
#   restrict,command="/opt/xeprime/deploy/prodtemp/ssh-gate.sh" ssh-ed25519 AAAA… github-actions-prodtemp
#
# `restrict` tắt shell tương tác, port/agent/X11 forwarding; `command=` bắt MỌI phiên của khoá đi
# qua script này, bất kể bên kia gõ gì. Script chỉ nhận đúng một câu:
#
#   deploy ghcr.io/daihanhbvt/xeprime:prodtemp-<sha>
#
# Vì sao không dùng chung khoá của staging: khoá đó mở shell đầy đủ của user `xeprime` (đọc được
# mọi file env, xoá được mọi volume). Khoá của bản tạm nằm ở một Environment GitHub KHÁC; lộ nó
# thì kẻ cầm chỉ deploy lại được image của chính repo này lên chính bản tạm. Thu hồi = xoá dòng.
set -euo pipefail

CMD="${SSH_ORIGINAL_COMMAND:-}"
PATTERN='^deploy (ghcr\.io/daihanhbvt/xeprime:prodtemp-[0-9a-f]{7,40})$'

if [[ "$CMD" =~ $PATTERN ]]; then
  cd /opt/xeprime
  exec ./deploy/prodtemp/deploy.sh --image "${BASH_REMATCH[1]}"
fi

echo 'Khoá này chỉ được chạy: deploy ghcr.io/daihanhbvt/xeprime:prodtemp-<sha>' >&2
exit 1
