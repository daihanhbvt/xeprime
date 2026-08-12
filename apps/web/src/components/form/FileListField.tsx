'use client';

import {
  DeleteOutlined,
  DownloadOutlined,
  FilePdfOutlined,
  FileImageOutlined,
  ReloadOutlined,
  UploadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { App, Button, Form, Progress, Upload } from 'antd';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import { DOCUMENT_UPLOAD_MIME_TYPES } from '@xeprime/types';
import { getErrorMessage } from '@/services/api-client';
import { validateDocumentFile } from '@/services/upload';
import styles from './FileListField.module.css';

/**
 * Một tài liệu trong form — CHỈ metadata server phát, không có URL nào (Wave 4.1).
 * `id = null` + `status = 'legacy'` là bản ghi Wave 4 cũ: chỉ hiển thị kèm yêu cầu tải lên
 * lại, không tải về/không gỡ được từ client.
 */
export interface UploadedFileItem {
  id: string | null;
  name: string;
  size?: number | null;
  status: 'ready' | 'legacy';
}

interface FileListFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: ReactNode;
  /**
   * Toàn bộ flow upload (presign → PUT → hoàn tất xác minh) do FEATURE cung cấp — component
   * chỉ quản danh sách/tiến độ/thử lại. Trả về metadata của file đã `ready`.
   */
  upload: (file: File, onProgress: (percent: number) => void) => Promise<UploadedFileItem>;
  /** Xin signed URL ngắn hạn SAU khi backend kiểm quyền — không lưu URL ở đâu cả. */
  getDownloadUrl: (item: UploadedFileItem) => Promise<string>;
  /** Trần số tệp — khớp validator (mặc định 10). */
  max?: number;
  help?: ReactNode;
  disabled?: boolean;
}

interface PendingFileUpload {
  id: string;
  file: File;
  progress: number;
  status: 'uploading' | 'error';
  message?: string;
}

/**
 * Danh sách TÀI LIỆU RIÊNG TƯ (PDF/ảnh) nối RHF ↔ upload có xác minh — dùng cho hợp đồng
 * nguồn xe. Cùng kỷ luật với `ImageGalleryField`: upload song song append qua ref, file hỏng
 * không kéo theo file đã xong (partial failure), lỗi có thử lại. Tải về xin URL mới mỗi lần
 * bấm — không giữ URL trong state/DB.
 */
export function FileListField<T extends FieldValues>({
  control,
  name,
  label,
  upload,
  getDownloadUrl,
  max = 10,
  help,
  disabled = false,
}: FileListFieldProps<T>) {
  const { field, fieldState } = useController({ control, name });
  const { message } = App.useApp();
  const [pending, setPending] = useState<PendingFileUpload[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const fieldValue = field.value as UploadedFileItem[] | undefined;
  const items = useMemo(() => fieldValue ?? [], [fieldValue]);

  // Nhiều file song song xong không theo thứ tự render — append qua ref, không dùng closure cũ.
  const itemsRef = useRef<UploadedFileItem[]>(items);
  const pendingRef = useRef<PendingFileUpload[]>(pending);
  const uploadSequence = useRef(0);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  function commit(next: UploadedFileItem[]) {
    itemsRef.current = next;
    field.onChange(next);
  }

  function commitPending(next: PendingFileUpload[]) {
    pendingRef.current = next;
    setPending(next);
  }

  function updatePending(id: string, patch: Partial<PendingFileUpload>) {
    commitPending(
      pendingRef.current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function startUpload(file: File, existingId?: string) {
    uploadSequence.current += 1;
    const id = existingId ?? `${file.name}-${file.lastModified}-${uploadSequence.current}`;
    const item: PendingFileUpload = { id, file, progress: 0, status: 'uploading' };
    if (existingId) {
      updatePending(id, item);
    } else {
      commitPending([...pendingRef.current, item]);
    }

    upload(file, (progress) => updatePending(id, { progress }))
      .then((uploaded) => {
        commit([...itemsRef.current, uploaded]);
        commitPending(pendingRef.current.filter((candidate) => candidate.id !== id));
      })
      .catch((err: unknown) => {
        const error = getErrorMessage(err);
        updatePending(id, { status: 'error', message: error });
        message.error(error);
      });
  }

  function handleSelect(file: File): false {
    if (itemsRef.current.length + pendingRef.current.length >= max) {
      message.warning(`Tối đa ${max} tệp`);
      return false;
    }
    const invalid = validateDocumentFile(file);
    if (invalid) {
      message.error(invalid);
      return false;
    }
    startUpload(file);
    return false; // chặn upload mặc định của AntD — flow presign→PUT→complete do feature lo
  }

  async function handleDownload(item: UploadedFileItem) {
    if (!item.id) return;
    setDownloadingId(item.id);
    try {
      // URL ký sống ~2 phút, xin mới cho từng cú bấm — không giữ lại ở bất cứ đâu.
      const url = await getDownloadUrl(item);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <Form.Item
      label={label}
      validateStatus={fieldState.error ? 'error' : ''}
      help={fieldState.error?.message ?? help ?? 'PDF, JPG, PNG — tối đa 10MB mỗi tệp'}
      className={styles.item}
    >
      <div className={styles.list}>
        {items.map((item) =>
          item.status === 'legacy' ? (
            // Bản ghi Wave 4 cũ (từng là URL public): không link, không gỡ — chờ tải lên lại.
            <div key={`legacy-${item.name}`} className={`${styles.row} ${styles.legacyRow}`}>
              <span className={styles.fileIcon} aria-hidden="true">
                <WarningOutlined />
              </span>
              <span className={styles.fileName} title={item.name}>
                {item.name}
              </span>
              <span className={styles.legacyNote}>
                Tài liệu cũ cần được tải lên lại để bảo đảm quyền riêng tư
              </span>
            </div>
          ) : (
            <div key={item.id} className={styles.row}>
              <span className={styles.fileIcon} aria-hidden="true">
                {item.name.toLowerCase().endsWith('.pdf') ? (
                  <FilePdfOutlined />
                ) : (
                  <FileImageOutlined />
                )}
              </span>
              <span className={styles.fileName} title={item.name}>
                {item.name}
              </span>
              <Button
                size="small"
                type="link"
                icon={<DownloadOutlined />}
                loading={downloadingId === item.id}
                onClick={() => void handleDownload(item)}
              >
                Tải xuống
              </Button>
              {disabled ? null : (
                <button
                  type="button"
                  className={styles.removeBtn}
                  aria-label={`Xoá tệp ${item.name}`}
                  onClick={() => commit(items.filter((candidate) => candidate.id !== item.id))}
                >
                  <DeleteOutlined />
                </button>
              )}
            </div>
          ),
        )}

        {pending.map((item) =>
          item.status === 'error' ? (
            <div key={item.id} className={`${styles.row} ${styles.failedRow}`} role="alert">
              <span className={styles.fileName} title={item.message}>
                {item.file.name} — {item.message}
              </span>
              <button
                type="button"
                className={styles.retryBtn}
                aria-label={`Thử lại ${item.file.name}`}
                onClick={() => startUpload(item.file, item.id)}
              >
                <ReloadOutlined /> Thử lại
              </button>
              <button
                type="button"
                className={styles.removeBtn}
                aria-label={`Bỏ ${item.file.name}`}
                onClick={() =>
                  commitPending(
                    pendingRef.current.filter((candidate) => candidate.id !== item.id),
                  )
                }
              >
                <DeleteOutlined />
              </button>
            </div>
          ) : (
            <div key={item.id} className={styles.row} aria-label={`Đang tải ${item.file.name}`}>
              <span className={styles.fileName}>{item.file.name}</span>
              <Progress className={styles.progress} percent={item.progress} size="small" />
            </div>
          ),
        )}

        {!disabled && items.length + pending.length < max ? (
          <Upload
            accept={DOCUMENT_UPLOAD_MIME_TYPES.join(',')}
            showUploadList={false}
            multiple
            beforeUpload={handleSelect}
          >
            <Button icon={<UploadOutlined />}>Tải lên tài liệu</Button>
          </Upload>
        ) : null}
      </div>
    </Form.Item>
  );
}
