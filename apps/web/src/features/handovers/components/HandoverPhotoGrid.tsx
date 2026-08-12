'use client';

import {
  CameraOutlined,
  CheckCircleFilled,
  CloseOutlined,
  EyeOutlined,
  ReloadOutlined,
  WarningFilled,
} from '@ant-design/icons';
import { App, Progress, Upload } from 'antd';
import { useEffect, useRef, useState } from 'react';
import {
  HANDOVER_EXTERIOR_SLOTS,
  HANDOVER_PHOTO_SLOT,
  HANDOVER_PHOTO_SLOT_LABEL,
  HANDOVER_REQUIRED_SLOTS,
  IMAGE_UPLOAD_MIME_TYPES,
  type HandoverPhotoSlot,
  type HandoverType,
} from '@xeprime/types';
import { getErrorMessage } from '@/services/api-client';
import { uploadToR2, validateImageFile } from '@/services/upload';
import {
  attachHandoverPhoto,
  fetchHandoverPhotoUrl,
  presignHandoverPhoto,
  removeHandoverPhoto,
} from '../api';
import type { Handover, HandoverPhoto } from '../types';
import styles from './Handover.module.css';

interface PendingUpload {
  file: File;
  progress: number;
  status: 'uploading' | 'error';
  message?: string;
}

/**
 * Lưới ảnh hiện trạng: 4 góc ngoại thất + ảnh đồng hồ Odo.
 *
 * Ô cố định (không phải danh sách file tự do) vì tranh chấp hiện trạng chỉ giải quyết được
 * khi hai bên nhìn CÙNG một góc trước và sau chuyến. Tải lại một ô là THAY ảnh, không chồng
 * thêm — ràng buộc unique `(handover_id, slot)` ở DB nói đúng điều đó.
 *
 * Ảnh mới tải lên hiện preview cục bộ (blob của chính file vừa chọn) để có phản hồi ngay;
 * ảnh cũ mở bằng signed URL XIN LẠI TỪNG LẦN BẤM — không URL nào được giữ trong state
 * (cùng kỷ luật `FileListField` của Wave 4.1).
 */
export function HandoverPhotoGrid({
  bookingId,
  type,
  photos,
  canViewFiles,
  disabled,
  onChanged,
}: {
  bookingId: string;
  type: HandoverType;
  photos: HandoverPhoto[];
  canViewFiles: boolean;
  disabled: boolean;
  onChanged: (handover: Handover) => void;
}) {
  const { message } = App.useApp();
  const [pending, setPending] = useState<Record<string, PendingUpload>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const previewsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);
  // Blob URL là tài nguyên của trình duyệt — không thu hồi thì rò bộ nhớ khi mở/đóng nhiều lần.
  useEffect(
    () => () => {
      Object.values(previewsRef.current).forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );

  const filled = new Map(photos.map((photo) => [photo.slot, photo]));

  function setPendingFor(slot: string, value: PendingUpload | null) {
    setPending((current) => {
      const next = { ...current };
      if (value) next[slot] = value;
      else delete next[slot];
      return next;
    });
  }

  async function startUpload(slot: HandoverPhotoSlot, file: File) {
    const invalid = validateImageFile(file);
    if (invalid) {
      message.error(invalid);
      return;
    }
    setPendingFor(slot, { file, progress: 0, status: 'uploading' });
    try {
      const ticket = await presignHandoverPhoto(bookingId, type, slot, file);
      await uploadToR2(ticket.uploadUrl, file, (progress) =>
        setPendingFor(slot, { file, progress, status: 'uploading' }),
      );
      const updated = await attachHandoverPhoto(bookingId, type, ticket.fileId, slot);
      setPreviews((current) => {
        if (current[slot]) URL.revokeObjectURL(current[slot]);
        return { ...current, [slot]: URL.createObjectURL(file) };
      });
      setPendingFor(slot, null);
      onChanged(updated);
    } catch (err) {
      // Hỏng một ô KHÔNG kéo theo ô đã xong — mỗi ô có nút thử lại của riêng nó.
      setPendingFor(slot, {
        file,
        progress: 0,
        status: 'error',
        message: getErrorMessage(err),
      });
    }
  }

  async function handleRemove(slot: HandoverPhotoSlot) {
    setBusySlot(slot);
    try {
      const updated = await removeHandoverPhoto(bookingId, type, slot);
      setPreviews((current) => {
        if (current[slot]) URL.revokeObjectURL(current[slot]);
        const next = { ...current };
        delete next[slot];
        return next;
      });
      onChanged(updated);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setBusySlot(null);
    }
  }

  async function handleView(slot: HandoverPhotoSlot) {
    const photo = filled.get(slot);
    if (!photo?.fileId) return;
    setBusySlot(slot);
    try {
      // URL ký sống ~2 phút, xin mới cho từng cú bấm — không giữ lại ở bất cứ đâu.
      const ticket = await fetchHandoverPhotoUrl(bookingId, type, photo.fileId);
      window.open(ticket.downloadUrl, '_blank', 'noopener');
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setBusySlot(null);
    }
  }

  function renderSlot(slot: HandoverPhotoSlot) {
    const photo = filled.get(slot);
    const upload = pending[slot];
    const required = HANDOVER_REQUIRED_SLOTS.includes(slot);
    const preview = previews[slot];
    const label = HANDOVER_PHOTO_SLOT_LABEL[slot];

    return (
      <div key={slot} className={styles.slot}>
        <div
          className={[
            styles.slotBox,
            photo ? styles.slotFilled : '',
            upload?.status === 'error' ? styles.slotError : '',
            !photo && !upload && required ? styles.slotRequired : '',
          ]
            .filter(Boolean)
            .join(' ')}
          data-slot={slot}
          data-state={upload?.status ?? (photo ? 'filled' : 'empty')}
        >
          {upload?.status === 'uploading' ? (
            <div className={styles.slotStatus} aria-label={`Đang tải ảnh ${label}`}>
              <Progress
                type="circle"
                size={40}
                percent={upload.progress}
                aria-hidden
              />
            </div>
          ) : upload?.status === 'error' ? (
            <button
              type="button"
              className={styles.slotAction}
              onClick={() => void startUpload(slot, upload.file)}
              aria-label={`Tải lại ảnh ${label}`}
            >
              <WarningFilled className={styles.slotErrorIcon} />
              <span className={styles.slotActionText}>
                <ReloadOutlined /> Tải thất bại
              </span>
            </button>
          ) : photo ? (
            <>
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- blob cục bộ của file vừa chọn, không phải ảnh từ mạng
                <img src={preview} alt={`Ảnh ${label}`} className={styles.slotImage} />
              ) : (
                <span className={styles.slotStatus}>
                  <CheckCircleFilled className={styles.slotDoneIcon} />
                  <span className={styles.slotActionText}>Đã có ảnh</span>
                </span>
              )}
              <div className={styles.slotOverlay}>
                {canViewFiles ? (
                  <button
                    type="button"
                    className={styles.slotIconBtn}
                    aria-label={`Xem ảnh ${label}`}
                    disabled={busySlot === slot}
                    onClick={() => void handleView(slot)}
                  >
                    <EyeOutlined />
                  </button>
                ) : null}
                {disabled ? null : (
                  <button
                    type="button"
                    className={styles.slotIconBtn}
                    aria-label={`Xoá ảnh ${label}`}
                    disabled={busySlot === slot}
                    onClick={() => void handleRemove(slot)}
                  >
                    <CloseOutlined />
                  </button>
                )}
              </div>
            </>
          ) : disabled ? (
            <span className={styles.slotStatus}>
              <span className={styles.slotActionText}>Chưa có ảnh</span>
            </span>
          ) : (
            <Upload
              accept={IMAGE_UPLOAD_MIME_TYPES.join(',')}
              showUploadList={false}
              beforeUpload={(file) => {
                void startUpload(slot, file);
                return false; // flow presign → PUT → xác minh do feature lo
              }}
            >
              <button type="button" className={styles.slotAction} aria-label={`Tải ảnh ${label}`}>
                <CameraOutlined />
                <span className={styles.slotActionText}>Tải lên</span>
              </button>
            </Upload>
          )}
        </div>
        <span className={styles.slotLabel}>
          {label}
          {required ? <span className={styles.slotRequiredMark}> *</span> : null}
        </span>
        {upload?.status === 'error' ? (
          <span className={styles.slotErrorText} role="alert">
            {upload.message}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.photoBlock}>
      <p className={styles.photoTitle}>Ảnh hiện trạng</p>
      <div className={styles.slotGrid}>{HANDOVER_EXTERIOR_SLOTS.map(renderSlot)}</div>
      <p className={styles.photoTitle}>Ảnh đồng hồ KM &amp; nhiên liệu</p>
      <div className={styles.slotGrid}>{renderSlot(HANDOVER_PHOTO_SLOT.ODOMETER)}</div>
    </div>
  );
}
