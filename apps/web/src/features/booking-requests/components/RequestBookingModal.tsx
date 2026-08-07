'use client';

import { useState } from 'react';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { RequestBookingFlow } from './RequestBookingFlow';

interface RequestBookingModalProps {
  vehicleId: string;
  vehicleName: string;
  vehicleImageUrl?: string | null;
  pricePerDay?: string | null;
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
 * `size="md"` → desktop 560px, mobile **toàn màn hình** theo Figma `130:1563` quy tắc 5
 * ("Form overlays → Full-Screen (luôn — cần chỗ cho bàn phím)"). Đúng thứ luồng này cần:
 * có ô nhập ngày, họ tên, SĐT và 6 ô OTP.
 *
 * Bản trước truyền `size="88dvh"` cho `Drawer` — `size` của AntD chỉ nhận `'default' | 'large'`,
 * nên chiều cao đó chưa bao giờ có tác dụng (backlog D14.1). Migration này bỏ hẳn nó.
 */
export function RequestBookingModal({
  vehicleId,
  vehicleName,
  vehicleImageUrl,
  pricePerDay,
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
      size="md"
      footer={null}
      confirmLoading={busy}
    >
      {open ? (
        <RequestBookingFlow
          vehicleId={vehicleId}
          vehicleName={vehicleName}
          vehicleImageUrl={vehicleImageUrl}
          pricePerDay={pricePerDay}
          pickupAt={pickupAt}
          returnAt={returnAt}
          onClose={onClose}
          onBusyChange={setBusy}
        />
      ) : null}
    </ResponsiveDialog>
  );
}
