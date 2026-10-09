'use client';

import {
  CameraOutlined,
  CheckCircleOutlined,
  IdcardOutlined,
  PictureOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { Alert, Button, Progress } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { useSubmitDriverLicence } from '../hooks/use-driver-licence';
import {
  PrepareImageError,
  prepareLicenceImage,
  type PrepareImageRejection,
} from '../prepare-licence-image';
import styles from './DriverLicenceUploader.module.css';

const TIP_KEYS = ['front', 'corners', 'light', 'flat'] as const;

/**
 * Chọn / chụp ảnh mặt trước bằng lái → xem lại → gửi.
 *
 * Ảnh được chuẩn bị NGAY khi chọn (thu nhỏ, xoay đúng chiều, bỏ EXIF) để khung xem trước hiện
 * đúng thứ sẽ được gửi đi, và để lỗi "ảnh quá nhỏ / không mở được" hiện trước khi khách bấm gửi.
 *
 * Trên thiết bị cảm ứng có thêm nút "Chụp ảnh" mở thẳng camera sau (`capture="environment"`);
 * trên máy tính chỉ còn vùng kéo-thả / chọn tệp — hai nút cùng mở một hộp chọn tệp chỉ gây rối.
 */
export function DriverLicenceUploader({
  onSubmitted,
  showTips = true,
}: {
  /** Gửi xong (lượt nộp đã sang "đang đọc") — nơi gọi đổi màn hình nếu cần. */
  onSubmitted?: () => void;
  showTips?: boolean;
}) {
  const t = useTranslations('DriverLicence');
  const errorMessage = useErrorMessage();
  const submit = useSubmitDriverLicence();

  const fileInput = useRef<HTMLInputElement | null>(null);
  const cameraInput = useRef<HTMLInputElement | null>(null);
  const [prepared, setPrepared] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [rejection, setRejection] = useState<PrepareImageRejection | null>(null);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);

  // URL xem trước là một blob trong bộ nhớ trình duyệt — thu hồi khi đổi ảnh hoặc rời màn.
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function pick(raw: File | undefined) {
    if (!raw || preparing || submit.isPending) return;
    setRejection(null);
    submit.reset();
    setPreparing(true);
    try {
      const file = await prepareLicenceImage(raw);
      setPrepared(file);
      setPreviewUrl(URL.createObjectURL(file));
    } catch (error) {
      setRejection(error instanceof PrepareImageError ? error.reason : 'unsupported');
    } finally {
      setPreparing(false);
    }
  }

  function clear() {
    setPrepared(null);
    setPreviewUrl(null);
    setProgress(0);
    submit.reset();
  }

  function send() {
    if (!prepared || submit.isPending) return;
    setProgress(0);
    submit.mutate(
      { file: prepared, onProgress: setProgress },
      {
        onSuccess: () => {
          clear();
          onSubmitted?.();
        },
      },
    );
  }

  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    void pick(event.dataTransfer.files[0]);
  }

  const inputs = (
    <>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className={styles.hiddenInput}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          void pick(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className={styles.hiddenInput}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          void pick(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </>
  );

  if (prepared && previewUrl) {
    const sending = submit.isPending;
    return (
      <div className={styles.root}>
        {inputs}
        <p className={styles.previewTitle}>{t('preview.title')}</p>
        <div className={cx(styles.previewFrame, sending && styles.previewSending)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- blob URL cục bộ, không qua next/image */}
          <img src={previewUrl} alt={t('preview.alt')} className={styles.previewImage} />
          {sending ? (
            <div className={styles.previewOverlay}>
              <Progress
                type="circle"
                percent={progress}
                size={72}
                aria-label={t('progress.uploading', { percent: progress })}
              />
              <span>{t('progress.uploading', { percent: progress })}</span>
            </div>
          ) : null}
        </div>
        {!sending ? <p className={styles.previewCheck}>{t('preview.check')}</p> : null}
        {submit.isError ? (
          <Alert
            type="error"
            showIcon
            title={errorMessage(submit.error)}
            className={styles.alert}
          />
        ) : null}
        <p className={styles.consent}>
          <SafetyCertificateOutlined aria-hidden="true" />
          <span>{t('consent')}</span>
        </p>
        <div className={styles.previewActions}>
          <Button icon={<ReloadOutlined aria-hidden="true" />} onClick={clear} disabled={sending}>
            {t('preview.retake')}
          </Button>
          <Button
            type="primary"
            icon={<CheckCircleOutlined aria-hidden="true" />}
            loading={sending}
            onClick={send}
          >
            {t('preview.submit')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {inputs}
      <button
        type="button"
        className={cx(styles.dropzone, dragging && styles.dropzoneActive)}
        onClick={() => fileInput.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        disabled={preparing}
        aria-busy={preparing}
      >
        <span className={styles.cardSilhouette} aria-hidden="true">
          <IdcardOutlined />
        </span>
        {preparing ? (
          <span className={styles.dropTitle}>{t('picker.preparing')}</span>
        ) : (
          <>
            <span className={cx(styles.dropTitle, styles.dropTitleDesktop)}>
              {t('picker.dropTitle')}
            </span>
            <span className={cx(styles.dropTitle, styles.dropTitleTouch)}>
              {t('picker.tapTitle')}
            </span>
          </>
        )}
        <span className={styles.dropHint}>{t('picker.dropHint')}</span>
        <span className={styles.dropFormats}>{t('picker.formats')}</span>
      </button>

      <div className={styles.pickerActions}>
        <Button
          type="primary"
          size="large"
          icon={<CameraOutlined aria-hidden="true" />}
          className={styles.cameraButton}
          onClick={() => cameraInput.current?.click()}
          disabled={preparing}
        >
          {t('picker.takePhoto')}
        </Button>
        <Button
          size="large"
          icon={<PictureOutlined aria-hidden="true" />}
          className={styles.fileButton}
          onClick={() => fileInput.current?.click()}
          disabled={preparing}
        >
          {t('picker.chooseFile')}
        </Button>
      </div>

      {rejection ? (
        <Alert type="warning" showIcon title={t(`prepare.${rejection}`)} className={styles.alert} />
      ) : null}

      {showTips ? (
        <div className={styles.tips}>
          <p className={styles.tipsTitle}>{t('tips.title')}</p>
          <ul className={styles.tipList}>
            {TIP_KEYS.map((key) => (
              <li key={key}>
                <CheckCircleOutlined aria-hidden="true" />
                <span>{t(`tips.${key}`)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
