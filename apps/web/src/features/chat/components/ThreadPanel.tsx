'use client';

import { ArrowLeftOutlined } from '@ant-design/icons';
import { Button, Spin } from 'antd';
import { useEffect, useRef } from 'react';
import { cx } from '@/lib/cx';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useThread } from '../hooks/use-thread';
import type { ConversationSummary, MessageAttachment } from '../types';
import { MessageComposer } from './MessageComposer';
import { PreviewImage } from '@/components/data-display/PreviewImage';
import styles from './ChatView.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import { useTranslations } from 'next-intl';

/** Khung tin nhắn của một hội thoại. */
export function ThreadPanel({
  conversation,
  onBack,
}: {
  conversation: ConversationSummary;
  onBack?: () => void;
}) {
  const t = useTranslations('Chat');
  const fmt = useAppFormat();

  const { data: user } = useCurrentUser();
  const { messages, loading, loadingOlder, error, nextBefore, loadOlder, pushLocal } = useThread(
    conversation.id,
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages.length]);

  return (
    <div className={styles.thread}>
      <header className={styles.threadHead}>
        {onBack ? (
          <Button
            type="text"
            size="small"
            icon={<ArrowLeftOutlined />}
            onClick={onBack}
            className={styles.backBtn}
            aria-label={t('back')}
          />
        ) : null}
        <div className={styles.threadTitleWrap}>
          <div className={styles.threadTitle}>{conversation.partyName}</div>
          {conversation.vehicleName ? (
            <div className={styles.threadSub}>{conversation.vehicleName}</div>
          ) : null}
        </div>
      </header>

      <div className={styles.messages}>
        {loading ? (
          <div className={styles.centerPane}>
            <Spin />
          </div>
        ) : error ? (
          <div className={styles.centerPane}>
            <span className={styles.error}>{error}</span>
          </div>
        ) : (
          <>
            {nextBefore ? (
              <div className={styles.loadOlder}>
                <Button size="small" loading={loadingOlder} onClick={loadOlder}>
                  {t('olderMessages')}
                </Button>
              </div>
            ) : null}

            {messages.length === 0 ? (
              <div className={styles.centerPane}>
                <span className={styles.hint}>{t('emptyThread')}</span>
              </div>
            ) : (
              messages.map((m) => {
                const mine = m.senderUserId != null && m.senderUserId === user?.id;
                return (
                  <div key={m.id} className={cx(styles.bubbleRow, mine && styles.bubbleRowMine)}>
                    <div className={cx(styles.bubble, mine && styles.bubbleMine)}>
                      {m.text ? <span className={styles.bubbleText}>{m.text}</span> : null}
                      {m.attachments.map((a, i) => (
                        <Attachment key={i} attachment={a} />
                      ))}
                      <span className={styles.bubbleTime}>{fmt.dateTime(m.sentAt)}</span>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      <MessageComposer conversationId={conversation.id} onSent={pushLocal} />
    </div>
  );
}

function Attachment({ attachment }: { attachment: MessageAttachment }) {
  const t = useTranslations('Chat');
  if (attachment.fileType?.startsWith('image/')) {
    // Bấm ảnh mở trình xem toàn màn hình ngay trong app — không nhảy sang tab mới.
    return (
      <PreviewImage
        src={attachment.url}
        alt={attachment.fileName ?? t('imageAlt')}
        className={styles.attachImage}
      />
    );
  }
  return (
    <a href={attachment.url} target="_blank" rel="noreferrer" className={styles.attachFile}>
      {attachment.fileName ?? t('attachment')}
    </a>
  );
}
