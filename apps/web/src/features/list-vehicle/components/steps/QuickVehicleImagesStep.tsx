'use client';

import { CameraOutlined } from '@ant-design/icons';
import { Alert, Progress } from 'antd';
import { useTranslations } from 'next-intl';
import { useWatch, type Control } from 'react-hook-form';
import { VEHICLE_GALLERY_MAX_IMAGES, VEHICLE_PUBLIC_MIN_IMAGES } from '@xeprime/types';

import { ImageGalleryField } from '@/components/form/ImageGalleryField';
import { ImageUploadField } from '@/components/form/ImageUploadField';
import { presignVehicleImage } from '@/services/upload';

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
export function QuickVehicleImagesStep({ control }: { control: Control<QuickVehicleValues> }) {
  const t = useTranslations('ListYourVehicle.images');
  const tForm = useTranslations('Vehicles.form.media');

  const mainImageUrl = useWatch({ control, name: 'mainImageUrl' });
  const images = useWatch({ control, name: 'images' }) ?? [];

  // Ảnh đại diện thường nằm luôn trong thư viện — đếm trên tập URL đã khử trùng, đúng cách
  // backend đếm khi xét điều kiện lên chợ.
  const total = new Set([...(mainImageUrl ? [mainImageUrl] : []), ...images]).size;
  const missing = Math.max(0, VEHICLE_PUBLIC_MIN_IMAGES - total);

  return (
    <div className={styles.stack}>
      <section className={styles.block}>
        <h3 className={styles.blockTitle}>{t('title')}</h3>
        <p className={styles.blockHint}>{t('intro')}</p>

        <ImageUploadField
          control={control}
          name="mainImageUrl"
          label={tForm('mainImage')}
          presign={presignVehicleImage}
          help={t('mainImageHelp')}
        />

        <ImageGalleryField
          control={control}
          name="images"
          label={tForm('gallery')}
          presign={presignVehicleImage}
          max={VEHICLE_GALLERY_MAX_IMAGES}
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
          <Alert type="info" showIcon message={t('missing', { count: missing })} />
        ) : (
          <Alert type="success" showIcon message={t('enough')} />
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
