'use client';

import { CloudUploadOutlined, DeleteOutlined } from '@ant-design/icons';
import { Button, Progress, Upload } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useController, type Control } from 'react-hook-form';
import { IMAGE_UPLOAD_MAX_BYTES, IMAGE_UPLOAD_MIME_TYPES } from '@xeprime/types';

import { initialOf } from '@/lib/initials';

import type { AccountProfileValues } from '@xeprime/validators';
import { useAvatarUpload } from '../hooks/use-avatar-upload';
import styles from './ProfileAvatarPicker.module.css';

const MAX_MB = Math.round(IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024));

/**
 * Ô ảnh đại diện của hộp "Cập nhật thông tin" (Figma `20063:65345`): ảnh vuông 100px, bên phải là
 * tên file + nút xoá và dòng gợi ý định dạng.
 *
 * Luồng tải là của `uploadImage`/`validateImageFile` như `ImageUploadField` — chỉ bố cục khác.
 * Tên file chỉ biết khi người dùng vừa chọn trong lượt này; ảnh đã lưu từ trước hiện "Ảnh hiện
 * tại" thay vì một khoá R2 vô nghĩa với họ.
 */
export function ProfileAvatarPicker({
  control,
  fallbackName,
  disabled = false,
}: {
  control: Control<AccountProfileValues>;
  fallbackName: string;
  disabled?: boolean;
}) {
  const t = useTranslations('Account.profileEdit');
  const tUpload = useTranslations('Common.components.imageUpload');
  const { field, fieldState } = useController({ control, name: 'avatarUrl' });
  const [fileName, setFileName] = useState<string | null>(null);
  const {
    select: handleSelect,
    uploading,
    progress,
  } = useAvatarUpload((publicUrl, name) => {
    field.onChange(publicUrl);
    setFileName(name);
  });

  const url = field.value || null;
  const locked = disabled || uploading;

  function remove() {
    field.onChange(null);
    setFileName(null);
  }

  return (
    <div className={styles.root}>
      <Upload
        accept={IMAGE_UPLOAD_MIME_TYPES.join(',')}
        showUploadList={false}
        beforeUpload={handleSelect}
        disabled={locked}
      >
        <button type="button" className={styles.tile} disabled={locked} aria-label={t('pick')}>
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- ảnh trên R2, không qua next/image
            <img src={url} alt={tUpload('alt')} className={styles.image} />
          ) : (
            <span className={styles.initial}>{initialOf(fallbackName)}</span>
          )}
          {uploading ? (
            <span className={styles.progress}>
              <Progress type="circle" size={64} percent={progress} aria-label={tUpload('progressLabel')} />
            </span>
          ) : null}
        </button>
      </Upload>

      <div className={styles.meta}>
        <div className={styles.nameRow}>
          {url ? (
            <>
              <span className={styles.fileName}>{fileName ?? t('currentPhoto')}</span>
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={remove}
                disabled={locked}
                aria-label={t('remove')}
              />
            </>
          ) : (
            <Upload
              accept={IMAGE_UPLOAD_MIME_TYPES.join(',')}
              showUploadList={false}
              beforeUpload={handleSelect}
              disabled={locked}
            >
              <Button icon={<CloudUploadOutlined />} disabled={locked}>
                {uploading ? tUpload('uploading', { percent: progress }) : tUpload('upload')}
              </Button>
            </Upload>
          )}
        </div>
        <p className={styles.help}>{t('avatarHelp', { max: MAX_MB })}</p>
        {fieldState.error?.message ? (
          <p className={styles.error} role="alert">
            {fieldState.error.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
