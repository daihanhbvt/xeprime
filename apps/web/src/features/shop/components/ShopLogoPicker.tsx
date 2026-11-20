'use client';

import { CloudUploadOutlined, DeleteOutlined, ShopOutlined } from '@ant-design/icons';
import { App, Button, Form, Upload } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, type ReactNode } from 'react';
import { IMAGE_UPLOAD_MAX_BYTES, IMAGE_UPLOAD_MIME_TYPES } from '@xeprime/types';

import { useUploadRejectionMessage } from '@/i18n/use-upload-rejection-message';
import { cx } from '@/lib/cx';
import { validateImageSelection } from '@/services/upload';

import styles from './ShopLogoPicker.module.css';

/** Ảnh logo đã chọn ở máy, CHƯA tải lên - kèm URL xem trước (`blob:`) do chính ô này cấp và thu hồi. */
export interface PickedLogo {
  file: File;
  previewUrl: string;
}

const MAX_MB = Math.round(IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024));

/**
 * Ô LOGO của form đăng ký gian hàng (ADR 0103) - chọn ảnh từ máy và xem trước NGAY, nhưng chưa tải
 * lên: lúc điền form gian hàng chưa tồn tại, mà đường ký URL ảnh gian hàng
 * (`/uploads/shop-media/presign`) cần một gian hàng. Form tạo gian hàng xong mới tải tệp này lên rồi
 * gắn vào hồ sơ.
 *
 * Khác `ImageUploadField` ở đúng chỗ đó - ô kia tải lên ngay khi chọn và giữ URL công khai trong RHF.
 * Giá trị ở đây là một `File`, nên nó KHÔNG đi qua RHF/schema (schema đăng ký dùng chung với app
 * native, nơi chưa có ô này): nơi gọi giữ state và tự báo lỗi "chưa chọn logo".
 */
export function ShopLogoPicker({
  id,
  value,
  onChange,
  error,
  disabled = false,
}: {
  /** `id` của nút chọn ảnh - nơi gọi đặt tiêu điểm vào đây khi thiếu logo. */
  id: string;
  value: PickedLogo | null;
  onChange: (next: PickedLogo | null) => void;
  /** Chữ lỗi dưới ô; `null` = không lỗi. */
  error: string | null;
  disabled?: boolean;
}) {
  const t = useTranslations('ShopOnboarding.signup.fields.logo');
  const { message } = App.useApp();
  const rejection = useUploadRejectionMessage();

  /*
   * Thu hồi URL `blob:` khi ảnh bị thay/xoá và khi ô bị tháo - một URL không thu hồi giữ nguyên tấm
   * ảnh trong bộ nhớ tới khi đóng tab. Ref giữ URL MỚI NHẤT để cleanup lúc tháo không đọc giá trị cũ.
   */
  const latest = useRef<string | null>(value?.previewUrl ?? null);
  useEffect(() => {
    latest.current = value?.previewUrl ?? null;
  }, [value]);
  useEffect(
    () => () => {
      if (latest.current) URL.revokeObjectURL(latest.current);
    },
    [],
  );

  function replace(next: PickedLogo | null) {
    if (value) URL.revokeObjectURL(value.previewUrl);
    onChange(next);
  }

  function select(file: File): false {
    const invalid = validateImageSelection(file);
    if (invalid) {
      message.error(rejection(invalid));
    } else {
      replace({ file, previewUrl: URL.createObjectURL(file) });
    }
    // Chặn upload mặc định của AntD - tệp chỉ được tải lên sau khi gian hàng đã tạo.
    return false;
  }

  const picker = (children: ReactNode) => (
    <Upload
      accept={IMAGE_UPLOAD_MIME_TYPES.join(',')}
      showUploadList={false}
      beforeUpload={select}
      disabled={disabled}
    >
      {children}
    </Upload>
  );

  return (
    <Form.Item
      label={t('label')}
      required
      validateStatus={error ? 'error' : ''}
      help={error ?? undefined}
      className={styles.item}
    >
      <div className={styles.row}>
        {picker(
          <button
            type="button"
            className={cx(styles.tile, value && styles.tileFilled, error && styles.tileError)}
            disabled={disabled}
            aria-label={value ? t('change') : t('choose')}
          >
            {value ? (
              // eslint-disable-next-line @next/next/no-img-element -- ảnh `blob:` ở máy, không qua next/image
              <img src={value.previewUrl} alt={t('previewAlt')} className={styles.preview} />
            ) : (
              <span className={styles.placeholder}>
                <ShopOutlined aria-hidden />
                <span>{t('tile')}</span>
              </span>
            )}
          </button>,
        )}
        <div className={styles.side}>
          <p className={styles.hint}>{t('hint', { maxMb: MAX_MB })}</p>
          <div className={styles.actions}>
            {picker(
              <Button id={id} icon={<CloudUploadOutlined />} disabled={disabled}>
                {value ? t('change') : t('choose')}
              </Button>,
            )}
            {value ? (
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                disabled={disabled}
                onClick={() => replace(null)}
              >
                {t('remove')}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </Form.Item>
  );
}
