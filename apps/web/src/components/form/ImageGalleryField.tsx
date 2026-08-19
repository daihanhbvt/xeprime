'use client';

import { DeleteOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { App, Form, Progress, Upload } from 'antd';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import { IMAGE_UPLOAD_MIME_TYPES } from '@xeprime/types';
import { getErrorMessage } from '@/services/api-client';
import { uploadImage, validateImageFile, type UploadPresign } from '@/services/upload';
import { PreviewImage } from '@/components/data-display/PreviewImage';
import styles from './ImageGalleryField.module.css';
import { useUploadRejectionMessage } from '@/i18n/use-upload-rejection-message';

interface ImageGalleryFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  /** `ReactNode` để feature tự gắn dấu hiệu riêng cạnh nhãn (xem `TextField`). */
  label: ReactNode;
  presign: (file: File) => Promise<UploadPresign>;
  /** Trần số ảnh — khớp validator (mặc định 20). */
  max?: number;
}

interface PendingImageUpload {
  id: string;
  file: File;
  progress: number;
  status: 'uploading' | 'error';
  message?: string;
}

/**
 * Gallery ảnh nối RHF ↔ upload R2: chọn nhiều file từ máy (presign → PUT từng file), kéo-thả
 * đổi thứ tự (thứ tự mảng = `sortOrder` backend), xoá từng ảnh. Field giữ `string[]` URL công
 * khai — khớp schema yup + API replace-set hiện có. Thay cho repeater dán URL cũ.
 */
export function ImageGalleryField<T extends FieldValues>({
  control,
  name,
  label,
  presign,
  max = 20,
}: ImageGalleryFieldProps<T>) {
  const uploadRejectionMessage = useUploadRejectionMessage();
  const { field, fieldState } = useController({ control, name });
  const { message } = App.useApp();
  const [pending, setPending] = useState<PendingImageUpload[]>([]);

  const fieldValue = field.value as string[] | undefined;
  const items = useMemo(() => fieldValue ?? [], [fieldValue]);

  // Nhiều file upload song song xong không theo thứ tự render — append qua ref để không
  // ghi đè nhau bằng closure cũ.
  const itemsRef = useRef<string[]>(items);
  const pendingRef = useRef<PendingImageUpload[]>(pending);
  const uploadSequence = useRef(0);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  function commit(next: string[]) {
    itemsRef.current = next;
    field.onChange(next);
  }

  function commitPending(next: PendingImageUpload[]) {
    pendingRef.current = next;
    setPending(next);
  }

  function updatePending(id: string, patch: Partial<PendingImageUpload>) {
    commitPending(
      pendingRef.current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function startUpload(file: File, existingId?: string) {
    uploadSequence.current += 1;
    const id = existingId ?? `${file.name}-${file.lastModified}-${uploadSequence.current}`;
    const item: PendingImageUpload = { id, file, progress: 0, status: 'uploading' };
    if (existingId) {
      updatePending(id, item);
    } else {
      commitPending([...pendingRef.current, item]);
    }

    uploadImage(file, presign, (progress) => updatePending(id, { progress }))
      .then((publicUrl) => {
        commit([...itemsRef.current, publicUrl]);
        commitPending(pendingRef.current.filter((candidate) => candidate.id !== id));
      })
      .catch((err: unknown) => {
        const error = getErrorMessage(err);
        updatePending(id, { status: 'error', message: error });
        message.error(error);
      });
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleSelect(file: File): false {
    if (itemsRef.current.length + pendingRef.current.length >= max) {
      message.warning(`Tối đa ${max} ảnh`);
      return false;
    }
    const invalid = validateImageFile(file);
    if (invalid) {
      message.error(uploadRejectionMessage(invalid));
      return false;
    }
    startUpload(file);
    return false; // chặn upload mặc định của AntD — mình tự PUT lên R2
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = items.indexOf(String(active.id));
    const to = items.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    commit(arrayMove(items, from, to));
  }

  return (
    <Form.Item
      label={label}
      validateStatus={fieldState.error ? 'error' : ''}
      help={fieldState.error?.message ?? 'Kéo thả để đổi thứ tự hiển thị'}
      style={{ marginBottom: 14 }}
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items} strategy={rectSortingStrategy}>
          <div className={styles.grid}>
            {items.map((url) => (
              <SortableThumb
                key={url}
                url={url}
                onRemove={() => commit(items.filter((u) => u !== url))}
              />
            ))}
            {pending.map((item) => (
              <PendingUploadTile
                key={item.id}
                item={item}
                onRetry={() => startUpload(item.file, item.id)}
                onRemove={() =>
                  commitPending(pendingRef.current.filter((candidate) => candidate.id !== item.id))
                }
              />
            ))}
            {items.length + pending.length < max ? (
              <Upload
                accept={IMAGE_UPLOAD_MIME_TYPES.join(',')}
                showUploadList={false}
                multiple
                beforeUpload={handleSelect}
              >
                <button type="button" className={styles.addTile}>
                  <PlusOutlined />
                  <span>Thêm ảnh</span>
                </button>
              </Upload>
            ) : null}
          </div>
        </SortableContext>
      </DndContext>
    </Form.Item>
  );
}

function PendingUploadTile({
  item,
  onRetry,
  onRemove,
}: {
  item: PendingImageUpload;
  onRetry: () => void;
  onRemove: () => void;
}) {
  if (item.status === 'error') {
    return (
      <div className={`${styles.pendingTile} ${styles.failedTile}`} role="alert">
        <span title={item.message}>{item.file.name}</span>
        <div className={styles.pendingActions}>
          <button type="button" onClick={onRetry} aria-label={`Thử lại ${item.file.name}`}>
            <ReloadOutlined />
          </button>
          <button type="button" onClick={onRemove} aria-label={`Bỏ ${item.file.name}`}>
            <DeleteOutlined />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pendingTile} aria-label={`Đang tải ${item.file.name}`}>
      <Progress type="circle" percent={item.progress} size={42} />
      <span>{item.progress}%</span>
    </div>
  );
}

function SortableThumb({ url, onRemove }: { url: string; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: url,
  });

  // Vị trí kéo-thả chỉ biết lúc runtime → CSS custom property (ngoại lệ inline style duy nhất
  // được phép — CLAUDE.md mục 5), transform thật nằm trong module.css.
  const dragStyle = {
    '--drag-x': `${transform?.x ?? 0}px`,
    '--drag-y': `${transform?.y ?? 0}px`,
    '--drag-transition': transition ?? 'none',
  } as CSSProperties;

  return (
    <div
      ref={setNodeRef}
      className={isDragging ? `${styles.thumb} ${styles.thumbDragging}` : styles.thumb}
      style={dragStyle}
      {...attributes}
      {...listeners}
    >
      {/* Click ngắn mở trình xem to; kéo vẫn sắp xếp được (PointerSensor có activationConstraint). */}
      <PreviewImage src={url} alt="Ảnh gallery" className={styles.photo} />
      <button
        type="button"
        className={styles.removeBtn}
        aria-label="Xoá ảnh"
        // PointerSensor có activationConstraint nên click ngắn vẫn tới được nút này.
        onClick={onRemove}
      >
        <DeleteOutlined />
      </button>
    </div>
  );
}
