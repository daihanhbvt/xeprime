'use client';

import { Skeleton, Tabs } from 'antd';
import { useTranslations } from 'next-intl';
import { PERMISSION } from '@xeprime/types';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { usePermissions } from '@/hooks/use-permissions';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { InsuranceCertificatesPanel } from './InsuranceCertificatesPanel';
import { InsuranceOverviewPanel } from './InsuranceOverviewPanel';
import { InsuranceProductsPanel } from './InsuranceProductsPanel';
import { InsuranceVehiclesPanel } from './InsuranceVehiclesPanel';
import { RemittancesPanel } from './RemittancesPanel';

const TAB = {
  /** Tiền bảo hiểm một tháng + nguồn phí + việc tồn (ADR 0097). */
  OVERVIEW: 'overview',
  PRODUCTS: 'products',
  /** Ô tô, điều kiện bảo hiểm, phí theo bậc, đối chiếu MIC (ADR 0097). */
  VEHICLES: 'vehicles',
  CERTIFICATES: 'certificates',
  /** Bảng kê trả phí cho hãng (ADR 0088 điều 6). */
  REMITTANCES: 'remittances',
} as const;
type Tab = (typeof TAB)[keyof typeof TAB];
const isTab = (v: string | null): v is Tab => Object.values(TAB).includes(v as Tab);

/**
 * Tham số URL thuộc RIÊNG một tab (tìm kiếm, trang, bộ lọc, bản ghi đang mở, tháng). Các tab dùng
 * chung tên `q`/`page` — đổi tab mà giữ chúng thì ô tìm của tab Hợp đồng lọc luôn tab Xe.
 */
const TAB_SCOPED_PARAMS = [
  'q',
  'page',
  'limit',
  'status',
  'productKind',
  'eligibility',
  'open',
  'remittance',
  'month',
] as const;
type TabUrlState = { tab?: Tab } & Partial<Record<(typeof TAB_SCOPED_PARAMS)[number], string>>;

/**
 * Màn BẢO HIỂM của nền tảng (ADR 0064 · ADR 0097) — mỗi tab gác bằng quyền của chính endpoint nó gọi:
 *
 *   - "Tổng quan", "Hợp đồng", "Bảng kê" — `platform.money.manage` (tiền giữ hộ / phải trả hãng);
 *   - "Biểu phí & sản phẩm", "Xe" — `platform.insurance.manage` (danh mục, bảng bậc, đối chiếu MIC).
 *
 * Ẩn tab chỉ là trang trí — backend chặn thật bằng `@RequirePermissions` (ADR 0027 điều 4).
 * Tab đang mở nằm trên URL (`?tab=`) để F5 và gửi link giữ đúng chỗ.
 */
export function InsuranceAdminView() {
  const t = useTranslations('AdminInsurance');
  const { has, isLoading } = usePermissions();
  const { filters, setFilters } = useUrlFilters((sp): TabUrlState => {
    const tab = sp.get('tab');
    return { tab: isTab(tab) ? tab : undefined };
  });

  const canProducts = has(PERMISSION.PLATFORM_INSURANCE_MANAGE);
  const canCertificates = has(PERMISSION.PLATFORM_MONEY_MANAGE);
  const items = [
    ...(canCertificates
      ? [{ key: TAB.OVERVIEW, label: t('tabs.overview'), children: <InsuranceOverviewPanel /> }]
      : []),
    ...(canCertificates
      ? [
          {
            key: TAB.CERTIFICATES,
            label: t('tabs.certificates'),
            children: <InsuranceCertificatesPanel />,
          },
          // Cùng quyền tiền: bảng kê là vế "phải trả hãng" của tiền giữ hộ.
          { key: TAB.REMITTANCES, label: t('tabs.remittances'), children: <RemittancesPanel /> },
        ]
      : []),
    ...(canProducts
      ? [
          { key: TAB.PRODUCTS, label: t('tabs.products'), children: <InsuranceProductsPanel /> },
          { key: TAB.VEHICLES, label: t('tabs.vehicles'), children: <InsuranceVehiclesPanel /> },
        ]
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
          missingPermissions={[
            PERMISSION.PLATFORM_INSURANCE_MANAGE,
            PERMISSION.PLATFORM_MONEY_MANAGE,
          ]}
        />
      ) : (
        <Tabs
          aria-label={t('page.tabsLabel')}
          activeKey={active}
          onChange={(key) =>
            setFilters({
              tab: key as Tab,
              ...Object.fromEntries(TAB_SCOPED_PARAMS.map((param) => [param, undefined])),
            })
          }
          destroyOnHidden
          items={items}
        />
      )}
    </div>
  );
}
