'use client';

import { ArrowDownOutlined, FileOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Spin } from 'antd';
import {
  CHAT_SEND_STATE,
  DAY_PARAM_FORMAT,
  groupThreadMessages,
  isOwnSideMessage,
  nowInAppTz,
  toAppTz,
} from '@xeprime/domain';
import { useTranslations } from 'next-intl';
import { useMemo, type RefObject } from 'react';
import Link from 'next/link';
import { PreviewImage, PreviewImageGroup } from '@/components/data-display/PreviewImage';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import { messageTripHref, messageVehicleHref } from '../chat-links';
import type { ThreadEntry } from '../hooks/use-thread';
import type { MessageAttachment } from '../types';
import styles from './ChatView.module.css';

interface MessageListProps {
  entries: ThreadEntry[];
  /** Phía người xem — quyết định bong bóng nào bên phải. */
  viewerSide: string;
  /** Có hiện tên người gửi phía gian hàng không (inbox nhiều nhân viên). */
  showSenderNames: boolean;
  loading: boolean;
  error: string | null;
  onReload: () => void;
  hasOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  /**
   * Ba mảnh RỜI của `useThreadScroll`, không phải cả object.
   *
   * Truyền nguyên object thì component nhận một thứ vừa chứa ref vừa chứa hàm, và React Compiler
   * không phân biệt được lượt đọc nào là an toàn — nó bỏ luôn việc ghi nhớ cho cả cây con.
   */
  containerRef: RefObject<HTMLDivElement | null>;
  hasNewBelow: boolean;
  onJumpToLatest: () => void;
  onRetryMessage: (clientMessageId: string) => void;
  onDiscardMessage: (clientMessageId: string) => void;
}

/**
 * Khung tin nhắn.
 *
 * Bên nào là "của tôi" quyết định bằng `senderType` so với PHÍA người xem, KHÔNG bằng
 * `senderUserId === user.id`. Đó là lỗi thật của bản trước ở inbox gian hàng: tin do đồng nghiệp
 * gửi có `senderUserId` khác mình nên bị vẽ như tin của khách, và hội thoại đọc ra ngược nghĩa.
 */
export function MessageList({
  entries,
  viewerSide,
  showSenderNames,
  loading,
  error,
  onReload,
  hasOlder,
  loadingOlder,
  onLoadOlder,
  containerRef,
  hasNewBelow,
  onJumpToLatest,
  onRetryMessage,
  onDiscardMessage,
}: MessageListProps) {
  const t = useTranslations('Chat');
  const fmt = useAppFormat();

  const groups = useMemo(
    () =>
      groupThreadMessages(entries, {
        isMine: (m) => isOwnSideMessage(m.senderType, viewerSide),
        // Khoá gộp gồm NGƯỜI GỬI: hai nhân viên trả lời nối nhau là hai nhóm, nếu không tin của
        // người này đội tên người kia.
        senderKey: (m) => m.senderUserId ?? m.senderType ?? 'system',
        senderName: (m) => m.senderName ?? null,
        dayOf: (sentAt) => toAppTz(sentAt).format(DAY_PARAM_FORMAT),
      }),
    [entries, viewerSide],
  );

  if (loading) {
    return (
      <div className={styles.messages}>
        <div className={styles.centerPane}>
          <Spin />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.messages}>
        <div className={styles.centerPane}>
          <span className={styles.error}>{error}</span>
          <Button size="small" icon={<ReloadOutlined />} onClick={onReload}>
            {t('retry')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.messagesWrap}>
      <div
        className={styles.messages}
        ref={containerRef}
        role="log"
        aria-live="polite"
        aria-label={t('messagesLabel')}
        tabIndex={0}
      >
        {hasOlder ? (
          <div className={styles.loadOlder}>
            <Button size="small" loading={loadingOlder} onClick={onLoadOlder}>
              {t('olderMessages')}
            </Button>
          </div>
        ) : null}

        {entries.length === 0 ? (
          <div className={styles.centerPane}>
            <span className={styles.hint}>{t('emptyThread')}</span>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.key} className={styles.groupWrap}>
              {group.startsDay ? <DaySeparator day={group.day} /> : null}

              <div className={cx(styles.group, group.mine && styles.groupMine)}>
                {showSenderNames && !group.mine && group.senderName ? (
                  <span className={styles.senderName}>{group.senderName}</span>
                ) : null}

                {group.entries.map(({ message, state }) => (
                  <div
                    key={message.id}
                    className={cx(styles.bubbleRow, group.mine && styles.bubbleRowMine)}
                  >
                    <div
                      className={cx(
                        styles.bubble,
                        group.mine && styles.bubbleMine,
                        state === CHAT_SEND_STATE.PENDING && styles.bubblePending,
                        state === CHAT_SEND_STATE.FAILED && styles.bubbleFailed,
                      )}
                    >
                      <ContextCard message={message} viewerSide={viewerSide} />

                      {message.text ? (
                        <span className={styles.bubbleText}>{message.text}</span>
                      ) : null}

                      {message.attachments.length > 0 ? (
                        <PreviewImageGroup>
                          <div className={styles.attachGrid}>
                            {message.attachments.map((a, i) => (
                              <Attachment key={`${message.id}-${i}`} attachment={a} />
                            ))}
                          </div>
                        </PreviewImageGroup>
                      ) : null}

                      <span className={styles.bubbleMeta}>
                        {state === CHAT_SEND_STATE.PENDING ? (
                          <span className={styles.bubbleState}>{t('sending')}</span>
                        ) : state === CHAT_SEND_STATE.FAILED ? (
                          <span className={styles.bubbleStateFailed}>{t('sendFailed')}</span>
                        ) : (
                          <time className={styles.bubbleTime} dateTime={message.sentAt}>
                            {fmt.time(message.sentAt)}
                          </time>
                        )}
                      </span>

                      {state === CHAT_SEND_STATE.FAILED && message.clientMessageId ? (
                        <span className={styles.failedActions}>
                          <Button
                            size="small"
                            type="link"
                            onClick={() => onRetryMessage(message.clientMessageId as string)}
                          >
                            {t('retrySend')}
                          </Button>
                          <Button
                            size="small"
                            type="link"
                            danger
                            onClick={() => onDiscardMessage(message.clientMessageId as string)}
                          >
                            {t('discard')}
                          </Button>
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {hasNewBelow ? (
        <button
          type="button"
          className={styles.newBelow}
          onClick={onJumpToLatest}
        >
          <ArrowDownOutlined /> {t('newMessages')}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Thẻ ngữ cảnh gắn trên một tin nhắn — kiểu trích dẫn: "câu này đang hỏi về chiếc này / chuyến này".
 *
 * Đây là thứ thay cho việc tách hội thoại theo xe. Cùng một thread với gian hàng có thể nói về
 * nhiều chiếc, nhiều chuyến, và thẻ giữ cho từng câu vẫn rõ ngữ cảnh. Có chuyến thì thẻ là thẻ
 * CHUYẾN (ảnh + tên xe của chuyến đó) — bấm vào mở đúng chuyến ở site của người xem.
 */
function ContextCard({
  message,
  viewerSide,
}: {
  message: ThreadEntry['message'];
  viewerSide: string;
}) {
  const t = useTranslations('Chat');
  const fmt = useAppFormat();
  const { vehicle, trip } = message;

  let href: string;
  if (trip) href = messageTripHref(viewerSide, trip);
  else if (vehicle) href = messageVehicleHref(viewerSide, vehicle.id);
  else return null;

  const name = vehicle?.name ?? t('trip');
  const schedule = trip?.pickupAt ? fmt.shortDateTimeRange(trip.pickupAt, trip.returnAt) : null;
  const detail = [trip?.code ? t('tripCode', { code: trip.code }) : null, schedule]
    .filter(Boolean)
    .join(' · ');

  return (
    <Link
      href={href}
      className={styles.vehicleCard}
      aria-label={t('about', { subject: trip ? t('tripOf', { name }) : name })}
    >
      {vehicle?.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- ảnh R2, không qua loader của Next
        <img src={vehicle.imageUrl} alt={name} className={styles.vehicleCardThumb} />
      ) : null}
      <span className={styles.vehicleCardBody}>
        <span className={styles.vehicleCardLabel}>
          {trip ? t('aboutTrip') : t('aboutVehicle')}
        </span>
        <span className={styles.vehicleCardName}>{name}</span>
        {detail ? <span className={styles.vehicleCardDetail}>{detail}</span> : null}
      </span>
    </Link>
  );
}

function DaySeparator({ day }: { day: string }) {
  const t = useTranslations('Chat');
  const fmt = useAppFormat();

  const today = nowInAppTz();
  const label =
    day === today.format(DAY_PARAM_FORMAT)
      ? t('today')
      : day === today.subtract(1, 'day').format(DAY_PARAM_FORMAT)
        ? t('yesterday')
        : fmt.fullDate(toAppTz(`${day}T00:00:00+07:00`));

  return (
    <div className={styles.daySeparator}>
      <span>{label}</span>
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
        loading="lazy"
      />
    );
  }

  return (
    <a href={attachment.url} target="_blank" rel="noreferrer" className={styles.attachFile}>
      <FileOutlined />
      <span className={styles.attachFileName}>{attachment.fileName ?? t('attachment')}</span>
    </a>
  );
}
