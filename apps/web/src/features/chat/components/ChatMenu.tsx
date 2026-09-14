'use client';

import { MessageOutlined, RightOutlined } from '@ant-design/icons';
import { Avatar, Badge, Button, Empty, Popover, Skeleton } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { nowInAppTz, toAppTz } from '@xeprime/domain';
import type { ChatSide } from '@xeprime/types';
import { HeaderIconButton } from '@/components/layout/HeaderIconButton';
import { useIsMobile } from '@/hooks/use-media-query';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import { initialOf } from '@/lib/initials';
import { useChatBadge } from '../hooks/use-chat-badge';
import {
  RECENT_CONVERSATIONS_LIMIT,
  useRecentConversations,
} from '../hooks/use-recent-conversations';
import type { ConversationSummary } from '../types';
import styles from './ChatMenu.module.css';

/** Tham số deep link của `ChatView` — bấm một dòng ở popup mở ĐÚNG hội thoại đó. */
const CONVERSATION_PARAM = 'c';

/**
 * Biểu tượng tin nhắn ở thanh trên cùng — MỘT component cho cả khu khách (`CHAT_SIDE.CUSTOMER`)
 * và cổng quản lý (`CHAT_SIDE.SHOP`).
 *
 * Hai hình thái theo bề rộng màn hình, và đó là chủ đích:
 *
 *  - **Desktop**: popup xem nhanh vài hội thoại gần nhất. Người đang xem một tin đăng không phải
 *    rời trang chỉ để liếc xem khách vừa nhắn gì; bấm một dòng mới nhảy sang màn chat, và nhảy
 *    thẳng tới đúng hội thoại đó (`?c=<id>`).
 *  - **Mobile**: đi THẲNG tới màn chat. Một popup 340px trên màn 390px thì gần bằng cả màn hình
 *    nhưng chỉ hiện được vài dòng — nó là bản sao tệ hơn của chính trang chat, cộng thêm một
 *    nhịp chạm. Ở đó biểu tượng là một liên kết thật, mở tab mới cũng được.
 */
export function ChatMenu({ side }: { side: ChatSide }) {
  const t = useTranslations('Chat');
  const badge = useChatBadge(side);
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (isMobile) {
    return (
      <HeaderIconButton
        icon={<MessageOutlined />}
        label={t('inboxTitle')}
        count={badge.count}
        href={badge.href}
      />
    );
  }

  return (
    <Popover
      content={
        <ChatQuickPanel
          side={badge.side}
          inboxHref={badge.href}
          open={open}
          onNavigate={() => setOpen(false)}
        />
      }
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
      styles={{ content: { padding: 0 } }}
    >
      <HeaderIconButton
        icon={<MessageOutlined />}
        label={t('inboxTitle')}
        count={badge.count}
        active={open}
      />
    </Popover>
  );
}

function ChatQuickPanel({
  side,
  inboxHref,
  open,
  onNavigate,
}: {
  side: ChatSide;
  inboxHref: string;
  open: boolean;
  onNavigate: () => void;
}) {
  const t = useTranslations('Chat');
  // `open` là `enabled` của query: popup đóng thì không có request nào cho một danh sách không ai xem.
  const query = useRecentConversations(side, open);
  const items = query.data?.items.slice(0, RECENT_CONVERSATIONS_LIMIT) ?? [];

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <span className={styles.title}>{t('inboxTitle')}</span>
      </div>

      <div className={styles.body}>
        {query.isPending ? (
          <div className={styles.skeleton}>
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} avatar active paragraph={{ rows: 1 }} title={{ width: '55%' }} />
            ))}
          </div>
        ) : query.isError ? (
          <div className={styles.center}>
            <span className={styles.error}>{t('loadError')}</span>
            <Button size="small" onClick={() => void query.refetch()}>
              {t('retry')}
            </Button>
          </div>
        ) : items.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t('empty')}
            className={styles.empty}
          />
        ) : (
          <ul className={styles.list}>
            {items.map((conversation) => (
              <li key={conversation.id}>
                <ConversationRow
                  conversation={conversation}
                  inboxHref={inboxHref}
                  onNavigate={onNavigate}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Lối ra luôn có mặt, kể cả khi hộp thư rỗng — popup không bao giờ là ngõ cụt. */}
      <Link href={inboxHref} className={styles.viewAll} onClick={onNavigate}>
        {t('viewAll')}
        <RightOutlined aria-hidden="true" />
      </Link>
    </div>
  );
}

function ConversationRow({
  conversation,
  inboxHref,
  onNavigate,
}: {
  conversation: ConversationSummary;
  inboxHref: string;
  onNavigate: () => void;
}) {
  const t = useTranslations('Chat');
  const stamp = useConversationStamp();

  const unread = conversation.unread > 0;
  const preview =
    conversation.lastMessageText ??
    (conversation.vehicleName
      ? t('about', { subject: conversation.vehicleName })
      : t('startConversation'));

  return (
    <Link
      // Là LIÊN KẾT thật chứ không phải `router.push` trong `onClick`: mở tab mới, sao chép địa
      // chỉ và bấm giữa chuột đều hoạt động như mọi dòng danh sách khác trong sản phẩm.
      href={`${inboxHref}?${CONVERSATION_PARAM}=${encodeURIComponent(conversation.id)}`}
      className={cx(styles.item, unread && styles.itemUnread)}
      onClick={onNavigate}
    >
      <Avatar
        size={38}
        src={conversation.partyAvatarUrl ?? undefined}
        className={styles.itemAvatar}
      >
        {initialOf(conversation.partyName)}
      </Avatar>

      <span className={styles.itemBody}>
        <span className={styles.itemTop}>
          <span className={cx(styles.itemName, unread && styles.itemNameUnread)}>
            {conversation.partyName}
          </span>
          {conversation.lastMessageAt ? (
            <time className={styles.itemTime} dateTime={conversation.lastMessageAt}>
              {stamp(conversation.lastMessageAt)}
            </time>
          ) : null}
        </span>

        <span className={styles.itemBottom}>
          <span className={cx(styles.itemPreview, unread && styles.itemPreviewUnread)}>
            {preview}
          </span>
          {unread ? (
            <Badge
              count={conversation.unread}
              overflowCount={99}
              size="small"
              title={t('unreadCount', { count: conversation.unread })}
            />
          ) : null}
        </span>
      </span>
    </Link>
  );
}

/**
 * Mốc thời gian kiểu hộp thư: hôm nay chỉ cần giờ, hôm qua cần một chữ, xa hơn thì ngày/tháng.
 *
 * Không dùng `fmt.dateTime` ở đây: một dòng rộng ~230px không đủ chỗ cho "10:24 14/09/2026", và
 * cái người ta liếc tìm trong hộp thư là "mới hay cũ", không phải một mốc chính xác tới phút của
 * ba tuần trước.
 */
function useConversationStamp() {
  const t = useTranslations('Chat');
  const fmt = useAppFormat();

  return (value: string) => {
    const at = toAppTz(value);
    const today = nowInAppTz();
    if (at.isSame(today, 'day')) return at.format('HH:mm');
    if (at.isSame(today.subtract(1, 'day'), 'day')) return t('yesterday');
    return fmt.date(value);
  };
}
