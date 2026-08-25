'use client';

import { Alert } from 'antd';
import { useTranslations } from 'next-intl';
import { RECEIPT_SOURCE_GROUP, RECEIPT_STATUS, RECEIPT_TYPE } from '@xeprime/types';
import { MoneyStat } from '@/components/data-display/MoneyStat';
import { ROUTES, receiptsPath } from '@/constants/routes';
import { isNegativeMoney } from '@/lib/money';
import { useAppFormat } from '@/i18n/use-app-format';
import type { FinanceOverviewFilters, FinanceSummary } from '../types';
import styles from './FinanceOverviewCards.module.css';

interface FinanceOverviewCardsProps {
  data: FinanceSummary | undefined;
  filters: FinanceOverviewFilters;
  loading: boolean;
  error: boolean;
}

/**
 * BA LỚP TIỀN của một kỳ, xếp thành ba khối tách rời.
 *
 * Vì sao không phải một hàng sáu thẻ: ba lớp trả lời ba câu hỏi khác nhau và mang ba đơn vị thời
 * gian khác nhau. "Lợi nhuận" là của MỘT KỲ; "Cọc đang giữ" là TẠI LÚC NÀY và không đổi khi
 * người dùng chọn kỳ khác. Xếp chúng cạnh nhau trong một hàng là mời người đọc cộng trừ hai thứ
 * không cộng trừ được với nhau — và đó chính là cách sinh ra một con số sai mà không ai thấy sai.
 *
 * Mỗi thẻ là một LIÊN KẾT về đúng tập phiếu sinh ra nó (`docs/design/09` §3.1). Đường dẫn mang
 * `sourceGroup` + `status=approved` để tổng ở sổ khớp từng đồng với con số trên thẻ; thiếu
 * `sourceGroup`, bấm "Doanh thu" sẽ mở ra một sổ có cộng cả tiền cọc.
 */
export function FinanceOverviewCards({
  data,
  filters,
  loading,
  error,
}: FinanceOverviewCardsProps) {
  const t = useTranslations('Finance.overview.cards');
  const fmt = useAppFormat();

  if (error && !data) {
    return <Alert type="warning" showIcon message={t('error')} className={styles.alert} />;
  }

  const showSkeleton = loading && !data;
  const period = { from: filters.from, to: filters.to, status: RECEIPT_STATUS.APPROVED };
  const businessPath = (type: string) =>
    receiptsPath.filtered({ ...period, type, sourceGroup: RECEIPT_SOURCE_GROUP.BUSINESS });

  return (
    <div className={styles.layers}>
      <section className={styles.layer} aria-labelledby="xp-fin-result">
        <h2 id="xp-fin-result" className={styles.layerTitle}>
          {t('business.title')}
        </h2>
        <div className={styles.lead}>
          <MoneyStat
            label={t('business.revenue')}
            value={data ? fmt.money(data.revenue) : null}
            tone="positive"
            loading={showSkeleton}
            href={businessPath(RECEIPT_TYPE.INCOME)}
          />
          <MoneyStat
            label={t('business.cost')}
            value={data ? fmt.money(data.cost) : null}
            tone="negative"
            loading={showSkeleton}
            href={businessPath(RECEIPT_TYPE.EXPENSE)}
            hint={
              data && data.unassignedCost !== '0' ? (
                <span>{t('business.unassigned', { value: fmt.money(data.unassignedCost) })}</span>
              ) : undefined
            }
          />
          <MoneyStat
            label={t('business.profit')}
            value={data ? fmt.money(data.profit) : null}
            tone={isNegativeMoney(data?.profit) ? 'negative' : 'accent'}
            loading={showSkeleton}
            hint={
              data ? (
                <span>
                  {data.profitMarginPercent == null
                    ? t('business.marginUnknown')
                    : t('business.margin', { value: data.profitMarginPercent })}
                </span>
              ) : undefined
            }
          />
        </div>
        {/*
          Nói thẳng con số này CHƯA gồm gì. "Lợi nhuận" ở đây là lãi tiền mặt theo sổ; khấu hao,
          lãi vay và tiền thuê xe của chủ chưa bao giờ sinh phiếu chi nên chưa nằm trong đó.
        */}
        <p className={styles.note}>{t('business.note')}</p>
      </section>

      <div className={styles.side}>
        <section className={styles.layer} aria-labelledby="xp-fin-cash">
          <h2 id="xp-fin-cash" className={styles.layerTitle}>
            {t('cash.title')}
          </h2>
          <div className={styles.compact}>
            <MoneyStat
              label={t('cash.in')}
              value={data ? fmt.money(data.totalIncome) : null}
              tone="positive"
              size="compact"
              loading={showSkeleton}
              href={receiptsPath.filtered({ ...period, type: RECEIPT_TYPE.INCOME })}
            />
            <MoneyStat
              label={t('cash.out')}
              value={data ? fmt.money(data.totalExpense) : null}
              tone="negative"
              size="compact"
              loading={showSkeleton}
              href={receiptsPath.filtered({ ...period, type: RECEIPT_TYPE.EXPENSE })}
            />
            <MoneyStat
              label={t('cash.balance')}
              value={data ? fmt.money(data.balance) : null}
              tone={isNegativeMoney(data?.balance) ? 'negative' : 'neutral'}
              size="compact"
              loading={showSkeleton}
            />
          </div>
          <p className={styles.note}>{t('cash.note')}</p>
        </section>

        <section className={styles.layer} aria-labelledby="xp-fin-now">
          <h2 id="xp-fin-now" className={styles.layerTitle}>
            {t('now.title')}
          </h2>
          <div className={styles.compact}>
            <MoneyStat
              label={t('now.depositHeld')}
              value={data ? fmt.money(data.depositHeld) : null}
              size="compact"
              loading={showSkeleton}
              hint={
                data ? <span>{t('now.bookings', { count: data.depositHeldBookings })}</span> : undefined
              }
              href={receiptsPath.filtered({
                status: RECEIPT_STATUS.APPROVED,
                sourceGroup: RECEIPT_SOURCE_GROUP.HELD_FUNDS,
              })}
            />
            <MoneyStat
              label={t('now.debt')}
              value={data ? fmt.money(data.totalDebt) : null}
              tone={data && data.totalDebt !== '0' ? 'negative' : 'neutral'}
              size="compact"
              loading={showSkeleton}
              hint={data ? <span>{t('now.bookings', { count: data.debtBookings })}</span> : undefined}
              href={ROUTES.MANAGE.DEBTS}
            />
          </div>
          <p className={styles.note}>{t('now.note')}</p>
        </section>
      </div>
    </div>
  );
}
