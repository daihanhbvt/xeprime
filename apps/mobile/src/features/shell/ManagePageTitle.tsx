import type { ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';

/**
 * Tiêu đề của MỘT TRANG trong khu quản lý, nằm TRONG nội dung — không phải trong thanh trên.
 *
 * Cùng cách web dựng: thanh trên là chrome dùng chung (thương hiệu · gian hàng · danh tính), còn
 * "Đơn thuê" / "Yêu cầu thuê" là tiêu đề của trang và đi kèm hành động chính của chính trang đó
 * ("Tạo đơn"). Nhồi tiêu đề trang vào thanh trên thì mỗi lần đổi mục là cả thanh đổi chữ, và
 * người dùng mất mốc "mình đang ở app nào" — mục đang sáng trong drawer đã lo việc đó.
 */
export function ManagePageTitle({
  title,
  /**
   * Tổng số bản ghi — vai của `showTotal` trên `Pagination` của web.
   *
   * Danh sách cuộn vô hạn không có thanh phân trang để đặt con số này, mà đây lại là thứ người
   * vận hành cần biết trước khi cuộn ("142 đơn" quyết định họ tìm bằng cuộn hay bằng bộ lọc).
   * Bỏ nó đi là mất thông tin web đang có, chứ không phải giản lược cho gọn.
   */
  total,
  action,
}: {
  title: string;
  total?: string;
  action?: ReactNode;
}) {
  return (
    <XStack ai="center" gap={space.sm} px={layout.screenX} pt={space.md} pb={space.xs}>
      <YStack f={1} gap={1}>
        <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.bold} numberOfLines={1}>
          {title}
        </Text>
        {total ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={1}>
            {total}
          </Text>
        ) : null}
      </YStack>
      {action}
    </XStack>
  );
}
