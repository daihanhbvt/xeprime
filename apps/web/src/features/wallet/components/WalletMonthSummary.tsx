'use client';

import { Alert, Button, Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import { ACCOUNT_TRACK, resolveAccountTrack } from '@xeprime/types';
import type { ReactNode } from 'react';
import { DeductedAmount } from '@/components/data-display/DeductedAmount';
import { InfoHint } from '@/components/data-display/InfoHint';
import { useCurrentUser } from '@/hooks/use-current-user';
import { dayjs } from '@/lib/datetime';
import { isPositiveMoney, isZeroMoney } from '@/lib/money';
import { useAppFormat } from '@/i18n/use-app-format';
import { useWalletStatement } from '../hooks';
import type { WalletStatementFilters } from '../types';
import styles from './WalletMonthSummary.module.css';

/**
 * "TỔNG HỢP THÁNG" — cột phải của trang Quản lý ví (design `23813:39558`).
 *
 * Cộng dồn của CẢ KỲ (không theo trang đang xem) đọc từ CÙNG `GET /shop/wallet/statement` với
 * bảng tổng hợp bên trái — cùng khoá cache khi người dùng đang ở tab đó, nên không thêm request,
 * và hai nơi không thể nói hai con số.
 *
 * Design vẽ bốn dòng (chuyến · thay đổi số dư · thuế · thu nhập). Các dòng còn lại chỉ hiện khi
 * KHÁC 0 (chốt 04/11/2026, giữ từ bảng cũ): phần khách trả tay lúc nhận xe, phí giao xe, phí gói,
 * phí dịch vụ – chủ xe. Thiếu chúng thì "thu nhập" không cộng ra được từ các dòng phía trên.
 */
export function WalletMonthSummary({ filters }: { filters: WalletStatementFilters }) {
  const t = useTranslations('Wallet');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const { data: user } = useCurrentUser();
  const query = useWalletStatement(filters, true);
  const data = query.data;
  const title = t('month.title', { month: dayjs(filters.period, 'YYYY-MM').format('MM/YYYY') });

  return (
    <section className={styles.card} aria-label={title}>
      <h2 className={styles.title}>{title}</h2>

      {query.isPending && !data ? <Skeleton active paragraph={{ rows: 4 }} /> : null}
      {query.isError && !data ? (
        <Alert
          type="error"
          showIcon
          title={t('statement.loadError')}
          action={
            <Button size="small" onClick={() => void query.refetch()}>
              {tCommon('actions.retry')}
            </Button>
          }
        />
      ) : null}

      {data ? (
        <>
          <dl className={styles.rows}>
            <Row
              label={t('statement.stats.trips')}
              value={t('statement.stats.tripsValue', { count: data.stats.completedTripCount })}
            />
            <Row
              label={t('month.balanceChange')}
              value={fmt.money(data.totals.balanceChangeTotal)}
            />
            {isZeroMoney(data.totals.payAtPickupTotal) ? null : (
              <Row
                label={t('statement.totals.payAtPickup')}
                hint={t('statement.totals.payAtPickupHint')}
                value={fmt.money(data.totals.payAtPickupTotal)}
              />
            )}
            {isZeroMoney(data.totals.deliveryTotal) ? null : (
              <Row
                label={t('statement.totals.delivery')}
                hint={t('statement.totals.deliveryHint')}
                value={fmt.money(data.totals.deliveryTotal)}
              />
            )}
            {isZeroMoney(data.totals.subscriptionFeeTotal) ? null : (
              <Row
                label={t('statement.totals.subscriptionFee')}
                value={<DeductedAmount emphasis value={data.totals.subscriptionFeeTotal} />}
              />
            )}
            {isPositiveMoney(data.totals.ownerCommissionTotal) ? (
              <Row
                label={t('statement.totals.commission')}
                value={<DeductedAmount emphasis value={data.totals.ownerCommissionTotal} />}
              />
            ) : null}
            <Row
              label={t('statement.totals.tax')}
              value={<DeductedAmount emphasis value={data.totals.taxTotal} />}
            />
            <Row
              highlight
              label={t(`statement.totals.${ownerIncomeKeyFor(user?.tenant)}`)}
              value={fmt.money(data.totals.ownerIncome)}
            />
          </dl>
          <p className={styles.footnote}>{t('statement.totals.ownerIncomeHint')}</p>
        </>
      ) : null}
    </section>
  );
}

/**
 * Khoá nhãn dòng thu nhập theo TUYẾN của người đang đọc.
 *
 * Cùng một trang phục vụ hai người: chủ gian hàng tuyến gói và chủ xe cá nhân tuyến hoa hồng.
 * Gọi một chủ xe có đúng một chiếc xe là "chủ gian hàng" ngay trên dòng thu nhập của chính họ là
 * sai về con người. Suy từ TUYẾN (`resolveAccountTrack`, dùng chung với nhãn tài khoản và app
 * native); tuyến chưa xác định rơi về nhãn chung "Thu nhập" — không đoán.
 *
 * Hàm THUẦN, nhận đúng phần dữ liệu nó cần, nên test được mà không dựng React.
 */
export function ownerIncomeKeyFor(
  tenant: Parameters<typeof resolveAccountTrack>[0],
): 'ownerIncome' | 'ownerIncomeCommission' | 'ownerIncomeGeneric' {
  const { track } = resolveAccountTrack(tenant);
  if (track === ACCOUNT_TRACK.SHOP_OWNER) return 'ownerIncome';
  if (track === ACCOUNT_TRACK.COMMISSION_OWNER) return 'ownerIncomeCommission';
  return 'ownerIncomeGeneric';
}

/** Một cặp nhãn–giá trị; lời giải thích (nếu có) vào dấu ⓘ, không thành dòng chữ phụ. */
function Row({
  label,
  hint,
  value,
  highlight = false,
}: {
  label: string;
  hint?: string;
  value: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={highlight ? `${styles.row} ${styles.highlight}` : styles.row}>
      <dt className={styles.label}>
        {label}
        {hint ? <InfoHint label={label} content={hint} /> : null}
      </dt>
      <dd className={styles.value}>{value}</dd>
    </div>
  );
}
