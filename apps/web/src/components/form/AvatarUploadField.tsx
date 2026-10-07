'use client';

import { CameraOutlined } from '@ant-design/icons';
import { App, Avatar, Button, Progress, Upload } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import { IMAGE_UPLOAD_MIME_TYPES } from '@xeprime/types';

import { useUploadRejectionMessage } from '@/i18n/use-upload-rejection-message';
import { initialOf } from '@/lib/initials';
import { getErrorMessage } from '@/services/api-client';
import { uploadImage, validateImageFile, type UploadPresign } from '@/services/upload';

import styles from './AvatarUploadField.module.css';

interface AvatarUploadFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  /** Tên để dựng chữ cái đầu khi chưa có ảnh. */
  fallbackName: string;
  presign: (file: File) => Promise<UploadPresign>;
  size?: number;
  disabled?: boolean;
}

/**
 * Ảnh đại diện BẮT BUỘC — ảnh tròn, nút "Thay đổi" nằm ngay trên ảnh, KHÔNG có nút xoá.
 *
 * Khác `ImageUploadField` (ô ảnh tổng quát có Xoá): chỗ nào dùng component này là chỗ ảnh không
 * được để trống — ví dụ ảnh của chủ xe cá nhân, thứ khách thấy trên chợ (ADR 0054). Bỏ nút xoá là
 * cách nói luật đó bằng giao diện; schema của form vẫn là nơi chặn thật (`avatarRequired`).
 *
 * Luồng tải giống hệt `ImageUploadField` (presign → PUT thẳng R2 → field nhận URL công khai), dùng
 * chung `uploadImage`/`validateImageFile` — không có bản thứ hai của luật MIME/dung lượng.
 */
export function AvatarUploadField<T extends FieldValues>({
  control,
  name,
  fallbackName,
  presign,
  size = 104,
  disabled = false,
}: AvatarUploadFieldProps<T>) {
  const t = useTranslations('Common.components.imageUpload');
  const uploadRejectionMessage = useUploadRejectionMessage();
  const { message } = App.useApp();
  const { field, fieldState } = useController({ control, name });
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const url = (field.value as string | null | undefined) || null;

  function handleSelect(file: File): false {
    const invalid = validateImageFile(file);
    if (invalid) {
      message.error(uploadRejectionMessage(invalid));
      return false;
    }
    setUploading(true);
    setProgress(0);
    uploadImage(file, presign, setProgress)
      .then((publicUrl) => field.onChange(publicUrl))
      .catch((err: unknown) => message.error(getErrorMessage(err)))
      .finally(() => setUploading(false));
    // Luôn chặn upload mặc định của AntD — mình tự PUT lên R2.
    return false;
  }

  const errorId = `${field.name}-error`;

  return (
    <div className={styles.root}>
      <div className={styles.frame}>
        <Avatar
          size={size}
          src={url ?? undefined}
          alt={t('alt')}
          className={fieldState.error ? `${styles.avatar} ${styles.avatarError}` : styles.avatar}
        >
          {initialOf(fallbackName)}
        </Avatar>
        {uploading ? (
          <div className={styles.progress}>
            <Progress
              type="circle"
              size={size - 16}
              percent={progress}
              aria-label={t('progressLabel')}
            />
          </div>
        ) : null}
      </div>

      <Upload
        accept={IMAGE_UPLOAD_MIME_TYPES.join(',')}
        showUploadList={false}
        beforeUpload={handleSelect}
        disabled={disabled || uploading}
      >
        <Button
          size="small"
          icon={<CameraOutlined />}
          disabled={disabled || uploading}
          aria-describedby={fieldState.error ? errorId : undefined}
        >
          {uploading ? t('uploading', { percent: progress }) : url ? t('change') : t('upload')}
        </Button>
      </Upload>

      {fieldState.error?.message ? (
        <p id={errorId} className={styles.error} role="alert">
          {fieldState.error.message}
        </p>
      ) : null}
    </div>
  );
}
