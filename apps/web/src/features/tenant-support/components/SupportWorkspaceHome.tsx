'use client';

import { Alert, Card, Descriptions } from 'antd';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { SUPPORT_WORKSPACE } from '@xeprime/types';
import { LoadingState } from '@/components/feedback/LoadingState';
import { useWorkspace } from '@/hooks/use-workspace';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useSupportSession } from '../support-session';

/**
 * Gốc của một phiên hỗ trợ: `package_pending` chỉ có trạng thái đăng ký/thanh toán (không bộ quản lý
 * nào mở); hai bộ còn lại chuyển thẳng tới trang đầu của CHÍNH bộ giao diện gian hàng đang dùng —
 * Tổng quan của Full Manage, danh sách xe của Owner Lite (ADR 0050 §12).
 */
export function SupportWorkspaceHome() {
  const session = useSupportSession();
  const router = useRouter();
  const { paths } = useWorkspace();
  const onboarding = session?.context.workspace === SUPPORT_WORKSPACE.ONBOARDING;
  useEffect(() => {
    if (session && !onboarding) router.replace(paths.home);
  }, [onboarding, paths.home, router, session]);

  if (!session) return null;
  if (onboarding) return <OnboardingStatus />;
  return <LoadingState variant="page" />;
}

function OnboardingStatus() {
  const session = useSupportSession()!;
  const t = useTranslations('TenantSupport.onboarding');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();
  const tenant = session.context.tenant;

  return (
    <Card title={t('title')}>
      <Alert type="info" showIcon title={t('body')} />
      <Descriptions
        column={1}
        size="small"
        bordered
        items={[
          {
            key: 'status',
            label: t('fields.status'),
            children: domainLabel('tenantStatus', tenant.status),
          },
          {
            key: 'plan',
            label: t('fields.plan'),
            children: tenant.planName ?? t('fields.noPlan'),
          },
          {
            key: 'planEndsAt',
            label: t('fields.planEndsAt'),
            children: tenant.planEndsAt ? fmt.date(tenant.planEndsAt) : t('fields.noPlan'),
          },
        ]}
      />
    </Card>
  );
}
