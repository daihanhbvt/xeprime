'use client';

import { DeleteOutlined, LoadingOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Form, Upload } from 'antd';
import { useState, type ReactNode } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import { IMAGE_UPLOAD_MIME_TYPES } from '@xeprime/types';
import { getErrorMessage } from '@/services/api-client';
import { uploadImage, validateImageFile, type UploadPresign } from '@/services/upload';
import styles from './ImageUploadField.module.css';

interface ImageUploadFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  /** `ReactNode` để feature tự gắn dấu hiệu riêng cạnh nhãn (xem `TextField`). */
  label: ReactNode;
  /** Endpoint presign theo loại ảnh (xe / gian hàng) — component không tự biết prefix. */
  presign: (file: File) => Promise<UploadPresign>;
  /**
   * Kiểm tra THÊM trước khi upload (ngoài MIME/dung lượng mặc định) — trả thông báo lỗi hoặc
   * null. Async vì có nơi phải decode ảnh để đọc kích thước thật (vd banner ép đúng tỉ lệ).
   */
  validate?: (file: File) => Promise<string | null>;
  /** Gợi ý dưới ô upload khi không có lỗi (vd cỡ ảnh chuẩn). */
  help?: ReactNode;
}

/**
 * Ô upload MỘT ảnh nối RHF ↔ AntD Upload: chọn file từ máy → presign → PUT thẳng lên R2 →
 * field nhận URL công khai (string | null, khớp schema yup hiện có). Thay cho ô dán URL cũ.
 */
export function ImageUploadField<T extends FieldValues>({
  control,
  name,
  label,
  presign,
  validate,
  help,
}: ImageUploadFieldProps<T>) {
  const { field, fieldState } = useController({ control, name });
  const { message } = App.useApp();
  const [uploading, setUploading] = useState(false);

  const url = (field.value as string | null | undefined) ?? null;

  function handleSelect(file: File): false {
    const invalid = validateImageFile(file);
    if (invalid) {
      message.error(invalid);
      return false;
    }
    setUploading(true);
    (validate ? validate(file) : Promise.resolve(null))
      .then((extraError) => {
        if (extraError) throw new Error(extraError);
        return uploadImage(file, presign);
      })
      .then((publicUrl) => field.onChange(publicUrl))
      .catch((err: unknown) => message.error(getErrorMessage(err)))
      .finally(() => setUploading(false));
    // Luôn chặn upload mặc định của AntD — mình tự PUT lên R2.
    return false;
  }

  return (
    <Form.Item
      label={label}
      validateStatus={fieldState.error ? 'error' : ''}
      help={fieldState.error?.message ?? help}
      style={{ marginBottom: 14 }}
    >
      <div className={styles.wrap}>
        <Upload
          accept={IMAGE_UPLOAD_MIME_TYPES.join(',')}
          showUploadList={false}
          beforeUpload={handleSelect}
          disabled={uploading}
        >
          <button type="button" className={styles.tile} disabled={uploading}>
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element -- ảnh trên R2, không qua next/image
              <img src={url} alt="Ảnh đã chọn" className={styles.preview} />
            ) : (
              <span className={styles.placeholder}>
                {uploading ? <LoadingOutlined /> : <PlusOutlined />}
                <span>{uploading ? 'Đang tải…' : 'Tải ảnh lên'}</span>
              </span>
            )}
          </button>
        </Upload>
        {url ? (
          <Button
            size="small"
            icon={<DeleteOutlined />}
            onClick={() => field.onChange(null)}
            disabled={uploading}
          >
            Xoá ảnh
          </Button>
        ) : null}
      </div>
    </Form.Item>
  );
}
