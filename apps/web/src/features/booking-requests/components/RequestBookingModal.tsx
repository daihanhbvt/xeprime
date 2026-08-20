'use client';

import { useTranslations } from 'next-intl';
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
  /** Ngữ cảnh dịch vụ/lộ trình từ tab tìm kiếm — prefill luồng đặt (17/08). */
  serviceType?: string | null;
  routeType?: string | null;
  open: boolean;
  onClose: () => void;
}

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
  serviceType,
  routeType,
  open,
  onClose,
}: RequestBookingModalProps) {
  /**
   * Đang xác minh OTP / gửi yêu cầu. Nâng lên vỏ để khoá các đường đóng VÔ Ý (Esc, bấm nền):
   * đóng giữa chừng sẽ gỡ flow trong khi request đang bay, khách không biết yêu cầu đã gửi hay
   * chưa. Nút đóng tường minh vẫn dùng được.
   */
  const t = useTranslations('BookingRequests.flow');
  const [busy, setBusy] = useState(false);
  /**
   * Đã gửi xong (hoặc trùng lặp) → overlay THU lại vừa nội dung.
   *
   * Khung `xl` hai cột rộng 1180px và cao hết màn là để chứa biểu mẫu; giữ nguyên nó cho một
   * thẻ xác nhận vài dòng thì phần lớn hộp thoại là chỗ trống, và mắt phải đi rất xa mới tới
   * hàng nút. Kết quả là một thông báo, không phải một không gian làm việc.
   */
  const [isResult, setIsResult] = useState(false);

  return (
    <ResponsiveDialog
      title={t('title')}
      open={open}
      onClose={onClose}
      size={isResult ? 'md' : 'xl'}
      // Bố cục hai cột tự cuộn từng bên (RequestBookingFlow `.left`/`.right`, StaffVehiclePicker
      // `.scroller`) — thân overlay phải khoá cuộn để không thành hai lớp lồng nhau.
      bodyScroll="content"
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
          serviceType={serviceType}
          routeType={routeType}
          onClose={onClose}
          onBusyChange={setBusy}
          onResultChange={setIsResult}
        />
      ) : null}
    </ResponsiveDialog>
  );
}
