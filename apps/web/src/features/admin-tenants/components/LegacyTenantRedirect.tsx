'use client';

import { Button } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { PLATFORM_PARTNER_KIND } from '@xeprime/types';
import { EmptyState } from '@/components/feedback/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { adminPartnerPath } from '@/constants/routes';
import { useAdminTenant } from '../hooks/use-admin-tenants';

/**
 * `/manage/admin/tenants?tenant=<id>` — link cũ, hoặc nơi biết GIAN HÀNG nhưng không biết LOẠI
 * (chi tiết đơn thuê, lối thoát phiên hỗ trợ).
 *
 * Loại lấy từ `partnerKind` mà SERVER suy cho chính gian hàng đó; client không đoán. Có loại là
 * thay URL (`replace` — nút Back không quay về trang trung gian này) sang đúng danh sách, panel chi
 * tiết mở sẵn. Không tra được (xoá, sai id, mất quyền) thì nói rõ và đưa hai lối vào danh sách.
 */
export function LegacyTenantRedirect({ tenantId }: { tenantId: string }) {
  const t = useTranslations('AdminTenants.legacyRedirect');
  const tNav = useTranslations('Navigation.platform');
  const router = useRouter();
  const { data, isError } = useAdminTenant(tenantId);

  useEffect(() => {
    if (data) router.replace(adminPartnerPath.tenant(data.partnerKind, data.id));
  }, [data, router]);

  if (isError) {
    return (
      <EmptyState
        variant="error"
        title={t('notFoundTitle')}
        description={t('notFoundBody')}
        action={
          <Link href={adminPartnerPath.list(PLATFORM_PARTNER_KIND.PACKAGE_SHOP)}>
            <Button type="primary">{tNav('packageShops')}</Button>
          </Link>
        }
        secondaryAction={
          <Link href={adminPartnerPath.list(PLATFORM_PARTNER_KIND.INDIVIDUAL_OWNER)}>
            <Button>{tNav('individualOwners')}</Button>
          </Link>
        }
      />
    );
  }

  return <LoadingState variant="page" label={t('loading')} />;
}
