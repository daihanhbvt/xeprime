'use client';

import { CloseOutlined, CloudUploadOutlined, FilePdfOutlined, ReloadOutlined } from '@ant-design/icons';
import { App, Form, Progress, Upload } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import { DOCUMENT_UPLOAD_MAX_BYTES, DOCUMENT_UPLOAD_MIME_TYPES } from '@xeprime/types';
import { PreviewImage } from '@/components/data-display/PreviewImage';
import fieldStyles from '@/components/form/field.module.css';
import { useUploadRejectionMessage } from '@/i18n/use-upload-rejection-message';
import { formatFileSize } from '@/lib/file-size';
import { getErrorMessage } from '@/services/api-client';
import { presignReceiptAttachment, uploadToR2, validateDocumentFile } from '@/services/upload';
import styles from './ReceiptAttachmentsField.module.css';

/** Trần tệp — khớp `ArrayMaxSize(10)` của `CreateReceiptDto`. */
const MAX_FILES = 10;

/**
 * Metadata hiển thị của một tệp ĐÃ tải xong.
 *
 * Không nằm trong giá trị form: API chỉ nhận `string[]` URL (`CreateReceiptDto.attachments`), và
 * nhét tên/kích thước vào field chỉ để rồi vứt đi lúc gửi là làm hợp đồng form lệch hợp đồng API.
 * Form tạo mới luôn có sẵn metadata vì chính nó vừa tải tệp lên, nên state cục bộ là đủ.
 */
interface UploadedDoc {
  url: string;
  name: string;
  size: number;
  type: string;
}

interface PendingDoc {
  id: string;
  file: File;
  progress: number;
  status: 'uploading' | 'error';
  message?: string;
}

interface ReceiptAttachmentsFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: ReactNode;
}

const isPdf = (doc: UploadedDoc) =>
  doc.type === 'application/pdf' || doc.url.toLowerCase().endsWith('.pdf');

/**
 * Chứng từ của phiếu thu/chi: ảnh hoá đơn HOẶC file PDF.
 *
 * Là một dải Ô VUÔNG nhỏ, không phải danh sách dòng: ảnh hoá đơn thì **hiện chính nó** (qua
 * `PreviewImage`, bấm là phóng to như mọi ảnh khác trong sản phẩm) — một thẻ ghi
 * "IMG_2481.jpg · 1.2 MB" không nói được nó là hoá đơn xăng hay ảnh chụp nhầm màn hình, mà đó
 * đúng là câu hỏi người duyệt phiếu sẽ hỏi. PDF không có ảnh thu nhỏ nên giữ icon + tên.
 *
 * Riêng với `ImageGalleryField` vì đây không phải thư viện ảnh: thứ tự giữa các chứng từ không
 * mang nghĩa gì (khác ảnh xe, nơi thứ tự CHÍNH LÀ thứ tự hiện trên marketplace), nên không có
 * kéo-thả sắp xếp.
 */
export function ReceiptAttachmentsField<T extends FieldValues>({
  control,
  name,
  label,
}: ReceiptAttachmentsFieldProps<T>) {
  const t = useTranslations('Finance.receipts.form.attachments');
  const { message } = App.useApp();
  const uploadRejectionMessage = useUploadRejectionMessage();
  const { field, fieldState } = useController({ control, name });

  // `?? []` dựng mảng mới mỗi lần render — vào thẳng deps của effect là effect chạy mọi lần.
  const fieldValue = field.value as string[] | undefined;
  const urls = useMemo(() => fieldValue ?? [], [fieldValue]);
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [pending, setPending] = useState<PendingDoc[]>([]);

  // Nhiều tệp tải xong không theo thứ tự — ghi qua ref để lần sau không đè bằng closure cũ.
  const urlsRef = useRef<string[]>(urls);
  const pendingRef = useRef<PendingDoc[]>(pending);
  const sequence = useRef(0);
  useEffect(() => {
    urlsRef.current = urls;
  }, [urls]);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  function commitPending(next: PendingDoc[]) {
    pendingRef.current = next;
    setPending(next);
  }

  function patchPending(id: string, patch: Partial<PendingDoc>) {
    commitPending(pendingRef.current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function startUpload(file: File, existingId?: string) {
    sequence.current += 1;
    const id = existingId ?? `${file.name}-${file.lastModified}-${sequence.current}`;
    const item: PendingDoc = { id, file, progress: 0, status: 'uploading' };
    if (existingId) patchPending(id, item);
    else commitPending([...pendingRef.current, item]);

    presignReceiptAttachment(file)
      .then(async (ticket) => {
        await uploadToR2(ticket.uploadUrl, file, (progress) => patchPending(id, { progress }));
        return ticket.publicUrl;
      })
      .then((publicUrl) => {
        const next = [...urlsRef.current, publicUrl];
        urlsRef.current = next;
        field.onChange(next);
        setDocs((current) => [
          ...current,
          { url: publicUrl, name: file.name, size: file.size, type: file.type },
        ]);
        commitPending(pendingRef.current.filter((candidate) => candidate.id !== id));
      })
      .catch((err: unknown) => {
        const text = getErrorMessage(err);
        patchPending(id, { status: 'error', message: text });
        message.error(text);
      });
  }

  function handleSelect(file: File): false {
    if (urlsRef.current.length + pendingRef.current.length >= MAX_FILES) {
      message.warning(t('tooMany', { max: MAX_FILES }));
      return false; // chặn upload mặc định của AntD — mình tự PUT lên R2
    }
    const invalid = validateDocumentFile(file);
    if (invalid) {
      message.error(uploadRejectionMessage(invalid));
      return false;
    }
    startUpload(file);
    return false;
  }

  function remove(url: string) {
    const next = urlsRef.current.filter((candidate) => candidate !== url);
    urlsRef.current = next;
    field.onChange(next);
    setDocs((current) => current.filter((doc) => doc.url !== url));
  }

  /*
   * URL có mà metadata không — chỉ xảy ra nếu field được nạp sẵn từ ngoài (form sửa sau này).
   * Vẫn hiện được ô: tên rút từ chính URL, loại đoán theo đuôi. Rơi mất một tệp khỏi dải chỉ vì
   * thiếu tên tệp là cách tệ nhất — người dùng sẽ tưởng nó chưa tải lên và tải lại.
   */
  const tiles: UploadedDoc[] = urls.map(
    (url) =>
      docs.find((doc) => doc.url === url) ?? {
        url,
        name: decodeURIComponent(url.split('/').pop() ?? url),
        size: 0,
        type: '',
      },
  );

  const full = urls.length + pending.length >= MAX_FILES;

  return (
    <Form.Item
      label={label}
      validateStatus={fieldState.error ? 'error' : ''}
      // Điều kiện nhận tệp là MỘT dòng nhỏ dưới dải ô, không phải hai dòng chữ nhồi trong ô thả:
      // nó cần đọc một lần rồi thôi, còn ô thả cần là một mục tiêu để bấm.
      help={fieldState.error?.message ?? t('hint', { maxMb: MAX_MB })}
      className={fieldStyles.item}
    >
      <div className={styles.strip}>
        {tiles.map((doc) => (
          <div key={doc.url} className={styles.tile}>
            {isPdf(doc) ? (
              <span className={styles.doc} title={doc.name}>
                <FilePdfOutlined className={styles.docIcon} aria-hidden="true" />
                <span className={styles.docName}>{doc.name}</span>
              </span>
            ) : (
              <PreviewImage src={doc.url} alt={doc.name} className={styles.image} />
            )}
            <button
              type="button"
              className={styles.remove}
              onClick={() => remove(doc.url)}
              aria-label={t('remove', { name: doc.name })}
              title={`${doc.name}${doc.size ? ` · ${formatFileSize(doc.size)}` : ''}`}
            >
              <CloseOutlined />
            </button>
          </div>
        ))}

        {pending.map((item) =>
          item.status === 'error' ? (
            <div key={item.id} className={`${styles.tile} ${styles.failed}`} role="alert">
              <span className={styles.doc} title={item.message}>
                <span className={styles.docName}>{item.file.name}</span>
              </span>
              <button
                type="button"
                className={styles.retry}
                onClick={() => startUpload(item.file, item.id)}
                aria-label={t('retry', { name: item.file.name })}
              >
                <ReloadOutlined />
              </button>
              <button
                type="button"
                className={styles.remove}
                onClick={() => commitPending(pendingRef.current.filter((c) => c.id !== item.id))}
                aria-label={t('remove', { name: item.file.name })}
              >
                <CloseOutlined />
              </button>
            </div>
          ) : (
            <div
              key={item.id}
              className={styles.tile}
              aria-label={t('uploading', { name: item.file.name })}
            >
              <Progress type="circle" percent={item.progress} size={44} />
            </div>
          ),
        )}

        {full ? null : (
          <Upload
            className={styles.add}
            accept={DOCUMENT_UPLOAD_MIME_TYPES.join(',')}
            showUploadList={false}
            multiple
            beforeUpload={handleSelect}
          >
            <button type="button" className={styles.addTile}>
              <CloudUploadOutlined aria-hidden="true" />
              <span>{t('add')}</span>
            </button>
          </Upload>
        )}
      </div>
    </Form.Item>
  );
}

const MAX_MB = Math.round(DOCUMENT_UPLOAD_MAX_BYTES / (1024 * 1024));
