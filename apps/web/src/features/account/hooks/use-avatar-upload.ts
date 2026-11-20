'use client';

import { App } from 'antd';
import { useState } from 'react';

import { useUploadRejectionMessage } from '@/i18n/use-upload-rejection-message';
import { getErrorMessage } from '@/services/api-client';
import { presignAvatar, uploadImage, validateImageSelection } from '@/services/upload';

/**
 * Tải ẢNH ĐẠI DIỆN của tài khoản lên R2 - một luồng cho mọi ô chọn ảnh đại diện (hộp "Cập nhật
 * thông tin" của site khách, nút máy ảnh của trang Tài khoản & bảo mật partner).
 *
 * Kiểm định dạng/cỡ trước (`validateImageSelection`), PUT thẳng lên R2 qua `presignAvatar`, rồi trao URL
 * công khai cho nơi gọi. Ảnh CHƯA lưu vào hồ sơ: form của nơi gọi giữ nó tới khi bấm Lưu.
 *
 * `select` trả `false` để dùng thẳng làm `beforeUpload` của AntD `Upload` - chặn lượt tải mặc định.
 */
export function useAvatarUpload(onUploaded: (url: string, fileName: string) => void) {
  const { message } = App.useApp();
  const uploadRejectionMessage = useUploadRejectionMessage();
  const [progress, setProgress] = useState<number | null>(null);

  function select(file: File): false {
    const invalid = validateImageSelection(file);
    if (invalid) {
      message.error(uploadRejectionMessage(invalid));
      return false;
    }
    setProgress(0);
    uploadImage(file, presignAvatar, setProgress)
      .then((url) => onUploaded(url, file.name))
      .catch((err: unknown) => message.error(getErrorMessage(err)))
      .finally(() => setProgress(null));
    return false;
  }

  return { select, uploading: progress !== null, progress: progress ?? 0 };
}
