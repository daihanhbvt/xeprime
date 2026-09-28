import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, type ListRenderItemInfo } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { badgeOffset, CountBadge } from '@/components/ui/CountBadge';
import { ListEnd } from '@/components/ui/ListEnd';
import { ListRowSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useBadges } from '@/features/badges/hooks/use-badges';
import { useAppFormat } from '@/i18n/use-app-format';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { LIST_TUNING } from '@/theme/list-tuning';
import { appStyles } from '@/theme/styles';
import { colors, fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
import type { NotificationItem } from '@/features/notifications/api';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationsInfinite,
} from '../hooks/use-notifications';
import {
  notificationHref,
  notificationIcon,
  type NotificationContext,
} from '../notification-display';

const SKELETON_ROWS = 5;

/** Tấm trượt chiếm nhiều màn hơn mặc định: đây là một DANH SÁCH, không phải một menu ba dòng. */
const SHEET_MAX_RATIO = 0.85;

/** Chấm "chưa đọc" ở mép phải một dòng — cùng vai với `.dot` của web. */
const UNREAD_DOT = 8;

/**
 * Đường kẻ giữa hai dòng — dày hơn 1dp và dùng `border` thay `borderSubtle`: trên một danh sách
 * hai-ba dòng chữ, nét quá nhạt làm các dòng dính vào nhau thành một khối.
 */
const ROW_DIVIDER = 1.5;

const notificationKey = (item: NotificationItem) => item.id;

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
}: {
  context: NotificationContext;
  /** Vẽ nhỏ lại, vùng chạm giữ nguyên — cho thanh trên CHẬT của khu quản lý. */
  compact?: boolean;
}) {
  const t = useTranslations('Notifications');
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();

  const [open, setOpen] = useState(false);

  const unreadCount = useBadges().notificationsUnread;
  const list = useNotificationsInfinite(open);
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

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<NotificationItem>) => (
      <NotificationRow
        item={item}
        timeLabel={fmt.dateTime(item.createdAt)}
        unreadLabel={t('unreadMark')}
        onPress={handleItem}
      />
    ),
    [fmt, handleItem, t],
  );

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={
          unreadCount > 0 ? t('bellWithCount', { count: unreadCount }) : t('title')
        }
        hitSlop={compact ? Math.ceil((sizing.touchTarget - sizing.compactBox) / 2) : space.xs}
        style={compact ? styles.bellCompact : styles.bell}
      >
        <Ionicons
          name="notifications-outline"
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
            <CountBadge count={unreadCount} tone="danger" size="sm" />
          </YStack>
        ) : null}
      </Pressable>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('title')}
        maxRatio={SHEET_MAX_RATIO}
        padded={false}
        /*
          Danh sách thông báo là `FlatList` — nó phải tự cuộn, không nằm trong vùng cuộn của tấm
          trượt. Lồng vào đó là cảnh báo "VirtualizedList should never be nested inside plain
          ScrollViews", và kèm theo là ảo hoá mất tác dụng lẫn `onEndReached` không bao giờ bắn
          (tức không tải được trang thông báo thứ hai).
        */
        scroll={false}
      >
        <XStack ai="center" jc="flex-end" px={space.md} pb={space.xs}>
          <Pressable
            onPress={() => markAll.mutate()}
            disabled={unreadCount === 0 || markAll.isPending}
            accessibilityRole="button"
            accessibilityLabel={t('markAllRead')}
            accessibilityState={{ disabled: unreadCount === 0 || markAll.isPending }}
            hitSlop={space.xs}
          >
            <Text
              col={unreadCount === 0 ? colors.textDisabled : colors.primaryActive}
              fos={fontSize.bodySm}
              fow={fontWeight.semibold}
            >
              {t('markAllRead')}
            </Text>
          </Pressable>
        </XStack>

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
            data={items}
            keyExtractor={notificationKey}
            renderItem={renderItem}
            /*
              `flex: 1` để danh sách nhận đúng phần chiều cao còn lại của tấm trượt: không có nó
              thì nó tự cao bằng nội dung, tràn khỏi tấm và lại không có đáy để `onEndReached` bắn.
            */
            style={appStyles.fill}
            onEndReached={loadMore}
            ListFooterComponent={
              list.isFetchingNextPage ? ListRowSkeleton : list.hasNextPage ? null : ListEnd
            }
            {...LIST_TUNING}
          />
        )}
      </BottomSheet>
    </>
  );
}

function NotificationRow({
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
  const isUnread = !item.readAt;

  return (
    <Pressable
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={isUnread ? `${item.title}, ${unreadLabel}` : item.title}
      /*
       * Dòng CHƯA ĐỌC có nền gold rất nhạt — chữ đậm thôi thì không đủ.
       *
       * Trên một danh sách dày chữ, khác biệt duy nhất là nét chữ buộc người dùng so từng dòng
       * với dòng bên cạnh mới biết cái nào mới; một mảng nền đọc ra ngay trong một cái liếc. Dùng
       * đúng `primaryLight` mà `ConversationRow` dùng làm nền chạm, nên hai màn cùng một tông.
       *
       * Nền khi CHẠM phải khác nền "chưa đọc", không thì chạm vào một dòng chưa đọc trông như
       * không có gì xảy ra — nên chạm dùng `surfaceMuted`.
       */
      style={({ pressed }) => [
        styles.row,
        isUnread ? styles.rowUnread : null,
        pressed ? styles.rowPressed : null,
      ]}
    >
      <XStack ai="flex-start" gap={space.sm}>
        <YStack
          w={sizing.touchTarget}
          h={sizing.touchTarget}
          br={radius.pill}
          /*
           * Viên tròn luôn mang màu gold đậm của app, kể cả ở dòng đã đọc: một viên trắng/xám
           * trên nền trắng không đọc ra là biểu tượng gì cho tới khi nhìn kỹ, còn gold đặc cho
           * mỗi dòng một điểm neo mắt. Chưa đọc vẫn phân biệt bằng nền dòng + chấm bên phải, và
           * viên tròn đậm thêm một bậc (`primaryActive`) để không chìm vào nền gold nhạt đó.
           */
          bg={isUnread ? colors.primaryActive : colors.primary}
          ai="center"
          jc="center"
        >
          <Ionicons
            name={notificationIcon(item.type)}
            size={iconSize.sm}
            color={colors.onPrimary}
          />
        </YStack>

        <YStack f={1} gap={2}>
          <Text
            col={colors.text}
            fos={fontSize.bodySm}
            fow={isUnread ? fontWeight.bold : fontWeight.semibold}
          >
            {item.title}
          </Text>
          {item.body ? (
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {item.body}
            </Text>
          ) : null}
          <Text col={colors.placeholder} fos={fontSize.label}>
            {timeLabel}
          </Text>
        </YStack>

        {isUnread ? (
          <YStack
            w={UNREAD_DOT}
            h={UNREAD_DOT}
            br={radius.pill}
            bg={colors.primary}
            mt={space.xs}
          />
        ) : null}
      </XStack>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
    borderBottomColor: colors.border,
    borderBottomWidth: ROW_DIVIDER,
    minHeight: sizing.touchTarget,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  rowUnread: {
    backgroundColor: colors.primaryLight,
  },
  rowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
});
