import type { ConversationSummary } from '@/features/chat/api';
import { CHAT_SIDE, type ChatSide } from '@xeprime/types';
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
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManagePageTitle } from '@/features/shell/ManagePageTitle';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { LIST_TUNING } from '@/theme/list-tuning';
import { colors, space } from '@/theme/tokens';
import { ConversationRow } from './components/ConversationRow';
import { useConversationsInfinite } from './hooks/use-chat';

const SKELETON_ROWS = 6;

/** Lọc chạy ở server nên mỗi ký tự là một request — chờ người dùng ngừng gõ đã. Cùng số với web. */
const SEARCH_DEBOUNCE_MS = 350;

/*
 * Hàm ở TẦM MODULE: đổi danh tính của `keyExtractor` buộc `VirtualizedList` dựng lại mọi ô đang
 * gắn — thấy rõ thành nháy mỗi nhịp poll.
 */
const conversationKey = (conversation: ConversationSummary) => conversation.id;

/**
 * Hộp thư — MỘT màn cho CẢ HAI bề mặt, đúng như web dựng `ChatView` một lần rồi truyền `side`.
 *
 * `side` là prop BẮT BUỘC, không suy từ đường dẫn: `/chat` là hộp thư khách, `/manage/chat` là
 * inbox gian hàng, và một tài khoản vừa thuê xe vừa làm chủ shop có cả hai. Server trả hai tập
 * khác nhau và `side` là thứ nói cho nó biết tập nào.
 *
 * Khác web ở TRÌNH BÀY, không ở dữ liệu: web là hai cột (danh sách + thread) trên một trang,
 * native là hai màn (danh sách → `chat/[id]`) vì 390dp không đủ cho hai cột. Và phân trang là
 * tải-thêm-khi-cuộn thay cho bộ số trang — một hàng nút trang trên điện thoại chiếm chỗ đúng một
 * cuộc trò chuyện. Việc CẮT TRANG và LỌC vẫn ở server.
 *
 * Bộ lọc giữ ở state màn hình, không ở Redux: native không có URL để chia sẻ và bộ lọc này chết
 * theo màn (ADR 0004, mục "Screen filters").
 */
export function ChatListScreen({ side }: { side: ChatSide }) {
  const t = useTranslations('Chat');
  const tNav = useTranslations('Navigation.manage');
  const navigateOnce = useNavigateOnce();

  const shop = side === CHAT_SIDE.SHOP;

  const [search, setSearch] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);

  const query = useConversationsInfinite(side, {
    ...(debouncedSearch.trim() ? { q: debouncedSearch.trim() } : {}),
    ...(unreadOnly ? { unreadOnly: true } : {}),
  });

  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);

  const openConversation = useCallback(
    (conversation: ConversationSummary) =>
      navigateOnce(
        shop ? ROUTES.manage.chatThread(conversation.id) : ROUTES.chat.thread(conversation.id),
      ),
    [navigateOnce, shop],
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
      <ConversationRow
        conversation={item}
        onPress={openConversation}
      />
    ),
    [openConversation],
  );

  const filtering = unreadOnly || debouncedSearch.trim().length > 0;

  const body = (
    // Tab gốc KHÔNG có cạnh 'bottom' (thanh tab đã cộng `insets.bottom`); khu quản lý thì có,
    // vì ở đó màn nằm trong một stack không có thanh tab nào chừa chỗ.
    <Screen edges={shop ? ['left', 'right', 'bottom'] : ['left', 'right']} scroll={false} padded={false}>
      {shop ? <ManagePageTitle title={tNav('chat')} /> : null}

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

  if (!shop) return body;

  return (
    <>
      <ManageHeader />
      {body}
    </>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: space.lg,
  },
});
