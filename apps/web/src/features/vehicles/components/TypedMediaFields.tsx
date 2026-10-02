'use client';

import { useEffect, useRef } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';

import {
  VehicleImageBoard,
  type MediaUpdater,
  type VehicleMediaItem,
} from '@/features/vehicle-manage/components/VehicleImageBoard';
import { presignVehicleImage, type UploadPresign } from '@/services/upload';

import styles from './TypedMediaFields.module.css';

/**
 * Bước ẢNH của hai WIZARD THÊM XE (nhanh + nâng cao) — CÙNG màn ảnh với mục "Hình ảnh" của màn
 * sửa xe (30/09/2026): ảnh chính + các ô theo vị trí, thanh tiến trình, thử lại khi hỏng, kéo thả.
 *
 * Phần hiển thị + upload là `VehicleImageBoard`. Khác biệt DUY NHẤT với màn sửa: ở đây ảnh là
 * trường RHF (`media` + `mainImageUrl`) và đi cùng một lần `POST /vehicles` với mọi trường khác
 * — lúc thêm xe chưa có `vehicleId` nào để `PATCH`.
 *
 * Giữ mảng `images` song song với `media`: payload cũ và thao tác "xoá hết" có chủ đích vẫn chạy
 * như trước.
 */
export function TypedMediaFields<T extends FieldValues>({
  control,
  vehicleType,
  vehicleName = '',
  mediaName = 'media' as Path<T>,
  mainName = 'mainImageUrl' as Path<T>,
  presign = presignVehicleImage,
  onUploadingChange,
}: {
  control: Control<T>;
  vehicleType: string;
  vehicleName?: string;
  mediaName?: Path<T>;
  mainName?: Path<T>;
  /** Wizard đăng nhanh truyền bản MỞ GIAN HÀNG trước tấm ảnh đầu tiên — xem `QuickVehicleWizard`. */
  presign?: (file: File) => Promise<UploadPresign>;
  /** Có ảnh đang tải — wizard chặn "Tiếp tục"/"Lưu" để không gửi thiếu ảnh. */
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const { field, fieldState: mediaState } = useController({ control, name: mediaName });
  const { field: legacyImages } = useController({ control, name: 'images' as Path<T> });
  const { field: mainField, fieldState: mainState } = useController({ control, name: mainName });

  const mediaValue = field.value as VehicleMediaItem[] | undefined;
  /*
   * Upload chạy bất đồng bộ: khi một tấm tải xong, danh sách của lần render đã sinh ra lời gọi có
   * thể đã cũ. Bản kế tiếp luôn dựng từ ref, không từ closure. Ref đồng bộ trong effect (React
   * Compiler cấm đọc/ghi ref trong thân render); `onItemsChange` ghi ref ngay khi đổi.
   */
  const itemsRef = useRef<VehicleMediaItem[]>(mediaValue ?? []);
  useEffect(() => {
    itemsRef.current = mediaValue ?? [];
  }, [mediaValue]);

  const onItemsChange: MediaUpdater = (update) => {
    const next = update(itemsRef.current);
    itemsRef.current = next;
    field.onChange(next);
    legacyImages.onChange(next.map((item) => item.url));
  };

  return (
    <div className={styles.stack}>
      <VehicleImageBoard
        vehicleType={vehicleType}
        vehicleName={vehicleName}
        main={(mainField.value as string | null | undefined) ?? null}
        onMainChange={(url) => mainField.onChange(url)}
        items={mediaValue ?? []}
        onItemsChange={onItemsChange}
        canEdit
        presign={presign}
        onUploadingChange={onUploadingChange}
        mainError={mainState.error?.message}
      />
      {/* Chưa đủ số ảnh tối thiểu để lên chợ — lỗi của form, hiện ngay dưới bảng ảnh. */}
      {mediaState.error?.message ? (
        <p className={styles.error} role="alert">
          {mediaState.error.message}
        </p>
      ) : null}
    </div>
  );
}
