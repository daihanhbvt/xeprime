import { useTranslations } from 'use-intl';
import { Callout } from '@/components/ui/Callout';

/**
 * Gói hết hạn: nói RÕ là chế độ chỉ xem, không để nút tắt trông như thiếu quyền — ADR 0027
 * điều 3 (hết hạn là `read_only`, không phải `hidden`). Bốn màn (Phiếu thu chi, Danh mục,
 * Nhân sự, Tài xế, Chi nhánh) từng chép tay đúng ba dòng này; gộp lại một chỗ để lần thêm
 * tính năng thứ năm không phải chép dòng thứ năm.
 */
export function FeatureReadOnlyNotice({ show }: { show: boolean }) {
  const tFeature = useTranslations('ManageCommon.feature');
  if (!show) return null;
  return <Callout tone="warning">{tFeature('readOnlyTooltip')}</Callout>;
}
