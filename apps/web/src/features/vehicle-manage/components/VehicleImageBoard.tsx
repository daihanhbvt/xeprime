'use client';

import { DeleteOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { App, Progress, Switch, Tag, Upload } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  IMAGE_UPLOAD_MIME_TYPES,
  VEHICLE_GALLERY_MAX_IMAGES,
  VEHICLE_IMAGE_TYPE,
  vehicleImageSlotsFor,
  isSingleVehicleImageSlot,
  type VehicleImageType,
} from '@xeprime/types';

import { PreviewImage } from '@/components/data-display/PreviewImage';
import { PublishRequiredLabel } from '@/features/vehicles/components/VehicleCompleteness';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useUploadRejectionMessage } from '@/i18n/use-upload-rejection-message';
import { cx } from '@/lib/cx';
import {
  presignVehicleImage,
  uploadImage,
  validateImageFile,
  type UploadPresign,
} from '@/services/upload';

import { SectionCard } from './SectionCard';
import styles from './sections/ImagesSection.module.css';

export interface VehicleMediaItem {
  url: string;
  type: VehicleImageType;
}

/** Cập nhật danh sách ảnh bằng HÀM — hai tấm tải xong cùng lúc vẫn cộng dồn đúng. */
export type MediaUpdater = (update: (prev: VehicleMediaItem[]) => VehicleMediaItem[]) => void;

interface PendingUpload {
  id: string;
  slot: VehicleImageType;
  file: File;
  progress: number;
  status: 'uploading' | 'error';
  message?: string;
}

const SLOT_PREFIX = 'slot:';

/**
 * Ô ảnh HIỆN trên web (30/09/2026): KHÔNG có "Ảnh khác" — mỗi tấm ảnh phải có vị trí.
 *
 * Không đổi `vehicleImageSlotsFor` ở `@xeprime/types`: app native vẫn đọc nó. Ảnh CŨ thuộc loại
 * "khác" vẫn nằm nguyên trong danh sách và được gửi lại y như cũ khi lưu — không bị xoá, vẫn hiện
 * trên chợ và ở cột xem nhanh; chỉ không còn ô riêng trên màn này.
 */
function visibleSlots(vehicleType: string) {
  return vehicleImageSlotsFor(vehicleType).filter((slot) => slot !== VEHICLE_IMAGE_TYPE.OTHER);
}

/**
 * BẢNG ẢNH của một chiếc xe — ảnh chính + các ô theo vị trí (trước · sau · trái · phải · nội
 * thất/đồng hồ). Phần TRÌNH BÀY + UPLOAD dùng chung cho BA màn (30/09/2026):
 *
 * - mục "Hình ảnh" của màn sửa xe ở cả hai khu (`ImagesSection` — tự lưu bằng `PATCH`);
 * - bước ảnh của wizard THÊM XE nhanh và THÊM XE nâng cao (`TypedMediaFields` — gắn RHF, ảnh đi
 *   cùng `POST /vehicles`, vì lúc đó chưa có `vehicleId` nào để `PATCH`).
 *
 * Nó KHÔNG lưu gì: nhận ảnh chính + danh sách, báo thay đổi lên nơi gọi. Cùng đường upload
 * (presign → PUT R2 → URL công khai), cùng luật kiểm tệp, cùng trần ảnh, cùng thanh tiến trình,
 * thử lại và kéo thả — người dùng thấy MỘT màn ảnh ở cả ba chỗ.
 */
export function VehicleImageBoard({
  vehicleType,
  vehicleName,
  main,
  onMainChange,
  items,
  onItemsChange,
  canEdit,
  presign = presignVehicleImage,
  onUploadingChange,
  mainError,
}: {
  vehicleType: string;
  /** Tên xe cho chữ thay thế của ảnh — wizard chưa có tên thì để trống. */
  vehicleName: string;
  main: string | null;
  onMainChange: (url: string | null) => void;
  items: readonly VehicleMediaItem[];
  onItemsChange: MediaUpdater;
  canEdit: boolean;
  /** Wizard đăng nhanh truyền bản MỞ GIAN HÀNG trước tấm ảnh đầu tiên — xem `QuickVehicleWizard`. */
  presign?: (file: File) => Promise<UploadPresign>;
  /** Báo có ảnh ĐANG tải — nơi gọi chặn nút Lưu/Tiếp tục để không lưu thiếu ảnh. */
  onUploadingChange?: (uploading: boolean) => void;
  /** Lỗi validate của ảnh chính (wizard) — hiện ngay dưới ô ảnh chính. */
  mainError?: string;
}) {
  const t = useTranslations('VehicleManage.images');
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const uploadRejectionMessage = useUploadRejectionMessage();
  const { message } = App.useApp();
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [mainUploading, setMainUploading] = useState(false);
  const [reorder, setReorder] = useState(false);
  const sequence = useRef(0);

  const uploading = pending.some((p) => p.status === 'uploading') || mainUploading;
  useEffect(() => {
    onUploadingChange?.(uploading);
  }, [onUploadingChange, uploading]);

  function patchPending(id: string, patch: Partial<PendingUpload>) {
    setPending((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }
  function dropPending(id: string) {
    setPending((prev) => prev.filter((p) => p.id !== id));
  }

  /** Ô đơn thay ảnh đang có; ô nhiều ảnh nối thêm. Không bao giờ giữ hai dòng cùng một URL. */
  function placeUploaded(slot: VehicleImageType, url: string) {
    onItemsChange((prev) => [
      ...prev.filter((i) => i.url !== url && !(isSingleVehicleImageSlot(slot) && i.type === slot)),
      { url, type: slot },
    ]);
  }

  function startUpload(slot: VehicleImageType, file: File, existingId?: string) {
    sequence.current += 1;
    const id = existingId ?? `${file.name}-${file.lastModified}-${sequence.current}`;
    const entry: PendingUpload = { id, slot, file, progress: 0, status: 'uploading' };
    if (existingId) patchPending(id, entry);
    else setPending((prev) => [...prev, entry]);

    uploadImage(file, presign, (progress) => patchPending(id, { progress }))
      .then((url) => {
        placeUploaded(slot, url);
        dropPending(id);
      })
      .catch((err: unknown) => {
        const text = errorMessage(err);
        patchPending(id, { status: 'error', message: text });
        message.error(text);
      });
  }

  function handleSelect(slot: VehicleImageType, file: File): false {
    const occupied = items.length + pending.length;
    if (!isSingleVehicleImageSlot(slot) && occupied >= VEHICLE_GALLERY_MAX_IMAGES) {
      message.warning(t('maxReached', { max: VEHICLE_GALLERY_MAX_IMAGES }));
      return false;
    }
    const invalid = validateImageFile(file);
    if (invalid) {
      message.error(uploadRejectionMessage(invalid));
      return false;
    }
    startUpload(slot, file);
    return false;
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  /**
   * Kéo thả: thả vào một Ô = đổi vị trí ảnh (ô đơn đang có ảnh thì hai ảnh đổi chỗ); thả lên
   * một ảnh khác cùng ô nhiều ảnh = đổi thứ tự. Thứ tự mảng chính là `sortOrder` gửi lên.
   */
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeUrl = String(active.id);
    const overId = String(over.id);
    onItemsChange((current) => {
      const dragged = current.find((i) => i.url === activeUrl);
      if (!dragged) return current;
      const targetSlot = overId.startsWith(SLOT_PREFIX)
        ? (overId.slice(SLOT_PREFIX.length) as VehicleImageType)
        : (current.find((i) => i.url === overId)?.type ?? null);
      if (!targetSlot) return current;

      if (targetSlot !== dragged.type) {
        const displaced = isSingleVehicleImageSlot(targetSlot)
          ? current.find((i) => i.type === targetSlot)
          : null;
        return current.map((i) => {
          if (i.url === dragged.url) return { ...i, type: targetSlot };
          if (displaced && i.url === displaced.url) return { ...i, type: dragged.type };
          return i;
        });
      }
      if (!overId.startsWith(SLOT_PREFIX)) {
        const from = current.findIndex((i) => i.url === activeUrl);
        const to = current.findIndex((i) => i.url === overId);
        if (from >= 0 && to >= 0) return arrayMove(current, from, to);
      }
      return current;
    });
  }

  const slotLabel = (slot: VehicleImageType) => domainLabel('vehicleImageType', slot);

  return (
    <>
      <SectionCard headingLevel={1} title={t('mainImage')}>
        <div className={styles.toolbar}>
          <label className={styles.reorder}>
            <Switch
              checked={reorder}
              onChange={setReorder}
              disabled={!canEdit}
              aria-label={t('reorderLabel')}
            />
            <span>{t('reorderToggle')}</span>
          </label>
          <span className={styles.hint}>
            {t('minimumHint', { max: VEHICLE_GALLERY_MAX_IMAGES })}
          </span>
        </div>
        <MainImageTile
          url={main}
          canEdit={canEdit}
          label={<PublishRequiredLabel label={t('mainImage')} />}
          help={t('mainImageHelp')}
          onChange={onMainChange}
          presign={presign}
          onUploadingChange={setMainUploading}
          error={mainError}
        />
      </SectionCard>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className={styles.grid}>
          {/* Ô thứ năm đổi theo loại xe: ô tô hỏi ảnh nội thất, xe máy hỏi ảnh mặt đồng hồ. */}
          {visibleSlots(vehicleType).map((slot) => {
            const slotItems = items.filter((i) => i.type === slot);
            const slotPending = pending.filter((p) => p.slot === slot);
            const single = isSingleVehicleImageSlot(slot);
            const canAdd =
              canEdit && (single ? slotItems.length === 0 && slotPending.length === 0 : true);
            return (
              <SlotDropZone key={slot} slot={slot} active={reorder}>
                <div className={styles.slotBody}>
                  {slotItems.map((item) => (
                    <ImageTile
                      key={item.url}
                      item={item}
                      draggable={reorder && canEdit}
                      alt={t('alt', { slot: slotLabel(slot), vehicle: vehicleName })}
                      removeLabel={t('remove', { slot: slotLabel(slot) })}
                      onRemove={
                        canEdit
                          ? () => onItemsChange((prev) => prev.filter((i) => i.url !== item.url))
                          : undefined
                      }
                    />
                  ))}
                  {slotPending.map((p) => (
                    <PendingTile
                      key={p.id}
                      item={p}
                      onRetry={() => startUpload(p.slot, p.file, p.id)}
                      onRemove={() => dropPending(p.id)}
                      retryLabel={t('retry', { name: p.file.name })}
                      removeLabel={t('dropRemove', { name: p.file.name })}
                      uploadingLabel={t('uploading', { name: p.file.name })}
                    />
                  ))}
                  {canAdd ? (
                    <Upload
                      accept={IMAGE_UPLOAD_MIME_TYPES.join(',')}
                      showUploadList={false}
                      multiple={!single}
                      beforeUpload={(file) => handleSelect(slot, file)}
                    >
                      <button type="button" className={styles.addTile}>
                        <PlusOutlined aria-hidden="true" />
                        <span className={styles.addLabel}>{t('choose')}</span>
                      </button>
                    </Upload>
                  ) : null}
                </div>
                <div className={styles.slotFoot}>
                  <span className={styles.slotTitle}>{slotLabel(slot)}</span>
                  <span className={cx(styles.slotHelper, slotItems.length > 0 && styles.slotDone)}>
                    {slotItems.length > 0 ? (
                      <Tag color="success" className={styles.doneTag}>
                        {t('uploaded')}
                      </Tag>
                    ) : (
                      t(`helper.${slot}`)
                    )}
                  </span>
                </div>
              </SlotDropZone>
            );
          })}
        </div>
      </DndContext>
    </>
  );
}

/** Ô nhận thả — chỉ "sáng" khi đang bật kéo thả. */
function SlotDropZone({
  slot,
  active,
  children,
}: {
  slot: VehicleImageType;
  active: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${SLOT_PREFIX}${slot}`, disabled: !active });
  return (
    <section
      ref={setNodeRef}
      className={cx(styles.slot, active && styles.slotDroppable, isOver && styles.slotOver)}
      aria-label={slot}
    >
      {children}
    </section>
  );
}

function ImageTile({
  item,
  draggable,
  alt,
  removeLabel,
  onRemove,
}: {
  item: VehicleMediaItem;
  draggable: boolean;
  alt: string;
  removeLabel: string;
  onRemove?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.url,
    disabled: !draggable,
  });
  // Vị trí kéo chỉ biết lúc runtime → CSS custom property (ngoại lệ inline style duy nhất — CLAUDE.md §5).
  const dragStyle = {
    '--drag-x': `${transform?.x ?? 0}px`,
    '--drag-y': `${transform?.y ?? 0}px`,
  } as CSSProperties;
  return (
    <div
      ref={setNodeRef}
      className={cx(
        styles.thumb,
        draggable && styles.thumbDraggable,
        isDragging && styles.thumbDragging,
      )}
      style={dragStyle}
      {...attributes}
      {...listeners}
    >
      <PreviewImage src={item.url} alt={alt} className={styles.photo} draggable={false} />
      {onRemove ? (
        <button
          type="button"
          className={styles.removeBtn}
          aria-label={removeLabel}
          onClick={onRemove}
        >
          <DeleteOutlined />
        </button>
      ) : null}
    </div>
  );
}

function PendingTile({
  item,
  onRetry,
  onRemove,
  retryLabel,
  removeLabel,
  uploadingLabel,
}: {
  item: PendingUpload;
  onRetry: () => void;
  onRemove: () => void;
  retryLabel: string;
  removeLabel: string;
  uploadingLabel: string;
}) {
  if (item.status === 'error') {
    return (
      <div className={cx(styles.pendingTile, styles.failedTile)} role="alert">
        <span title={item.message}>{item.file.name}</span>
        <div className={styles.pendingActions}>
          <button type="button" onClick={onRetry} aria-label={retryLabel}>
            <ReloadOutlined />
          </button>
          <button type="button" onClick={onRemove} aria-label={removeLabel}>
            <DeleteOutlined />
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.pendingTile} aria-label={uploadingLabel}>
      <Progress type="circle" percent={item.progress} size={42} />
    </div>
  );
}

/** Ảnh đại diện — một ô riêng, cùng đường upload; giữ `mainImageUrl` là nguồn duy nhất của thẻ xe. */
function MainImageTile({
  url,
  canEdit,
  label,
  help,
  onChange,
  presign,
  onUploadingChange,
  error,
}: {
  url: string | null;
  canEdit: boolean;
  label: ReactNode;
  help: string;
  onChange: (url: string | null) => void;
  presign: (file: File) => Promise<UploadPresign>;
  onUploadingChange: (uploading: boolean) => void;
  error?: string;
}) {
  const t = useTranslations('VehicleManage.images');
  const tCommon = useTranslations('Common.components.imageUpload');
  const errorMessage = useErrorMessage();
  const uploadRejectionMessage = useUploadRejectionMessage();
  const { message } = App.useApp();
  const [progress, setProgress] = useState<number | null>(null);

  function select(file: File): false {
    const invalid = validateImageFile(file);
    if (invalid) {
      message.error(uploadRejectionMessage(invalid));
      return false;
    }
    setProgress(0);
    onUploadingChange(true);
    uploadImage(file, presign, setProgress)
      .then((next) => onChange(next))
      .catch((err: unknown) => message.error(errorMessage(err)))
      .finally(() => {
        setProgress(null);
        onUploadingChange(false);
      });
    return false;
  }

  return (
    <div className={styles.mainRow}>
      <div className={styles.mainTileWrap}>
        {url ? (
          <PreviewImage src={url} alt={tCommon('alt')} className={styles.mainPhoto} />
        ) : (
          <div className={styles.mainPlaceholder} aria-hidden="true" />
        )}
        {progress != null ? (
          <div className={styles.mainProgress}>
            <Progress type="circle" percent={progress} size={42} />
          </div>
        ) : null}
      </div>
      <div className={styles.mainText}>
        <span className={styles.slotTitle}>{label}</span>
        <span className={styles.slotHelper}>{help}</span>
        {canEdit ? (
          <div className={styles.mainActions}>
            <Upload
              accept={IMAGE_UPLOAD_MIME_TYPES.join(',')}
              showUploadList={false}
              beforeUpload={select}
            >
              <button type="button" className={styles.linkBtn} disabled={progress != null}>
                {url ? tCommon('change') : t('choose')}
              </button>
            </Upload>
            {url ? (
              <button
                type="button"
                className={cx(styles.linkBtn, styles.dangerBtn)}
                onClick={() => onChange(null)}
              >
                {tCommon('remove')}
              </button>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <span className={styles.mainError} role="alert">
            {error}
          </span>
        ) : null}
      </div>
    </div>
  );
}
