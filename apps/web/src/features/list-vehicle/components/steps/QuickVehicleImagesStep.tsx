'use client';

import { Alert, Progress } from 'antd';
import { useTranslations } from 'next-intl';
import { useWatch, type Control } from 'react-hook-form';
import { missingVehicleImageTypes, requiredVehicleImageTypes } from '@xeprime/types';

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
}) {
  const t = useTranslations('ListYourVehicle.images');
  const vehicleType = useWatch({ control, name: 'vehicleType' });
  const media = useWatch({ control, name: 'media' }) ?? [];

  // Đếm theo GÓC đã có, không theo số tấm ảnh — đúng phép kiểm của schema và của backend.
  const required = requiredVehicleImageTypes(vehicleType).length;
  const missing = missingVehicleImageTypes(vehicleType, media).length;
  const done = required - missing;

  return (
    <div className={styles.stack}>
      <section className={styles.block}>
        <h3 className={styles.blockTitle}>{t('title')}</h3>
        <p className={styles.blockHint}>{t('intro')}</p>

        <TypedMediaFields control={control} vehicleType={vehicleType} presign={presign} />
      </section>

      <section className={styles.block} aria-live="polite">
        <div className={styles.counterRow}>
          <span className={styles.counterLabel}>{t('counter', { count: done, min: required })}</span>
          <Progress
            percent={required === 0 ? 100 : (done / required) * 100}
            showInfo={false}
            className={styles.counterBar}
            aria-label={t('counterAria')}
          />
        </div>
        {missing > 0 ? (
          <Alert type="info" showIcon title={t('missing', { count: missing })} />
        ) : (
          <Alert type="success" showIcon title={t('enough')} />
        )}
      </section>
    </div>
  );
}
