'use client';

import { Skeleton, Tabs } from 'antd';
import { useTranslations } from 'next-intl';
import { PERMISSION } from '@xeprime/types';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { usePermissions } from '@/hooks/use-permissions';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { InsuranceCertificatesPanel } from './InsuranceCertificatesPanel';
import { InsuranceProductsPanel } from './InsuranceProductsPanel';

const TAB = { PRODUCTS: 'products', CERTIFICATES: 'certificates' } as const;
type Tab = (typeof TAB)[keyof typeof TAB];
const isTab = (v: string | null): v is Tab => v === TAB.PRODUCTS || v === TAB.CERTIFICATES;

/**
 * Màn BẢO HIỂM của nền tảng (ADR 0064) — hai tab, mỗi tab gác bằng quyền của chính endpoint nó gọi:
 *
 *   - "Sản phẩm" — `platform.insurance.manage` (danh mục hiện cho khách);
 *   - "Chứng nhận" — `platform.money.manage` (hàng đợi GCN là phí khách đang được giữ hộ; cùng
 *     bảng với hàng đợi bảo hiểm ở màn Tài chính).
 *
 * Ẩn tab chỉ là trang trí — backend chặn thật bằng `@RequirePermissions` (ADR 0027 điều 4).
 * Tab đang mở nằm trên URL (`?tab=`) để F5 và gửi link giữ đúng chỗ.
 */
export function InsuranceAdminView() {
  const t = useTranslations('AdminInsurance');
  const { has, isLoading } = usePermissions();
  const { filters, setFilters } = useUrlFilters((sp) => {
    const tab = sp.get('tab');
    return { tab: isTab(tab) ? tab : undefined };
  });

  const canProducts = has(PERMISSION.PLATFORM_INSURANCE_MANAGE);
  const canCertificates = has(PERMISSION.PLATFORM_MONEY_MANAGE);
  const items = [
    ...(canCertificates
      ? [{ key: TAB.CERTIFICATES, label: t('tabs.certificates'), children: <InsuranceCertificatesPanel /> }]
      : []),
    ...(canProducts
      ? [{ key: TAB.PRODUCTS, label: t('tabs.products'), children: <InsuranceProductsPanel /> }]
      : []),
  ];
  const active =
    filters.tab && items.some((i) => i.key === filters.tab) ? filters.tab : items[0]?.key;

  return (
    <div>
      <ManagePageHeader title={t('page.title')} subtitle={t('page.subtitle')} />
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : items.length === 0 ? (
        <PermissionState
          missingPermissions={[PERMISSION.PLATFORM_INSURANCE_MANAGE, PERMISSION.PLATFORM_MONEY_MANAGE]}
        />
      ) : (
        <Tabs
          aria-label={t('page.tabsLabel')}
          activeKey={active}
          onChange={(key) => setFilters({ tab: key as Tab }, { resetPage: false })}
          destroyOnHidden
          items={items}
        />
      )}
    </div>
  );
}
