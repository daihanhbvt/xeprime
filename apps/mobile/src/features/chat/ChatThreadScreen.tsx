import { Ionicons } from '@expo/vector-icons';
import { CHAT_SIDE } from '@xeprime/types';
import { DAY_PARAM_FORMAT, isOwnSideMessage, nowInAppTz, toAppTz } from '@xeprime/domain';
import { useRouter } from 'expo-router';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, type ListRenderItemInfo } from 'react-native';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { PhotoViewer } from '@/components/ui/PhotoViewer';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenLoading } from '@/components/state/ScreenLoading';
import { useAppFormat } from '@/i18n/use-app-format';
import { LIST_TUNING } from '@/theme/list-tuning';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { ChatComposer } from './components/ChatComposer';
import { MessageBubble } from './components/MessageBubble';
import { useConversation } from './hooks/use-chat';
import { useThread, type ThreadEntry } from './hooks/use-thread';

/** Cuộn xa đáy quá ngưỡng này thì tin mới KHÔNG kéo màn xuống — chỉ hiện nút "có tin mới". */
const NEAR_BOTTOM_PX = 120;

const entryKey = (entry: ThreadEntry) => entry.message.id;

/**
 * Màn một cuộc trò chuyện.
 *
 * `inverted` là quyết định trung tâm, và nó thay cho toàn bộ phần neo cuộn mà bản web phải tự
 * viết: danh sách đảo ngược có gốc toạ độ ở ĐÁY, nên tin mới đến tự nằm đúng chỗ, và tin CŨ
 * thêm vào đầu mảng mọc ra phía trên mà không dịch một pixel nào của vùng đang đọc. Với
 * `FlatList` thường, mỗi lần tải lịch sử là một cú nhảy phải bù bằng tay.
 *
 * Hệ quả kéo theo: `onEndReached` ở đây nghĩa là "chạm tới tin CŨ NHẤT", nên nó nối trang lịch
 * sử chứ không phải trang mới.
 */
export function ChatThreadScreen({ conversationId }: { conversationId: string }) {
  const t = useTranslations('Chat');
  const router = useRouter();
  const navigateOnce = useNavigateOnce();

  const conversationQuery = useConversation(conversationId);
  const thread = useThread(conversationId);

  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const listRef = useRef<FlatList<ThreadEntry>>(null);

  // Danh sách đảo: offset 0 CHÍNH LÀ tin mới nhất.
  const jumpToLatest = useCallback(
    () => listRef.current?.scrollToOffset({ offset: 0, animated: true }),
    [],
  );

  const viewerSide = conversationQuery.data?.side ?? CHAT_SIDE.CUSTOMER;

  // Thẻ xe trên bong bóng dẫn sang tin đăng — cùng lối đi với thẻ xe ở màn khám phá.
  const openListing = useCallback(
    (vehicleId: string) => navigateOnce(ROUTES.explore.listingDetail(vehicleId)),
    [navigateOnce],
  );

  /** Danh sách đảo: mới nhất TRƯỚC. Ngày phân cách tính trên thứ tự đã đảo. */
  const inverted = useMemo(() => [...thread.entries].reverse(), [thread.entries]);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<ThreadEntry>) => {
      const { message, state } = item;
      const mine = isOwnSideMessage(message.senderType, viewerSide);

      /*
       * Trong danh sách ĐẢO, phần tử phía "sau" là tin CŨ HƠN. Nên dải ngày của một tin được vẽ
       * khi tin cũ hơn kế nó thuộc ngày khác — tức chính nó là tin ĐẦU TIÊN của ngày đó.
       */
      const day = toAppTz(message.sentAt).format(DAY_PARAM_FORMAT);
      const older = inverted[index + 1];
      const startsDay = !older || toAppTz(older.message.sentAt).format(DAY_PARAM_FORMAT) !== day;

      return (
        <YStack>
          <MessageBubble
            text={message.text ?? null}
            attachments={message.attachments}
            sentAt={message.sentAt}
            mine={mine}
            state={state}
            onPressImage={setViewerUrl}
            {...(message.vehicle ? { vehicle: message.vehicle } : {})}
            onPressVehicle={openListing}
            {...(message.clientMessageId
              ? {
                  onRetry: () => void thread.retry(message.clientMessageId as string),
                  onDiscard: () => thread.discard(message.clientMessageId as string),
                }
              : {})}
          />
          {startsDay ? <DaySeparator day={day} /> : null}
        </YStack>
      );
    },
    [inverted, viewerSide, thread],
  );

  const onScroll = useCallback(
    // Danh sách đảo: `contentOffset.y` là khoảng cách tính từ ĐÁY, nên phép so là trực tiếp.
    (event: { nativeEvent: { contentOffset: { y: number } } }) => {
      setAwayFromBottom(event.nativeEvent.contentOffset.y > NEAR_BOTTOM_PX);
    },
    [],
  );

  // Đầu trang chỉ còn ĐỐI PHƯƠNG: hội thoại thuộc về gian hàng, một thread nói về nhiều xe —
  // gắn tên một chiếc lên đây là nói sai về phần còn lại. Ngữ cảnh nằm ở thẻ trên từng tin.
  const title = conversationQuery.data?.partyName ?? '';

  if (conversationQuery.isPending) {
    return (
      <>
        <AppHeader onBack={() => router.back()} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenLoading />
        </Screen>
      </>
    );
  }

  if (conversationQuery.isError) {
    return (
      <>
        <AppHeader onBack={() => router.back()} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenError
            error={conversationQuery.error}
            title={t('loadError')}
            onRetry={() => void conversationQuery.refetch()}
          />
        </Screen>
      </>
    );
  }

  return (
    <>
      <AppHeader
        onBack={() => router.back()}
        title={title}
      />

      {/*
        `Screen` gánh safe area + tránh bàn phím; `footer` đặt ô soạn tin nằm TRONG lớp tránh bàn
        phím đó. Đây là lý do `ChatComposer` không tự bọc `KeyboardAvoidingView`: hai lớp lồng
        nhau thì phần đẩy cộng dồn và ô nhập bị hất lên giữa màn.
      */}
      <Screen
        edges={['left', 'right', 'bottom']}
        scroll={false}
        padded={false}
        footer={
          <ChatComposer onSend={thread.send} disabled={thread.loading || Boolean(thread.error)} />
        }
      >
        {thread.loading ? (
          <ScreenLoading />
        ) : thread.error ? (
          <ScreenError error={thread.error} title={t('messagesLoadError')} onRetry={thread.reload} />
        ) : inverted.length === 0 ? (
          /*
            Trạng thái rỗng nằm NGOÀI `FlatList`, không phải ở `ListEmptyComponent`: cờ `inverted`
            lật cả khung chứa nội dung 180°, nên chữ đặt trong đó hiện ra lộn ngược.
          */
          <YStack f={1} ai="center" jc="center" p={space.lg}>
            <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center">
              {t('emptyThread')}
            </Text>
          </YStack>
        ) : (
          <YStack f={1}>
            <FlatList
              ref={listRef}
              inverted
              data={inverted}
              keyExtractor={entryKey}
              renderItem={renderItem}
              onScroll={onScroll}
              scrollEventThrottle={64}
              // Đảo ngược ⇒ "cuối danh sách" là tin CŨ NHẤT, nên đây là nối trang LỊCH SỬ.
              onEndReached={thread.loadOlder}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.listContent}
              {...LIST_TUNING}
            />

            {awayFromBottom ? (
              <JumpToLatest label={t('newMessages')} onPress={jumpToLatest} />
            ) : null}
          </YStack>
        )}
      </Screen>

      <PhotoViewer
        url={viewerUrl}
        unavailableLabel={t('attachmentUnavailable')}
        onClose={() => setViewerUrl(null)}
      />
    </>
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
    <YStack ai="center" py={space.sm}>
      <Text
        px={space.md}
        py={2}
        br={radius.pill}
        bg={colors.surfaceMuted}
        col={colors.textMuted}
        fos={fontSize.label}
      >
        {label}
      </Text>
    </YStack>
  );
}

/**
 * Chỉ báo "còn tin ở dưới" — CỐ Ý không tự cuộn.
 *
 * Người dùng đang đọc lịch sử mà màn tự nhảy xuống đáy là mất chỗ đang đọc. Nút này chỉ nói rằng
 * có gì đó ở dưới; đưa quyền quyết định cho ngón tay.
 */
function JumpToLatest({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <YStack pos="absolute" bottom={space.md} left={0} right={0} ai="center" pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={styles.pill}
      >
        <Ionicons name="arrow-down" size={iconSize.xs} color={colors.onPrimary} />
        <Text col={colors.onPrimary} fos={fontSize.label} fow={fontWeight.semibold}>
          {label}
        </Text>
      </Pressable>
    </YStack>
  );
}

const styles = StyleSheet.create({
  listContent: {
    flexGrow: 1,
    paddingVertical: space.sm,
  },
  pill: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
});
