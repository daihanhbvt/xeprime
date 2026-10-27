import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, type ListRenderItemInfo } from 'react-native';
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
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Card } from '@/components/ui/Card';
import { CardAccent } from '@/components/ui/CardAccent';
import { CardActionBar, type CardAction } from '@/components/ui/CardActionBar';
import { Chip } from '@/components/ui/Chip';
import { FORM_DATE_FLOOR } from '@/components/ui/DateField';
import { DatePickerSheet } from '@/components/ui/DatePickerSheet';
import { DetailChevron } from '@/components/ui/DetailArrow';
import { ListEnd } from '@/components/ui/ListEnd';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useCancelWithdrawal } from '@/features/wallet/hooks/use-wallet';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { goBackOr } from '@/navigation/go-back-or';
import { ACCOUNT_PAYMENTS_TAB, AccountPaymentsTabs } from './components/AccountPaymentsTabs';
import { queryKeys } from '@/queries/query-keys';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';

/** "19:00:39 16/07/2026" như bản vẽ, giờ Việt Nam. */
const ROW_TIME_FORMAT = 'HH:mm:ss DD/MM/YYYY';
const CHIP_DAY_FORMAT = 'DD/MM/YYYY';

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
export function AccountPaymentsScreen() {
  const t = useTranslations('AccountPayments.history');
  const tHub = useTranslations('AccountPayments.hub');
  const router = useRouter();

  const [status, setStatus] = useState<AccountTransactionStatus | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);

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
  const filtered = status !== null || from !== '' || to !== '';
  const dayLabel = (value: string) => toAppTz(value).format(CHIP_DAY_FORMAT);

  return (
    <>
      <AppHeader
        onBack={() => goBackOr(router, ROUTES.account.home())}
        title={tHub('title')}
        subtitle={tHub('subtitle')}
      />
      <AccountPaymentsTabs value={ACCOUNT_PAYMENTS_TAB.HISTORY} />
      <Screen edges={['left', 'right', 'bottom']} padded={false} scroll={false}>
        <FlatList
          data={rows}
          keyExtractor={keyOf}
          contentContainerStyle={{ padding: space.md, gap: space.sm }}
          renderItem={({ item }: ListRenderItemInfo<AccountTransaction>) => (
            <TransactionRow row={item} />
          )}
          ListHeaderComponent={
            <YStack gap={space.sm} pb={space.sm}>
              <XStack flexWrap="wrap" gap={space.xs}>
                <Chip
                  label={t('filters.all')}
                  selected={status === null}
                  onPress={() => setStatus(null)}
                />
                {ACCOUNT_TRANSACTION_STATUS_VALUES.map((value) => (
                  <Chip
                    key={value}
                    label={t(`status.${value}`)}
                    selected={status === value}
                    onPress={() => setStatus(value)}
                  />
                ))}
              </XStack>
              {/* "Chọn khoảng thời gian" — hai mốc chọn bằng tấm lịch, chạm chip đã chọn để đổi. */}
              <XStack flexWrap="wrap" gap={space.xs} ai="center">
                <Chip
                  icon="calendar-outline"
                  role="button"
                  selected={from !== ''}
                  label={from ? dayLabel(from) : t('filters.rangePlaceholder')}
                  onPress={() => setPicking('from')}
                />
                <Chip
                  icon="calendar-outline"
                  role="button"
                  selected={to !== ''}
                  label={to ? dayLabel(to) : t('filters.rangeTo')}
                  onPress={() => setPicking('to')}
                />
                {from || to ? (
                  <Chip
                    icon="close"
                    role="button"
                    label={t('filters.clearRange')}
                    onPress={() => {
                      setFrom('');
                      setTo('');
                    }}
                  />
                ) : null}
              </XStack>
            </YStack>
          }
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

      <DatePickerSheet
        open={picking !== null}
        onClose={() => setPicking(null)}
        title={picking === 'to' ? t('filters.rangeTo') : t('filters.rangePlaceholder')}
        minDate={picking === 'to' && from ? toAppTz(from) : FORM_DATE_FLOOR}
        value={picking === 'to' ? to : from}
        onChange={(next) => {
          if (picking === 'to') setTo(next);
          else {
            setFrom(next);
            // Mốc đầu vượt mốc cuối thì bỏ mốc cuối — khoảng ngược là khoảng rỗng.
            if (to && next > to) setTo('');
          }
          setPicking(null);
        }}
      />
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
