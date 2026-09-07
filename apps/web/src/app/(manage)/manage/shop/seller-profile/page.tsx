'use client';

import { Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { PERMISSION } from '@xeprime/types';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ROUTES } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { SellerProfileWorkspace } from '@/features/seller-profile/components/SellerProfileWorkspace';

export default function SellerProfilePage() {
  const t = useTranslations('SellerProfile');
  const { has, isLoading } = usePermissions();

  if (isLoading) return null;

  if (!has(PERMISSION.SELLER_PROFILE_VIEW)) {
    return (
      <PermissionState
        kind="forbidden"
        title={t('page.noPermissionTitle')}
        description={t('page.noPermission')}
        missingPermissions={[PERMISSION.SELLER_PROFILE_VIEW]}
        action={
          <Link href={ROUTES.MANAGE.ROOT}>
            <Button type="primary">{t('page.backHome')}</Button>
          </Link>
        }
      />
    );
  }

  return <SellerProfileWorkspace />;
}
