'use client';

import { useState } from 'react';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import type { PublicListingDetail } from '@/features/marketplace/types';
import { RequestBookingFlow } from './RequestBookingFlow';

interface RequestBookingModalProps {
  vehicleId: string;
  vehicleName: string;
  vehicleImageUrl?: string | null;
  /** Listing đầy đủ khi mở từ trang chi tiết — tránh gọi lại API cho cột hồ sơ xe. */
  listing?: PublicListingDetail | null;
  pickupAt?: string | null;
  returnAt?: string | null;
  open: boolean;
  onClose: () => void;
}

const TITLE = 'Yêu cầu thuê xe';

/**
 * Vỏ đựng luồng đặt xe. Toàn bộ nghiệp vụ (kiểm tra khung giờ trống, OTP, gửi yêu cầu) nằm
 * trong `RequestBookingFlow`; ở đây chỉ còn hình thái overlay.
 *
 * Chỉ render flow khi mở → mỗi lần mở là state mới (không mang theo bước dở của lần trước).
 *
 * `size="xl"` (Wave 9) → desktop modal rộng, đủ chỗ cho HAI cột (hồ sơ xe · luồng thao tác);
 * mobile vẫn **toàn màn hình** theo Figma `130:1563` quy tắc 5 ("Form overlays → Full-Screen —
 * cần chỗ cho bàn phím"). Đúng thứ luồng này cần: có lịch, họ tên, SĐT và 6 ô OTP.
 *
 * `footer={null}`: mỗi bước có bộ nút riêng ngay cuối cột phải, nên footer chung của dialog sẽ
 * là hàng nút thứ hai không ai bấm.
 */
export function RequestBookingModal({
  vehicleId,
  vehicleName,
  vehicleImageUrl,
  listing,
  pickupAt,
  returnAt,
  open,
  onClose,
}: RequestBookingModalProps) {
  /**
   * Đang xác minh OTP / gửi yêu cầu. Nâng lên vỏ để khoá các đường đóng VÔ Ý (Esc, bấm nền):
   * đóng giữa chừng sẽ gỡ flow trong khi request đang bay, khách không biết yêu cầu đã gửi hay
   * chưa. Nút đóng tường minh vẫn dùng được.
   */
  const [busy, setBusy] = useState(false);

  return (
    <ResponsiveDialog
      title={TITLE}
      open={open}
      onClose={onClose}
      size="xl"
      footer={null}
      confirmLoading={busy}
    >
      {open ? (
        <RequestBookingFlow
          vehicleId={vehicleId}
          vehicleName={vehicleName}
          vehicleImageUrl={vehicleImageUrl}
          listing={listing}
          pickupAt={pickupAt}
          returnAt={returnAt}
          onClose={onClose}
          onBusyChange={setBusy}
        />
      ) : null}
    </ResponsiveDialog>
  );
}
