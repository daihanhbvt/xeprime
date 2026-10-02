import { useTranslations } from 'use-intl';
import { TENANT_STATUS, type TenantStatus } from '@xeprime/types';
import { Callout } from '@/components/ui/Callout';
import { shopStatusNotice } from '../status-notice';
import type { MyShop } from '../api';

/**
 * MỘT dải trạng thái cho màn hồ sơ gian hàng — bản native của `ShopStatusBanner` bên web, và CHỈ
 * khi gian hàng không ở trạng thái vận hành bình thường.
 *
 * Nhãn trạng thái đã nằm cạnh tên gian hàng ở tiêu đề trang, nên lặp lại nó ở đây chỉ tốn chỗ.
 * Thứ dải này phải nói là điều người dùng CHƯA biết: gian hàng bị KHOÁ hay HẾT HẠN — xe đang biến
 * mất khỏi chợ ngay lúc này. Gian hàng `active` (gần như tất cả mọi người) không có dải nào.
 *
 * ## Trục XÁC MINH không còn ở đây (24/09/2026)
 *
 * Tới ngày này dải còn nói về phiếu xác minh gian hàng (đang chờ / cần bổ sung / bị từ chối) kèm
 * nút "Gửi lại". Nền tảng đã tạm ngừng xác minh gian hàng — màn duyệt của nền tảng chỉ nhận phiếu
 * XE — nên mọi câu ở trục đó đều hứa một vòng trao đổi mà không ai ở đầu kia. Web gỡ cả dải lẫn
 * nút; app theo đúng như vậy.
 *
 * Nhánh không-`active` còn bắt cả dữ liệu cũ (`draft`/`pending_review` chưa qua backfill) — với
 * chúng, câu chữ theo trạng thái vẫn là câu đúng.
 */
export function ShopStatusBanner({ shop }: { shop: MyShop }) {
  const t = useTranslations('Shop');

  if ((shop.status as TenantStatus) === TENANT_STATUS.ACTIVE) return null;
  const notice = shopStatusNotice(shop.status);

  return (
    <Callout tone={notice.tone} title={t(`status.${notice.key}.title` as 'status.draft.title')}>
      {t(`status.${notice.key}.body` as 'status.draft.body')}
    </Callout>
  );
}
