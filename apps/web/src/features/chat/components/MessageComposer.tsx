'use client';

import { PaperClipOutlined, SendOutlined } from '@ant-design/icons';
import { App, Button, Input } from 'antd';
import { useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { getErrorMessage } from '@/services/api-client';
import { presignChatAttachment, uploadToR2 } from '../api';
import { useSendMessage } from '../hooks/use-chat-mutations';
import type { ChatMessage } from '../types';
import styles from './ChatView.module.css';
import { useTranslations } from 'next-intl';

/** Ô soạn tin: text + đính kèm (presign → PUT R2 → gửi message tham chiếu URL). */
export function MessageComposer({
  conversationId,
  onSent,
}: {
  conversationId: string;
  onSent: (message: ChatMessage) => void;
}) {
  const t = useTranslations('Chat');
  const { message } = App.useApp();
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const send = useSendMessage(conversationId);

  const submitText = () => {
    const trimmed = text.trim();
    if (!trimmed || send.isPending) return;
    send.mutate(
      { text: trimmed },
      {
        onSuccess: (m) => {
          setText('');
          onSent(m);
        },
        onError: (e) => message.error(getErrorMessage(e)),
      },
    );
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitText();
    }
  };

  const onPickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const contentType = file.type || 'application/octet-stream';
      const presign = await presignChatAttachment(file.name, contentType);
      await uploadToR2(presign.uploadUrl, file);
      send.mutate(
        {
          attachments: [
            {
              url: presign.publicUrl,
              fileType: file.type || undefined,
              fileName: file.name,
              fileSize: file.size,
            },
          ],
        },
        {
          onSuccess: (m) => onSent(m),
          onError: (er) => message.error(getErrorMessage(er)),
        },
      );
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={styles.composer}>
      <input ref={fileRef} type="file" hidden onChange={onPickFile} />
      <Button
        type="text"
        icon={<PaperClipOutlined />}
        loading={uploading}
        onClick={() => fileRef.current?.click()}
        aria-label={t('attach')}
      />
      <Input.TextArea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={t('inputPlaceholder')}
        autoSize={{ minRows: 1, maxRows: 4 }}
        className={styles.composerInput}
      />
      <Button
        type="primary"
        icon={<SendOutlined />}
        loading={send.isPending}
        onClick={submitText}
        aria-label={t('send')}
      />
    </div>
  );
}
