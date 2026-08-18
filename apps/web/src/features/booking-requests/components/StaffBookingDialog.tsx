'use client';

import { useState } from 'react';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import type { VehicleListItem } from '@/features/vehicles/types';
import { StaffBookingFlow } from './StaffBookingFlow';
import { StaffVehiclePicker } from './StaffVehiclePicker';

/** Xe của luồng — từ ô lịch được bấm, hoặc từ bước chọn xe ngay trong hộp thoại. */
interface PickedVehicle {
  id: string;
  name: string;
  imageUrl?: string | null;
}

interface StaffBookingDialogProps {
  /**
   * Xe đã biết trước (lịch: ô được bấm đã nói rõ xe nào). Bỏ trống ở lối vào chưa biết xe
   * (danh sách đơn, hồ sơ khách) → hộp thoại mở ở BƯỚC CHỌN XE.
   */
  vehicleId?: string | null;
  vehicleName?: string | null;
  vehicleImageUrl?: string | null;
  /** Prefill từ ô lịch được bấm (ISO). */
  pickupAt?: string | null;
  returnAt?: string | null;
  /** Prefill khách — lối vào từ hồ sơ khách đã biết người thuê là ai (S-01). */
  customerName?: string | null;
  customerPhone?: string | null;
  open: boolean;
  onClose: () => void;
}

/**
 * Vỏ đựng luồng "Đặt xe" của gian hàng — CÙNG hình thái với `RequestBookingModal` của khách
 * (xl hai cột khi nhập, thu về md ở màn kết quả, mobile toàn màn hình). Nghiệp vụ nằm trong
 * `StaffBookingFlow`; chỉ render khi mở để mỗi lần mở là state mới.
 *
 * MỘT hộp thoại cho mọi lối tạo đơn thủ công (lịch · danh sách đơn · hồ sơ khách): lối nào biết
 * sẵn xe thì vào thẳng, lối nào chưa biết thì chọn xe trước. Dựng một form tạo đơn thứ hai cho
 * riêng danh sách đơn là cách chắc chắn để hai nơi trôi khỏi nhau về giá, lịch và dịch vụ.
 *
 * Vỏ này KHÔNG tự render thêm gì cạnh hai bước: thân `xl` cao cố định + `overflow: hidden`, nên
 * mỗi khối chèn thêm đều ăn vào chiều cao của bước và đẩy hàng nút ra khỏi tầm nhìn. "Chọn xe
 * khác" vì thế đi vào trong luồng (`onChangeVehicle`), cạnh thẻ xe.
 */
export function StaffBookingDialog({
  vehicleId,
  vehicleName,
  vehicleImageUrl,
  pickupAt,
  returnAt,
  customerName,
  customerPhone,
  open,
  onClose,
}: StaffBookingDialogProps) {
  const [busy, setBusy] = useState(false);
  const [isResult, setIsResult] = useState(false);
  const [picked, setPicked] = useState<PickedVehicle | null>(null);

  const preset: PickedVehicle | null = vehicleId
    ? { id: vehicleId, name: vehicleName ?? '', imageUrl: vehicleImageUrl }
    : null;
  const vehicle = preset ?? picked;

  function handleClose() {
    setPicked(null);
    onClose();
  }

  return (
    <ResponsiveDialog
      title={vehicle ? 'Đặt xe cho khách' : 'Chọn xe cho đơn thuê'}
      open={open}
      onClose={handleClose}
      size={isResult ? 'md' : 'xl'}
      mobileMode="fullscreen"
      footer={null}
      confirmLoading={busy}
    >
      {!open ? null : vehicle ? (
        <StaffBookingFlow
          vehicleId={vehicle.id}
          vehicleName={vehicle.name}
          vehicleImageUrl={vehicle.imageUrl}
          pickupAt={pickupAt}
          returnAt={returnAt}
          customerName={customerName}
          customerPhone={customerPhone}
          // Vào từ lịch thì xe là cố định — không cho đổi, tránh mở một nhánh không ai cần.
          onChangeVehicle={preset ? null : () => setPicked(null)}
          onClose={handleClose}
          onBusyChange={setBusy}
          onResultChange={setIsResult}
        />
      ) : (
        <StaffVehiclePicker
          onPick={(item: VehicleListItem) =>
            setPicked({ id: item.id, name: item.name, imageUrl: item.mainImageUrl })
          }
        />
      )}
    </ResponsiveDialog>
  );
}
