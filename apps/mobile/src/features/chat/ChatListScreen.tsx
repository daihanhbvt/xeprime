import type { ConversationSummary } from '@/api/chat/api';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, type ListRenderItemInfo } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Screen } from '@/components/layout/Screen';
import { Chip } from '@/components/ui/Chip';
import { ListEnd } from '@/components/ui/ListEnd';
import { SearchInput } from '@/components/ui/SearchInput';
import { ListRowSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { LIST_TUNING } from '@/theme/list-tuning';
import { colors, space } from '@/theme/tokens';
import { ConversationRow } from './components/ConversationRow';
import { useConversationsInfinite } from './hooks/use-chat';

const SKELETON_ROWS = 6;

/*
 * Hàm ở TẦM MODULE: đổi danh tính của `keyExtractor` buộc `VirtualizedList` dựng lại mọi ô đang
 * gắn — thấy rõ thành nháy mỗi nhịp poll.
 */
const conversationKey = (conversation: ConversationSummary) => conversation.id;

/**
 * Tab "Tin nhắn" — hộp thư PHÍA KHÁCH.
 *
 * Phân trang là tải-thêm-khi-cuộn thay cho bộ số trang của web (một hàng nút trang trên điện
 * thoại chiếm chỗ đúng một cuộc trò chuyện), nhưng việc CẮT TRANG và LỌC vẫn ở server — không có
 * chỗ nào kéo cả hộp thư về rồi lọc tại chỗ.
 *
 * Bộ lọc giữ ở state màn hình, không ở Redux: native không có URL để chia sẻ và bộ lọc này chết
 * theo màn (ADR 0004, mục "Screen filters").
 */
export function ChatListScreen() {
  const t = useTranslations('Chat');
  const navigateOnce = useNavigateOnce();

  const [search, setSearch] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  // Lọc chạy ở server nên mỗi ký tự là một request — chờ người dùng ngừng gõ đã.
  const debouncedSearch = useDebouncedValue(search, 350);

  const query = useConversationsInfinite({
    ...(debouncedSearch.trim() ? { q: debouncedSearch.trim() } : {}),
    ...(unreadOnly ? { unreadOnly: true } : {}),
  });

  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);

  const openConversation = useCallback(
    (conversation: ConversationSummary) => navigateOnce(ROUTES.chat.thread(conversation.id)),
    [navigateOnce],
  );

  /*
   * Phụ thuộc vào ĐÚNG ba thứ nó đọc, không phải cả object `query`: object đó là bản mới ở mọi
   * lần render của TanStack Query, nên `[query]` làm `onEndReached` đổi danh tính liên tục.
   */
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const { isRefetching, refetch } = query;
  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={isRefetching}
        onRefresh={() => void refetch()}
        tintColor={colors.primaryActive}
      />
    ),
    [isRefetching, refetch],
  );

  const renderRow = useCallback(
    ({ item }: ListRenderItemInfo<ConversationSummary>) => (
      <ConversationRow conversation={item} onPress={openConversation} />
    ),
    [openConversation],
  );

  const filtering = unreadOnly || debouncedSearch.trim().length > 0;

  return (
    // KHÔNG có cạnh 'bottom': đây là màn gốc của một tab và thanh tab đã tự cộng `insets.bottom`.
    <Screen edges={['left', 'right']} scroll={false} padded={false}>
      <YStack gap={space.sm} px={layout.screenX} pt={space.sm} pb={space.sm}>
        <SearchInput
          value={search}
          onChange={setSearch}
          label={t('searchPlaceholder')}
          placeholder={t('searchPlaceholder')}
        />
        <XStack gap={space.xs}>
          <Chip label={t('filterAll')} selected={!unreadOnly} onPress={() => setUnreadOnly(false)} />
          <Chip
            label={t('filterUnread')}
            selected={unreadOnly}
            onPress={() => setUnreadOnly(true)}
          />
        </XStack>
      </YStack>

      {query.isPending ? (
        <YStack>
          {Array.from({ length: SKELETON_ROWS }, (_, i) => (
            <ListRowSkeleton key={i} />
          ))}
        </YStack>
      ) : query.isError ? (
        <ScreenError
          error={query.error}
          title={t('loadError')}
          onRetry={() => void query.refetch()}
        />
      ) : items.length === 0 ? (
        <ScreenMessage
          icon="chatbubble-ellipses-outline"
          title={filtering ? t('noMatches') : t('empty')}
          description={filtering ? undefined : t('pickConversation')}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={conversationKey}
          renderItem={renderRow}
          contentContainerStyle={styles.listContent}
          onEndReached={loadMore}
          refreshControl={refreshControl}
          /*
            Truyền KIỂU component, không phải một phần tử: `<ListRowSkeleton />` là object mới ở
            mỗi lần render nên chân danh sách bị dựng lại liên tục.
          */
          ListFooterComponent={
            query.isFetchingNextPage ? ListRowSkeleton : query.hasNextPage ? null : ListEnd
          }
          {...LIST_TUNING}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: space.lg,
  },
});
