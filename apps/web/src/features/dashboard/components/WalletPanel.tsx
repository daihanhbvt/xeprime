'use client';

import { RightOutlined, WalletOutlined } from '@ant-design/icons';
import { Skeleton } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { WALLET_STATUS } from '@xeprime/types';
import { useWalletStatement, useWalletSummary } from '@/features/wallet/hooks';
import { useAppFormat } from '@/i18n/use-app-format';
import { MONTH_PARAM_FORMAT, nowInAppTz } from '@/lib/datetime';
import { DashboardPanel } from './DashboardPanel';
import styles from './SidePanels.module.css';

/**
 * "Tiền của bạn" — số dư ví (rút được + đang chờ chuyển) và, ở tuyến hoa hồng, THU NHẬP tháng này.
 *
 * Không con số nào được tính ở đây:
 *  - số dư đọc `GET /shop/wallet` — cùng nguồn với trang "Số dư & rút tiền";
 *  - thu nhập đọc `ownerIncome` của bảng tổng hợp giao dịch tháng này (`/shop/wallet/statement`)
 *    — dòng mà chủ xe thấy ở cuối bảng đó, đúng từng đồng.
 *
 * Tuyến GÓI không có dòng thu nhập ở đây: Tổng quan của họ đã có "Doanh thu" từ sổ thu chi, và hai
 * con số tiền cùng tên khác nguồn đứng cạnh nhau là mời người đọc so hai thứ không so được.
 *
 * Ví là quyền SỞ HỮU (`@ShopOwnerOnly`, ADR 0038 điều 3) — nơi gọi chỉ dựng panel cho chủ.
 */
export function WalletPanel({ showIncome, href }: { showIncome: boolean; href: string }) {
  const t = useTranslations('Dashboard.wallet');
  const fmt = useAppFormat();
  const summary = useWalletSummary('shop');
  const statement = useWalletStatement(
    { period: nowInAppTz().format(MONTH_PARAM_FORMAT), page: 1 },
    showIncome,
  );

  const data = summary.data;

  return (
    <DashboardPanel title={t('title')} icon={<WalletOutlined />}>
      {summary.isLoading ? (
        <Skeleton active title={false} paragraph={{ rows: 3 }} />
      ) : summary.isError || !data ? (
        <p className={styles.note}>{t('loadError')}</p>
      ) : (
        <div className={styles.stack}>
          {showIncome ? (
            <div className={styles.moneyHero}>
              <span className={styles.moneyLabel}>{t('income')}</span>
              {statement.data ? (
                <>
                  <span className={styles.moneyValue}>{fmt.money(statement.data.totals.ownerIncome)}</span>
                  <span className={styles.moneyHint}>
                    {t('incomeHint', { count: statement.data.stats.completedTripCount })}
                  </span>
                </>
              ) : statement.isError ? (
                <span className={styles.moneyHint}>{t('loadError')}</span>
              ) : (
                <Skeleton.Input active size="small" />
              )}
            </div>
          ) : null}

          <dl className={styles.moneyGrid}>
            <div>
              <dt className={styles.moneyLabel}>{t('available')}</dt>
              <dd className={styles.moneyStrong}>{fmt.money(data.available)}</dd>
            </div>
            <div>
              <dt className={styles.moneyLabel}>{t('pending')}</dt>
              <dd className={styles.moneyPlain}>{fmt.money(data.pending)}</dd>
            </div>
          </dl>

          {data.status === WALLET_STATUS.FROZEN ? <p className={styles.noteWarn}>{t('frozen')}</p> : null}

          <Link href={href} className={styles.footLink}>
            {t('open')}
            <RightOutlined aria-hidden />
          </Link>
        </div>
      )}
    </DashboardPanel>
  );
}
