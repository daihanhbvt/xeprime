'use client';

import { CloudUploadOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Form, Progress, Upload } from 'antd';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import { IMAGE_UPLOAD_MIME_TYPES } from '@xeprime/types';
import { getErrorMessage } from '@/services/api-client';
import { uploadImage, validateImageFile, type UploadPresign } from '@/services/upload';
import fieldStyles from './field.module.css';
import styles from './ImageUploadField.module.css';
import { useUploadRejectionMessage } from '@/i18n/use-upload-rejection-message';

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
  const t = useTranslations('Common.components.imageUpload');
  const tCommon = useTranslations('Common');
  const uploadRejectionMessage = useUploadRejectionMessage();
  const { field, fieldState } = useController({ control, name });
  const { message } = App.useApp();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failedUpload, setFailedUpload] = useState<{ file: File; message: string } | null>(null);

  const url = (field.value as string | null | undefined) ?? null;

  function startUpload(file: File) {
    setUploading(true);
    setProgress(0);
    setFailedUpload(null);
    (validate ? validate(file) : Promise.resolve(null))
      .then((extraError) => {
        if (extraError) throw new Error(extraError);
        return uploadImage(file, presign, setProgress);
      })
      .then((publicUrl) => field.onChange(publicUrl))
      .catch((err: unknown) => {
        const error = getErrorMessage(err);
        setFailedUpload({ file, message: error });
        message.error(error);
      })
      .finally(() => setUploading(false));
  }

  function handleSelect(file: File): false {
    const invalid = validateImageFile(file);
    if (invalid) {
      message.error(uploadRejectionMessage(invalid));
      return false;
    }
    startUpload(file);
    // Luôn chặn upload mặc định của AntD — mình tự PUT lên R2.
    return false;
  }

  return (
    <Form.Item
      label={label}
      validateStatus={fieldState.error ? 'error' : ''}
      help={fieldState.error?.message ?? help}
      className={fieldStyles.item}
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
              <img src={url} alt={t('alt')} className={styles.preview} />
            ) : (
              <span className={styles.placeholder}>
                {uploading ? (
                  <Progress
                    type="circle"
                    percent={progress}
                    size={48}
                    aria-label={t('progressLabel')}
                  />
                ) : (
                  <PlusOutlined />
                )}
                <span>{uploading ? t('uploading', { percent: progress }) : t('upload')}</span>
              </span>
            )}
          </button>
        </Upload>
        {/*
          Ảnh đã có: "Thay đổi" nói ra được việc mà tấm ảnh vốn đã làm khi bấm vào. Ô ảnh trông
          như một tấm hình chứ không như một nút, nên nếu chỉ có "Xoá" thì lối duy nhất để đổi ảnh
          là xoá đi rồi tải lại — người dùng không đoán ra bấm thẳng vào ảnh cũng được.
        */}
        {url ? (
          <div className={styles.actions}>
            <Upload
              accept={IMAGE_UPLOAD_MIME_TYPES.join(',')}
              showUploadList={false}
              beforeUpload={handleSelect}
              disabled={uploading}
            >
              <Button size="small" icon={<CloudUploadOutlined />} disabled={uploading}>
                {t('change')}
              </Button>
            </Upload>
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => field.onChange(null)}
              disabled={uploading}
            >
              {t('remove')}
            </Button>
          </div>
        ) : null}
      </div>
      {failedUpload ? (
        <div className={styles.uploadError} role="alert">
          <span>{failedUpload.message}</span>
          <Button size="small" onClick={() => startUpload(failedUpload.file)}>
            {tCommon('actions.retry')}
          </Button>
        </div>
      ) : null}
    </Form.Item>
  );
}
