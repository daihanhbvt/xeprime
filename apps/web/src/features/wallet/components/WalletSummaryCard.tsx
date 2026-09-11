'use client';

import { Alert, Button, Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import { useAppFormat } from '@/i18n/use-app-format';
import { useWalletSummary } from '../hooks';
import type { WalletScope } from '../types';
import styles from './WalletSummaryCard.module.css';

/**
 * Số dư ví điểm — BA con số, không phải một.
 *
 * Hiện một con số duy nhất sẽ làm người dùng hoặc tưởng rút được nhiều hơn thực tế (khi có lệnh
 * đang chờ chuyển), hoặc tưởng tiền đã biến mất trong lúc chờ. Ba con số trả lời đủ: rút được
 * ngay · đang trên đường · tổng XePrime đang nợ.
 *
 * `legalNote` hiện CỐ ĐỊNH, không phải tooltip: bản chất của sổ này là nghĩa vụ phải trả, và
 * người dùng phải đọc được điều đó ở cùng chỗ họ nhìn thấy con số — "1 điểm = 1đ · rút về ngân
 * hàng được · không hết hạn" (ADR 0033 điều 1).
 */
export function WalletSummaryCard({
  scope,
  onWithdraw,
}: {
  scope: WalletScope;
  onWithdraw?: () => void;
}) {
  const t = useTranslations('Wallet');
  const fmt = useAppFormat();
  const { data, isPending, isError } = useWalletSummary(scope);

  if (isPending) return <Skeleton active paragraph={{ rows: 2 }} />;
  if (isError) return <Alert type="error" showIcon message={t('loadError')} />;

  const frozen = data.status === 'frozen';
  const canWithdraw = !frozen && Number(data.available) >= Number(data.minWithdrawAmount);

  return (
    <section className={styles.card} aria-label={t(`title.${scope === 'shop' ? 'tenant' : 'user'}`)}>
      <header className={styles.head}>
        <h2 className={styles.title}>
          {t(`title.${scope === 'shop' ? 'tenant' : 'user'}`)}
        </h2>
        {onWithdraw ? (
          <Button type="primary" disabled={!canWithdraw} onClick={onWithdraw}>
            {t('withdraw.action')}
          </Button>
        ) : null}
      </header>

      {frozen ? <Alert type="warning" showIcon message={t('balance.frozen')} /> : null}

      <dl className={styles.figures}>
        <div className={styles.primary}>
          <dt>{t('balance.available')}</dt>
          <dd className={styles.big}>
            {fmt.money(data.available)} <span className={styles.unit}>{t('unit')}</span>
          </dd>
        </div>
        <div>
          <dt>{t('balance.pending')}</dt>
          <dd>{fmt.money(data.pending)}</dd>
        </div>
        <div>
          <dt>{t('balance.total')}</dt>
          <dd>{fmt.money(data.total)}</dd>
        </div>
      </dl>

      <p className={styles.legal}>{t('legalNote')}</p>

      {Number(data.total) === 0 ? <p className={styles.empty}>{t('empty')}</p> : null}
    </section>
  );
}
