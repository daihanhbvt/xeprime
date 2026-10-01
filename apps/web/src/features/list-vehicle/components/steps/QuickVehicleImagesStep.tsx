'use client';

import { CameraOutlined } from '@ant-design/icons';
import { Alert, Progress } from 'antd';
import { useTranslations } from 'next-intl';
import { useWatch, type Control } from 'react-hook-form';
import { VEHICLE_PUBLIC_MIN_IMAGES } from '@xeprime/types';

import { TypedMediaFields } from '@/features/vehicles/components/TypedMediaFields';
import { presignVehicleImage } from '@/services/upload';
import type { UploadPresign } from '@/services/upload';

import type { QuickVehicleValues } from '../../schema';
import styles from './QuickVehicleSteps.module.css';

/** Bốn góc chụp nên có — GỢI Ý, không phải bốn ô bắt buộc đúng loại. */
const ANGLES = ['front', 'rear', 'side', 'interior'] as const;

/**
 * Bước 3 — hình ảnh xe.
 *
 * Dùng đúng đường tải ảnh đang chạy: presign → PUT thẳng lên R2 → URL công khai, cùng bộ kiểm
 * tra tệp và cùng hai component (`ImageUploadField` cho ảnh đại diện, `ImageGalleryField` cho
 * thư viện). Không có luồng upload thứ hai, và tuyệt đối không có giấy tờ riêng tư ở đây —
 * chúng đi qua kho riêng có signed URL.
 *
 * Bộ đếm nói thẳng còn thiếu mấy ảnh để GỬI DUYỆT được. Thiếu vẫn lưu nháp được: chặn người
 * dùng ở bước cuối vì thiếu một tấm ảnh là cách chắc chắn để mất luôn chiếc xe đó.
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
  const mainImageUrl = useWatch({ control, name: 'mainImageUrl' });
  const images = useWatch({ control, name: 'images' }) ?? [];
  const media = useWatch({ control, name: 'media' }) ?? [];

  // Ảnh đại diện thường nằm luôn trong thư viện — đếm trên tập URL đã khử trùng, đúng cách
  // backend đếm khi xét điều kiện lên chợ.
  const total = new Set([
    ...(mainImageUrl ? [mainImageUrl] : []),
    ...images,
    ...media.map((item) => item.url),
  ]).size;
  const missing = Math.max(0, VEHICLE_PUBLIC_MIN_IMAGES - total);

  return (
    <div className={styles.stack}>
      <section className={styles.block}>
        <h3 className={styles.blockTitle}>{t('title')}</h3>
        <p className={styles.blockHint}>{t('intro')}</p>

        <TypedMediaFields
          control={control}
          vehicleType={useWatch({ control, name: 'vehicleType' })}
          presign={presign}
        />
      </section>

      <section className={styles.block} aria-live="polite">
        <div className={styles.counterRow}>
          <span className={styles.counterLabel}>
            {t('counter', { count: total, min: VEHICLE_PUBLIC_MIN_IMAGES })}
          </span>
          <Progress
            percent={Math.min(100, (total / VEHICLE_PUBLIC_MIN_IMAGES) * 100)}
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

      <section className={styles.block}>
        <h3 className={styles.blockTitle}>
          <CameraOutlined aria-hidden="true" /> {t('anglesTitle')}
        </h3>
        <ul className={styles.angles}>
          {ANGLES.map((angle) => (
            <li key={angle}>{t(`angles.${angle}`)}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
