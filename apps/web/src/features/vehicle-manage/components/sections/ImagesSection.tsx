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
import { useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  IMAGE_UPLOAD_MIME_TYPES,
  VEHICLE_GALLERY_MAX_IMAGES,
  vehicleImageSlotsFor,
  isSingleVehicleImageSlot,
  type VehicleImageType,
} from '@xeprime/types';

import { PreviewImage } from '@/components/data-display/PreviewImage';
import { StickyFormActions } from '@/components/form/StickyFormActions';
import { PublishRequiredLabel } from '@/features/vehicles/components/VehicleCompleteness';
import { useUpdateVehicle } from '@/features/vehicles/hooks/use-vehicle-mutations';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useUploadRejectionMessage } from '@/i18n/use-upload-rejection-message';
import { cx } from '@/lib/cx';
import { presignVehicleImage, uploadImage, validateImageFile } from '@/services/upload';

import { useManagedVehicle } from '../VehicleManageContext';
import { SectionCard } from '../SectionCard';
import styles from './ImagesSection.module.css';

interface MediaItem {
  url: string;
  type: VehicleImageType;
}

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
 * Mục "Hình ảnh" (mockup 3) — thư viện xếp theo Ô VỊ TRÍ (trước · sau · trái · phải · nội thất ·
 * khác) trên cùng bảng `vehicle_images` với `imageType`; API cũ `images: string[]` vẫn nguyên.
 *
 * Cùng đường upload với form xe: presign → PUT R2 → URL công khai (`uploadImage`), cùng luật
 * kiểm tệp, cùng trần ảnh. Ảnh cũ chưa gán vị trí hiện ở "Ảnh khác" theo fallback của server và
 * KHÔNG bị ghi lại cho tới khi chủ xe bấm lưu. Ảnh đại diện vẫn là `mainImageUrl` — nguồn duy
 * nhất của thẻ xe/chợ, và là trường nhạy cảm (ADR 0008) nên đổi khi xe công khai phải xác nhận.
 */
export function ImagesSection() {
  const { vehicle, canEdit } = useManagedVehicle();
  const t = useTranslations('VehicleManage.images');
  const tEdit = useTranslations('Vehicles.edit');
  const tActions = useTranslations('Common.actions');
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const uploadRejectionMessage = useUploadRejectionMessage();
  const { message } = App.useApp();
  const update = useUpdateVehicle(vehicle.id);

  const initial = useMemo(
    () => ({
      main: vehicle.mainImageUrl ?? null,
      items: (vehicle.media ?? []).map((m) => ({ url: m.url, type: m.type as VehicleImageType })),
    }),
    [vehicle.mainImageUrl, vehicle.media],
  );
  const [main, setMain] = useState<string | null>(initial.main);
  const [items, setItems] = useState<MediaItem[]>(initial.items);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [reorder, setReorder] = useState(false);
  /*
   * Upload chạy bất đồng bộ và kết thúc sau nhiều lần render, nên mọi thay đổi danh sách đều
   * dùng dạng HÀM (`setItems(prev => …)`): hai ảnh tải xong cùng lúc vẫn cộng dồn đúng, và
   * không cần ref chép state — ghi ref trong lúc render là hành vi không xác định ở React 19.
   */
  const sequence = useRef(0);

  const dirty =
    main !== initial.main || JSON.stringify(items) !== JSON.stringify(initial.items);

  function patchPending(id: string, patch: Partial<PendingUpload>) {
    setPending((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }
  function dropPending(id: string) {
    setPending((prev) => prev.filter((p) => p.id !== id));
  }

  /** Ô đơn thay ảnh đang có; "Ảnh khác" nối thêm. Không bao giờ giữ hai dòng cùng một URL. */
  function placeUploaded(slot: VehicleImageType, url: string) {
    setItems((prev) => [
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

    uploadImage(file, presignVehicleImage, (progress) => patchPending(id, { progress }))
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
   * một ảnh khác trong "Ảnh khác" = đổi thứ tự. Thứ tự mảng chính là `sortOrder` gửi lên.
   */
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeUrl = String(active.id);
    const overId = String(over.id);
    const current = items;
    const dragged = current.find((i) => i.url === activeUrl);
    if (!dragged) return;

    const targetSlot = overId.startsWith(SLOT_PREFIX)
      ? (overId.slice(SLOT_PREFIX.length) as VehicleImageType)
      : (current.find((i) => i.url === overId)?.type ?? null);
    if (!targetSlot) return;

    if (targetSlot !== dragged.type) {
      const displaced = isSingleVehicleImageSlot(targetSlot)
        ? current.find((i) => i.type === targetSlot)
        : null;
      setItems(
        current.map((i) => {
          if (i.url === dragged.url) return { ...i, type: targetSlot };
          if (displaced && i.url === displaced.url) return { ...i, type: dragged.type };
          return i;
        }),
      );
      return;
    }
    if (!overId.startsWith(SLOT_PREFIX)) {
      const from = current.findIndex((i) => i.url === activeUrl);
      const to = current.findIndex((i) => i.url === overId);
      if (from >= 0 && to >= 0) setItems(arrayMove(current, from, to));
    }
  }

  async function submit() {
    try {
      await update.mutateAsync({
        mainImageUrl: main,
        media: items.map((i) => ({ url: i.url, type: i.type })),
      });
      message.success(t('saved'));
    } catch (err) {
      message.error(errorMessage(err));
    }
  }

  function save() {
    void submit();
  }

  const slotLabel = (slot: VehicleImageType) => domainLabel('vehicleImageType', slot);

  return (
    <form
      noValidate
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
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
          <span className={styles.hint}>{t('minimumHint', { max: VEHICLE_GALLERY_MAX_IMAGES })}</span>
        </div>
        <MainImageTile
          url={main}
          canEdit={canEdit}
          label={<PublishRequiredLabel label={t('mainImage')} />}
          help={t('mainImageHelp')}
          onChange={setMain}
        />
      </SectionCard>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className={styles.grid}>
          {/* Ô thứ năm đổi theo loại xe: ô tô hỏi ảnh nội thất, xe máy hỏi ảnh mặt đồng hồ. */}
          {vehicleImageSlotsFor(vehicle.vehicleType).map((slot) => {
            const slotItems = items.filter((i) => i.type === slot);
            const slotPending = pending.filter((p) => p.slot === slot);
            const single = isSingleVehicleImageSlot(slot);
            const canAdd = canEdit && (single ? slotItems.length === 0 && slotPending.length === 0 : true);
            return (
              <SlotDropZone key={slot} slot={slot} active={reorder}>
                <div className={styles.slotBody}>
                  {slotItems.map((item) => (
                    <ImageTile
                      key={item.url}
                      item={item}
                      draggable={reorder && canEdit}
                      alt={t('alt', { slot: slotLabel(slot), vehicle: vehicle.name })}
                      removeLabel={t('remove', { slot: slotLabel(slot) })}
                      onRemove={canEdit ? () => setItems(items.filter((i) => i.url !== item.url)) : undefined}
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

      <StickyFormActions
        submitLabel={tActions('saveChanges')}
        cancelLabel={tEdit('revert')}
        onCancel={
          dirty
            ? () => {
                setMain(initial.main);
                setItems(initial.items);
              }
            : undefined
        }
        submitting={update.isPending}
        disabled={!canEdit || !dirty || pending.length > 0}
      />

    </form>
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
  children: React.ReactNode;
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
  item: MediaItem;
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
      className={cx(styles.thumb, draggable && styles.thumbDraggable, isDragging && styles.thumbDragging)}
      style={dragStyle}
      {...attributes}
      {...listeners}
    >
      <PreviewImage src={item.url} alt={alt} className={styles.photo} draggable={false} />
      {onRemove ? (
        <button type="button" className={styles.removeBtn} aria-label={removeLabel} onClick={onRemove}>
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
}: {
  url: string | null;
  canEdit: boolean;
  label: React.ReactNode;
  help: string;
  onChange: (url: string | null) => void;
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
    uploadImage(file, presignVehicleImage, setProgress)
      .then((next) => onChange(next))
      .catch((err: unknown) => message.error(errorMessage(err)))
      .finally(() => setProgress(null));
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
            <Upload accept={IMAGE_UPLOAD_MIME_TYPES.join(',')} showUploadList={false} beforeUpload={select}>
              <button type="button" className={styles.linkBtn} disabled={progress != null}>
                {url ? tCommon('change') : t('choose')}
              </button>
            </Upload>
            {url ? (
              <button type="button" className={cx(styles.linkBtn, styles.dangerBtn)} onClick={() => onChange(null)}>
                {tCommon('remove')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

