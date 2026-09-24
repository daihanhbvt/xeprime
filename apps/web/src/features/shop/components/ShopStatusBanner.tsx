'use client';

import { Alert } from 'antd';
import { useTranslations } from 'next-intl';
import { TENANT_STATUS, type TenantStatus } from '@xeprime/types';
import { shopStatusNotice } from '../status-notice';
import type { MyShop } from '../types';
import styles from './ShopStatusBanner.module.css';

interface ShopStatusBannerProps {
  shop: MyShop;
}

/**
 * Một dải trạng thái duy nhất — CHỈ khi gian hàng không ở trạng thái vận hành bình thường.
 *
 * Nhãn trạng thái đã nằm cạnh tên gian hàng ở tiêu đề trang, nên lặp lại nó ở đây chỉ tốn chỗ.
 * Thứ dải này phải nói là điều người dùng chưa biết: gian hàng bị KHOÁ hay HẾT HẠN — xe đang biến
 * mất khỏi chợ ngay lúc này. Gian hàng `active` (gần như tất cả mọi người) không có dải nào.
 *
 * ## Trục XÁC MINH không còn ở đây (24/09/2026)
 *
 * Tới ngày này dải còn nói về phiếu xác minh gian hàng (đang chờ / cần bổ sung / bị từ chối) kèm
 * nút "Gửi lại". Nền tảng đã tạm ngừng xác minh gian hàng — màn duyệt của nền tảng chỉ nhận phiếu
 * XE — nên mọi câu ở trục đó đều hứa một vòng trao đổi mà không ai ở đầu kia. Một hành động không
 * còn ai xử lý thì ẩn hẳn, không đổi thành một dòng giải thích luật nội bộ.
 *
 * Nhãn "đã xác minh" của những gian hàng ĐÃ được xác minh trước đó vẫn giữ ở nơi khác — đó là một
 * sự thật đã xảy ra, không phải một lời mời làm gì.
 */
export function ShopStatusBanner({ shop }: ShopStatusBannerProps) {
  const t = useTranslations('Shop');

  /*
   * Nhánh này còn bắt cả dữ liệu cũ (`draft`/`pending_review` chưa qua backfill) — với chúng,
   * câu chữ theo trạng thái vẫn là câu đúng.
   */
  if ((shop.status as TenantStatus) === TENANT_STATUS.ACTIVE) return null;

  const notice = shopStatusNotice(shop.status);
  return (
    <Alert
      className={styles.banner}
      type={notice.tone}
      showIcon
      title={t(`status.${notice.key}.title`)}
      description={t(`status.${notice.key}.body`)}
    />
  );
}
