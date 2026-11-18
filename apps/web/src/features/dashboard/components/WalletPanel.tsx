'use client';

import { Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { WALLET_STATUS } from '@xeprime/types';
import { WithdrawDialog } from '@/features/wallet/components/WithdrawDialog';
import { useWalletStatement, useWalletSummary, useWithdrawGate } from '@/features/wallet/hooks';
import { useAppFormat } from '@/i18n/use-app-format';
import { MONTH_PARAM_FORMAT, nowInAppTz } from '@/lib/datetime';
import { HeadLink } from './HeadLink';
import styles from './WalletPanel.module.css';

/**
 * Ví — Figma "Wallet Card" `24138:80590`: khung kem gradient (ảnh của bản vẽ), "RÚT ĐƯỢC NGAY" +
 * số 30 bold, hai số "Đang chờ" · "Tổng XePrime phải trả", nút vàng "Rút về ngân hàng" mở THẲNG
 * hộp rút tiền (như app Partner), link "Số dư & rút tiền".
 *
 * Giữ hai dòng bản vẽ không có (chốt 17/11/2026): số dư tạm khoá chỉ hiện khi ví `frozen`; "Thu
 * nhập tháng này" chỉ ở chủ xe tuyến hoa hồng. Chỉ CHỦ thấy thẻ này (nơi gọi gác `isShopOwner`).
 */
export function WalletPanel({ showIncome, href }: { showIncome: boolean; href: string }) {
  const t = useTranslations('Dashboard.wallet');
  const tWallet = useTranslations('Wallet');
  const fmt = useAppFormat();
  const summary = useWalletSummary('shop');
  const { canWithdraw, hint } = useWithdrawGate('shop');
  const statement = useWalletStatement(
    { period: nowInAppTz().format(MONTH_PARAM_FORMAT), page: 1 },
    showIncome,
  );
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const data = summary.data;
  const frozen = data?.status === WALLET_STATUS.FROZEN;

  return (
    <section className={styles.card} aria-label={t('title')}>
      {summary.isPending ? (
        <Skeleton active title={false} paragraph={{ rows: 4 }} />
      ) : summary.isError || !data ? (
        <p className={styles.note}>{t('loadError')}</p>
      ) : (
        <div className={styles.balance}>
          <div className={styles.hero}>
            <span className={styles.heroLabel}>{t('available')}</span>
            <span className={styles.heroValue}>{fmt.money(data.available)}</span>
          </div>
          <div className={styles.figures}>
            <div className={styles.figure}>
              <span className={styles.figureLabel}>{t('pendingShort')}</span>
              <span className={styles.figureValue}>{fmt.money(data.pending)}</span>
            </div>
            <div className={styles.figure}>
              <span className={styles.figureLabel}>{tWallet('balance.total')}</span>
              <span className={styles.figureValue}>{fmt.money(data.total)}</span>
            </div>
          </div>
          <button
            type="button"
            className={styles.cta}
            disabled={!canWithdraw}
            onClick={() => setWithdrawOpen(true)}
          >
            {tWallet('withdraw.action')}
          </button>
          {frozen ? <p className={styles.noteWarn}>{t('frozen')}</p> : null}
          {hint ? <p className={styles.note}>{hint}</p> : null}
        </div>
      )}

      {showIncome ? (
        <div className={styles.income}>
          <div className={styles.incomeRow}>
            <span className={styles.figureLabel}>{t('income')}</span>
            <span className={styles.figureValue}>
              {statement.data
                ? fmt.money(statement.data.totals.ownerIncome)
                : statement.isError
                  ? '-'
                  : '…'}
            </span>
          </div>
          {statement.data ? (
            <p className={styles.note}>
              {t('incomeHint', { count: statement.data.stats.completedTripCount })}
            </p>
          ) : statement.isError ? (
            <p className={styles.note}>{t('loadError')}</p>
          ) : null}
        </div>
      ) : null}

      <div className={styles.foot}>
        <HeadLink href={href} label={t('open')} />
      </div>

      <WithdrawDialog scope="shop" open={withdrawOpen} onClose={() => setWithdrawOpen(false)} />
    </section>
  );
}
