import { useEffect, useMemo, useState, type MutableRefObject, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  absoluteMoney,
  isNegativeMoney,
  isPositiveMoney,
  isZeroMoney,
  nowInAppTz,
} from '@xeprime/domain';
import {
  ACCOUNT_TRACK,
  WALLET_STATEMENT_UNIT,
  resolveAccountTrack,
} from '@xeprime/types';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { DeductedAmount } from '@/components/ui/DeductedAmount';
import { useAccumulatedPages } from '@/hooks/use-accumulated-pages';
import { useLoadNextPage } from '@/hooks/use-load-next-page';
import {
  MONTH_PERIOD_FORMAT,
  MonthPeriodField,
  periodLabel,
} from '@/components/ui/MonthPeriodField';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { OwnerPayoutTable } from '@/features/bookings/components/OwnerPayoutTable';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, market, radius, space, typeScale } from '@/theme/tokens';
import { FONT_FAMILY } from '@/theme/fonts';
import { XP_TOKENS, toPx } from '@xeprime/ui';
import { LineIcon } from '@/components/icons/LineIcon';
import { InfoHint } from '@/components/ui/InfoHint';
import { ServiceTypeChip } from '@/components/ui/ServiceTypeChip';
import {
  type WalletStatementFilters,
  type WalletStatementTrip,
} from '@/api/wallet/api';
import { useWalletStatement } from '../hooks/use-wallet';

/**
 * BẢNG TỔNG HỢP GIAO DỊCH — một tháng làm ăn của gian hàng, đọc từ `/shop/wallet/statement`.
 *
 * ## Bảng của web thành THẺ ở đây, và không mất cột nào
 *
 * Bản web là một bảng 8 cột rộng tối thiểu 880px. Ở 360dp, thứ duy nhất làm được với nó là cuộn
 * ngang — tức người đọc không bao giờ thấy trọn một dòng, mà một dòng ở đây chính là một chuyến.
 * Nên mỗi chuyến là một THẺ: mã + hình thức ở đầu, giờ nhận/trả, rồi ba con số tiền xếp thành cặp
 * nhãn–giá trị. Đủ cả tám thông tin của bảng, không bỏ cột nào — kể cả `Đơn giá` và `Hình thức` mà
 * hình thái `compact` bên web lược đi, vì ở đây không có cột nào phải nhường chỗ cho cột khác.
 *
 * ## Vì sao không có dòng "phí sàn"
 *
 * Phí dịch vụ XePrime do KHÁCH trả thêm (ADR 0032 điều 2), không trừ vào doanh thu gian hàng. Dựng
 * nó thành một dòng khấu trừ trong bảng thu nhập của chủ xe là bịa ra một khoản họ không hề mất.
 *
 * ## Vì sao "thay đổi số dư" nhỏ hơn "doanh thu"
 *
 * Khách chỉ trả `D + S + IV + IP` online; phần `B − D` họ đưa TAY cho chủ xe lúc nhận xe và XePrime
 * không thu hộ. Bảng vì thế có một dòng riêng cho phần trả tay — thiếu nó, chủ xe đọc hai con số
 * lệch nhau rồi tin rằng nền tảng đang giữ tiền của mình.
 */
export function WalletStatementPanel({
  filters,
  onFiltersChange,
  loadMoreRef,
}: {
  filters: WalletStatementFilters;
  onFiltersChange: (patch: Partial<WalletStatementFilters>) => void;
  /** Màn chứa gọi `current()` khi cuộn gần đáy (`Screen onNearEnd`) - cuộn vô hạn. */
  loadMoreRef: MutableRefObject<(() => void) | null>;
}) {
  const colors = useColors();
  const t = useTranslations('Wallet.statement');
  const tWallet = useTranslations('Wallet');
  const tCommon = useTranslations('Common');

  /*
   * Luôn hiện và luôn tải — đúng web (25/09/2026). Bản trước thu gọn khối này mặc định và chỉ tải
   * khi mở, một khác biệt mà web không có.
   */
  const query = useWalletStatement(filters, true);
  const data = query.data;
  /* Cuộn vô hạn (mobile-feature §5): gộp các trang đã tải, trang 1 thay toàn bộ. */
  const items = useAccumulatedPages(data?.items, data?.page, (trip) => trip.bookingId);
  const { hasNext, loadNext } = useLoadNextPage({
    page: data?.page,
    limit: data?.limit,
    total: data?.total,
    fetching: query.isFetching,
    onPage: (page) => onFiltersChange({ page }),
  });
  useEffect(() => {
    loadMoreRef.current = loadNext;
    return () => {
      if (loadMoreRef.current === loadNext) loadMoreRef.current = null;
    };
  }, [loadMoreRef, loadNext]);
  /** Đang tải lại TỪ ĐẦU (đổi tháng / kéo làm mới) - khung xương thay chỗ các thẻ. */
  const reloading = query.isFetching && filters.page <= 1;
  const loadingMore = query.isFetching && filters.page > 1;
  const totals = data?.totals;
  /*
   * Hoa hồng `H` do CHỦ XE chịu (ADR 0064 điều 3) — dòng chỉ hiện khi KỲ có hoa hồng (số của cả kỳ,
   * nên lật trang không làm dòng nhảy ra nhảy vào): tuyến gói luôn `H = 0`. Như web.
   */
  const showCommission = isPositiveMoney(totals?.ownerCommissionTotal);
  // Cột "Phí giao xe" — chỉ có khi kỳ có chuyến giao tận nơi, như web.
  const showDelivery = isPositiveMoney(totals?.deliveryTotal);

  /** Tháng sau chưa xảy ra — trần là tháng HIỆN TẠI theo giờ VN, đúng `maxDate` của web. */
  const maxPeriod = useMemo(() => nowInAppTz().format(MONTH_PERIOD_FORMAT), []);

  return (
    <YStack gap={toPx(XP_TOKENS['space-12'])}>
      {/* Ô tháng trải ngang "Tháng 10/2026" ngay dưới hàng tab (Figma `24612:145586`). */}
      <MonthPeriodField
        variant="compact"
        block
        display={tWallet('month.value', { month: periodLabel(filters.period) })}
        label={t('period')}
        value={filters.period}
        maxPeriod={maxPeriod}
        onChange={(period) => onFiltersChange({ period, page: 1 })}
      />

      {query.isError && !data ? (
        <Callout tone="danger" title={t('loadError')}>
          <Button
            label={tCommon('actions.retry')}
            variant="secondary"
            size="sm"
            block={false}
            onPress={() => void query.refetch()}
          />
        </Callout>
      ) : null}

      {/*
        Khung xương cho lần tải ĐẦU, và cho cả lượt đổi kỳ/lật trang.

        `placeholderData: keepPreviousData` giữ bảng cũ trong lúc tải — thứ đúng cho nhịp cuộn,
        nhưng trên một bảng TIỀN thì "những con số bạn đang nhìn là của tháng bạn vừa rời" phải nói
        ra. Web nói bằng `loading` của `DataTable`; ở đây khung xương THAY CHỖ các thẻ chuyến,
        nên không bao giờ có hai bộ số cùng lúc trên màn.
      */}
      {reloading ? <MiniRowsSkeleton rows={4} /> : null}

      {!query.isFetching && items.length === 0 ? (
        <Card>
          <YStack gap={space.xs}>
            <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
              {t('empty.title')}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('empty.body')}
            </Text>
          </YStack>
        </Card>
      ) : null}

      {reloading ? null : items.map((trip) => (
            <TripCard
              key={trip.bookingId}
              trip={trip}
              showCommission={showCommission}
              showDelivery={showDelivery}
            />
          ))}

      {/* Đang nối trang kế: khung xương dưới các thẻ đã có. Hết trang: dòng tổng. */}
      {loadingMore ? <MiniRowsSkeleton rows={2} /> : null}
      {!reloading && !hasNext && (data?.total ?? 0) > 0 ? (
        <Text col={colors.textMuted} fos={fontSize.label} ta="center">
          {t('totalLabel', { count: data?.total ?? 0 })}
        </Text>
      ) : null}

    </YStack>
  );
}

/**
 * Thẻ "Tổng hợp tháng" — bản native của `WalletMonthSummary` (web, PR #276).
 *
 * Web tách phần cộng dồn của kỳ ra khỏi bảng tổng hợp, đứng ở cột bên và hiện ở CẢ HAI tab (Tổng
 * hợp giao dịch · Biến động số dư). Đọc cùng `GET /shop/wallet/statement` với bảng — cùng khoá
 * cache, nên không tốn thêm một lượt gọi khi đang ở tab tổng hợp.
 */
export function WalletMonthSummary({ filters }: { filters: WalletStatementFilters }) {
  const colors = useColors();
  const t = useTranslations('Wallet.statement');
  const tWallet = useTranslations('Wallet');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const query = useWalletStatement(filters, true);
  const totals = query.data?.totals;
  const stats = query.data?.stats;
  const showCommission = isPositiveMoney(totals?.ownerCommissionTotal);
  const { data: user } = useCurrentUser();
  /*
   * Dòng thu nhập gọi người đọc bằng ĐÚNG tên của họ.
   *
   * Cùng một bảng phục vụ hai người: chủ gian hàng tuyến gói ở khu quản lý, và chủ xe cá nhân tuyến
   * hoa hồng ở khu tài khoản. Gọi một chủ xe có đúng một chiếc xe là "chủ gian hàng" ngay trên dòng
   * nói về thu nhập của chính họ là sai về con người. Suy từ TUYẾN, dùng chung phép suy với nhãn
   * tài khoản và với web.
   */
  const incomeLabelKey = ownerIncomeKeyFor(user?.tenant);
  const [year, month] = filters.period.split('-');

  return (
    /* Figma "Nhóm thông tin" `24228:102213`: thẻ trắng viền, bo 16, đệm 16, khe 12. */
    <YStack
      bg={colors.surface}
      bw={1}
      bc={colors.border}
      br={radius.card}
      p={space.md}
      gap={toPx(XP_TOKENS['space-12'])}
    >
      <Text
        col={colors.text}
        fos={typeScale.title.fontSize}
        lh={typeScale.title.lineHeight}
        fow={fontWeight.semibold}
      >
        {tWallet('month.title', { month: `${month}/${year}` })}
      </Text>
      {query.isPending && !query.data ? <MiniRowsSkeleton rows={4} /> : null}
      {query.isError && !query.data ? (
        <Callout tone="danger" title={t('loadError')}>
          <Button
            label={tCommon('actions.retry')}
            variant="secondary"
            size="sm"
            block={false}
            onPress={() => void query.refetch()}
          />
        </Callout>
      ) : null}
      {totals && stats ? (
        <>
          <YStack>
            <LineRow
              label={t('stats.trips')}
              value={t('stats.tripsValue', { count: stats.completedTripCount })}
            />
            <LineRow
              label={tWallet('month.balanceChange')}
              value={<SignedAmount value={totals.balanceChangeTotal} compact />}
            />
            {/*
              Phần khách trả TAY: chỉ hiện khi thật sự có. Ở gian hàng tắt thu cọc qua sàn thì
              `D = 0` và toàn bộ tiền thuê đi thẳng cho chủ xe - giấu nó đi sẽ khiến "thu nhập"
              trông như từ trên trời rơi xuống. Lời giải thích nằm ở ⓘ.
            */}
            {isZeroMoney(totals.payAtPickupTotal) ? null : (
              <LineRow
                label={t('totals.payAtPickup')}
                info={t('totals.payAtPickupHint')}
                value={fmt.money(totals.payAtPickupTotal)}
              />
            )}
            {/* Phí giao xe đứng RIÊNG (ADR 0068 điều 5) - chỉ khi kỳ có chuyến giao tận nơi. */}
            {isZeroMoney(totals.deliveryTotal) ? null : (
              <LineRow
                label={t('totals.delivery')}
                info={t('totals.deliveryHint')}
                value={fmt.money(totals.deliveryTotal)}
              />
            )}
            {isZeroMoney(totals.subscriptionFeeTotal) ? null : (
              <LineRow
                label={t('totals.appSubscriptionFee')}
                value={`−${fmt.money(totals.subscriptionFeeTotal)}`}
                tone="danger"
              />
            )}
            {showCommission ? (
              <LineRow
                label={t('totals.commission')}
                value={<DeductedAmount value={totals.ownerCommissionTotal} size={fontSize.label} />}
              />
            ) : null}
            <LineRow
              label={t('totals.tax')}
              value={<DeductedAmount value={totals.taxTotal} size={fontSize.label} />}
            />
            {/* Dòng chốt: nhãn 12 semibold `text/gray/medium`, số 14/20 semibold `brand/primary-2`. */}
            <LineRow
              label={t(`totals.${incomeLabelKey}`)}
              emphasis
              last
              value={
                <Text
                  col={colors.brandLink}
                  fos={typeScale.body.fontSize}
                  lh={typeScale.body.lineHeight}
                  fow={fontWeight.semibold}
                >
                  {fmt.money(totals.ownerIncome)}
                </Text>
              }
            />
          </YStack>
          {/* Chú thích nghiêng 12/18 `text/gray/very-low` cuối thẻ (Figma `24228:102228`). */}
          <Text
            col={colors.textPlaceholder}
            fos={typeScale.label.fontSize}
            lh={typeScale.label.lineHeight}
            fontStyle="italic"
          >
            {t('totals.appOwnerIncomeHint')}
          </Text>
        </>
      ) : null}
    </YStack>
  );
}

/**
 * Thẻ ba chỉ số của kỳ - đánh giá · chuyến thành công · tỉ lệ phản hồi (Figma "Vehicle Summary"
 * `24228:102201`). Đọc cùng `GET /shop/wallet/statement` (cùng khoá cache với Tổng hợp tháng),
 * đứng riêng dưới thẻ số dư như Figma thay vì nằm trong bảng.
 */
export function WalletStatsCard({ filters }: { filters: WalletStatementFilters }) {
  const colors = useColors();
  const t = useTranslations('Wallet.statement');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const query = useWalletStatement(filters, true);
  const stats = query.data?.stats;
  if (!stats) return null;

  return (
    <XStack
      bg={colors.surface}
      bw={1}
      bc={colors.border}
      br={radius.card}
      p={toPx(XP_TOKENS['space-12'])}
      ai="flex-start"
    >
      <StatCell
        leading={<LineIcon name="star" size={iconSize.lg} color={market.star} />}
        value={
          stats.ratingAvg == null ? tCommon('labels.emptyValue') : fmt.rating(stats.ratingAvg)
        }
        label={t('stats.rating', { count: stats.ratingCount ?? 0 })}
      />
      <StatCell
        value={t('stats.tripsValue', { count: stats.completedTripCount })}
        label={t('stats.trips')}
      />
      <StatCell
        value={
          stats.responseRatePercent == null
            ? tCommon('labels.emptyValue')
            : t('stats.responseValue', { percent: stats.responseRatePercent })
        }
        label={t('stats.response')}
      />
    </XStack>
  );
}

function StatCell({ leading, value, label }: { leading?: ReactNode; value: string; label: string }) {
  const colors = useColors();
  return (
    <YStack f={1} minWidth={0} ai="center" gap={2}>
      <XStack ai="center" gap={space.xs}>
        {leading}
        <Text
          col={colors.text}
          fos={typeScale.title.fontSize}
          lh={typeScale.title.lineHeight}
          fow={fontWeight.semibold}
          numberOfLines={1}
        >
          {value}
        </Text>
      </XStack>
      <Text
        col={colors.textMuted}
        fos={typeScale.label.fontSize}
        lh={typeScale.label.lineHeight}
        ta="center"
        numberOfLines={2}
      >
        {label}
      </Text>
    </YStack>
  );
}

/**
 * Một chuyến — đủ tám thông tin của một dòng bảng bên web, xếp dọc.
 *
 * Mã chuyến đứng đầu và KHÔNG bị cắt: nó là thứ chủ xe dùng để đối chiếu với chứng từ, và một mã
 * thiếu ba ký tự cuối thì vô dụng.
 */
function TripCard({
  trip,
  showCommission,
  showDelivery,
  defaultOpen = false,
}: {
  trip: WalletStatementTrip;
  /** Kỳ có hoa hồng — cùng cờ với dòng tổng, để mọi thẻ của một kỳ cùng một hình. */
  showCommission: boolean;
  /** Kỳ có chuyến giao tận nơi — cùng cờ với cột "Phí giao xe" của web. */
  showDelivery: boolean;
  /** Figma vẽ thẻ ĐẦU mở sẵn, các thẻ sau thu gọn. */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const colors = useColors();
  const t = useTranslations('Wallet.statement');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();

  /*
   * Figma "Transaction" `24228:102230`. Đầu thẻ (mã + viên dịch vụ +
   * mũi tên, rồi giờ nhận → trả + đơn giá) là vùng chạm mở/thu. Thu gọn chỉ còn dòng Doanh thu;
   * mở ra đủ các dòng tiền của chuyến như bảng web, kèm bảng cộng ví (ADR 0068 điều 5).
   */
  return (
    /* Figma "Transaction" `24612:145368`: thẻ trắng viền `stroke/gray-low200`, bo 12, đệm 16, khe 8. */
    <YStack bg={colors.surface} bw={1} bc={colors.border} br={radius.control} p={space.md} gap={space.sm}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={t('toggle', { code: trip.code })}
      >
        <YStack gap={space.sm}>
          <XStack ai="center" jc="space-between" gap={space.sm}>
            {/* Mã chuyến KHÔNG bị cắt: thứ chủ xe dùng để đối chiếu chứng từ. */}
            <XStack f={1} minWidth={0} ai="center" gap={space.sm} flexWrap="wrap">
              <Text
                col={colors.text}
                fos={typeScale.body.fontSize}
                lh={typeScale.body.lineHeight}
                fow={fontWeight.semibold}
              >
                {trip.code}
              </Text>
              <ServiceTypeChip value={trip.serviceType} />
            </XStack>
            <LineIcon
              name={open ? 'chevron-up-md' : 'chevron-down-md'}
              size={iconSize.lg}
              color={colors.textMuted}
            />
          </XStack>
          <XStack ai="center" jc="space-between" gap={space.sm}>
            <Text
              flexShrink={1}
              col={colors.text}
              fos={typeScale.body.fontSize}
              lh={typeScale.body.lineHeight}
            >
              {`${fmt.shortDateTime(trip.pickupAt)}  →  ${fmt.shortDateTime(trip.returnAt)}`}
            </Text>
            {trip.unitAmount == null ? (
              <Text col={colors.textPlaceholder} fos={typeScale.body.fontSize}>
                {tCommon('labels.emptyValue')}
              </Text>
            ) : (
              <Text
                col={colors.text}
                fos={typeScale.body.fontSize}
                lh={typeScale.body.lineHeight}
                fow={fontWeight.medium}
                fontFamily={FONT_FAMILY.medium}
              >
                {fmt.money(trip.unitAmount)}
                <Text
                  col={colors.textPlaceholder}
                  fos={typeScale.body.fontSize}
                  lh={typeScale.body.lineHeight}
                  fow={fontWeight.regular}
                  fontFamily={FONT_FAMILY.body}
                >
                  {trip.unitKind === WALLET_STATEMENT_UNIT.MONTH ? t('unitPerMonth') : t('unitPerDay')}
                </Text>
              </Text>
            )}
          </XStack>
        </YStack>
      </Pressable>

      {/*
        Thu gọn: một dòng Doanh thu 12/18. Mở: mọi dòng tiền của chuyến (cả bảng cộng ví nối tiếp,
        ADR 0068 điều 5) cùng cỡ 14/20, chung một cột như Figma `24612:145377`.
      */}
      <YStack>
        <LineRow
          label={t('columns.revenue')}
          value={fmt.money(trip.revenueAmount)}
          size={open ? 'md' : 'sm'}
          last={!open}
        />
        {open ? (
          <>
            {showCommission ? (
              <LineRow
                size="md"
                label={t('columns.commission')}
                value={<DeductedAmount value={trip.ownerCommissionAmount} size={fontSize.body} />}
              />
            ) : null}
            {/* Thuế là khoản TRỪ khỏi tiền chủ xe - hiện dấu trừ, không chỉ là một số nhỏ. */}
            <LineRow
              size="md"
              label={t('columns.tax')}
              value={<DeductedAmount value={trip.taxAmount} size={fontSize.body} />}
            />
            {showDelivery ? (
              <LineRow
                size="md"
                label={t('columns.delivery')}
                value={
                  isZeroMoney(trip.deliveryAmount)
                    ? tCommon('labels.emptyValue')
                    : fmt.money(trip.deliveryAmount)
                }
              />
            ) : null}
            <LineRow
              size="md"
              label={t('columns.balanceChange')}
              last={!trip.ownerPayout}
              value={<SignedAmount value={trip.balanceChange} compact size={fontSize.body} />}
            />
            {trip.ownerPayout ? (
              <OwnerPayoutTable
                payout={trip.ownerPayout}
                label={t('payout.label', { code: trip.code })}
                variant="ledger"
              />
            ) : null}
          </>
        ) : null}
      </YStack>
    </YStack>
  );
}

/**
 * Một dòng nhãn - giá trị của Figma ("Summary Item" / "Transaction Detail"): đệm dọc 8, kẻ đáy
 * 1px `stroke/gray-50`, nhãn 12/18 `text/gray/low`, giá trị 12/18 medium. `emphasis` = dòng chốt
 * (nhãn semibold `text/gray/medium`); `last` = bỏ kẻ đáy.
 */
function LineRow({
  label,
  value,
  info,
  tone,
  emphasis = false,
  last = false,
  size = 'sm',
}: {
  label: string;
  value: ReactNode;
  /** `sm` = 12/18 (mặc định); `md` = 14/20 - dòng tiền của thẻ chuyến đang mở. */
  size?: 'sm' | 'md';
  /** Lời giải thích - mở bằng ⓘ cạnh nhãn, không chiếm thêm dòng. */
  info?: string;
  tone?: 'danger';
  emphasis?: boolean;
  last?: boolean;
}) {
  const colors = useColors();
  const type = size === 'md' ? typeScale.body : typeScale.label;
  return (
    <XStack
      ai="center"
      jc="space-between"
      gap={space.sm}
      py={space.sm}
      {...(last ? {} : { borderBottomWidth: 1, borderColor: colors.background })}
    >
      <XStack f={1} minWidth={0} ai="center" gap={space.xs}>
        <Text
          flexShrink={1}
          col={emphasis ? colors.textMuted : colors.placeholder}
          fos={type.fontSize}
          lh={type.lineHeight}
          fow={emphasis ? fontWeight.semibold : fontWeight.regular}
        >
          {label}
        </Text>
        {info ? <InfoHint label={label} content={info} size={fontSize.label} /> : null}
      </XStack>
      {typeof value === 'string' ? (
        <Text
          col={tone === 'danger' ? colors.danger : colors.text}
          fos={type.fontSize}
          lh={type.lineHeight}
          fow={fontWeight.medium}
        >
          {value}
        </Text>
      ) : (
        value
      )}
    </XStack>
  );
}

/**
 * Số tiền có DẤU.
 *
 * Dấu đứng trước và có màu riêng: trên một sổ tiền, hướng dòng tiền là thứ mắt phải bắt được trước
 * giá trị. Dùng cả dấu lẫn màu để không phụ thuộc khả năng phân biệt màu.
 */
export function SignedAmount({
  value,
  prominent = false,
  strong = false,
  compact = false,
  size: sizeOverride,
}: {
  value: string;
  /** Cỡ chữ riêng - thắng `prominent`/`compact`. */
  size?: number;
  prominent?: boolean;
  strong?: boolean;
  /** Cỡ dòng Figma 12/18 medium - giá trị trong "Summary Item" / "Transaction Detail". */
  compact?: boolean;
}) {
  const colors = useColors();
  const fmt = useAppFormat();
  const size = sizeOverride ?? (prominent ? fontSize.h4 : compact ? fontSize.label : fontSize.bodySm);
  const weight =
    prominent || strong ? fontWeight.bold : compact ? fontWeight.medium : fontWeight.regular;

  if (isZeroMoney(value)) {
    return (
      <Text col={colors.textMuted} fos={size} fow={weight}>
        {fmt.money('0')}
      </Text>
    );
  }

  /*
   * So và lấy trị tuyệt đối trên CHUỖI (`@xeprime/domain`), không đi vòng qua `Number()`.
   *
   * ADR 0007 giữ tiền là chuỗi suốt đường đi đúng để nó không bao giờ chạm float. Cùng bộ helper mà
   * `WalletScreen` — chính màn dựng panel này — đang dùng cho sổ ví.
   */
  const negative = isNegativeMoney(value);
  return (
    <Text col={negative ? colors.danger : colors.success} fos={size} fow={weight}>
      {`${negative ? '−' : '+'}${fmt.money(absoluteMoney(value) ?? '0')}`}
    </Text>
  );
}

/**
 * Khoá nhãn dòng thu nhập theo TUYẾN của người đang đọc.
 *
 * Hàm THUẦN và nhận đúng phần dữ liệu nó cần, nên test được mà không dựng React — cùng khuôn với
 * `walletScopeFor`, và cùng phép suy với bản web.
 */
export function ownerIncomeKeyFor(
  tenant: Parameters<typeof resolveAccountTrack>[0],
): 'ownerIncome' | 'ownerIncomeCommission' | 'ownerIncomeGeneric' {
  const { track } = resolveAccountTrack(tenant);
  if (track === ACCOUNT_TRACK.SHOP_OWNER) return 'ownerIncome';
  if (track === ACCOUNT_TRACK.COMMISSION_OWNER) return 'ownerIncomeCommission';
  return 'ownerIncomeGeneric';
}
