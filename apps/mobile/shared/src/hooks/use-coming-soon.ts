import { useCallback } from 'react';
import { useTranslations } from 'use-intl';
import { useAppToast } from '@/components/feedback/use-app-toast';

/**
 * Báo "chức năng đang được phát triển" — MỘT câu, MỘT chỗ.
 *
 * Đây là quy ước sẵn có của khu quản lý: mục menu chưa có màn vẫn HIỆN đúng chỗ của nó và chạm
 * vào thì báo câu này (`ManageDrawer`). Rút thành hook vì luật đó không chỉ đúng với menu —
 * mọi lối đi mà web CÓ còn app CHƯA dựng đều phải xử lý như vậy.
 *
 * Vì sao giữ nút thay vì bỏ đi: ẩn một hành động khiến người dùng tưởng sản phẩm KHÔNG có nó, và
 * hai client đọc ra hai sản phẩm khác nhau. Một nút nói thẳng "đang phát triển" thì trung thực,
 * còn ẩn đi là một khoảng lặng mà người dùng phải tự đoán.
 */
export function useComingSoon(): () => void {
  const t = useTranslations('Common.states');
  const toast = useAppToast();

  return useCallback(() => toast.showInfo(t('featureComingSoon')), [t, toast]);
}
