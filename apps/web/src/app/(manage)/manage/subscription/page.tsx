import { redirect } from 'next/navigation';

import { SHOP_SECTION, shopSectionPath } from '@/constants/routes';

/**
 * ALIAS CHUYỂN TIẾP (16/09/2026) — "Gói & hoá đơn" thôi làm trang độc lập.
 *
 * Nó về làm section "Gói & hạn mức" của trang Cửa hàng, nơi gian hàng vốn đã tới để khai mọi
 * thứ khác về chính mình. Không mất nội dung nào: hạn mức chỗ theo loại xe, hạn gói, nút
 * mua/gia hạn, hoá đơn đang chờ kèm QR và lịch sử thanh toán đều dựng từ chính
 * `SubscriptionWorkspace` — cùng component, cùng hook, cùng quyền.
 *
 * Route cũ giữ lại kèm `?section=plan` để ai đã bookmark rơi thẳng vào đúng phần đó, không
 * phải đầu trang rồi tự đi tìm.
 *
 * ⚠️ KHÔNG áp dụng cho `/account/subscription`: đó vẫn là trang thật. Chủ xe tuyến hoa hồng
 * không vào `/manage` được, và màn đó là phễu nâng cấp lên tuyến gói (ADR 0028 điều 1).
 */
export default function ManageSubscriptionRedirectPage(): never {
  redirect(shopSectionPath(SHOP_SECTION.PLAN));
}
