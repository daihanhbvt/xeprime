import { useMemo } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { absoluteMoney, isNegativeMoney, isZeroMoney, nowInAppTz } from '@xeprime/domain';
import {
  ACCOUNT_TRACK,
  STATUS_COLOR,
  WALLET_STATEMENT_UNIT,
  resolveAccountTrack,
} from '@xeprime/types';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { CardAccent } from '@/components/ui/CardAccent';
import type { IconName } from '@/components/ui/Chip';
import { Divider } from '@/components/ui/DataRow';
import { IconDisc } from '@/components/ui/IconDisc';
import { Pagination } from '@/components/ui/Pagination';
import { MONTH_PERIOD_FORMAT, MonthPeriodField } from '@/components/ui/MonthPeriodField';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import {
  WALLET_STATEMENT_PAGE_SIZE,
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
}: {
  filters: WalletStatementFilters;
  onFiltersChange: (patch: Partial<WalletStatementFilters>) => void;
}) {
  const t = useTranslations('Wallet.statement');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
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

  /*
   * Luôn hiện và luôn tải — đúng web (25/09/2026). Bản trước thu gọn khối này mặc định và chỉ tải
   * khi mở, một khác biệt mà web không có.
   */
  const query = useWalletStatement(filters, true);
  const data = query.data;
  const items = data?.items ?? [];
  const stats = data?.stats;
  const totals = data?.totals;

  /** Tháng sau chưa xảy ra — trần là tháng HIỆN TẠI theo giờ VN, đúng `maxDate` của web. */
  const maxPeriod = useMemo(() => nowInAppTz().format(MONTH_PERIOD_FORMAT), []);

  return (
    <YStack gap={space.sm}>
      <BlockTitle>{t('title')}</BlockTitle>

      <MonthPeriodField
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
      {query.isFetching ? <MiniRowsSkeleton rows={4} /> : null}

      {stats ? (
        <Card padded={false}>
          <XStack ai="stretch" py={space.sm}>
            <MetricCell
              icon="star-outline"
              tone={colors.warning}
              surface={colors.warningSurface}
              value={
                stats.ratingAvg == null ? tCommon('labels.emptyValue') : fmt.rating(stats.ratingAvg)
              }
              label={t('stats.rating', { count: stats.ratingCount ?? 0 })}
            />
            <MetricDivider />
            <MetricCell
              icon="checkmark-circle-outline"
              tone={colors.success}
              surface={colors.successSurface}
              value={t('stats.tripsValue', { count: stats.completedTripCount })}
              label={t('stats.trips')}
            />
            <MetricDivider />
            <MetricCell
              icon="chatbubbles-outline"
              tone={colors.info}
              surface={colors.infoSurface}
              value={
                stats.responseRatePercent == null
                  ? tCommon('labels.emptyValue')
                  : t('stats.responseValue', { percent: stats.responseRatePercent })
              }
              label={t('stats.response')}
            />
          </XStack>
        </Card>
      ) : null}

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

      {query.isFetching ? null : items.map((trip) => <TripCard key={trip.bookingId} trip={trip} />)}

      {(data?.total ?? 0) > 0 ? (
        <YStack gap={space.xs}>
          <Text col={colors.textMuted} fos={fontSize.label} ta="center">
            {t('totalLabel', { count: data?.total ?? 0 })}
          </Text>
          <Pagination
            page={data?.page ?? filters.page}
            limit={data?.limit ?? WALLET_STATEMENT_PAGE_SIZE}
            total={data?.total ?? 0}
            onChange={(page) => onFiltersChange({ page })}
          />
        </YStack>
      ) : null}

      {totals ? (
        <Card padded={false}>
          <YStack p={space.md} gap={space.sm}>
            <SummaryRow
              label={t('totals.balanceChange')}
              value={<SignedAmount value={totals.balanceChangeTotal} strong />}
            />
            {/*
              Phần khách trả TAY: chỉ hiện khi thật sự có. Ở gian hàng tắt thu cọc qua sàn thì
              `D = 0` và toàn bộ tiền thuê đi thẳng cho chủ xe — dòng này khi đó là cả doanh thu, và
              giấu nó đi sẽ khiến "thu nhập" trông như từ trên trời rơi xuống.
            */}
            {isZeroMoney(totals.payAtPickupTotal) ? null : (
              <SummaryRow
                label={t('totals.payAtPickup')}
                hint={t('totals.payAtPickupHint')}
                value={
                  <Text col={colors.text} fos={fontSize.bodySm}>
                    {fmt.money(totals.payAtPickupTotal)}
                  </Text>
                }
              />
            )}
            {isZeroMoney(totals.subscriptionFeeTotal) ? null : (
              <SummaryRow
                label={t('totals.subscriptionFee')}
                value={
                  <Text col={colors.danger} fos={fontSize.bodySm}>
                    {`−${fmt.money(totals.subscriptionFeeTotal)}`}
                  </Text>
                }
              />
            )}
            <SummaryRow
              label={t('totals.tax')}
              value={
                isZeroMoney(totals.taxTotal) ? (
                  <Text col={colors.textMuted} fos={fontSize.bodySm}>
                    {fmt.money('0')}
                  </Text>
                ) : (
                  <Text col={colors.danger} fos={fontSize.bodySm}>
                    {`−${fmt.money(totals.taxTotal)}`}
                  </Text>
                )
              }
            />
          </YStack>
          <Divider />
          <YStack px={space.md} py={space.sm} bg={colors.primaryLight}>
            <SummaryRow
              label={t(`totals.${incomeLabelKey}`)}
              hint={t('totals.ownerIncomeHint')}
              highlight
              value={
                <Text col={colors.price} fos={fontSize.h4} fow={fontWeight.bold}>
                  {fmt.money(totals.ownerIncome)}
                </Text>
              }
            />
          </YStack>
        </Card>
      ) : null}
    </YStack>
  );
}

/**
 * Một chuyến — đủ tám thông tin của một dòng bảng bên web, xếp dọc.
 *
 * Mã chuyến đứng đầu và KHÔNG bị cắt: nó là thứ chủ xe dùng để đối chiếu với chứng từ, và một mã
 * thiếu ba ký tự cuối thì vô dụng.
 */
function TripCard({ trip }: { trip: WalletStatementTrip }) {
  const t = useTranslations('Wallet.statement');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const accent = isZeroMoney(trip.balanceChange)
    ? STATUS_COLOR.NEUTRAL
    : isNegativeMoney(trip.balanceChange)
      ? STATUS_COLOR.DANGER
      : STATUS_COLOR.SUCCESS;

  return (
    <Card padded={false}>
      <XStack>
        {/* Cùng ngôn ngữ với thẻ phiếu Thu–Chi: xanh = tiền vào, đỏ = tiền ra, xám = không đổi. */}
        <CardAccent color={accent} />

        <YStack f={1} minWidth={0} p={space.md} gap={space.sm}>
          <XStack ai="flex-start" gap={space.sm}>
            <YStack f={1} minWidth={0} gap={space.xs}>
              <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold} numberOfLines={1}>
                {trip.code}
              </Text>
              <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
                {`${fmt.shortDateTime(trip.pickupAt)} → ${fmt.shortDateTime(trip.returnAt)}`}
              </Text>
              <StatusBadge
                label={domainLabel('serviceType', trip.serviceType, trip.serviceType)}
                color={STATUS_COLOR.ACCENT}
                size="sm"
              />
            </YStack>

            <YStack ai="flex-end" gap={2}>
              <Text col={colors.textMuted} fos={fontSize.label}>
                {t('columns.balanceChange')}
              </Text>
              <SignedAmount value={trip.balanceChange} prominent />
            </YStack>
          </XStack>

          <Divider />

          <YStack gap={space.xs}>
            <Row
              label={t('columns.unitAmount')}
              value={
                trip.unitAmount == null ? (
                  <Text col={colors.textMuted} fos={fontSize.bodySm}>
                    {tCommon('labels.emptyValue')}
                  </Text>
                ) : (
                  <Text col={colors.text} fos={fontSize.bodySm}>
                    {trip.unitKind === WALLET_STATEMENT_UNIT.MONTH
                      ? fmt.pricePerMonth(trip.unitAmount)
                      : fmt.pricePerDay(trip.unitAmount)}
                  </Text>
                )
              }
            />
            <Row
              label={t('columns.revenue')}
              value={
                <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                  {fmt.money(trip.revenueAmount)}
                </Text>
              }
            />
            {/* Thuế là khoản TRỪ khỏi tiền chủ xe — hiện dấu trừ, không chỉ là một số nhỏ. */}
            <Row
              label={t('columns.tax')}
              value={
                isZeroMoney(trip.taxAmount) ? (
                  <Text col={colors.textMuted} fos={fontSize.bodySm}>
                    {fmt.money('0')}
                  </Text>
                ) : (
                  <Text col={colors.danger} fos={fontSize.bodySm}>
                    {`−${fmt.money(trip.taxAmount)}`}
                  </Text>
                )
              }
            />
          </YStack>
        </YStack>
      </XStack>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <XStack ai="center" jc="space-between" gap={space.sm}>
      <Text f={1} col={colors.textMuted} fos={fontSize.bodySm}>
        {label}
      </Text>
      {value}
    </XStack>
  );
}

function SummaryRow({
  label,
  hint,
  value,
  highlight,
}: {
  label: string;
  hint?: string;
  value: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <XStack ai="flex-start" jc="space-between" gap={space.sm}>
      <YStack f={1} gap={2}>
        <Text
          col={colors.text}
          fos={fontSize.bodySm}
          fow={highlight ? fontWeight.semibold : fontWeight.regular}
        >
          {label}
        </Text>
        {hint ? (
          <Text col={colors.textMuted} fos={fontSize.label}>
            {hint}
          </Text>
        ) : null}
      </YStack>
      {value}
    </XStack>
  );
}

function MetricCell({
  icon,
  tone,
  surface,
  value,
  label,
}: {
  icon: IconName;
  tone: string;
  surface: string;
  value: string;
  label: string;
}) {
  return (
    <YStack f={1} minWidth={0} ai="center" gap={space.xs} px={space.xs}>
      <IconDisc icon={icon} tone={tone} surface={surface} size={32} />
      <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold} ta="center">
        {value}
      </Text>
      <Text col={colors.textMuted} fos={fontSize.label} ta="center" numberOfLines={2}>
        {label}
      </Text>
    </YStack>
  );
}

/** Kẻ dọc giữ ba chỉ số thành một dải, thay vì ba mẩu chữ rời trên nền trắng. */
function MetricDivider() {
  return <YStack w={1} bg={colors.borderSubtle} alignSelf="stretch" />;
}

/**
 * Số tiền có DẤU.
 *
 * Dấu đứng trước và có màu riêng: trên một sổ tiền, hướng dòng tiền là thứ mắt phải bắt được trước
 * giá trị. Dùng cả dấu lẫn màu để không phụ thuộc khả năng phân biệt màu.
 */
function SignedAmount({
  value,
  prominent = false,
  strong = false,
}: {
  value: string;
  prominent?: boolean;
  strong?: boolean;
}) {
  const fmt = useAppFormat();
  const size = prominent ? fontSize.h4 : fontSize.bodySm;
  const weight = prominent || strong ? fontWeight.bold : fontWeight.regular;

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
