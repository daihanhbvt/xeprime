import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  type ListRenderItemInfo,
} from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  ACCOUNT_TRANSACTION_STATUS,
  ACCOUNT_TRANSACTION_STATUS_VALUES,
  STATUS_COLOR,
  type AccountTransactionStatus,
  type StatusColor,
} from '@xeprime/types';
import { absoluteMoney, isNegativeMoney, isZeroMoney, toAppTz } from '@xeprime/domain';
import {
  ACCOUNT_TRANSACTION_LIMIT,
  accountTransactionParams,
  accountTransactionsApi,
  type AccountTransaction,
  type AccountTransactionPage,
} from '@/api/account-payments/api';
import { WALLET_SCOPE } from '@/api/wallet/api';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Screen } from '@/components/layout/Screen';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Card } from '@/components/ui/Card';
import { CardAccent } from '@/components/ui/CardAccent';
import { CardActionBar, type CardAction } from '@/components/ui/CardActionBar';
import { Chip } from '@/components/ui/Chip';
import { DateRangeField } from '@/components/ui/DateRangeField';
import { DetailChevron } from '@/components/ui/DetailArrow';
import { ListEnd } from '@/components/ui/ListEnd';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useCancelWithdrawal } from '@/features/wallet/hooks/use-wallet';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { queryKeys } from '@/queries/query-keys';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';

/** "19:00:39 16/07/2026" như bản vẽ, giờ Việt Nam. */
const ROW_TIME_FORMAT = 'HH:mm:ss DD/MM/YYYY';

const STATUS_TONE: Record<AccountTransactionStatus, StatusColor> = {
  [ACCOUNT_TRANSACTION_STATUS.SUCCEEDED]: STATUS_COLOR.SUCCESS,
  [ACCOUNT_TRANSACTION_STATUS.PENDING]: STATUS_COLOR.WARNING,
  [ACCOUNT_TRANSACTION_STATUS.FAILED]: STATUS_COLOR.DANGER,
};

/**
 * Tab "Lịch sử giao dịch" — bản native của web `AccountPaymentsView` (Figma `21695:27193`).
 *
 * MỘT danh sách hợp nhất (`GET /account/transactions`): tiền giữ chỗ, rút ví điểm, hoàn tiền, tiền
 * thuê/cọc. Lọc trạng thái (Tất cả / Thành công / Đang chờ / Thất bại) + khoảng ngày — chạy ở
 * server. Bộ lọc giữ ở state màn (native không có URL — ADR 0004 "Screen filters"). Cuộn vô hạn:
 * `page` là `pageParam`, không nằm trong khoá cache.
 *
 * Lệnh rút còn chờ duyệt có hành động "Huỷ yêu cầu" ngay trên thẻ.
 */
/** Thân tab — header + dải tab do `AccountPaymentsHub` dựng. */
export function AccountPaymentsScreen() {
  const colors = useColors();
  const t = useTranslations('AccountPayments.history');

  const [status, setStatus] = useState<AccountTransactionStatus | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const filterKey = { status, from: from || null, to: to || null };
  const query = useInfiniteQuery({
    queryKey: queryKeys.accountTransactions.listInfinite({
      ...filterKey,
      limit: ACCOUNT_TRANSACTION_LIMIT,
    }),
    queryFn: ({ pageParam }) =>
      accountTransactionsApi.list(accountTransactionParams({ ...filterKey, page: pageParam })),
    initialPageParam: 1,
    getNextPageParam: (last: AccountTransactionPage) =>
      last.meta.hasNext ? last.meta.page + 1 : undefined,
    placeholderData: keepPreviousData,
  });

  const rows = (query.data?.pages ?? []).flatMap((page) => page.data);
  // Kéo để làm mới — vòng quay chỉ hiện khi khách kéo, không theo các lượt refetch nền.
  const pull = usePullRefresh(query.refetch);
  const filtered = status !== null || from !== '' || to !== '';
  const statusChips: { value: AccountTransactionStatus | null; label: string }[] = [
    { value: null, label: t('filters.all') },
    ...ACCOUNT_TRANSACTION_STATUS_VALUES.map((value) => ({ value, label: t(`status.${value}`) })),
  ];

  return (
    <>
      {/*
        Thanh lọc ĐỨNG YÊN dưới dải tab (người dùng chốt 29/10/2026): chip trạng thái chạm một lần là
        lọc; dưới là ô "Từ ngày → Đến ngày" dùng chung với màn Chuyến đi (`DateRangeField`).
      */}
      <YStack px={space.md} pt={space.sm} gap={space.sm}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <XStack gap={space.xs}>
            {statusChips.map((chip) => (
              <Chip
                key={chip.value ?? 'all'}
                label={chip.label}
                size="sm"
                selected={status === chip.value}
                onPress={() => setStatus(chip.value)}
              />
            ))}
          </XStack>
        </ScrollView>
        <DateRangeField
          value={{ from: from || undefined, to: to || undefined }}
          onChange={(range) => {
            setFrom(range.from ?? '');
            setTo(range.to ?? '');
          }}
          labels={{
            field: t('filters.range'),
            from: t('filters.rangeFrom'),
            to: t('filters.rangeTo'),
            clear: t('filters.clearRange'),
          }}
        />
      </YStack>
      <Screen edges={['left', 'right', 'bottom']} padded={false} scroll={false}>
        <FlatList
          data={rows}
          keyExtractor={keyOf}
          refreshControl={
            <RefreshControl
              refreshing={pull.refreshing}
              onRefresh={pull.onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          contentContainerStyle={{ padding: space.md, gap: space.sm }}
          renderItem={({ item }: ListRenderItemInfo<AccountTransaction>) => (
            <TransactionRow row={item} />
          )}
          ListEmptyComponent={
            query.isPending ? (
              <MiniRowsSkeleton rows={5} />
            ) : query.isError ? (
              <ScreenError
                error={query.error}
                title={t('loadError')}
                onRetry={() => void query.refetch()}
              />
            ) : (
              <ScreenMessage
                icon="card-outline"
                title={filtered ? t('empty.filtered') : t('empty.all')}
              />
            )
          }
          ListFooterComponent={
            query.isFetchingNextPage ? (
              <YStack ai="center" py={space.md}>
                <ActivityIndicator color={colors.primaryActive} />
              </YStack>
            ) : rows.length > 0 && !query.hasNextPage ? (
              <ListEnd />
            ) : null
          }
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          onEndReachedThreshold={0.4}
        />
      </Screen>

    </>
  );
}

const keyOf = (row: AccountTransaction) => row.id;

/**
 * MỘT giao dịch — vạch mép trái + nhãn góc phải mang TRẠNG THÁI (ngôn ngữ thẻ danh sách mobile),
 * số tiền có dấu là thứ to nhất thẻ, dưới là tên khoản và "#mã · giờ ngày". Dòng thuộc một chuyến
 * mở chuyến đó; lệnh rút chờ duyệt có "Huỷ yêu cầu".
 */
function TransactionRow({ row }: { row: AccountTransaction }) {
  const colors = useColors();
  const t = useTranslations('AccountPayments.history');
  const fmt = useAppFormat();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const navigateOnce = useNavigateOnce();
  const cancel = useCancelWithdrawal(WALLET_SCOPE.ACCOUNT);
  const [confirming, setConfirming] = useState(false);

  const zero = isZeroMoney(row.amount);
  const sign = zero ? '' : isNegativeMoney(row.amount) ? '-' : '+';
  const amount = `${sign}${fmt.money(absoluteMoney(row.amount))}`;
  const tone = STATUS_TONE[row.status] ?? STATUS_COLOR.NEUTRAL;
  const title = t(`titles.${row.title}`);
  const meta = [row.code ? `#${row.code}` : null, toAppTz(row.occurredAt).format(ROW_TIME_FORMAT)]
    .filter(Boolean)
    .join('  ');

  const actions: CardAction[] = row.cancellable
    ? [
        {
          key: 'cancel',
          label: t('cancel.action'),
          icon: 'close-circle-outline',
          tone: 'danger',
          onPress: () => setConfirming(true),
        },
      ]
    : [];

  const tripId = row.tripId;

  return (
    <>
      <Card
        padded={false}
        {...(tripId ? { onPress: () => navigateOnce(ROUTES.booking.detail(tripId)) } : {})}
        accessibilityLabel={`${title} ${amount}`}
      >
        <XStack>
          <CardAccent color={tone} />
          <YStack f={1} minWidth={0}>
            <YStack p={space.sm} gap={space.xs}>
              <XStack ai="center" gap={space.xs}>
                <Text
                  f={1}
                  minWidth={0}
                  col={colors.text}
                  fos={fontSize.h4}
                  fow={fontWeight.bold}
                  numberOfLines={1}
                >
                  {amount}
                </Text>
                <StatusBadge label={t(`status.${row.status}`)} color={tone} size="sm" />
              </XStack>
              <Text col={colors.text} fos={fontSize.body} fow={fontWeight.medium}>
                {title}
              </Text>
              <XStack ai="center" gap={space.xs}>
                <Text
                  f={1}
                  minWidth={0}
                  col={colors.placeholder}
                  fos={fontSize.label}
                  numberOfLines={1}
                >
                  {meta}
                </Text>
                {tripId ? <DetailChevron /> : null}
              </XStack>
            </YStack>
            <CardActionBar actions={actions} />
          </YStack>
        </XStack>
      </Card>

      {row.cancellable ? (
        <AlertDialog
          open={confirming}
          title={t('cancel.confirm')}
          message={t('cancel.hint')}
          confirmLabel={t('cancel.action')}
          loading={cancel.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() =>
            cancel.mutate(row.id, {
              onSuccess: () => {
                setConfirming(false);
                toast.showSuccess(t('cancel.done'));
              },
              onError: (error) => {
                setConfirming(false);
                toast.showError(errorMessage(error));
              },
            })
          }
        />
      ) : null}
    </>
  );
}
