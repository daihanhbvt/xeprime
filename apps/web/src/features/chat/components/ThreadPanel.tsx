'use client';

import { ArrowLeftOutlined } from '@ant-design/icons';
import { Avatar, Button } from 'antd';
import { isOwnSideMessage } from '@xeprime/domain';
import { CHAT_SIDE } from '@xeprime/types';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { initialOf } from '@/lib/initials';
import { useThread } from '../hooks/use-thread';
import { useVehicleContext } from '../hooks/use-vehicle-context';
import { useThreadScroll } from '../hooks/use-thread-scroll';
import type { ConversationSummary } from '../types';
import { MessageComposer } from './MessageComposer';
import { MessageList } from './MessageList';
import styles from './ChatView.module.css';

/**
 * Khung một hội thoại: đầu trang (đối phương + ngữ cảnh xe), khung tin, ô soạn.
 *
 * Component này KHÔNG được remount theo `key={conversation.id}` nữa. `useThread` và
 * `useThreadScroll` đều tự reset theo `conversationId` (bộ đếm thế hệ + hiệu ứng reset), và
 * remount thì `MessageComposer` mất luôn chữ đang gõ dở mỗi lần danh sách hội thoại được làm
 * mới và tạo lại object `conversation`.
 */
export function ThreadPanel({
  conversation,
  onBack,
  pendingVehicleId,
  onClearPendingVehicle,
}: {
  conversation: ConversationSummary;
  onBack?: () => void;
  /** Xe vừa mở chat từ tin đăng của nó — chờ gắn vào câu nhắn đầu tiên. */
  pendingVehicleId?: string | null;
  onClearPendingVehicle?: () => void;
}) {
  const t = useTranslations('Chat');
  const thread = useThread(conversation.id);
  const vehicleContext = useVehicleContext(pendingVehicleId ?? null);

  const last = thread.entries[thread.entries.length - 1];
  const viewerSide = conversation.side;

  const scroll = useThreadScroll({
    conversationId: conversation.id,
    lastMessageId: last?.message.id ?? null,
    messageCount: thread.entries.length,
    lastMessageIsMine: isOwnSideMessage(last?.message.senderType, viewerSide),
    ready: !thread.loading,
  });

  /**
   * Tải tin cũ: đo chiều cao TRƯỚC, khôi phục SAU khi danh sách đã dài thêm.
   *
   * Cặp đo–khôi phục phải ôm trọn `await`, vì đó chính là khoảng mà nội dung mọc thêm ở phía
   * trên. Thiếu nó thì viewport nhảy về đầu danh sách và người đọc mất chỗ đang đọc.
   */
  const loadOlder = useCallback(async () => {
    const restore = scroll.captureAnchor();
    await thread.loadOlder();
    restore();
  }, [scroll, thread]);

  const jumpToLatest = useCallback(() => scroll.scrollToBottom('smooth'), [scroll]);

  return (
    <div className={styles.thread}>
      <header className={styles.threadHead}>
        {onBack ? (
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={onBack}
            className={styles.backBtn}
            aria-label={t('back')}
          />
        ) : null}

        <Avatar size={40} src={conversation.partyAvatarUrl ?? undefined}>
          {initialOf(conversation.partyName)}
        </Avatar>

        {/*
          Đầu trang chỉ còn ĐỐI PHƯƠNG.

          Trước đây nó gắn tên một chiếc xe và một nút "Xem tin đăng", vì mỗi hội thoại thuộc về
          đúng một xe. Giờ một thread nói về nhiều xe, nên đặt một chiếc lên đầu trang là nói sai
          về phần còn lại của cuộc trò chuyện — ngữ cảnh chuyển xuống thẻ trên từng tin nhắn, nơi
          nó gắn với đúng câu đã hỏi.
        */}
        <div className={styles.threadTitleWrap}>
          <div className={styles.threadTitle}>{conversation.partyName}</div>
        </div>
      </header>

      <MessageList
        entries={thread.entries}
        viewerSide={viewerSide}
        // Chỉ inbox gian hàng cần tên người gửi: nhiều nhân viên cùng trực một hội thoại. Khách
        // luôn nói chuyện với "gian hàng", nên gắn tên nhân viên ở đó chỉ là nhiễu.
        showSenderNames={viewerSide === CHAT_SIDE.SHOP}
        loading={thread.loading}
        error={thread.error}
        onReload={thread.reload}
        hasOlder={thread.hasOlder}
        loadingOlder={thread.loadingOlder}
        onLoadOlder={() => void loadOlder()}
        containerRef={scroll.containerRef}
        hasNewBelow={scroll.hasNewBelow}
        onJumpToLatest={jumpToLatest}
        onRetryMessage={(id) => void thread.retry(id)}
        onDiscardMessage={thread.discard}
      />

      <MessageComposer
        onSend={thread.send}
        disabled={thread.loading || thread.error !== null}
        vehicleContext={vehicleContext}
        {...(onClearPendingVehicle ? { onClearVehicleContext: onClearPendingVehicle } : {})}
      />
    </div>
  );
}
