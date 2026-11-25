'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { bookingResultDialogClassNames } from './BookingResult';
import { StaffBookingFlow } from './StaffBookingFlow';
import { StaffVehiclePicker, type PickedRange } from './StaffVehiclePicker';
import styles from './StaffBookingDialog.module.css';

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
  /**
   * Chi nhánh màn hình gọi đang lọc — bước chọn xe mở sẵn ở đó (ADR 0052).
   *
   * Chỉ là GIÁ TRỊ MỞ ĐẦU: người điều phối vẫn đổi được ngay trong bước chọn xe, vì điều xe từ
   * chi nhánh khác sang cho khách là việc bình thường.
   */
  defaultBranchId?: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Vỏ đựng luồng "Đặt xe" của gian hàng — CÙNG hình thái với `RequestBookingModal` của khách
 * (xl hai cột khi nhập; màn kết quả là hộp 600 không thanh tiêu đề như "Đã gửi yêu cầu"; mobile
 * toàn màn hình). Nghiệp vụ nằm trong `StaffBookingFlow`; chỉ render khi mở để mỗi lần mở là
 * state mới.
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
  defaultBranchId,
  open,
  onClose,
}: StaffBookingDialogProps) {
  const t = useTranslations('BookingRequests.staffFlow');
  const tPicker = useTranslations('BookingRequests.vehiclePicker');
  const [busy, setBusy] = useState(false);
  const [isResult, setIsResult] = useState(false);
  const [picked, setPicked] = useState<PickedVehicle | null>(null);
  /**
   * Khung giờ chọn ở bước chọn xe — thành giá trị mở đầu của bước Chuyến đi, và được giữ lại khi
   * nhân viên quay về "Chọn xe khác" để không phải chọn giờ lần nữa.
   */
  const [pickedRange, setPickedRange] = useState<PickedRange | null>(null);

  const preset: PickedVehicle | null = vehicleId
    ? { id: vehicleId, name: vehicleName ?? '', imageUrl: vehicleImageUrl }
    : null;
  const vehicle = preset ?? picked;

  function handleClose() {
    setPicked(null);
    setPickedRange(null);
    setIsResult(false);
    onClose();
  }

  const title = vehicle ? t('title') : tPicker('title');
  // Figma `24565:59739`: bước chọn xe có phụ đề dưới tiêu đề; tên khả truy cập vẫn là tiêu đề.
  const header = vehicle ? (
    title
  ) : (
    <span className={styles.titleBlock}>
      <span>{title}</span>
      <span className={styles.subtitle}>{tPicker('subtitle')}</span>
    </span>
  );

  return (
    <ResponsiveDialog
      // Hộp kết quả tự có tiêu đề lớn — tên hộp vẫn còn cho trình đọc màn hình.
      {...(isResult ? { hideHeaderTitle: true as const, ariaLabel: title } : { title: header })}
      open={open}
      onClose={handleClose}
      size={isResult ? 'fit' : 'xl'}
      // Bố cục hai cột tự cuộn từng bên (RequestBookingFlow `.left`/`.right`, StaffVehiclePicker
      // `.scroller`) — thân overlay phải khoá cuộn để không thành hai lớp lồng nhau.
      // Bước chọn xe: thân cao THEO NỘI DUNG (Figma `24565:59738` ôm sát lưới thẻ) — bộ chọn tự
      // giới hạn chiều cao và chỉ cho lưới cuộn, nên thân khoá cuộn (`pickerBody`).
      bodyScroll={vehicle ? 'content' : 'body'}
      mobileMode="fullscreen"
      footer={null}
      confirmLoading={busy}
      className={
        isResult
          ? bookingResultDialogClassNames.className
          : vehicle
            ? undefined
            : styles.pickerDialog
      }
      bodyClassName={
        isResult
          ? bookingResultDialogClassNames.bodyClassName
          : vehicle
            ? undefined
            : styles.pickerBody
      }
    >
      {!open ? null : vehicle ? (
        <StaffBookingFlow
          vehicleId={vehicle.id}
          vehicleName={vehicle.name}
          vehicleImageUrl={vehicle.imageUrl}
          pickupAt={preset ? pickupAt : (pickedRange?.pickupAt ?? pickupAt)}
          returnAt={preset ? returnAt : (pickedRange?.returnAt ?? returnAt)}
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
          defaultBranchId={defaultBranchId}
          initialRange={pickedRange}
          onCancel={handleClose}
          onContinue={(item, range) => {
            setPickedRange(range);
            setPicked({ id: item.id, name: item.name, imageUrl: item.mainImageUrl });
          }}
        />
      )}
    </ResponsiveDialog>
  );
}
