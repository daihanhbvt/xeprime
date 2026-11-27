'use client';

import {
  CheckCircleFilled,
  CloseOutlined,
  EyeOutlined,
  ReloadOutlined,
  WarningFilled,
} from '@ant-design/icons';
import { App, Image, Progress, Upload } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import {
  handoverExteriorSlotsFor,
  HANDOVER_PHOTO_SLOT,
  HANDOVER_PHOTO_SLOT_LABEL,
  handoverPhotoSlotsFor,
  IMAGE_UPLOAD_MIME_TYPES,
  type HandoverPhotoSlot,
  type HandoverType,
} from '@xeprime/types';
import { PreviewImage } from '@/components/data-display/PreviewImage';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useUploadRejectionMessage } from '@/i18n/use-upload-rejection-message';
import { cx } from '@/lib/cx';
import { getErrorMessage } from '@/services/api-client';
import { compressImageForUpload } from '@/lib/image-compression';
import { uploadToR2, validateImageSelection } from '@/services/upload';
import {
  attachHandoverPhoto,
  fetchHandoverPhotoUrl,
  presignHandoverPhoto,
  removeHandoverPhoto,
} from '../api';
import { useHandoverPhotoPreviews } from '../hooks';
import { HandoverSlotSample } from './HandoverSlotSample';
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
 * Hai hình thái:
 *  - `grid` (mặc định — hộp bổ sung biên bản): hai nhóm có tiêu đề, ngoại thất và đồng hồ KM;
 *  - `row` (chi tiết đơn, Figma `23845:49956`; hộp nhận lại xe `23941:65305`): mọi góc của loại xe
 *    trên một hàng (ô tô 5, xe máy 3 — `handoverPhotoSlotsFor`), nhãn dưới ảnh, ảnh đã có hiện THU
 *    NHỎ bằng URL ký ngắn hạn (tự làm mới — `useHandoverPhotoPreviews`).
 *
 * Ảnh mới tải lên hiện preview cục bộ (blob của chính file vừa chọn) để có phản hồi ngay; mở
 * xem toàn màn hình luôn xin một URL ký MỚI cho lần bấm đó.
 */
export function HandoverPhotoGrid({
  bookingId,
  type,
  vehicleType,
  photos,
  canViewFiles,
  disabled,
  onChanged,
  ensureHandover,
  variant = 'grid',
  highlightSlots,
}: {
  bookingId: string;
  type: HandoverType;
  /** Loại xe của đơn — quyết bộ góc chụp: xe máy chỉ trước · sau · Odo (`handoverExteriorSlotsFor`). */
  vehicleType: string;
  photos: HandoverPhoto[];
  canViewFiles: boolean;
  disabled: boolean;
  onChanged: (handover: Handover) => void;
  /**
   * Bảo đảm đã có biên bản để gắn ảnh vào, gọi TRƯỚC cú upload đầu tiên.
   *
   * Cần vì luồng nhanh Wave 10 không tạo biên bản nào cho tới lúc bấm xác nhận, trong khi
   * `POST …/photos/presign` đòi một biên bản còn sửa được (`requireActive` → 404). Tạo trễ
   * đúng lúc khách thật sự chọn ảnh.
   */
  ensureHandover?: () => Promise<void>;
  variant?: 'grid' | 'row';
  /** Góc còn thiếu đang bị cảnh báo — viền đỏ nhấp nháy (bấm giao xe khi chưa đủ ảnh). */
  highlightSlots?: ReadonlySet<string>;
}) {
  const t = useTranslations('Bookings.handover.photos');
  const dl = useDomainLabel();
  const uploadRejectionMessage = useUploadRejectionMessage();
  const { message } = App.useApp();
  const [pending, setPending] = useState<Record<string, PendingUpload>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [busySlot, setBusySlot] = useState<string | null>(null);
  /** URL ký đang xem toàn màn hình — thay cho mở tab mới; đóng trình xem là quên luôn URL. */
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const previewsRef = useRef<Record<string, string>>({});
  const thumbs = useHandoverPhotoPreviews(
    bookingId,
    type,
    photos,
    variant === 'row' && canViewFiles,
  ).data;

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
  const slotLabel = (slot: HandoverPhotoSlot) =>
    dl('handoverPhotoSlot', slot, HANDOVER_PHOTO_SLOT_LABEL[slot]);

  function setPendingFor(slot: string, value: PendingUpload | null) {
    setPending((current) => {
      const next = { ...current };
      if (value) next[slot] = value;
      else delete next[slot];
      return next;
    });
  }

  async function startUpload(slot: HandoverPhotoSlot, file: File) {
    const invalid = validateImageSelection(file);
    if (invalid) {
      message.error(uploadRejectionMessage(invalid));
      return;
    }
    setPendingFor(slot, { file, progress: 0, status: 'uploading' });
    try {
      await ensureHandover?.();
      // Nén TRƯỚC presign (presign ký theo dung lượng). Hồ sơ `detail`: ảnh giao nhận là bằng
      // chứng vết xước, cần giữ chi tiết hơn ảnh hiển thị.
      const upload = await compressImageForUpload(file, 'detail');
      const ticket = await presignHandoverPhoto(bookingId, type, slot, upload);
      await uploadToR2(ticket.uploadUrl, upload, (progress) =>
        setPendingFor(slot, { file, progress, status: 'uploading' }),
      );
      const updated = await attachHandoverPhoto(bookingId, type, ticket.fileId, slot);
      setPreviews((current) => {
        if (current[slot]) URL.revokeObjectURL(current[slot]);
        return { ...current, [slot]: URL.createObjectURL(upload) };
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
      const ticket = await fetchHandoverPhotoUrl(bookingId, type, photo.fileId);
      setViewerUrl(ticket.downloadUrl);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setBusySlot(null);
    }
  }

  function renderSlot(slot: HandoverPhotoSlot) {
    const photo = filled.get(slot);
    const upload = pending[slot];
    const preview = previews[slot] ?? thumbs?.[slot] ?? null;
    const label = slotLabel(slot);
    const flagged = !photo && !upload && Boolean(highlightSlots?.has(slot));

    return (
      <div key={slot} className={styles.slot}>
        <div
          className={cx(
            styles.slotBox,
            photo && styles.slotFilled,
            upload?.status === 'error' && styles.slotError,
            flagged && styles.slotFlagged,
          )}
          data-slot={slot}
          data-state={upload?.status ?? (photo ? 'filled' : 'empty')}
          data-flagged={flagged || undefined}
        >
          {upload?.status === 'uploading' ? (
            <div className={styles.slotStatus} aria-label={t('uploadingSlot', { slot: label })}>
              <Progress type="circle" size={40} percent={upload.progress} aria-hidden />
            </div>
          ) : upload?.status === 'error' ? (
            <button
              type="button"
              className={styles.slotAction}
              onClick={() => void startUpload(slot, upload.file)}
              aria-label={t('retrySlot', { slot: label })}
            >
              <WarningFilled className={styles.slotErrorIcon} />
              <span className={styles.slotActionText}>
                <ReloadOutlined /> {t('uploadFailed')}
              </span>
            </button>
          ) : photo ? (
            <>
              {preview ? (
                <PreviewImage src={preview} alt={label} className={styles.slotImage} />
              ) : (
                <span className={styles.slotStatus}>
                  <CheckCircleFilled className={styles.slotDoneIcon} />
                  <span className={styles.slotActionText}>{t('hasPhoto')}</span>
                </span>
              )}
              <div className={styles.slotOverlay}>
                {canViewFiles ? (
                  <button
                    type="button"
                    className={styles.slotIconBtn}
                    aria-label={t('viewSlot', { slot: label })}
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
                    aria-label={t('removeSlot', { slot: label })}
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
              <HandoverSlotSample slot={slot} className={styles.slotSample} />
              <span className={styles.slotActionText}>{t('noPhoto')}</span>
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
              {/*
                Cả ô là vùng bấm; hình mẫu mờ phía sau cho biết phải chụp GÓC nào, nút ở giữa nói
                rõ đây là chỗ tải ảnh lên.
              */}
              <button
                type="button"
                className={styles.slotAction}
                aria-label={t('uploadSlot', { slot: label })}
              >
                {/* Hình Figma "Empty State" đã có dấu "+" - không thêm viên "Tải lên" (20/11/2026). */}
                <HandoverSlotSample slot={slot} className={styles.slotSample} />
              </button>
            </Upload>
          )}
        </div>
        {/* Không dấu `*` ở đâu cả: ảnh hiện trạng TUỲ CHỌN hoàn toàn (design 14 §2). */}
        <span className={cx(styles.slotLabel, flagged && styles.slotLabelFlagged)}>{label}</span>
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
      {variant === 'row' ? (
        <div className={styles.slotRow}>{handoverPhotoSlotsFor(vehicleType).map(renderSlot)}</div>
      ) : (
        <>
          <p className={styles.photoTitle}>{t('title')}</p>
          <div className={styles.slotGrid}>
            {handoverExteriorSlotsFor(vehicleType).map(renderSlot)}
          </div>
          {/* Chỉ KM: Wave 10 bỏ hẳn nhiên liệu khỏi bàn giao (design 14 §8). */}
          <p className={styles.photoTitle}>{t('odometerTitle')}</p>
          <div className={cx(styles.slotGrid, styles.slotGridSingle)}>
            {renderSlot(HANDOVER_PHOTO_SLOT.ODOMETER)}
          </div>
        </>
      )}

      {/* Ảnh neo ẨN cho trình xem điều khiển bằng state — nút Xem chỉ việc đặt URL ký. */}
      {viewerUrl ? (
        <Image
          src={viewerUrl}
          alt=""
          // `classNames.root` chỉ ẩn cái neo; `rootClassName` ẩn LUÔN cả trình xem.
          classNames={{ root: styles.hiddenPreviewAnchor }}
          preview={{
            open: true,
            onOpenChange: (open) => {
              if (!open) setViewerUrl(null);
            },
          }}
        />
      ) : null}
    </div>
  );
}
