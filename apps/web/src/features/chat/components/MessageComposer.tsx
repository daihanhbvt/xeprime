'use client';

import { CloseOutlined, FileOutlined, PaperClipOutlined, SendOutlined } from '@ant-design/icons';
import { App, Button, Input, Progress } from 'antd';
import { useTranslations } from 'next-intl';
import { useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { newClientMessageId } from '@xeprime/domain';
import { CHAT_ATTACHMENT_MAX_COUNT } from '@xeprime/types';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import {
  CHAT_ATTACHMENT_ACCEPT,
  uploadChatAttachment,
  validateChatAttachment,
  type UploadedChatAttachment,
} from '../api';
import type { SendAttachment } from '../hooks/use-thread';
import type { PendingVehicleContext } from '../hooks/use-vehicle-context';
import styles from './ChatView.module.css';

const MAX_ATTACHMENTS = CHAT_ATTACHMENT_MAX_COUNT;

interface PendingAttachment {
  key: string;
  fileName: string;
  fileType: string;
  previewUrl: string | null;
  percent: number;
  /** `null` khi đang tải; có giá trị khi đã lên R2 xong và sẵn sàng gắn vào tin. */
  uploaded: UploadedChatAttachment | null;
  failed: boolean;
}

/**
 * Ô soạn tin: text nhiều dòng + đính kèm (presign → PUT R2 → gửi message tham chiếu URL).
 *
 * Tệp được tải lên NGAY khi chọn, không đợi bấm Gửi: người dùng nhìn thấy tiến trình thật và có
 * thể gõ chú thích trong lúc ảnh đang bay. Bấm Gửi khi đó chỉ ghép các URL đã có — thao tác tức
 * thì, thay vì một nút treo mấy giây không rõ đang làm gì.
 */
export function MessageComposer({
  onSend,
  disabled,
  vehicleContext,
  onClearVehicleContext,
}: {
  onSend: (input: {
    text?: string;
    attachments?: SendAttachment[];
    vehicleId?: string;
  }) => Promise<void>;
  disabled?: boolean;
  /** Xe vừa mở chat từ tin đăng của nó — gắn vào câu ĐẦU TIÊN rồi thôi. */
  vehicleContext?: PendingVehicleContext | null;
  onClearVehicleContext?: () => void;
}) {
  const t = useTranslations('Chat');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();

  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /*
   * Chốt CHỐNG GỬI ĐÔI bằng ref, không bằng `sending`.
   *
   * `setSending(true)` chỉ có hiệu lực ở lần render sau, nên Enter giữ tay hoặc double-click
   * vẫn lọt hai lần qua một điều kiện đọc state. Ref đổi ngay trong cùng một lượt gọi.
   * (Server cũng idempotent theo `clientMessageId`, nhưng hai request thừa vẫn là hai request.)
   */
  const inFlight = useRef(false);

  const uploading = attachments.some((a) => a.uploaded === null && !a.failed);
  const ready = attachments.filter((a) => a.uploaded).map((a) => a.uploaded as UploadedChatAttachment);
  const canSend = !disabled && !sending && !uploading && (text.trim().length > 0 || ready.length > 0);

  const submit = async () => {
    if (inFlight.current) return;
    const trimmed = text.trim();
    if (disabled || uploading || (!trimmed && ready.length === 0)) return;

    inFlight.current = true;
    setSending(true);

    // Dọn ô nhập TRƯỚC khi await: tin đã nằm trong danh sách ở trạng thái `pending`, và giữ chữ
    // lại trong ô là mời người dùng gõ tiếp lên trên nội dung vừa gửi.
    setText('');
    setAttachments((prev) => {
      // Ảnh xem trước đã lên R2 rồi; bong bóng tin đọc URL công khai, không đọc `blob:` này nữa.
      // Không thu hồi ở đây thì mỗi tin có ảnh để lại một bản sao trong bộ nhớ tab cho tới F5.
      prev.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
      return [];
    });

    try {
      await onSend({
        ...(trimmed ? { text: trimmed } : {}),
        ...(ready.length ? { attachments: ready } : {}),
        ...(vehicleContext ? { vehicleId: vehicleContext.id } : {}),
      });
      // Thẻ chỉ đi kèm câu ĐẦU TIÊN: những câu sau vẫn trong cùng chủ đề, lặp thẻ ở mỗi bong
      // bóng chỉ làm dòng hội thoại rối chứ không thêm thông tin.
      onClearVehicleContext?.();
    } catch (err) {
      // Tin đã chuyển sang `failed` trong danh sách với đủ nội dung để bấm gửi lại — nên chỗ này
      // chỉ cần nói ra, không cần dựng lại ô nhập.
      message.error(errorMessage(err));
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // `isComposing`: bộ gõ tiếng Việt xác nhận dấu bằng Enter — không có nhánh này thì gõ "à"
    // sẽ gửi mất một tin dở.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  };

  const onPickFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    const room = MAX_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      message.warning(t('attachmentLimit', { count: MAX_ATTACHMENTS }));
      return;
    }
    if (files.length > room) {
      message.warning(t('attachmentLimit', { count: MAX_ATTACHMENTS }));
    }

    for (const file of files.slice(0, room)) {
      const rejection = validateChatAttachment(file);
      if (rejection) {
        message.error(rejection === 'type' ? t('attachmentType') : t('attachmentTooLarge'));
        continue;
      }
      void startUpload(file);
    }
  };

  const startUpload = async (file: File) => {
    const key = newClientMessageId();
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;

    setAttachments((prev) => [
      ...prev,
      {
        key,
        fileName: file.name,
        fileType: file.type,
        previewUrl,
        percent: 0,
        uploaded: null,
        failed: false,
      },
    ]);

    try {
      const uploaded = await uploadChatAttachment(file, (percent) => {
        setAttachments((prev) => prev.map((a) => (a.key === key ? { ...a, percent } : a)));
      });
      setAttachments((prev) =>
        prev.map((a) => (a.key === key ? { ...a, uploaded, percent: 100 } : a)),
      );
    } catch (err) {
      setAttachments((prev) => prev.map((a) => (a.key === key ? { ...a, failed: true } : a)));
      message.error(errorMessage(err));
    }
  };

  const removeAttachment = (key: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.key === key);
      // `createObjectURL` giữ file trong bộ nhớ tới khi được thu hồi — bỏ qua là rò từng ảnh một.
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.key !== key);
    });
  };

  return (
    <div className={styles.composer}>
      {vehicleContext ? (
        <div className={styles.contextChip}>
          {vehicleContext.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- ảnh R2, không qua loader của Next
            <img src={vehicleContext.imageUrl} alt={vehicleContext.name} className={styles.contextThumb} />
          ) : null}
          <span className={styles.contextBody}>
            <span className={styles.contextLabel}>{t('aboutVehicle')}</span>
            <span className={styles.contextName}>{vehicleContext.name}</span>
          </span>
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            aria-label={t('clearVehicleContext')}
            onClick={onClearVehicleContext}
          />
        </div>
      ) : null}

      {attachments.length > 0 ? (
        <div className={styles.tray}>
          {attachments.map((a) => (
            <div key={a.key} className={cx(styles.trayItem, a.failed && styles.trayItemFailed)}>
              {a.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- blob: cục bộ, không qua loader ảnh của Next
                <img src={a.previewUrl} alt={a.fileName} className={styles.trayThumb} />
              ) : (
                <span className={styles.trayFileIcon}>
                  <FileOutlined />
                </span>
              )}

              <span className={styles.trayName}>{a.fileName}</span>

              {a.failed ? (
                <span className={styles.trayFailed}>{t('uploadFailed')}</span>
              ) : a.uploaded ? null : (
                <Progress percent={a.percent} size="small" showInfo={false} />
              )}

              <Button
                type="text"
                size="small"
                icon={<CloseOutlined />}
                aria-label={t('removeAttachment', { name: a.fileName })}
                onClick={() => removeAttachment(a.key)}
              />
            </div>
          ))}
        </div>
      ) : null}

      <div className={styles.composerRow}>
        <input
          ref={fileRef}
          type="file"
          hidden
          multiple
          accept={CHAT_ATTACHMENT_ACCEPT}
          onChange={onPickFiles}
        />
        <Button
          type="text"
          icon={<PaperClipOutlined />}
          onClick={() => fileRef.current?.click()}
          disabled={disabled || attachments.length >= MAX_ATTACHMENTS}
          aria-label={t('attach')}
        />
        <Input.TextArea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('inputPlaceholder')}
          // `autoSize` với trần 5 dòng: khung tin nhắn là `flex: 1` nên ô cao lên đẩy nó thấp
          // xuống thay vì đội cả trang — không có bước nhảy bố cục.
          autoSize={{ minRows: 1, maxRows: 5 }}
          disabled={disabled}
          className={styles.composerInput}
          aria-label={t('inputPlaceholder')}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          loading={sending || uploading}
          disabled={!canSend}
          onClick={() => void submit()}
          aria-label={t('send')}
        />
      </div>
    </div>
  );
}
