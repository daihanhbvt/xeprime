'use client';

import { Alert, Segmented } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { FINANCE_GRANULARITY_VALUES, RECEIPT_STATUS } from '@xeprime/types';
import { RevenueTrendChart } from '@/components/chart/RevenueTrendChart';
import { MoneyStat } from '@/components/data-display/MoneyStat';
import { receiptsPath } from '@/constants/routes';
import { buildPeriodRange } from '@/lib/datetime';
import { isNegativeMoney, isZeroMoney } from '@/lib/money';
import { useAppFormat } from '@/i18n/use-app-format';
import { FINANCE_OVERVIEW_PERIOD_VALUES } from '../constants';
import { useFinanceSeries, useFinanceSummaryOverview } from '../hooks/use-finance-overview';
import { useFinancePeriodFilters } from '../hooks/use-finance-overview-filters';
import type { FinanceScope } from '../types';
import styles from './FinanceEntityPanel.module.css';

interface FinanceEntityPanelProps {
  /**
   * Thực thể đang xem. Đúng MỘT khoá được đặt — panel không dựng để cắt hai chiều cùng lúc, và
   * một giao điểm "xe X của khách Y" là câu hỏi khác hẳn.
   */
  scope: FinanceScope;
  /**
   * Loại thực thể — quyết định bộ số hiện ra, không phải chỉ nhãn.
   *
   * Một chiếc xe có chi phí (bảo dưỡng, xăng) nên nói được lãi/lỗ. Một khách hàng thì không:
   * chi phí của gian hàng không gắn vào khách, nên "Chi phí 0 ₫ · Lợi nhuận = Doanh thu" chỉ là
   * hai ô nhiễu giả vờ mang thông tin. Thay vào đó khách hiện phần thực sự của họ: còn nợ.
   */
  kind: 'vehicle' | 'customer';
  /**
   * Người đang xem có quyền ghi phiếu không — quyết định lối "Tạo phiếu thu/chi" có mặt hay không.
   *
   * Là PROP chứ không phải một `usePermissions()` bên trong: khối này là một bảng số, và kéo
   * `useCurrentUser` vào nó khiến mọi nơi nhúng nó phải có sẵn `QueryClientProvider` chỉ để hiện
   * một cái link. Nơi gọi vốn đã phải kiểm quyền để quyết định có dựng khối này hay không, nên
   * câu trả lời đã nằm sẵn ở đó. Ẩn link KHÔNG phải là bảo vệ — guard backend mới là (CLAUDE.md §6).
   */
  canCreateReceipt?: boolean;
}

/**
 * Khối TIỀN của một thực thể — nhúng vào hồ sơ xe và hồ sơ khách.
 *
 * Dùng lại nguyên bộ endpoint của màn Tổng quan doanh thu, chỉ thêm mệnh đề thu hẹp. Đó là điều
 * làm cho con số ở đây và con số ở bảng tổng quan **không thể lệch nhau** — chúng là cùng một
 * câu truy vấn. Viết một endpoint riêng cho "doanh thu một chiếc xe" sẽ là bản thứ hai của cùng
 * phép tính, và bản thứ hai luôn trôi khỏi bản đầu.
 *
 * Kỳ nằm trên URL (`?from=&to=`) chứ không phải state cục bộ: một đường dẫn tới hồ sơ xe kèm kỳ
 * đang xem phải gửi được cho đồng nghiệp và sống sót qua F5.
 */
export function FinanceEntityPanel({
  scope,
  kind,
  canCreateReceipt = false,
}: FinanceEntityPanelProps) {
  const t = useTranslations('Finance.entity');
  const fmt = useAppFormat();
  const { filters, setFilters } = useFinancePeriodFilters();

  const summary = useFinanceSummaryOverview(filters, scope);
  const series = useFinanceSeries(filters, scope);

  const periodOptions = useMemo(
    () =>
      FINANCE_OVERVIEW_PERIOD_VALUES.map((value) => ({
        value,
        label: t(`periods.${value}`),
      })),
    [t],
  );
  const granularityOptions = useMemo(
    () => FINANCE_GRANULARITY_VALUES.map((value) => ({ value, label: t(`every.${value}`) })),
    [t],
  );

  const activePeriod = periodOptions.find((option) => {
    const range = buildPeriodRange(option.value);
    return filters.from === range.from && filters.to === range.to;
  })?.value;

  const data = summary.data;
  const loading = summary.isFetching && !data;

  // Nhãn cột theo ĐỘ MỊN THẬT server đã dùng — kỳ dài bị hạ xuống `month` mà nhãn vẫn in ngày
  // thì mỗi cột nói dối về khoảng nó đại diện.
  const granularity = series.data?.granularity ?? filters.granularity;
  const labelOf = (bucket: string) =>
    granularity === 'month' ? fmt.monthYear(new Date(`${bucket}T12:00:00Z`)) : fmt.dateKey(bucket);

  const seriesEmpty =
    series.data !== undefined &&
    series.data.buckets.every((b) => b.revenue === '0' && b.cost === '0');

  return (
    <section className={styles.panel} aria-label={t(`title.${kind}`)}>
      <div className={styles.header}>
        <h2 className={styles.title}>{t(`title.${kind}`)}</h2>
        <div className={styles.headerLinks}>
          {/*
            * Ghi một khoản THẲNG cho chiếc xe này — phí rửa, vá lốp, gửi bãi không thuộc chuyến
            * nào, nên trước đây chúng không có lối vào từ hồ sơ xe và chỉ ghi được bằng cách mở
            * sổ rồi tự tìm lại đúng chiếc xe vừa xem.
            *
            * Chỉ ở hồ sơ XE: một khoản thu/chi gắn thẳng vào KHÁCH không tồn tại trong sổ — tiền
            * của khách luôn đi qua một chuyến.
            *
            * Không đi kèm khoảng kỳ: kỳ đang xem là bộ lọc để ĐỌC, còn phiếu sắp ghi thì mặc định
            * là hôm nay. Mang `from`/`to` sang sẽ khiến sổ mở ra không chứa chính phiếu vừa tạo.
            */}
          {kind === 'vehicle' && scope.vehicleId && canCreateReceipt ? (
            <Link
              className={styles.ledgerLink}
              href={receiptsPath.filtered({ vehicleId: scope.vehicleId, create: true })}
            >
              {t('createReceipt')}
            </Link>
          ) : null}
          <Link
            className={styles.ledgerLink}
            href={receiptsPath.filtered({
              ...scope,
              status: RECEIPT_STATUS.APPROVED,
              // CHỈ hai đầu kỳ — `granularity` là chuyện của biểu đồ, sổ không hiểu nó.
              from: filters.from,
              to: filters.to,
            })}
          >
            {t('openLedger')}
          </Link>
        </div>
      </div>

      <div className={styles.periods}>
        <Segmented
          size="small"
          options={periodOptions}
          value={activePeriod ?? ''}
          onChange={(value) => setFilters(buildPeriodRange(value as PeriodOption))}
          aria-label={t('periods.label')}
        />
      </div>

      {summary.isError && !data ? (
        <Alert type="warning" showIcon message={t('error')} />
      ) : (
        <div className={styles.stats}>
          <MoneyStat
            label={t('revenue')}
            value={data ? fmt.money(data.revenue) : null}
            tone="positive"
            size="compact"
            loading={loading}
          />
          {kind === 'vehicle' ? (
            <>
              <MoneyStat
                label={t('cost')}
                value={data ? fmt.money(data.cost) : null}
                tone="negative"
                size="compact"
                loading={loading}
              />
              <MoneyStat
                label={t('profit')}
                value={data ? fmt.money(data.profit) : null}
                tone={isNegativeMoney(data?.profit) ? 'negative' : 'accent'}
                size="compact"
                loading={loading}
                hint={
                  data ? (
                    <span>
                      {data.profitMarginPercent == null
                        ? t('marginUnknown')
                        : t('margin', { value: data.profitMarginPercent })}
                    </span>
                  ) : undefined
                }
              />
            </>
          ) : (
            <MoneyStat
              label={t('debt')}
              value={data ? fmt.money(data.totalDebt) : null}
              tone={data && !isZeroMoney(data.totalDebt) ? 'negative' : 'neutral'}
              size="compact"
              loading={loading}
              hint={data ? <span>{t('debtBookings', { count: data.debtBookings })}</span> : undefined}
            />
          )}
          <MoneyStat
            label={t('trips')}
            value={data ? fmt.count(data.trips) : null}
            size="compact"
            loading={loading}
          />
        </div>
      )}

      <RevenueTrendChart
        points={series.data?.buckets ?? []}
        labelOf={labelOf}
        title={t('chartTitle')}
        height={220}
        loading={series.isFetching && !series.data}
        error={
          series.isError && !series.data
            ? { title: t('chartError'), onRetry: () => void series.refetch() }
            : null
        }
        empty={seriesEmpty ? { title: t('chartEmpty'), description: t('chartEmptyHint') } : null}
        actions={
          <Segmented
            size="small"
            options={granularityOptions}
            value={granularity ?? FINANCE_GRANULARITY_VALUES[0]}
            onChange={(value) => setFilters({ granularity: String(value) })}
            aria-label={t('every.label')}
          />
        }
      />

      <p className={styles.note}>{t(`note.${kind}`)}</p>
    </section>
  );
}

/** Cùng tập kỳ với màn Tổng quan — một bảng ngày, không đẻ bản thứ hai. */
type PeriodOption = (typeof FINANCE_OVERVIEW_PERIOD_VALUES)[number];
