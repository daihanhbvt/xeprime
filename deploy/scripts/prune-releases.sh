#!/usr/bin/env bash
# Giữ N bản phát hành gần nhất của MỘT môi trường trên máy, xoá image của các bản cũ hơn.
# Chạy từ GỐC REPO, SAU khi bản mới đã chạy khoẻ:
#
#   ./deploy/scripts/prune-releases.sh <môi trường> <tag gốc vừa deploy> [N=3]
#   ./deploy/scripts/prune-releases.sh staging ghcr.io/daihanhbvt/xeprime:staging-a1b2c3d
#
# Gọi từ `deploy/scripts/deploy.sh` (staging/production) và `deploy/prodtemp/deploy.sh`.
#
# Vì sao phải dọn: `docker image prune` chỉ xoá image MỒ CÔI, còn mỗi lần pull từ GHCR để lại
# bốn image CÓ TAG ĐẦY ĐỦ. Không dọn thì đĩa đầy dần, và thứ hỏng ĐẦU TIÊN không phải app mà là
# `backup-db.sh`: nó từ chối chạy khi còn dưới 2GB — tức là mất sao lưu TRƯỚC khi mất dịch vụ.
#
# Giữ lại (thay vì chỉ giữ bản đang chạy) để rollback không phải tải lại; bản đang chạy tính là
# một trong N. Lỗi ở đây không bao giờ làm hỏng lần deploy — tệ nhất là còn vài image chưa dọn.
set -uo pipefail

cd "$(dirname "$0")/../.."

XP_ENV="${1:?Cần tên môi trường, ví dụ: staging}"
XP_IMAGE="${2:?Cần tag gốc vừa deploy, ví dụ: ghcr.io/daihanhbvt/xeprime:staging-a1b2c3d}"
KEEP_RELEASES="${3:-3}"

REPO="${XP_IMAGE%:*}"
RELEASE="${XP_IMAGE##*:}"
HISTORY=".deploy-releases.$XP_ENV"

# Tag của bản phát hành mà không có hậu tố vai trò. Tag cũ (một image chung, trước 30/10/2026)
# không có hậu tố nên giữ nguyên — nó vẫn được tính là một bản phát hành.
release_of() { sed -E 's/-(web|api|worker|tools)$//'; }

# Đếm THEO LỊCH SỬ DEPLOY, không theo ngày tạo image: một bản chỉ sửa api thì web/worker/tools là
# đúng image cũ được gắn thêm tag mới, và "ngày tạo" của chúng là ngày của bản trước — sắp theo
# đó là xoá nhầm bản vừa deploy. Lần đầu chưa có file thì mồi từ image đang có.
if [[ ! -f "$HISTORY" ]]; then
  docker images --filter "reference=$REPO" --format '{{.Tag}}' \
    | grep -E "^${XP_ENV}-" | release_of | awk '!seen[$0]++' | head -n "$KEEP_RELEASES" \
    | tac > "$HISTORY"
fi
echo "$RELEASE" >> "$HISTORY"
# N bản KHÁC NHAU gần nhất tính từ cuối: rollback về một bản cũ làm nó thành bản mới nhất.
KEEP="$(tac "$HISTORY" | awk 'NF && !seen[$0]++' | head -n "$KEEP_RELEASES")"
tac <<<"$KEEP" > "$HISTORY"

# CHỈ tag của môi trường này (`<môi trường>-…`): các môi trường ở chung một VPS dùng chung
# repository image, và dọn theo repository là xoá bản rollback của môi trường kia.
docker images --filter "reference=$REPO" --format '{{.Tag}}' \
  | grep -E "^${XP_ENV}-" \
  | while read -r tag; do
      grep -qxF "$(release_of <<<"$tag")" <<<"$KEEP" || echo "$REPO:$tag"
    done \
  | xargs -r docker rmi >/dev/null 2>&1

docker image prune -f >/dev/null
exit 0
