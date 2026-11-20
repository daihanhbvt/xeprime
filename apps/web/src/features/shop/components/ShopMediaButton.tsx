'use client';

import { App, Button, Upload } from 'antd';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { IMAGE_UPLOAD_MIME_TYPES } from '@xeprime/types';

import { useUploadRejectionMessage } from '@/i18n/use-upload-rejection-message';
import { getErrorMessage } from '@/services/api-client';
import { presignShopMedia, uploadImage, validateImageSelection } from '@/services/upload';

/**
 * Nút "Đổi logo" / "Đổi ảnh bìa" của thẻ Thông tin hiển thị - chọn ảnh, tải thẳng lên R2 (cùng
 * đường `presignShopMedia` của ô ảnh cũ), rồi trao URL cho nơi gọi. Ảnh CHƯA lưu vào hồ sơ: thẻ
 * hiện bản xem trước, cặp "Hủy · Lưu thay đổi" quyết định (design 06/11/2026).
 */
export function ShopMediaButton({
  id,
  icon,
  label,
  disabled,
  onUploaded,
}: {
  /** `SHOP_LOGO_TRIGGER_ID` cho nút logo - dải chào mừng và lỗi thiếu logo nhắm vào nó. */
  id?: string;
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  onUploaded: (url: string) => void;
}) {
  const t = useTranslations('Common.components.imageUpload');
  const { message } = App.useApp();
  const rejection = useUploadRejectionMessage();
  const [progress, setProgress] = useState<number | null>(null);

  function select(file: File): false {
    const invalid = validateImageSelection(file);
    if (invalid) {
      message.error(rejection(invalid));
      return false;
    }
    setProgress(0);
    uploadImage(file, presignShopMedia, setProgress)
      .then(onUploaded)
      .catch((err: unknown) => message.error(getErrorMessage(err)))
      .finally(() => setProgress(null));
    // Chặn upload mặc định của AntD - mình tự PUT lên R2.
    return false;
  }

  const uploading = progress !== null;
  return (
    <Upload
      accept={IMAGE_UPLOAD_MIME_TYPES.join(',')}
      showUploadList={false}
      beforeUpload={select}
      disabled={disabled || uploading}
    >
      <Button id={id} block icon={icon} loading={uploading} disabled={disabled}>
        {uploading ? t('uploading', { percent: progress }) : label}
      </Button>
    </Upload>
  );
}
