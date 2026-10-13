'use client';

import { Tabs } from 'antd';
import { useTranslations } from 'next-intl';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import {
  ADMIN_APP_CONFIG_TAB,
  ADMIN_APP_CONFIG_TAB_PARAM,
  type AdminAppConfigTab,
} from '@/constants/routes';
import { PartnerAppConfigForm } from '@/features/app-config/components/PartnerAppConfigForm';
import { PlanGuideTemplateList } from '@/features/app-config/components/PlanGuideTemplateList';
import { useUrlFilters } from '@/hooks/use-url-filters';

const isTab = (value: string | null): value is AdminAppConfigTab =>
  value === ADMIN_APP_CONFIG_TAB.CONFIG || value === ADMIN_APP_CONFIG_TAB.TEMPLATES;

/**
 * CẤU HÌNH ỨNG DỤNG — chỉ nhân sự nền tảng có `platform.app_config.manage` (menu ẩn với người
 * khác, backend chặn thật). Tab ở URL (`?tab=`) để F5/chia sẻ link giữ đúng chỗ.
 */
export default function AdminAppConfigPage() {
  const t = useTranslations('AdminAppConfig');
  const { filters, setFilters } = useUrlFilters<{ tab: AdminAppConfigTab }>((sp) => {
    const tab = sp.get(ADMIN_APP_CONFIG_TAB_PARAM);
    return { tab: isTab(tab) ? tab : ADMIN_APP_CONFIG_TAB.CONFIG };
  });

  return (
    <div>
      <ManagePageHeader title={t('page.title')} subtitle={t('page.subtitle')} />
      <Tabs
        activeKey={filters.tab}
        onChange={(key) => setFilters({ tab: key as AdminAppConfigTab }, { resetPage: false })}
        destroyOnHidden
        items={[
          {
            key: ADMIN_APP_CONFIG_TAB.CONFIG,
            label: t('page.tabs.config'),
            children: <PartnerAppConfigForm />,
          },
          {
            key: ADMIN_APP_CONFIG_TAB.TEMPLATES,
            label: t('page.tabs.templates'),
            children: <PlanGuideTemplateList />,
          },
        ]}
      />
    </div>
  );
}
