'use client';

import {
  CustomerServiceOutlined,
  EllipsisOutlined,
  ExportOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Dropdown, Tabs, Tag } from 'antd';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import {
  PARTNER_DETAIL_TAB,
  PARTNER_DETAIL_TABS,
  PERMISSION,
  PLATFORM_PARTNER_KIND,
  SHOP_VERIFICATION_META,
  TENANT_STATUS_META,
  isPlatformPartnerKind,
  partnerDetailTabOf,
  type PartnerDetailTab,
  type PlatformPartnerKind,
  type ShopVerification,
  type TenantStatus,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import { shopPath } from '@/constants/routes';
import { StartSupportDialog } from '@/features/tenant-support/components/StartSupportDialog';
import { usePermissions } from '@/hooks/use-permissions';
import { isForbiddenError, isNotFoundError } from '@/lib/http-status';
import { useAppFormat } from '@/i18n/use-app-format';
import type { PartnerOverview } from './api';
import { ActivityTab } from './ActivityTab';
import { BillingTab } from './BillingTab';
import { BookingsTab } from './BookingsTab';
import { CommissionTab } from './CommissionTab';
import { usePartnerOverview } from './hooks';
import { OverviewTab } from './OverviewTab';
import { PartnerAdminDialog } from './PartnerAdminDialog';
import { ProfileTab } from './ProfileTab';
import { VehiclesTab } from './VehiclesTab';
import styles from './PartnerDetail.module.css';

/**
 * Drawer CHI TIẾT đối tác — MỘT vỏ cho "Gian hàng gói" và "Chủ xe cá nhân" (28/09/2026).
 *
 * CHỈ ĐỌC. Không tab nào có nút sửa, form hay mutation. Mọi thay đổi dữ liệu của đối tác đi qua
 * "Mở chế độ hỗ trợ" (ADR 0050 — luồng, lý do, capability allowlist và audit có sẵn). Ngoại lệ
 * duy nhất, tách hẳn khỏi các tab: "Thao tác quản trị nền tảng" (khoá/mở khoá, gán/huỷ gói) — hai
 * việc CỦA NỀN TẢNG mà phiên hỗ trợ cấm, mở trong một hộp thoại riêng.
 *
 * Biến thể đọc từ `partnerKind` SERVER trả về, không từ danh sách đang đứng: link gõ tay vào sai
 * danh sách vẫn ra đúng bộ tab của đối tác đó.
 */
export function PartnerDetailDrawer({
  tenantId,
  tab,
  onTabChange,
  onClose,
}: {
  tenantId: string | null;
  tab: string | undefined;
  onTabChange: (tab: PartnerDetailTab) => void;
  onClose: () => void;
}) {
  const t = useTranslations('AdminTenants.partnerDetail');
  const overview = usePartnerOverview(tenantId);
  const data = overview.data?.identity.id === tenantId ? overview.data : undefined;
  // 403 và 404 là câu trả lời cuối: nói đúng lý do, không mời bấm "Thử lại" một việc không thể thành.
  const forbidden = isForbiddenError(overview.error);
  const notFound = isNotFoundError(overview.error);
  const errorTitle = forbidden
    ? t('denied.title')
    : notFound
      ? t('states.notFound')
      : t('states.loadError');
  const errorDescription = forbidden
    ? t('denied.overview')
    : notFound
      ? t('states.notFoundBody')
      : t('states.loadErrorBody');

  return (
    <DetailDrawer
      open={Boolean(tenantId)}
      onClose={onClose}
      size="xl"
      title={data ? <PartnerHeader overview={data} /> : t('fallbackTitle')}
      ariaLabel={data ? t('ariaLabel', { name: data.identity.name }) : t('fallbackTitle')}
      extra={data ? <HeaderActions overview={data} /> : null}
      loading={!data && !overview.isError}
      error={overview.isError && !data}
      errorTitle={errorTitle}
      errorDescription={errorDescription}
      onRetry={forbidden || notFound ? undefined : () => void overview.refetch()}
      bodyClassName={styles.body}
      data-testid="partner-detail-drawer"
    >
      {data ? (
        // `key` theo tenant: đổi đối tác là dựng lại toàn bộ state của các tab (bộ lọc, trang).
        <PartnerTabs key={data.identity.id} overview={data} tab={tab} onTabChange={onTabChange} />
      ) : null}
    </DetailDrawer>
  );
}

function kindOf(overview: PartnerOverview): PlatformPartnerKind {
  return isPlatformPartnerKind(overview.identity.partnerKind)
    ? overview.identity.partnerKind
    : PLATFORM_PARTNER_KIND.INDIVIDUAL_OWNER;
}

function PartnerTabs({
  overview,
  tab,
  onTabChange,
}: {
  overview: PartnerOverview;
  tab: string | undefined;
  onTabChange: (tab: PartnerDetailTab) => void;
}) {
  const t = useTranslations('AdminTenants.partnerDetail.tabs');
  const kind = kindOf(overview);
  const isPackage = kind === PLATFORM_PARTNER_KIND.PACKAGE_SHOP;
  const active = partnerDetailTabOf(kind, tab);
  const tenantId = overview.identity.id;

  const content: Record<PartnerDetailTab, () => ReactNode> = {
    [PARTNER_DETAIL_TAB.OVERVIEW]: () => (
      <OverviewTab overview={overview} isPackage={isPackage} onGoTab={onTabChange} />
    ),
    [PARTNER_DETAIL_TAB.VEHICLES]: () => <VehiclesTab overview={overview} isPackage={isPackage} />,
    [PARTNER_DETAIL_TAB.BOOKINGS]: () => <BookingsTab tenantId={tenantId} />,
    [PARTNER_DETAIL_TAB.PROFILE]: () => <ProfileTab overview={overview} isPackage={isPackage} />,
    [PARTNER_DETAIL_TAB.BILLING]: () => <BillingTab overview={overview} />,
    [PARTNER_DETAIL_TAB.COMMISSION]: () => <CommissionTab tenantId={tenantId} />,
    [PARTNER_DETAIL_TAB.ACTIVITY]: () => <ActivityTab tenantId={tenantId} kind={kind} />,
  };

  return (
    <Tabs
      className={styles.tabs}
      activeKey={active}
      onChange={(key) => onTabChange(key as PartnerDetailTab)}
      // Chỉ tab đang mở được dựng — mỗi tab tự tải dữ liệu của mình khi được mở.
      items={PARTNER_DETAIL_TABS[kind].map((key) => ({
        key,
        label: t(key),
        children: key === active ? content[key]() : null,
      }))}
    />
  );
}

function PartnerHeader({ overview }: { overview: PartnerOverview }) {
  const t = useTranslations('AdminTenants.partnerDetail');
  const fmt = useAppFormat();
  const { identity, owner } = overview;
  const isPackage = kindOf(overview) === PLATFORM_PARTNER_KIND.PACKAGE_SHOP;
  return (
    <div className={styles.header}>
      <Avatar
        size={64}
        shape={isPackage ? 'square' : 'circle'}
        src={(isPackage ? identity.logoUrl : owner.avatarUrl) ?? undefined}
        alt={isPackage ? identity.name : (owner.name ?? identity.name)}
      >
        {(isPackage ? identity.name : (owner.name ?? identity.name)).slice(0, 1).toUpperCase()}
      </Avatar>
      <div className={styles.headerText}>
        <span className={styles.headerName}>
          {isPackage ? identity.name : (owner.name ?? identity.name)}
        </span>
        <span className={styles.headerCode}>{identity.code}</span>
        <div className={styles.tagRow}>
          <Tag color="gold">{t(`kind.${kindOf(overview)}`)}</Tag>
          {isPackage ? null : <Tag color="blue">{t('commissionTrack')}</Tag>}
          <StatusTag
            value={identity.status as TenantStatus}
            meta={TENANT_STATUS_META}
            group="tenantStatus"
          />
          <StatusTag
            value={identity.verification as ShopVerification}
            meta={SHOP_VERIFICATION_META}
            group="shopVerification"
          />
        </div>
        <span className={styles.headerMeta}>
          {t('joinedAt', { date: fmt.date(identity.createdAt) })}
        </span>
      </div>
    </div>
  );
}

function HeaderActions({ overview }: { overview: PartnerOverview }) {
  const t = useTranslations('AdminTenants.partnerDetail.actions');
  const { has } = usePermissions();
  const [supportOpen, setSupportOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const { identity } = overview;
  const isPackage = kindOf(overview) === PLATFORM_PARTNER_KIND.PACKAGE_SHOP;
  // Phiên hỗ trợ là quyền RIÊNG (ADR 0050) — server kiểm lại độc lập khi mở phiên.
  const canSupport = has(PERMISSION.PLATFORM_TENANT_SUPPORT_VIEW);
  // Menu "…" chỉ chứa lối vào hộp thoại quản trị nền tảng — không chứa mutation nào.
  const canAdmin =
    has(PERMISSION.PLATFORM_TENANT_MANAGE) || has(PERMISSION.PLATFORM_BILLING_MANAGE);

  return (
    <div className={styles.headerActions}>
      {canSupport ? (
        <Button
          type="primary"
          icon={<CustomerServiceOutlined />}
          onClick={() => setSupportOpen(true)}
        >
          {t('support')}
        </Button>
      ) : null}
      {identity.storefrontAvailable ? (
        <Button
          href={shopPath.detail(identity.slug)}
          target="_blank"
          rel="noreferrer"
          icon={<ExportOutlined />}
        >
          {isPackage ? t('storefront') : t('marketplace')}
        </Button>
      ) : null}
      {canAdmin ? (
        <Dropdown
          trigger={['click']}
          menu={{
            items: [{ key: 'admin', icon: <SettingOutlined />, label: t('admin') }],
            onClick: () => setAdminOpen(true),
          }}
        >
          <Button icon={<EllipsisOutlined />} aria-label={t('more')} />
        </Dropdown>
      ) : null}
      {canSupport ? (
        <StartSupportDialog
          tenantId={identity.id}
          tenantName={identity.name}
          open={supportOpen}
          onClose={() => setSupportOpen(false)}
        />
      ) : null}
      {canAdmin ? (
        <PartnerAdminDialog
          tenantId={identity.id}
          tenantName={identity.name}
          open={adminOpen}
          onClose={() => setAdminOpen(false)}
        />
      ) : null}
    </div>
  );
}
