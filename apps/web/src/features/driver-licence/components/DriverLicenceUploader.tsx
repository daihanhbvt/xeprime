'use client';

import {
  CameraOutlined,
  CheckCircleFilled,
  CloudUploadOutlined,
  LoadingOutlined,
  PictureOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Alert, Button } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { useDriverLicenceImage, useSubmitDriverLicence } from '../hooks/use-driver-licence';
import {
  PrepareImageError,
  prepareLicenceImage,
  type PrepareImageRejection,
} from '../prepare-licence-image';
import type { DriverLicence } from '../types';
import styles from './DriverLicenceUploader.module.css';

type StepState = 'done' | 'active' | 'todo';

/** Màn cảm ứng ⇒ chạm vào khung là mở camera sau; chuột ⇒ mở hộp chọn tệp. Hỏi lúc BẤM, không lúc render. */
const isTouchScreen = () =>
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

/**
 * Chọn / chụp ảnh mặt trước bằng lái → GỬI NGAY → tiến trình xác thực hiện TẠI CHỖ.
 *
 * Khung chọn mang dáng một tấm bằng lái (thẻ ID-1, 85,6 × 54 mm — ô chân dung bên trái, chữ bên
 * phải) để khách hiểu "đặt bằng vào đây" mà không phải đọc. Chọn xong, ảnh hiện ngay TRONG chính
 * khung đó kèm vạch quét, ba bước hiện ngay bên dưới — không đổi bố cục giữa "chọn" và "đang đọc".
 *
 * Không có bước "xem lại rồi bấm gửi": chọn xong là tải lên và máy đọc luôn; ảnh không dùng được
 * thì kết quả nói rõ vì sao và khách chọn ảnh khác ngay tại đây. Ảnh được chuẩn bị ở trình duyệt
 * trước khi tải (thu nhỏ, xoay đúng chiều, bỏ EXIF), nên ảnh hỏng/quá nhỏ bị báo trước khi gửi.
 *
 * Màn cảm ứng: chạm vào khung là chụp bằng camera sau, kèm lối "Chọn ảnh có sẵn". Máy tính: kéo
 * thả hoặc bấm để chọn tệp.
 */
export function DriverLicenceUploader({
  processing,
  onPick,
  onSubmitted,
}: {
  /** Lượt nộp ĐANG ĐƯỢC ĐỌC ở server (`processing`), hoặc `null`. */
  processing: DriverLicence | null;
  /** Khách vừa chọn một ảnh mới — nơi chứa ẩn kết quả CŨ (lý do bị từ chối) đi. */
  onPick?: () => void;
  /** Tải xong (lượt nộp đã sang "đang đọc"). */
  onSubmitted?: () => void;
}) {
  const t = useTranslations('DriverLicence');
  const errorMessage = useErrorMessage();
  const submit = useSubmitDriverLicence();

  const fileInput = useRef<HTMLInputElement | null>(null);
  const cameraInput = useRef<HTMLInputElement | null>(null);
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

  // Máy đọc xong (lượt nộp rời `processing`): về lại trạng thái chọn ảnh cho lần sau.
  const processingId = processing?.id ?? null;
  const [trackedId, setTrackedId] = useState<string | null>(processingId);
  if (trackedId !== processingId) {
    setTrackedId(processingId);
    if (processingId === null && !submit.isPending) {
      setPreviewUrl(null);
      setProgress(0);
    }
  }

  // Tải lại trang giữa lúc máy đang đọc thì không còn ảnh cục bộ — lấy ảnh đã nộp từ server.
  const serverImage = useDriverLicenceImage(processing && !previewUrl ? processing.id : null);

  const busy = preparing || submit.isPending || processing !== null;

  async function pick(raw: File | undefined) {
    if (!raw || busy) return;
    onPick?.();
    setRejection(null);
    submit.reset();
    setPreparing(true);
    let file: File;
    try {
      file = await prepareLicenceImage(raw);
    } catch (error) {
      setRejection(error instanceof PrepareImageError ? error.reason : 'unsupported');
      setPreparing(false);
      return;
    }
    setPreviewUrl(URL.createObjectURL(file));
    setPreparing(false);
    setProgress(0);
    submit.mutate(
      { file, onProgress: setProgress },
      {
        onSuccess: () => onSubmitted?.(),
        // Tải hỏng: bỏ ảnh xem trước, khách chọn lại ngay ở đây (lỗi hiện bên dưới).
        onError: () => setPreviewUrl(null),
      },
    );
  }

  function openPicker() {
    (isTouchScreen() ? cameraInput : fileInput).current?.click();
  }

  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    void pick(event.dataTransfer.files[0]);
  }

  const steps: { key: 'upload' | 'read' | 'check'; state: StepState }[] = [
    { key: 'upload', state: processing ? 'done' : 'active' },
    { key: 'read', state: processing ? 'active' : 'todo' },
    { key: 'check', state: 'todo' },
  ];
  const image = previewUrl ?? serverImage.data?.url ?? null;

  return (
    <div className={styles.root}>
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

      {busy ? (
        <div className={cx(styles.card, styles.cardBusy)}>
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob cục bộ / URL ký ngắn hạn của kho riêng tư
            <img src={image} alt="" className={styles.cardImage} />
          ) : (
            <div className={styles.cardPlaceholder} />
          )}
          <span className={styles.scanLine} aria-hidden="true" />
        </div>
      ) : (
        <button
          type="button"
          className={cx(styles.card, styles.cardPicker, dragging && styles.cardDragging)}
          onClick={openPicker}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {/* Dáng mặt trước bằng lái: dải tiêu đề, ô chân dung bên trái — chỉ để nhận ra, không chữ. */}
          <span className={styles.sketchTitle} aria-hidden="true" />
          <span className={styles.sketchPhoto} aria-hidden="true">
            <UserOutlined />
          </span>
          <span className={styles.cardText}>
            <span className={styles.cardIcon} aria-hidden="true">
              <CloudUploadOutlined className={styles.onPointer} />
              <CameraOutlined className={styles.onTouch} />
            </span>
            <span className={cx(styles.cardTitle, styles.onPointer)}>{t('picker.dropTitle')}</span>
            <span className={cx(styles.cardTitle, styles.onTouch)}>{t('picker.tapTitle')}</span>
            <span className={styles.cardHint}>{t('picker.hint')}</span>
          </span>
        </button>
      )}

      {busy ? (
        <div className={styles.progress} role="status" aria-live="polite">
          <p className={styles.progressTitle}>
            {preparing ? t('picker.preparing') : t('progress.title')}
          </p>
          <ol className={styles.steps}>
            {steps.map((step) => (
              <li key={step.key} className={cx(styles.step, styles[`step_${step.state}`])}>
                <span className={styles.stepIcon} aria-hidden="true">
                  {step.state === 'done' ? (
                    <CheckCircleFilled />
                  ) : step.state === 'active' ? (
                    <LoadingOutlined />
                  ) : (
                    <span className={styles.stepDot} />
                  )}
                </span>
                <span>
                  {t(`progress.steps.${step.key}`)}
                  {step.key === 'upload' && submit.isPending && progress > 0
                    ? ` · ${progress}%`
                    : null}
                </span>
              </li>
            ))}
          </ol>
          <p className={styles.progressHint}>{t('progress.hint')}</p>
        </div>
      ) : (
        <div className={styles.onTouch}>
          <Button
            type="link"
            icon={<PictureOutlined aria-hidden="true" />}
            onClick={() => fileInput.current?.click()}
          >
            {t('picker.chooseFile')}
          </Button>
        </div>
      )}

      {rejection ? (
        <Alert type="warning" showIcon title={t(`prepare.${rejection}`)} className={styles.alert} />
      ) : null}
      {submit.isError ? (
        <Alert type="error" showIcon title={errorMessage(submit.error)} className={styles.alert} />
      ) : null}
    </div>
  );
}
