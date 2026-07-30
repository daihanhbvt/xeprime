'use client';

import { DeleteOutlined, LoadingOutlined, PlusOutlined } from '@ant-design/icons';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { App, Form, Upload } from 'antd';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import { IMAGE_UPLOAD_MIME_TYPES } from '@xeprime/types';
import { getErrorMessage } from '@/services/api-client';
import { uploadImage, validateImageFile, type UploadPresign } from '@/services/upload';
import styles from './ImageGalleryField.module.css';

interface ImageGalleryFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  presign: (file: File) => Promise<UploadPresign>;
  /** Trần số ảnh — khớp validator (mặc định 20). */
  max?: number;
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
  const { field, fieldState } = useController({ control, name });
  const { message } = App.useApp();
  const [uploadingCount, setUploadingCount] = useState(0);

  const fieldValue = field.value as string[] | undefined;
  const items = useMemo(() => fieldValue ?? [], [fieldValue]);

  // Nhiều file upload song song xong không theo thứ tự render — append qua ref để không
  // ghi đè nhau bằng closure cũ.
  const itemsRef = useRef<string[]>(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  function commit(next: string[]) {
    itemsRef.current = next;
    field.onChange(next);
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleSelect(file: File): false {
    if (itemsRef.current.length + uploadingCount >= max) {
      message.warning(`Tối đa ${max} ảnh`);
      return false;
    }
    const invalid = validateImageFile(file);
    if (invalid) {
      message.error(invalid);
      return false;
    }
    setUploadingCount((n) => n + 1);
    uploadImage(file, presign)
      .then((publicUrl) => commit([...itemsRef.current, publicUrl]))
      .catch((err: unknown) => message.error(getErrorMessage(err)))
      .finally(() => setUploadingCount((n) => n - 1));
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
              <SortableThumb key={url} url={url} onRemove={() => commit(items.filter((u) => u !== url))} />
            ))}
            {Array.from({ length: uploadingCount }).map((_, i) => (
              <div key={`pending-${i}`} className={styles.pendingTile}>
                <LoadingOutlined />
              </div>
            ))}
            {items.length + uploadingCount < max ? (
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
      {/* eslint-disable-next-line @next/next/no-img-element -- ảnh trên R2, không qua next/image */}
      <img src={url} alt="Ảnh gallery" className={styles.photo} />
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
