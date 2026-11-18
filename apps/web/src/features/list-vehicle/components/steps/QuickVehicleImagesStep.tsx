'use client';

import type { ReactNode } from 'react';
import { useWatch, type Control } from 'react-hook-form';

import { TypedMediaFields } from '@/features/vehicles/components/TypedMediaFields';
import { presignVehicleImage } from '@/services/upload';
import type { UploadPresign } from '@/services/upload';

import type { QuickVehicleValues } from '../../schema';
import styles from './QuickVehicleSteps.module.css';

/**
 * Bước 3 — hình ảnh xe.
 *
 * Dùng đúng đường tải ảnh đang chạy: presign → PUT thẳng lên R2 → URL công khai, cùng bộ kiểm
 * tra tệp và cùng bảng ảnh (`VehicleImageBoard`) với màn sửa xe. Không có luồng upload thứ hai,
 * và tuyệt đối không có giấy tờ riêng tư ở đây — chúng đi qua kho riêng có signed URL.
 *
 * Bộ đếm nói thẳng còn thiếu mấy GÓC (07/10/2026): ô tô 5, xe máy 2 — không còn một con số "tối
 * thiểu 4 ảnh" chung, thứ vừa cho năm tấm ảnh mặt trước đi qua vừa báo thiếu với một chiếc xe
 * máy đã có đủ hai tấm cần thiết. Danh sách "góc chụp gợi ý" cũng không còn: mỗi góc nay là một
 * ô có nhãn bắt buộc ngay trên bảng ảnh, nên nhắc lại nó bên dưới là nhắc một việc đã làm.
 */
export function QuickVehicleImagesStep({
  control,
  presign = presignVehicleImage,
  extraTiles,
}: {
  control: Control<QuickVehicleValues>;
  /**
   * Cho phép nơi gọi BỌC lời gọi presign.
   *
   * Người đăng ký chiếc xe đầu tiên chưa có gian hàng, mà `/uploads/vehicle-images/presign` là
   * tenant-scoped — wizard dùng chỗ này để mở gian hàng ngay trước tấm ảnh đầu tiên. Vẫn là
   * ĐÚNG một đường tải ảnh: chỉ có thêm một việc xảy ra trước nó.
   */
  presign?: (file: File) => Promise<UploadPresign>;
  /** Ô thêm vào cuối lưới ảnh - ô "Cà vẹt xe" (ADR 0099). */
  extraTiles?: ReactNode;
}) {
  const vehicleType = useWatch({ control, name: 'vehicleType' });


  return (
    <div className={styles.stack}>
      {/* Tiêu đề + lời dẫn do thẻ "Ảnh xe" (`WizardSection`) của wizard vẽ - không nói hai lần. */}
      <section className={styles.block}>
        <TypedMediaFields
          control={control}
          vehicleType={vehicleType}
          presign={presign}
          variant="compact"
          extraTiles={extraTiles}
        />
      </section>

    </div>
  );
}
