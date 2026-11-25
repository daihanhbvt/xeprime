'use client';

import { CameraOutlined, DeleteOutlined } from '@ant-design/icons';
import { App, Button, Upload } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import { IMAGE_UPLOAD_MAX_BYTES, IMAGE_UPLOAD_MIME_TYPES } from '@xeprime/types';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useUploadRejectionMessage } from '@/i18n/use-upload-rejection-message';
import { presignDriverPhoto, uploadImage, validateImageSelection } from '@/services/upload';
import styles from './DriverPhotoField.module.css';

const MAX_MB = Math.round(IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024));

/**
 * Ảnh TUỲ CHỌN của tài xế nội bộ — Figma `24612:140670`: ô vuông 80 bo góc, "Thay ảnh" + nút xoá
 * đỏ, dòng định dạng bên dưới. Chọn ảnh là tải lên ngay (presign → PUT thẳng R2) và field nhận URL
 * công khai; server chỉ nhận URL dưới kho ảnh tài xế của CHÍNH bên thuê.
 */
export function DriverPhotoField<T extends FieldValues>({
  control,
  name,
  disabled = false,
}: {
  control: Control<T>;
  name: Path<T>;
  disabled?: boolean;
}) {
  const t = useTranslations('Drivers.add.internal');
  const { message } = App.useApp();
  const rejection = useUploadRejectionMessage();
  const errorMessage = useErrorMessage();
  const { field } = useController({ control, name });
  const [progress, setProgress] = useState<number | null>(null);
  const url = (field.value as string | null | undefined) || null;
  const uploading = progress !== null;

  function select(file: File): false {
    const invalid = validateImageSelection(file);
    if (invalid) {
      message.error(rejection(invalid));
      return false;
    }
    setProgress(0);
    uploadImage(file, presignDriverPhoto, setProgress)
      .then((publicUrl) => field.onChange(publicUrl))
      .catch((err: unknown) => message.error(errorMessage(err)))
      .finally(() => setProgress(null));
    // Chặn upload mặc định của AntD — luồng presign tự lo.
    return false;
  }

  const picker = (
    <Upload
      accept={IMAGE_UPLOAD_MIME_TYPES.join(',')}
      showUploadList={false}
      beforeUpload={select}
      disabled={disabled || uploading}
    >
      <Button loading={uploading} disabled={disabled}>
        {url ? t('photoChange') : t('photoAdd')}
      </Button>
    </Upload>
  );

  return (
    <div className={styles.row} role="group" aria-label={t('photo')}>
      <span className={styles.tile}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- ảnh kho R2 công khai, cỡ cố định
          <img src={url} alt={t('photoAlt')} className={styles.image} />
        ) : (
          <CameraOutlined className={styles.placeholder} aria-hidden="true" />
        )}
      </span>
      <div className={styles.side}>
        <div className={styles.actions}>
          {picker}
          {url && !uploading ? (
            <Button
              danger
              icon={<DeleteOutlined />}
              aria-label={t('photoRemove')}
              disabled={disabled}
              onClick={() => field.onChange(null)}
            />
          ) : null}
        </div>
        <span className={styles.hint} aria-live="polite">
          {uploading ? t('photoUploading', { percent: progress }) : t('photoHint', { maxMb: MAX_MB })}
        </span>
      </div>
    </div>
  );
}
