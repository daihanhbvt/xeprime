import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, type ListRenderItemInfo } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  PAYMENT_KIND_VALUES,
  PAYMENT_METHOD_META,
  PAYMENT_STATUS,
  PAYMENT_STATUS_META,
  STATUS_COLOR,
  type StatusColor,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import {
  ACCOUNT_PAYMENT_LIMIT,
  accountPaymentParams,
  accountPaymentsApi,
  type AccountPayment,
  type AccountPaymentPage,
  type AccountPaymentTotals,
} from '@/api/account-payments/api';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { BadgeRows, type BadgeRowItem } from '@/components/ui/BadgeRows';
import { Callout, CalloutBody } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { CardAccent } from '@/components/ui/CardAccent';
import { Chip } from '@/components/ui/Chip';
import { DetailChevron } from '@/components/ui/DetailArrow';
import { IconLine } from '@/components/ui/IconLine';
import { InlineAction } from '@/components/ui/InlineAction';
import { ListEnd } from '@/components/ui/ListEnd';
import { StatGrid, type StatCell } from '@/components/ui/StatGrid';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { goBackOr } from '@/navigation/go-back-or';
import { queryKeys } from '@/queries/query-keys';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';

const ALL = 'all';

/**
 * "Tiền của các chuyến đã thuê" — các khoản KHÁCH đã trả cho GIAN HÀNG.
 *
 * ## Ba loại tiền, ba màn — và đó là lý do khối giải thích đứng đầu
 *
 * Người dùng dễ đọc con số ở đây rồi tưởng đó là số dư của mình. Không phải:
 *   - màn NÀY   — tiền đã trả cho gian hàng (thuê, cọc);
 *   - Ví điểm   — tiền XePrime đang NỢ lại họ (ADR 0033);
 *   - chi tiết chuyến — khoản giữ chỗ chuyển cho XePrime.
 *
 * Câu "đây là tiền bạn đã trả cho gian hàng" lên DÒNG PHỤ của thanh trên: nó định nghĩa cả màn,
 * nên nó phải đọc được cùng lúc với tên màn chứ không nằm trong một khối màu mà mắt học cách bỏ
 * qua sau lần thứ hai. Khối `Callout` còn lại chỉ chở phần thanh trên không chở nổi — hai loại
 * tiền KHÁC ở đâu — và "Ví điểm" trong đó là một lối đi thật, không phải một chữ được tô màu.
 *
 * ## Bảng của web thành THẺ ở đây
 *
 * Bảng sáu cột cần 760dp mới đọc được; màn 360dp thì hoặc cuộn ngang hoặc chữ vỡ. Cùng sáu thông
 * tin, xếp lại thành thẻ — không bớt cột nào, vì bớt là giấu mất một loại tiền.
 *
 * Bộ lọc giữ ở state màn hình: native không có URL để chia sẻ, và bộ lọc này chết theo màn
 * (ADR 0004, mục "Screen filters").
 */
export function AccountPaymentsScreen() {
  const t = useTranslations('AccountPayments');
  const tNav = useTranslations('Navigation');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const navigateOnce = useNavigateOnce();
  const router = useRouter();

  const [kind, setKind] = useState<string | null>(null);

  /*
   * Cuộn tới đáy phải NỐI thêm trang, không thay trang.
   *
   * Bản trước giữ `page` ở state và gọi `useQuery`: chạm đáy là danh sách bị thay bằng đúng 20
   * dòng của trang sau, tức người dùng vừa cuộn qua trang một thì trang một biến mất dưới ngón
   * tay họ. Vì thế `page` KHÔNG nằm trong khoá cache ở đây — nó là `pageParam` của TanStack.
   */
  const query = useInfiniteQuery({
    queryKey: queryKeys.accountPayments.listInfinite({
      kind: kind ?? null,
      limit: ACCOUNT_PAYMENT_LIMIT,
    }),
    queryFn: ({ pageParam }) => accountPaymentsApi.list(accountPaymentParams({ kind, page: pageParam })),
    initialPageParam: 1,
    getNextPageParam: (last: AccountPaymentPage) =>
      last.meta.hasNext ? last.meta.page + 1 : undefined,
    // Giữ trang cũ trong lúc tải bộ lọc mới — danh sách nhấp nháy trắng khi đổi lọc là khó đọc.
    placeholderData: keepPreviousData,
  });

  const pages = query.data?.pages ?? [];
  const rows = pages.flatMap((page) => page.data);
  /* Tổng tính trên TOÀN BỘ tập, nên nó giống nhau ở mọi trang — lấy trang đầu là đủ. */
  const totals = pages[0]?.meta.totals;

  return (
    <>
      <AppHeader
        onBack={() => goBackOr(router, ROUTES.account.home())}
        title={tNav('account.payments')}
        subtitle={t('scope.title')}
      />
      <Screen edges={['left', 'right', 'bottom']} padded={false} scroll={false}>
        <FlatList
          data={rows}
          keyExtractor={keyOf}
          contentContainerStyle={{ padding: space.md, gap: space.sm }}
          renderItem={({ item }: ListRenderItemInfo<AccountPayment>) => (
            <PaymentRow
              payment={item}
              kindLabel={domainLabel('paymentKind', item.kind)}
              methodLabel={domainLabel('paymentMethod', item.method)}
              statusLabel={domainLabel(
                'paymentStatus',
                item.status,
                PAYMENT_STATUS_META[item.status]?.label,
              )}
              amount={fmt.money(item.amount)}
              paidAt={item.paidAt ? fmt.dateTime(item.paidAt) : t('notPaidYet')}
              onPress={() => navigateOnce(ROUTES.booking.detail(item.bookingId))}
            />
          )}
          ListHeaderComponent={
            <YStack gap={space.sm} pb={space.sm}>
              <PaymentTotals totals={totals} />

              {/* Cọc KHÔNG phải khoản mất đi — nói ra, nếu không con số đó đọc như một khoản lỗ. */}
              {totals && Number(totals.depositTotal) > 0 ? (
                <Callout tone="warning">
                  <CalloutBody>{t('depositNote')}</CalloutBody>
                </Callout>
              ) : null}

              <Callout tone="info">
                <CalloutBody>{t('scope.body')}</CalloutBody>
                <InlineAction
                  label={t('scope.balanceLink')}
                  onPress={() => navigateOnce(ROUTES.account.balance())}
                />
              </Callout>

              <XStack flexWrap="wrap" gap={space.xs}>
                <Chip
                  label={t('filters.all')}
                  selected={kind === null}
                  onPress={() => setKind(null)}
                />
                {PAYMENT_KIND_VALUES.map((value) => (
                  <Chip
                    key={value}
                    label={domainLabel('paymentKind', value)}
                    selected={kind === value}
                    onPress={() => setKind(value)}
                  />
                ))}
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
              <ScreenMessage icon="card-outline" title={t(`empty.${kind ?? ALL}` as never)} />
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

// Ở module scope, không inline: FlatList coi `keyExtractor` mới là prop đổi và dựng lại cây con.
const keyOf = (row: AccountPayment) => row.id;

/**
 * Bốn con số đầu màn — cùng bảng `StatGrid` với dải chỉ số của sổ khách và hồ sơ khách.
 *
 * Bản trước là bốn khối `flexWrap` dựng tay trong một `Card`: mỗi khối rộng theo nội dung của
 * chính nó, nên "Số chuyến" (một chữ số) đứng cạnh "Tổng đã trả" (mười chữ số) thành một dải
 * lệch nhau, và tới màn hẹp thì ô thứ tư rơi xuống một mình. Bảng có kẻ chia thì ô ăn theo
 * chiều cao của HÀNG và mép luôn thẳng.
 *
 * Hình mang màu PHÂN LOẠI, con số thì KHÔNG tô: ở đây không có con số nào là tin xấu — tiền cọc
 * cao không phải một khoản lỗ, và tô nó đỏ là báo động giả (lời giải thích nằm ở `depositNote`).
 */
function PaymentTotals({ totals }: { totals: AccountPaymentTotals | undefined }) {
  const t = useTranslations('AccountPayments.stats');
  const fmt = useAppFormat();

  const cells = useMemo<StatCell[]>(
    () =>
      totals
        ? [
            {
              key: 'paidTotal',
              icon: 'cash-outline',
              label: t('paidTotal'),
              value: fmt.money(totals.paidTotal),
              tone: colors.success,
            },
            {
              key: 'rental',
              icon: 'car-outline',
              label: t('rental'),
              value: fmt.money(totals.rentalTotal),
              tone: colors.info,
            },
            {
              key: 'deposit',
              icon: 'lock-closed-outline',
              label: t('deposit'),
              value: fmt.money(totals.depositTotal),
              tone: colors.warning,
            },
            {
              key: 'trips',
              icon: 'map-outline',
              label: t('trips'),
              value: fmt.count(totals.tripCount),
              tone: colors.textMuted,
            },
          ]
        : [],
    [totals, t, fmt],
  );

  if (cells.length === 0) return null;

  return (
    <Card padded={false}>
      <StatGrid cells={cells} />
    </Card>
  );
}

/**
 * MỘT khoản đã trả — cùng khuôn thẻ với phiếu thu/chi của khu quản lý.
 *
 * **Vạch mép trái mang TRẠNG THÁI**, khác `ReceiptCard` (vạch mang chiều tiền) và có lý do: ở sổ
 * này mọi khoản đều là tiền ĐI RA từ khách, nên chiều tiền không phân biệt được dòng nào với
 * dòng nào. Câu người ta lướt để hỏi là "khoản này đã trả xong chưa" — một dòng đang chờ nằm
 * giữa hai mươi dòng đã xong phải bắt được mắt trước khi đọc chữ.
 *
 * Số tiền là thứ TO NHẤT thẻ, nhãn trạng thái đối diện; khoản chưa thành công thì số nhạt đi để
 * không bị cộng nhẩm vào phần đã trả.
 *
 * Mỗi khoản dẫn về CHUYẾN của nó: câu hỏi kế tiếp luôn là "khoản này của chuyến nào".
 */
function PaymentRow({
  payment,
  kindLabel,
  methodLabel,
  statusLabel,
  amount,
  paidAt,
  onPress,
}: {
  payment: AccountPayment;
  kindLabel: string;
  methodLabel: string;
  statusLabel: string;
  amount: string;
  paidAt: string;
  onPress: () => void;
}) {
  const succeeded = payment.status === PAYMENT_STATUS.SUCCEEDED;
  const statusColor: StatusColor = PAYMENT_STATUS_META[payment.status]?.color ?? STATUS_COLOR.NEUTRAL;

  /*
   * LOẠI tiền đứng trước HÌNH THỨC: "cọc hay tiền thuê" đổi nghĩa của con số phía trên, còn
   * "chuyển khoản hay tiền mặt" chỉ nói nó đi bằng đường nào.
   */
  const badges: BadgeRowItem[] = [
    {
      key: 'kind',
      label: kindLabel,
      node: <StatusBadge label={kindLabel} color={STATUS_COLOR.NEUTRAL} size="sm" />,
    },
    {
      key: 'method',
      label: methodLabel,
      node: (
        <StatusBadge
          label={methodLabel}
          color={PAYMENT_METHOD_META[payment.method]?.color ?? STATUS_COLOR.NEUTRAL}
          size="sm"
        />
      ),
    },
  ];

  return (
    <Card
      padded={false}
      onPress={onPress}
      accessibilityLabel={`${payment.bookingCode}${LIST_SEPARATOR}${amount}`}
    >
      <XStack>
        <CardAccent color={statusColor} />

        <YStack f={1} minWidth={0} p={space.sm} gap={space.xs}>
          {/* Tầng 1 — SỐ TIỀN là thứ to nhất của thẻ, nhãn trạng thái đối diện. */}
          <XStack ai="center" gap={space.xs}>
            <Text
              f={1}
              minWidth={0}
              col={succeeded ? colors.text : colors.textMuted}
              fos={fontSize.h4}
              fow={fontWeight.bold}
              numberOfLines={1}
            >
              {amount}
            </Text>
            <StatusBadge label={statusLabel} color={statusColor} size="sm" />
          </XStack>

          {/* Tầng 2 — loại tiền và hình thức trả. */}
          <BadgeRows items={badges} />

          {/* Tầng 3 — dòng GIÁ TRỊ: khoản này của chuyến nào, xe nào. */}
          <IconLine icon="car-outline" iconTone={colors.primaryActive} strong>
            {`${payment.bookingCode}${LIST_SEPARATOR}${payment.vehicleName}`}
          </IconLine>

          {/* Tầng 4 — gian hàng và mốc ghi nhận: thứ để TRA CỨU, mờ nhất thẻ. */}
          <XStack ai="center" gap={space.xs}>
            <Text f={1} minWidth={0} col={colors.placeholder} fos={fontSize.label} numberOfLines={1}>
              {`${payment.tenantName}${LIST_SEPARATOR}${paidAt}`}
            </Text>
            <DetailChevron />
          </XStack>
        </YStack>
      </XStack>
    </Card>
  );
}
