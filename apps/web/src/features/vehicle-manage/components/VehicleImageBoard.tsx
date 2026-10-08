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
  isSingleVehicleImageSlot,
  requiredVehicleImageTypes,
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

/*
 * Ô ảnh HIỆN trên bảng = đúng các góc BẮT BUỘC của loại xe (`requiredVehicleImageTypes`): ô tô 5
 * (trước · sau · trái · phải · nội thất), xe máy 2 (trước · sau).
 *
 * KHÔNG có ô "Ảnh khác" — mỗi tấm ảnh phải có vị trí (30/09/2026). Ảnh CŨ thuộc loại đó, và ảnh
 * xe máy thuộc loại `dashboard` của luật trước 07/10/2026, vẫn nằm nguyên trong danh sách và
 * được gửi lại y như cũ khi lưu — không bị xoá, vẫn hiện trên chợ; chỉ không còn ô trên màn này.
 */

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
  items,
  onItemsChange,
  canEdit,
  presign = presignVehicleImage,
  onUploadingChange,
}: {
  vehicleType: string;
  /** Tên xe cho chữ thay thế của ảnh — wizard chưa có tên thì để trống. */
  vehicleName: string;
  items: readonly VehicleMediaItem[];
  onItemsChange: MediaUpdater;
  canEdit: boolean;
  /** Wizard đăng nhanh truyền bản MỞ GIAN HÀNG trước tấm ảnh đầu tiên — xem `QuickVehicleWizard`. */
  presign?: (file: File) => Promise<UploadPresign>;
  /** Báo có ảnh ĐANG tải — nơi gọi chặn nút Lưu/Tiếp tục để không lưu thiếu ảnh. */
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const t = useTranslations('VehicleManage.images');
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const uploadRejectionMessage = useUploadRejectionMessage();
  const { message } = App.useApp();
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [reorder, setReorder] = useState(false);
  const sequence = useRef(0);

  const uploading = pending.some((p) => p.status === 'uploading');
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
      <SectionCard headingLevel={1} title={t('galleryTitle')}>
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
        {/*
          Ảnh BÌA không còn ô tải lên riêng (07/10/2026): nó là ảnh MẶT TRƯỚC, do server suy ra.
          Trước đây đây là hai ô cạnh nhau hỏi cùng một tấm ảnh, và chủ xe nào tải hai tấm khác
          nhau thì thẻ xe ngoài chợ trưng một chiếc xe khác với ô "mặt trước" của chính nó.
        */}
        <p className={styles.hint}>{t('coverFromFront')}</p>
      </SectionCard>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className={styles.grid}>
          {requiredVehicleImageTypes(vehicleType).map((slot) => {
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
                  <span className={styles.slotTitle}>
                    <PublishRequiredLabel label={slotLabel(slot)} />
                  </span>
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
