'use client';

import { SyncOutlined } from '@ant-design/icons';
import { App, Button, Tag } from 'antd';
import { useTranslations } from 'next-intl';
import { INSURANCE_PREMIUM_SYNC_STATUS, STATUS_COLOR } from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useSyncInsurancePremium } from '../hooks';
import { previousTierDays } from '../premium-plan';
import type { InsuranceProduct } from '../types';
import { PremiumSyncNotice } from './PremiumSyncNotice';
import { useYearBandLabel } from './year-band-label';
import styles from './PremiumSyncCard.module.css';

type Band = NonNullable<InsuranceProduct['premiumYearBands']>[number];

/**
 * Biểu phí ĐANG ÁP DỤNG của bảo hiểm vật chất xe và trạng thái đồng bộ với hãng (ADR 0106).
 *
 * Không có vòng tự chạy: chỉ đồng bộ khi admin bấm (~50-60 lượt hỏi MIC). Lượt duyệt đơn thấy MIC báo
 * khác biểu phí thì đánh dấu "lệch" và thẻ này nhắc đồng bộ lại. Bảng là chính biểu phí báo giá đang
 * dùng: mỗi hàng một nhóm năm sản xuất, mỗi cột một bậc.
 */
export function PremiumSyncCard({ product }: { product: InsuranceProduct }) {
  const t = useTranslations('AdminInsurance.sync');
  const tBands = useTranslations('AdminInsurance.bands');
  const tPlan = useTranslations('AdminInsurance.plan');
  const fmt = useAppFormat();
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const sync = useSyncInsurancePremium();
  const yearBandLabel = useYearBandLabel();
  const tiers = product.premiumTiers ?? [];
  // Chưa có nhóm năm ⇒ một hàng "Mọi năm" mang biểu phí chung.
  const bands: Band[] = product.premiumYearBands?.length
    ? product.premiumYearBands
    : [{ yearFrom: null, yearTo: null, percents: tiers.map((tier) => tier.percent) }];

  const onSync = () => {
    if (sync.isPending) return;
    sync.mutate(undefined, {
      onSuccess: (result) => {
        if (result.status === INSURANCE_PREMIUM_SYNC_STATUS.SYNCED) {
          void message.success(t('syncedToast', { count: result.askedCount }));
        } else if (result.status === INSURANCE_PREMIUM_SYNC_STATUS.FAILED) {
          void message.warning(t('failedToast'));
        } else {
          void message.info(t('notSupportedToast'));
        }
      },
      onError: (err) => void message.error(errorMessage(err)),
    });
  };

  const columns: DataTableColumn<Band>[] = [
    {
      title: tBands('columns.year'),
      key: 'year',
      fixed: 'left',
      width: 140,
      render: (_, band) => (
        <span className={styles.strong}>
          {yearBandLabel(band.yearFrom ?? null, band.yearTo ?? null)}
        </span>
      ),
    },
    ...tiers.map((tier, index): DataTableColumn<Band> => {
      const from = previousTierDays(tiers, index);
      return {
        title:
          from === 0
            ? tPlan('durationFirst', { to: tier.maxDays })
            : tPlan('durationRange', { from, to: tier.maxDays }),
        key: `tier-${tier.maxDays}`,
        align: 'right',
        render: (_, band) => (
          <span className={styles.percent}>
            {tBands('percent', { percent: fmt.rate(band.percents[index] ?? '0') })}
          </span>
        ),
      };
    }),
  ];

  const locked = product.premiumSyncStatus === INSURANCE_PREMIUM_SYNC_STATUS.SYNCED;
  const drifted = product.premiumSyncStatus === INSURANCE_PREMIUM_SYNC_STATUS.DRIFTED;

  return (
    <section className={styles.card} aria-label={t('title')}>
      <div className={styles.head}>
        <div>
          <h3 className={styles.title}>
            {t('title')}{' '}
            {locked ? (
              <Tag color={STATUS_COLOR.SUCCESS}>{t('lockedTag')}</Tag>
            ) : drifted ? (
              <Tag color={STATUS_COLOR.DANGER}>{t('driftedTag')}</Tag>
            ) : (
              <Tag color={STATUS_COLOR.WARNING}>{t('editableTag')}</Tag>
            )}
          </h3>
          <p className={styles.muted}>{t('intro')}</p>
        </div>
        <Button icon={<SyncOutlined aria-hidden />} loading={sync.isPending} onClick={onSync}>
          {t('syncNow')}
        </Button>
      </div>
      <PremiumSyncNotice product={product} />
      <DataTable<Band>
        label={t('tableLabel')}
        columns={columns}
        items={bands}
        rowKey={(band) => `${band.yearFrom ?? 'min'}-${band.yearTo ?? 'max'}`}
        minWidth={140 + tiers.length * 120}
        filtered={false}
        empty={{ title: t('empty') }}
      />
    </section>
  );
}
