import { memo, useCallback, useMemo, useState } from 'react';
import { ListLoadingFooter } from '@/components/ui/DotsLoader';
import { FlatList, Pressable, RefreshControl, type ListRenderItemInfo } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { nowInAppTz, toAppTz } from '@xeprime/domain';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { HeaderChip } from '@/components/layout/HeaderChip';
import { LineIcon } from '@/components/icons/LineIcon';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { badgeOffset, CountBadge, HEADER_BADGE_MAX } from '@/components/ui/CountBadge';
import { ListEnd } from '@/components/ui/ListEnd';
import { ListRowSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useBadges } from '@/features/badges/hooks/use-badges';
import { PartnerMenuIcon } from '@/features/shell/PartnerMenuIcon';
import { useRelativeTimeLabel } from '@/i18n/use-relative-time';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { LIST_TUNING } from '@/theme/list-tuning';
import { useAppStyles } from '@/theme/styles';
import { makeStyles, useAppScheme, useColors } from '@/theme/ThemeProvider';
import { fontWeight, iconSize, radius, sizing, space, typeScale } from '@/theme/tokens';
import type { NotificationItem } from '@/features/notifications/api';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationsInfinite,
} from '../hooks/use-notifications';
import {
  NOTIFICATION_CONTEXT,
  notificationHref,
  notificationLook,
  type NotificationContext,
  type NotificationLook,
} from '../notification-display';

const SKELETON_ROWS = 5;

/** Tấm trượt chiếm nhiều màn hơn mặc định: đây là một DANH SÁCH, không phải một menu ba dòng. */
const SHEET_MAX_RATIO = 0.85;

/*
 * Số đo Figma "Notification Item" (tấm Thông báo `24512:124878`, người dùng chốt 20/11/2026 cho
 * cả hai app): dòng đệm 16, cách 12, kẻ đáy 1 `stroke/gray-100`; ô icon trắng đệm 8 bo 12 bóng
 * `0 1 1 /5%`, icon 20; tiêu đề 14/20 semibold; nội dung 14/20 `text/gray/medium` tối đa 2 dòng;
 * giờ 14/20 NGHIÊNG `text/gray/very-low`; chấm chưa đọc 6 `status/success`. Dòng CHƯA đọc nền
 * `bg/gray-50`, đã đọc nền trắng. Nhóm "HÔM NAY" / "TRƯỚC ĐÂY" 12/18 semibold `text/gray/very-low`.
 */
const UNREAD_DOT = 6;
const ROW_PAD = 16;
const ROW_GAP = 12;
const TILE_PAD = 8;
const TILE_ICON = 20;
const BODY_LINES = 2;
const GROUP_PAD_TOP_FIRST = 20;
const GROUP_PAD = 16;
const TILE_SHADOW = { boxShadow: '0px 1px 1px 0px rgba(10, 13, 18, 0.05)' } as const;
/** `Status/warning-500` - icon cam của Figma (token `color-warning` #e07b26 là sắc khác). */
const FIGMA_ORANGE = '#f79009';
const FIGMA_ORANGE_DARK = '#fdb022';

type SheetEntry =
  | { kind: 'group'; key: string; label: string; first: boolean }
  | { kind: 'item'; key: string; item: NotificationItem };

const entryKey = (entry: SheetEntry) => entry.key;

/**
 * Chuông thông báo (COM-04) — badge số chưa đọc + tấm trượt danh sách.
 *
 * Dùng chung ở thanh trên khu khách (`context="customer"`) và header khu quản lý
 * (`context="manage"`), y như web dùng một `NotificationBell` cho `MarketHeader` và `Topbar`.
 * Đích click-through suy từ `targetType` + bề mặt đang xem (`notificationHref`), và bảng phân
 * nhánh đó nằm ở `@xeprime/domain` — cùng hàm server dùng để đóng băng `data_json.url`.
 *
 * Khác web ở TRÌNH BÀY, không ở chức năng: popover đổi thành `BottomSheet` (một popover neo vào
 * icon trên màn 360dp thì hoặc che hết màn hoặc rộng 200px), và danh sách nối trang khi cuộn thay
 * vì dừng ở trang đầu — tấm trượt cuộn được nên không có lý do vứt đi phần còn lại.
 *
 * ĐÂY LÀ IN-APP, KHÔNG PHẢI PUSH: đăng ký device token và nhận FCM/APNs là việc của COM-07
 * (`use-push-notifications.ts`) — không có chỗ nào ở đây đụng tới token đẩy. Hai đợt gặp nhau ở
 * chỗ khác: nhận push ở tiền cảnh thì COM-07 invalidate query, và chuông này tự làm mới.
 */
export function NotificationBell({
  context,
  compact = false,
  chip = false,
  chipShape = 'round',
}: {
  context: NotificationContext;
  /** Vẽ nhỏ lại, vùng chạm giữ nguyên — cho thanh trên CHẬT của khu quản lý. */
  compact?: boolean;
  /** Vòng tròn có viền + bóng như `HeaderIconButton` web — thanh trên khu khách. */
  chip?: boolean;
  /** Dạng chip: `square` - ô 42 bo 12 của đầu Tổng quan app Partner (Figma Overview MB). */
  chipShape?: 'round' | 'square';
}) {
  const appStyles = useAppStyles();
  const colors = useColors();
  const styles = useStyles();
  const t = useTranslations('Notifications');
  const navigateOnce = useNavigateOnce();

  const [open, setOpen] = useState(false);

  const unreadCount = useBadges().notificationsUnread;
  const list = useNotificationsInfinite(open);
  // Kéo để làm mới danh sách trong tấm (kèm số chưa đọc — `refreshBadges` nằm trong lượt đọc).
  const pull = usePullRefresh(list.refetch);
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const items = useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  /**
   * Đích của một dòng — ĐÍCH ĐÃ ĐÓNG BĂNG thắng, suy lại từ `targetType` chỉ là đường lùi.
   *
   * `GET /notifications` lọc theo `userId` chứ KHÔNG theo audience, nên chuông ở khu khách liệt
   * kê cả thông báo phát cho vai gian hàng của chính người đó — đúng người dùng mà
   * `ChatBadgeButton` sinh ra để phục vụ. Suy đích từ BỀ MẶT ĐANG ĐỨNG khi đó mở
   * `/chat/:id` với `side=customer` cho một hội thoại của gian hàng, và server trả 403; với
   * `booking` thì ra `/trips/<id đơn của shop>` và trả 404.
   *
   * `url` do server giải lúc PHÁT, nơi duy nhất biết audience. Vẫn phải đi qua allowlist của app
   * (`deep-link.ts`): nó là dữ liệu trên dây, không phải lệnh.
   *
   * Nhánh lùi chỉ phục vụ dòng phát TRƯỚC 10/09/2026 — lúc đó `data_json` chưa tồn tại. Khi
   * `url` CÓ mà allowlist từ chối thì dừng hẳn, không rơi xuống bảng suy: một đích bị từ chối là
   * tín hiệu app cũ hơn server, và đoán bừa ở đó sẽ mở sai màn.
   */
  const handleItem = useCallback(
    (item: NotificationItem) => {
      if (!item.readAt) markRead.mutate(item.id);
      const href = notificationHref(item, context);
      setOpen(false);
      if (href) navigateOnce(href);
    },
    [context, markRead, navigateOnce],
  );

  /** Giờ của một dòng - "3 phút trước" / "Hôm qua 08h30" (`useRelativeTimeLabel`). */
  const timeLabel = useRelativeTimeLabel();

  // Hai nhóm "HÔM NAY" / "TRƯỚC ĐÂY" (Figma) - server đã xếp mới trước.
  const entries = useMemo<SheetEntry[]>(() => {
    const now = nowInAppTz();
    const today: NotificationItem[] = [];
    const earlier: NotificationItem[] = [];
    for (const item of items) {
      (toAppTz(item.createdAt).isSame(now, 'day') ? today : earlier).push(item);
    }
    const out: SheetEntry[] = [];
    const push = (key: string, label: string, group: NotificationItem[]) => {
      if (group.length === 0) return;
      out.push({ kind: 'group', key, label, first: out.length === 0 });
      for (const item of group) out.push({ kind: 'item', key: item.id, item });
    };
    push('group-today', t('groupToday'), today);
    push('group-earlier', t('groupEarlier'), earlier);
    return out;
  }, [items, t]);

  const renderItem = useCallback(
    ({ item: entry }: ListRenderItemInfo<SheetEntry>) =>
      entry.kind === 'group' ? (
        <GroupLabel label={entry.label} first={entry.first} />
      ) : (
        <NotificationRow
          item={entry.item}
          timeLabel={timeLabel(entry.item.createdAt)}
          unreadLabel={t('unreadMark')}
          onPress={handleItem}
        />
      ),
    [handleItem, t, timeLabel],
  );

  const canMarkAll = unreadCount > 0 && !markAll.isPending;

  return (
    <>
      {chip ? (
        <HeaderChip
          // Khu khách vẽ chuông bằng bộ icon nét design v2 (web `LineIcon name="bell"`).
          icon={{ line: chipShape === 'square' ? 'notification' : 'bell' }}
          shape={chipShape}
          onPress={() => setOpen(true)}
          accessibilityLabel={
            unreadCount > 0 ? t('bellWithCount', { count: unreadCount }) : t('title')
          }
          badgeCount={unreadCount}
        />
      ) : (
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={
            unreadCount > 0 ? t('bellWithCount', { count: unreadCount }) : t('title')
          }
          hitSlop={compact ? Math.ceil((sizing.touchTarget - sizing.compactBox) / 2) : space.xs}
          style={compact ? styles.bellCompact : styles.bell}
        >
          {/* Web: site partner `LineIcon name="notification"`, site khách `LineIcon name="bell"`. */}
          <LineIcon
            name={context === NOTIFICATION_CONTEXT.CUSTOMER ? 'bell' : 'notification'}
            size={compact ? iconSize.sm : iconSize.md}
            color={colors.text}
          />
          {unreadCount > 0 ? (
            <YStack
              pos="absolute"
              {...badgeOffset(
                compact ? sizing.compactBox : sizing.touchTarget,
                compact ? iconSize.sm : iconSize.md,
              )}
            >
              <CountBadge count={unreadCount} tone="danger" size="sm" max={HEADER_BADGE_MAX} />
            </YStack>
          ) : null}
        </Pressable>
      )}

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('title')}
        maxRatio={SHEET_MAX_RATIO}
        padded={false}
        chrome="v2"
        headerDivider
        headerAction={
          // Figma không vẽ - người dùng chốt: link chữ nhỏ cạnh ✕ (20/11/2026).
          <Pressable
            onPress={() => markAll.mutate()}
            disabled={!canMarkAll}
            accessibilityRole="button"
            accessibilityLabel={t('markAllRead')}
            accessibilityState={{ disabled: !canMarkAll }}
            hitSlop={space.sm}
          >
            <Text
              col={canMarkAll ? colors.accentText : colors.textDisabled}
              fos={typeScale.body.fontSize}
              lh={typeScale.body.lineHeight}
              fow={fontWeight.medium}
            >
              {t('markAllShort')}
            </Text>
          </Pressable>
        }
        /*
          Danh sách thông báo là `FlatList` — nó phải tự cuộn, không nằm trong vùng cuộn của tấm
          trượt. Lồng vào đó là cảnh báo "VirtualizedList should never be nested inside plain
          ScrollViews", và kèm theo là ảo hoá mất tác dụng lẫn `onEndReached` không bao giờ bắn
          (tức không tải được trang thông báo thứ hai).
        */
        scroll={false}
      >

        {list.isPending ? (
          <YStack>
            {Array.from({ length: SKELETON_ROWS }, (_, i) => (
              <ListRowSkeleton key={i} />
            ))}
          </YStack>
        ) : list.isError ? (
          <ScreenError
            messageFrom="backend"
            error={list.error}
            onRetry={() => void list.refetch()}
          />
        ) : items.length === 0 ? (
          <ScreenMessage icon="notifications-outline" title={t('empty')} />
        ) : (
          <FlatList
            data={entries}
            keyExtractor={entryKey}
            renderItem={renderItem}
            /*
              `flex: 1` để danh sách nhận đúng phần chiều cao còn lại của tấm trượt: không có nó
              thì nó tự cao bằng nội dung, tràn khỏi tấm và lại không có đáy để `onEndReached` bắn.
            */
            style={appStyles.fill}
            onEndReached={loadMore}
            refreshControl={
              <RefreshControl
                refreshing={pull.refreshing}
                onRefresh={pull.onRefresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            }
            ListFooterComponent={
              list.isFetchingNextPage ? ListLoadingFooter : list.hasNextPage ? null : ListEnd
            }
            {...LIST_TUNING}
          />
        )}
      </BottomSheet>
    </>
  );
}

/** Tên nhóm VIẾT HOA "HÔM NAY" / "TRƯỚC ĐÂY". */
const GroupLabel = memo(function GroupLabel({ label, first }: { label: string; first: boolean }) {
  const colors = useColors();
  return (
    <YStack px={ROW_PAD} pt={first ? GROUP_PAD_TOP_FIRST : GROUP_PAD} pb={GROUP_PAD}>
      <Text
        col={colors.textPlaceholder}
        fos={typeScale.label.fontSize}
        lh={typeScale.label.lineHeight}
        fow={fontWeight.semibold}
        textTransform="uppercase"
        accessibilityRole="header"
      >
        {label}
      </Text>
    </YStack>
  );
});

const NotificationRow = memo(function NotificationRow({
  item,
  timeLabel,
  unreadLabel,
  onPress,
}: {
  item: NotificationItem;
  timeLabel: string;
  unreadLabel: string;
  onPress: (item: NotificationItem) => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const isUnread = !item.readAt;

  return (
    <Pressable
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={isUnread ? `${item.title}, ${unreadLabel}` : item.title}
      // Nền chạm khác nền "chưa đọc", không thì chạm vào một dòng chưa đọc trông như không có gì.
      style={({ pressed }) => [
        styles.row,
        isUnread ? styles.rowUnread : null,
        pressed ? styles.rowPressed : null,
      ]}
    >
      <XStack ai="flex-start" gap={ROW_GAP}>
        <YStack p={TILE_PAD} br={radius.control} bg={colors.surface} style={TILE_SHADOW}>
          <NotificationGlyph look={notificationLook(item.type)} />
        </YStack>

        <YStack f={1} minWidth={0} gap={4}>
          <XStack ai="flex-start" gap={space.sm}>
            <Text
              f={1}
              col={colors.text}
              fos={typeScale.body.fontSize}
              lh={typeScale.body.lineHeight}
              fow={fontWeight.semibold}
            >
              {item.title}
            </Text>
            {isUnread ? (
              <YStack w={UNREAD_DOT} h={UNREAD_DOT} br={radius.pill} bg={colors.success} mt={space.xs} />
            ) : null}
          </XStack>
          <XStack ai="flex-start" gap={space.sm}>
            {item.body ? (
              <Text
                f={1}
                col={colors.textMuted}
                fos={typeScale.body.fontSize}
                lh={typeScale.body.lineHeight}
                numberOfLines={BODY_LINES}
              >
                {item.body}
              </Text>
            ) : (
              <YStack f={1} />
            )}
            <Text
              col={colors.textPlaceholder}
              fos={typeScale.body.fontSize}
              lh={typeScale.body.lineHeight}
              fontStyle="italic"
              numberOfLines={1}
            >
              {timeLabel}
            </Text>
          </XStack>
        </YStack>
      </XStack>
    </Pressable>
  );
});

/** Bốn hình Figma + ví (xem `notificationLook`). */
function NotificationGlyph({ look }: { look: NotificationLook }) {
  const colors = useColors();
  const orange = useAppScheme().scheme === 'dark' ? FIGMA_ORANGE_DARK : FIGMA_ORANGE;
  switch (look) {
    case 'urgent':
      return <PartnerMenuIcon name="doc-left" color={colors.danger} size={TILE_ICON} />;
    case 'car':
      return <PartnerMenuIcon name="car-profile" color={colors.success} size={TILE_ICON} />;
    case 'chat':
      return <PartnerMenuIcon name="sms" color={orange} size={TILE_ICON} />;
    case 'money':
      return <PartnerMenuIcon name="wallet" color={orange} size={TILE_ICON} />;
    default:
      return <PartnerMenuIcon name="doc-left" color={orange} size={TILE_ICON} />;
  }
}

const useStyles = makeStyles((colors) => ({
  bell: {
    alignItems: 'center',
    height: sizing.touchTarget,
    justifyContent: 'center',
    width: sizing.touchTarget,
  },
  bellCompact: {
    alignItems: 'center',
    height: sizing.compactBox,
    justifyContent: 'center',
    width: sizing.compactBox,
  },
  row: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.borderSubtle,
    borderBottomWidth: 1,
    padding: ROW_PAD,
  },
  rowUnread: {
    backgroundColor: colors.background,
  },
  rowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
}));
