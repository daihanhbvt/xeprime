'use client';

import {
  CheckCircleOutlined,
  CodeSandboxOutlined,
  PauseCircleOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { StatCard } from '@/features/dashboard/components/StatCard';
import { useAppFormat } from '@/i18n/use-app-format';
import type { PlanCatalogSummary } from '../plan-catalog';
import styles from './PlanCatalogStats.module.css';

/** Bốn con số đầu trang danh mục gói — luôn trên TOÀN danh mục, không theo bộ lọc. */
export function PlanCatalogStats({
  summary,
  loading,
}: {
  summary: PlanCatalogSummary;
  loading: boolean;
}) {
  const t = useTranslations('AdminPlans.page.stats');
  const fmt = useAppFormat();

  return (
    <div className={styles.grid}>
      <StatCard
        variant="tinted"
        tone="gold"
        icon={CodeSandboxOutlined}
        label={t('total')}
        value={fmt.count(summary.total)}
        hint={t('totalHint')}
        loading={loading}
      />
      <StatCard
        variant="tinted"
        tone="green"
        icon={CheckCircleOutlined}
        label={t('active')}
        value={fmt.count(summary.active)}
        hint={t('activeHint')}
        loading={loading}
      />
      <StatCard
        variant="tinted"
        tone="red"
        icon={PauseCircleOutlined}
        label={t('archived')}
        value={fmt.count(summary.archived)}
        hint={t('archivedHint')}
        loading={loading}
      />
      <StatCard
        variant="tinted"
        tone="blue"
        icon={TagsOutlined}
        label={t('subscriptions')}
        value={fmt.count(summary.subscriptions)}
        hint={t('subscriptionsHint')}
        loading={loading}
      />
    </div>
  );
}
