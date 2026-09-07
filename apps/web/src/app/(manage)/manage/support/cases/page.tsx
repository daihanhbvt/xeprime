'use client';

import { Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { PERMISSION } from '@xeprime/types';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ROUTES } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { SupportCasesView } from '@/features/support-cases/components/SupportCasesView';
import { SUPPORT_SURFACE } from '@/features/support-cases/types';

/** Case hỗ trợ/tranh chấp của GIAN HÀNG — bộ cơ bản, không gác sau gói (ADR 0027 điều 1). */
export default function ShopSupportCasesPage() {
  const t = useTranslations('SupportCases');
  const { has, isLoading } = usePermissions();

  if (isLoading) return null;

  if (!has(PERMISSION.SUPPORT_VIEW)) {
    return (
      <PermissionState
        kind="forbidden"
        title={t('page.noPermissionTitle')}
        description={t('page.noPermission')}
        missingPermissions={[PERMISSION.SUPPORT_VIEW]}
        action={
          <Link href={ROUTES.MANAGE.ROOT}>
            <Button type="primary">{t('page.backHome')}</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div>
      <ManagePageHeader title={t('page.tenantTitle')} subtitle={t('page.tenantSubtitle')} />
      <SupportCasesView surface={SUPPORT_SURFACE.TENANT} />
    </div>
  );
}
