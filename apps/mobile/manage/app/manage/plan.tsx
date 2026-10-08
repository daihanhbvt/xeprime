import { SubscriptionScreen } from '@/features/subscription/SubscriptionScreen';

/**
 * Gói & hoá đơn dạng TRANG CON — nằm ở stack ngoài bộ tab nên có nút lui về đúng màn vừa bấm
 * (dải "gói hết hạn" ở Thu chi, Công nợ…). Mục menu vẫn là `/manage/subscription` (tab).
 */
export default function ManagePlanPageRoute() {
  return <SubscriptionScreen shell="stacked" />;
}
