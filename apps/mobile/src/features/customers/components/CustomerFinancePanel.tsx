import { useCallback, useMemo, useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  FINANCE_GRANULARITY,
  FINANCE_GRANULARITY_VALUES,
  RECEIPT_STATUS,
  type FinanceGranularity,
} from '@xeprime/types';
import { buildPeriodRange, isZeroMoney, type PeriodKey } from '@xeprime/domain';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Card } from '@/components/ui/Card';
import { InlineAction } from '@/components/ui/InlineAction';
import { SelectControl } from '@/components/ui/SelectControl';
import { SkeletonText } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { ReceiptCard } from '@/features/finance/components/ReceiptCard';
import { RevenueTrendChart } from '@/features/finance/components/RevenueTrendChart';
import { useFinanceSeries, useFinanceSummary, useReceipts } from '@/features/finance/hooks/use-finance';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';

/** Vài phiếu gần nhất là đủ để trả lời "khách này đã đưa/nhận bao nhiêu"; xem đủ thì sang sổ. */
const PREVIEW_LIMIT = 10;

/**
 * Kỳ xem nhanh — CÙNG tập với `FINANCE_OVERVIEW_PERIOD_VALUES` của web, cùng hàm
 * `buildPeriodRange`. Không đẻ ra bảng ngày thứ hai.
 */
const PERIOD_VALUES = [
  'today',
  'this_week',
  'this_month',
  'last_month',
  'this_quarter',
  'this_year',
] as const satisfies readonly PeriodKey[];

/**
 * Kỳ mặc định khi màn vừa mở — cùng `FINANCE_OVERVIEW_DEFAULT_PERIOD` của web.
 *
 * Một biểu đồ KHÔNG CÓ BIÊN là một biểu đồ không vẽ được, và "toàn bộ lịch sử" cũng không phải
 * câu hỏi ai hỏi khi mở hồ sơ khách buổi sáng.
 */
const DEFAULT_PERIOD: PeriodKey = 'this_month';

/**
 * Tiền của MỘT khách (khu "Thu chi" của CUS-02) — bản native của `CustomerReceiptsPanel`.
 *
 * Hai tầng, cố ý xếp theo thứ tự này:
 *  1. **Doanh thu theo kỳ** — "khách này mang lại bao nhiêu tiền THẬT trong kỳ", cộng trên phiếu
 *     đã duyệt, cùng phép tính với màn Tổng quan doanh thu.
 *  2. **Danh sách phiếu gần nhất** — bằng chứng đằng sau con số đó.
 *
 * Con số ở đây KHÁC ba thẻ "Tổng giá trị thuê / Đã thu / Còn nợ" phía trên hồ sơ, và khác một
 * cách có chủ đích: ba thẻ đó tính trên ĐƠN (luỹ kế, để đi đòi nợ), còn khối này tính trên TIỀN
 * THẬT ĐÃ VÀO theo kỳ.
 *
 * Kỳ sống ở state màn hình chứ không ở URL: app native không có URL để chia sẻ (ADR 0004).
 *
 * Gác quyền `finance.view` ở NƠI GỌI — tiền là quyền RIÊNG trong sổ khách (luật của S-01).
 */
export function CustomerFinancePanel({ customerId }: { customerId: string }) {
  const t = useTranslations('Customers.finance');
  const tEntity = useTranslations('Finance.entity');
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();

  const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD);
  const [granularity, setGranularity] = useState<FinanceGranularity>(FINANCE_GRANULARITY.DAY);

  /*
   * Tính lại theo `period` chứ không giữ hai đầu ngày trong state: một màn mở qua nửa đêm phải
   * hiểu "hôm nay" là hôm nay, không phải hôm qua.
   */
  const range = useMemo(() => buildPeriodRange(period), [period]);
  const filters = useMemo(() => ({ ...range, granularity }), [range, granularity]);
  const scope = useMemo(() => ({ tenantCustomerId: customerId }), [customerId]);

  const summary = useFinanceSummary(filters, scope);
  const series = useFinanceSeries(filters, scope);

  const receipts = useReceipts({
    tenantCustomerId: customerId,
    limit: PREVIEW_LIMIT,
  });

  const periodOptions = useMemo(
    () => PERIOD_VALUES.map((value) => ({ value, label: tEntity(`periods.${value}`) })),
    [tEntity],
  );
  const granularityOptions = useMemo(
    () =>
      FINANCE_GRANULARITY_VALUES.map((value) => ({ value, label: tEntity(`every.${value}`) })),
    [tEntity],
  );

  // Nhãn cột theo ĐỘ MỊN THẬT server đã dùng — kỳ dài bị hạ xuống `month` mà nhãn vẫn in ngày
  // thì mỗi cột nói dối về khoảng nó đại diện.
  const actualGranularity = (series.data?.granularity ?? granularity) as FinanceGranularity;
  const labelOf = useCallback(
    (bucket: string) =>
      actualGranularity === FINANCE_GRANULARITY.MONTH
        ? fmt.monthYear(new Date(`${bucket}T12:00:00Z`))
        : fmt.dateKey(bucket),
    [actualGranularity, fmt],
  );

  const seriesEmpty =
    series.data !== undefined &&
    series.data.buckets.every((bucket) => isZeroMoney(bucket.revenue) && isZeroMoney(bucket.cost));

  const receiptItems = receipts.data?.items ?? [];
  const receiptTotal = receipts.data?.meta.total ?? 0;

  return (
    <YStack gap={space.lg}>
      {/* ── Khối 1: doanh thu theo kỳ ─────────────────────────────────────── */}
      <YStack gap={space.md}>
        <BlockTitle>{tEntity('title.customer')}</BlockTitle>

        <SelectControl
          label={tEntity('periods.label')}
          value={period}
          options={periodOptions}
          onChange={(next) => setPeriod(next as PeriodKey)}
        />

        {summary.isError && !summary.data ? (
          <ScreenError
            error={summary.error}
            title={tEntity('error')}
            onRetry={() => void summary.refetch()}
          />
        ) : summary.isLoading && !summary.data ? (
          <SkeletonText lines={3} />
        ) : summary.data ? (
          <Card>
            <XStack flexWrap="wrap" gap={space.md}>
              <Stat label={tEntity('revenue')} value={fmt.money(summary.data.revenue)} tone={colors.success} />
              <Stat
                label={tEntity('debt')}
                value={fmt.money(summary.data.totalDebt)}
                hint={tEntity('debtBookings', { count: summary.data.debtBookings })}
                {...(isZeroMoney(summary.data.totalDebt) ? {} : { tone: colors.danger })}
              />
              <Stat label={tEntity('trips')} value={fmt.count(summary.data.trips)} />
            </XStack>
          </Card>
        ) : null}

        {/* Tiêu đề biểu đồ — web đặt nó trên khung biểu đồ, giữ nguyên ở đây. */}
        <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {tEntity('chartTitle')}
        </Text>

        <SelectControl
          label={tEntity('every.label')}
          value={granularity}
          options={granularityOptions}
          onChange={(next) => setGranularity(next as FinanceGranularity)}
        />

        {series.isError && !series.data ? (
          <ScreenError
            error={series.error}
            title={tEntity('chartError')}
            onRetry={() => void series.refetch()}
          />
        ) : series.isLoading && !series.data ? (
          <SkeletonText lines={5} />
        ) : seriesEmpty || !series.data || series.data.buckets.length === 0 ? (
          <ScreenMessage
            icon="stats-chart-outline"
            title={tEntity('chartEmpty')}
            description={tEntity('chartEmptyHint')}
          />
        ) : (
          <RevenueTrendChart
            buckets={series.data.buckets}
            labelOf={labelOf}
            formatMoney={fmt.money}
          />
        )}

        <Text col={colors.textMuted} fos={fontSize.label}>
          {tEntity('note.customer')}
        </Text>

        <InlineAction
          label={tEntity('openLedger')}
          onPress={() =>
            navigateOnce(
              ROUTES.manage.receipts({
                tenantCustomerId: customerId,
                status: RECEIPT_STATUS.APPROVED,
                // CHỈ hai đầu kỳ — `granularity` là chuyện của biểu đồ, sổ không hiểu nó.
                from: range.from,
                to: range.to,
              }),
            )
          }
        />
      </YStack>

      {/* ── Khối 2: phiếu gần nhất, bằng chứng đằng sau con số trên ─────────── */}
      <YStack gap={space.md}>
        <BlockTitle>{t('list.title')}</BlockTitle>

        {receipts.isLoading && !receipts.data ? (
          <SkeletonText lines={4} />
        ) : receipts.isError && !receipts.data ? (
          <ScreenError
            error={receipts.error}
            title={t('list.error')}
            onRetry={() => void receipts.refetch()}
          />
        ) : receiptItems.length === 0 ? (
          <ScreenMessage
            icon="receipt-outline"
            title={t('list.emptyTitle')}
            description={t('list.emptyHint')}
          />
        ) : (
          <>
            {receiptItems.map((receipt) => (
              <ReceiptCard key={receipt.id} receipt={receipt} />
            ))}

            {receiptTotal > receiptItems.length ? (
              <InlineAction
                label={t('list.viewAll', { count: receiptTotal })}
                onPress={() =>
                  navigateOnce(ROUTES.manage.receipts({ tenantCustomerId: customerId }))
                }
              />
            ) : null}
          </>
        )}
      </YStack>
    </YStack>
  );
}

/** Một chỉ số tiền — `f={1}` với sàn bề rộng để ba ô xuống dòng gọn thay vì bị bóp nát. */
function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <YStack f={1} minWidth={110} gap={2}>
      <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={2}>
        {label}
      </Text>
      <Text col={tone ?? colors.text} fos={fontSize.body} fow={fontWeight.semibold} numberOfLines={1}>
        {value}
      </Text>
      {hint ? (
        <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </YStack>
  );
}
