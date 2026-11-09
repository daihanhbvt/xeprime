'use client';

import { Alert } from 'antd';
import { useTranslations } from 'next-intl';
import { RECEIPT_SOURCE_GROUP, RECEIPT_STATUS, RECEIPT_TYPE } from '@xeprime/types';
import { MoneyStat } from '@/components/data-display/MoneyStat';
import { receiptsPath } from '@/constants/routes';
import { isNegativeMoney } from '@/lib/money';
import { useAppFormat } from '@/i18n/use-app-format';
import type { FinanceOverviewFilters, FinanceSummary } from '../types';
import styles from './FinanceOverviewCards.module.css';

interface FinanceOverviewCardsProps {
  data: FinanceSummary | undefined;
  filters: FinanceOverviewFilters;
  /**
   * Số phiếu thu / phiếu chi KINH DOANH của kỳ (đã loại cọc) — cộng từ cơ cấu theo danh mục, vốn
   * dùng đúng bộ lọc "tiền thật, không giữ hộ" với thẻ Doanh thu/Chi phí. `undefined` khi cơ cấu
   * chưa về: dòng phụ khi đó chỉ nói "đã trừ cọc", không bịa ra "0 phiếu".
   */
  revenueReceipts: number | undefined;
  costReceipts: number | undefined;
  loading: boolean;
  error: boolean;
}

/**
 * Sáu thẻ số liệu đầu màn Tổng quan doanh thu — design Partner-XePrime "Summary Metrics"
 * (`23813:32225`): một hàng, ba thẻ hẹp của KỲ (doanh thu · chi phí · lợi nhuận) rồi ba thẻ rộng.
 *
 * Hai đơn vị thời gian vẫn tách bằng CHỮ chứ không bằng khối: "Cọc đang giữ" và "Khách còn nợ" là
 * số TẠI LÚC NÀY, không đổi theo kỳ — dòng phụ của chúng nói "hiện tại", để không ai cộng trừ
 * chúng với lợi nhuận của tháng.
 *
 * Mọi thẻ có tập phiếu sinh ra nó đều là LIÊN KẾT tới đúng tập đó (`docs/design/09` §3.1, chốt lại
 * 04/11/2026: giữ liên kết, thêm mũi tên). Đường dẫn mang `sourceGroup` + `status=approved` để
 * tổng ở sổ khớp từng đồng với con số trên thẻ; thiếu `sourceGroup`, bấm "Doanh thu" sẽ mở ra một
 * sổ có cộng cả tiền cọc. "Lợi nhuận" là hiệu của hai thẻ trước nên không có tập phiếu riêng.
 */
export function FinanceOverviewCards({
  data,
  filters,
  revenueReceipts,
  costReceipts,
  loading,
  error,
}: FinanceOverviewCardsProps) {
  const t = useTranslations('Finance.overview.tiles');
  const tCards = useTranslations('Finance.overview.cards');
  const fmt = useAppFormat();

  if (error && !data) {
    return <Alert type="warning" showIcon title={tCards('error')} className={styles.alert} />;
  }

  const showSkeleton = loading && !data;
  const period = { from: filters.from, to: filters.to, status: RECEIPT_STATUS.APPROVED };
  const businessPath = (type: string) =>
    receiptsPath.filtered({ ...period, type, sourceGroup: RECEIPT_SOURCE_GROUP.BUSINESS });
  const receiptsHint = (count: number | undefined) =>
    count === undefined ? t('exDeposit') : t('receipts', { count });
  /*
   * Lời giải thích của "lãi tiền mặt theo sổ" nằm sau dấu ⓘ của thẻ Doanh thu: nó nói con số này
   * CHƯA gồm gì (khấu hao, lãi vay, tiền thuê xe của chủ chưa bao giờ sinh phiếu chi).
   */
  const businessInfo = { content: t('businessNote'), label: t('businessInfoLabel') };

  return (
    <section className={styles.tiles} aria-label={t('label')}>
      <MoneyStat
        variant="tile"
        label={t('revenue')}
        value={data ? fmt.money(data.revenue) : null}
        loading={showSkeleton}
        hint={data ? receiptsHint(revenueReceipts) : undefined}
        info={businessInfo}
        href={businessPath(RECEIPT_TYPE.INCOME)}
      />
      <MoneyStat
        variant="tile"
        label={t('cost')}
        value={data ? fmt.money(data.cost) : null}
        tone="negative"
        loading={showSkeleton}
        hint={data ? receiptsHint(costReceipts) : undefined}
        href={businessPath(RECEIPT_TYPE.EXPENSE)}
      />
      <MoneyStat
        variant="tile"
        label={t('profit')}
        value={data ? fmt.money(data.profit) : null}
        tone={isNegativeMoney(data?.profit) ? 'negative' : 'positive'}
        loading={showSkeleton}
        hint={
          data
            ? data.profitMarginPercent == null
              ? t('marginUnknown')
              : t('margin', { value: data.profitMarginPercent })
            : undefined
        }
      />
      <MoneyStat
        variant="tile"
        label={t('netCash')}
        value={data ? fmt.money(data.balance) : null}
        tone={isNegativeMoney(data?.balance) ? 'negative' : 'neutral'}
        loading={showSkeleton}
        hint={
          data
            ? t('cashFlow', { in: fmt.money(data.totalIncome), out: fmt.money(data.totalExpense) })
            : undefined
        }
        info={{ content: t('cashNote'), label: t('cashInfoLabel') }}
        href={receiptsPath.filtered(period)}
      />
      <MoneyStat
        variant="tile"
        label={t('depositHeld')}
        value={data ? fmt.money(data.depositHeld) : null}
        loading={showSkeleton}
        hint={data ? t('bookingsNow', { count: data.depositHeldBookings }) : undefined}
        href={receiptsPath.filtered({
          status: RECEIPT_STATUS.APPROVED,
          sourceGroup: RECEIPT_SOURCE_GROUP.HELD_FUNDS,
        })}
      />
      <MoneyStat
        variant="tile"
        label={t('debt')}
        value={data ? fmt.money(data.totalDebt) : null}
        loading={showSkeleton}
        hint={data ? t('bookings', { count: data.debtBookings }) : undefined}
        href={receiptsPath.debts()}
      />
    </section>
  );
}
