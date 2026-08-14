'use client';

import { useState } from 'react';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { StaffBookingFlow } from './StaffBookingFlow';

interface StaffBookingDialogProps {
  vehicleId: string;
  vehicleName: string;
  vehicleImageUrl?: string | null;
  /** Prefill từ ô lịch được bấm (ISO). */
  pickupAt?: string | null;
  returnAt?: string | null;
  open: boolean;
  onClose: () => void;
}

/**
 * Vỏ đựng luồng "Đặt xe" của gian hàng — CÙNG hình thái với `RequestBookingModal` của khách
 * (xl hai cột khi nhập, thu về md ở màn kết quả, mobile toàn màn hình). Nghiệp vụ nằm trong
 * `StaffBookingFlow`; chỉ render khi mở để mỗi lần mở là state mới.
 */
export function StaffBookingDialog({
  vehicleId,
  vehicleName,
  vehicleImageUrl,
  pickupAt,
  returnAt,
  open,
  onClose,
}: StaffBookingDialogProps) {
  const [busy, setBusy] = useState(false);
  const [isResult, setIsResult] = useState(false);

  return (
    <ResponsiveDialog
      title="Đặt xe cho khách"
      open={open}
      onClose={onClose}
      size={isResult ? 'md' : 'xl'}
      mobileMode="fullscreen"
      footer={null}
      confirmLoading={busy}
    >
      {open ? (
        <StaffBookingFlow
          vehicleId={vehicleId}
          vehicleName={vehicleName}
          vehicleImageUrl={vehicleImageUrl}
          pickupAt={pickupAt}
          returnAt={returnAt}
          onClose={onClose}
          onBusyChange={setBusy}
          onResultChange={setIsResult}
        />
      ) : null}
    </ResponsiveDialog>
  );
}
