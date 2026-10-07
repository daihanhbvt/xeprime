'use client';

import {
  CarOutlined,
  CustomerServiceOutlined,
  DollarOutlined,
  ExportOutlined,
  FileTextOutlined,
  HistoryOutlined,
  InfoCircleOutlined,
  PictureOutlined,
} from '@ant-design/icons';
import { Alert, Button, Collapse, Tag, type CollapseProps } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { LIST_SEPARATOR } from '@xeprime/domain';
import {
  APPROVAL_STATUS,
  APPROVAL_STATUS_META,
  LISTING_STATUS_META,
  MARKETPLACE_VISIBILITY_REASON_META,
  PERMISSION,
  STATUS_COLOR,
  TENANT_STATUS_META,
  VEHICLE_PUBLIC_STATUS_META,
  type ApprovalStatus,
  type ListingStatus,
  type MarketplaceVisibilityReason,
  type TenantStatus,
  type VehiclePublicStatus,
  type VehicleType,
} from '@xeprime/types';
import { EntityIdentity } from '@/components/data-display/EntityIdentity';
import { InfoHint } from '@/components/data-display/InfoHint';
import { StatusTag } from '@/components/data-display/StatusTag';
import { VEHICLE_TYPE_ICON } from '@/components/data-display/VehicleTypeIcon';
import { WorkDrawerFacts, type WorkDrawerFact } from '@/components/overlay/WorkDrawer';
import {
  adminApprovalPath,
  adminAuditPath,
  adminBookingPath,
  adminPartnerPath,
  adminTenantSupportPath,
  listingPath,
  marketSiteHref,
  shopPath,
} from '@/constants/routes';
import { AUDIT_TARGET_TYPE } from '@/features/admin-audit/constants';
import { ReviewGallery } from '@/features/approvals/components/ReviewSections';
import { useCatalogLabels } from '@/features/catalog/use-catalog';
import { StartSupportDialog } from '@/features/tenant-support/components/StartSupportDialog';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import type { AdminVehicleDetail } from '../types';
import styles from './AdminVehicleDetailDrawer.module.css';

/** Khối mở sẵn: đủ để nhận diện xe và kiểm giá mà không phải bấm; mô tả và hoạt động mở khi cần. */
const DEFAULT_OPEN_SECTIONS = ['gallery', 'info', 'pricing'];

/** Phiếu duyệt đã trả về cho chủ xe — kể lại lý do ngay đầu hồ sơ. */
const RETURNED_STATUSES: ReadonlySet<string> = new Set([
  APPROVAL_STATUS.NEEDS_REVISION,
  APPROVAL_STATUS.REJECTED,
]);

/* ───────────────────────────── Cột trái: hồ sơ xe ───────────────────────────── */

export function VehicleProfile({ vehicle }: { vehicle: AdminVehicleDetail }) {
  const t = useTranslations('AdminVehicles');
  return (
    <>
      <VehicleIntro vehicle={vehicle} />
      <Collapse
        className={styles.collapse}
        defaultActiveKey={DEFAULT_OPEN_SECTIONS}
        items={useSectionItems(vehicle, t)}
      />
    </>
  );
}

/** Tên xe + nhãn loại/dịch vụ/vị trí + các cảnh báo về trạng thái kiểm duyệt. */
function VehicleIntro({ vehicle }: { vehicle: AdminVehicleDetail }) {
  const t = useTranslations('AdminVehicles.intro');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const TypeIcon = VEHICLE_TYPE_ICON[vehicle.vehicleType as VehicleType] ?? CarOutlined;
  const approval = vehicle.latestApproval;

  return (
    <div className={styles.intro}>
      <h2 className={styles.vehicleName}>{vehicle.name}</h2>
      <div className={styles.chips}>
        <Tag icon={<TypeIcon aria-hidden />} className={styles.chip}>
          {domainLabel('vehicleType', vehicle.vehicleType)}
        </Tag>
        <Tag className={styles.chip}>{fmt.serviceTypes(vehicle.serviceTypes)}</Tag>
        {vehicle.provinceName ? <Tag className={styles.chip}>{vehicle.provinceName}</Tag> : null}
      </div>

      {vehicle.platformHide ? (
        <Alert
          type="error"
          showIcon
          className={styles.introAlert}
          title={t('hidden.title')}
          description={t(vehicle.platformHide.hiddenByName ? 'hidden.body' : 'hidden.bodyNoName', {
            name: vehicle.platformHide.hiddenByName ?? '',
            at: fmt.dateTime(vehicle.platformHide.hiddenAt),
            reason: vehicle.platformHide.reason,
          })}
        />
      ) : null}

      {approval?.status === APPROVAL_STATUS.PENDING ? (
        <Alert
          type="info"
          showIcon
          className={styles.introAlert}
          title={t('pending.title')}
          description={
            <span className={styles.inline}>
              {t('pending.body', { at: fmt.dateTime(approval.submittedAt) })}
              <Link href={adminApprovalPath.task(approval.taskId)}>{t('pending.open')}</Link>
            </span>
          }
        />
      ) : null}

      {approval && RETURNED_STATUSES.has(approval.status) ? (
        <Alert
          type="warning"
          showIcon
          className={styles.introAlert}
          title={t('returned.title', {
            status: domainLabel('approvalStatus', approval.status),
          })}
          description={
            <span className={styles.inline}>
              {approval.reason ? (
                <span className={styles.prose}>{t('returned.reason', { reason: approval.reason })}</span>
              ) : null}
              <Link href={adminApprovalPath.task(approval.taskId)}>{t('pending.open')}</Link>
            </span>
          }
        />
      ) : null}
    </div>
  );
}

function useSectionItems(
  vehicle: AdminVehicleDetail,
  t: ReturnType<typeof useTranslations<'AdminVehicles'>>,
): CollapseProps['items'] {
  const tCommon = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const labels = useCatalogLabels();
  const empty = <span className={styles.muted}>{tCommon('emptyValue')}</span>;
  const label = (icon: ReactNode, text: string) => (
    <span className={styles.sectionLabel}>
      {icon}
      {text}
    </span>
  );
  const money = (value: string | null | undefined) =>
    value ? <span className={styles.money}>{fmt.money(value)}</span> : empty;

  const model = [labels.brandLabel(vehicle.brand) ?? vehicle.brand, vehicle.model]
    .filter(Boolean)
    .join(' ');

  const info: WorkDrawerFact[] = [
    { key: 'plate', label: t('detail.plate'), value: vehicle.plateNumber ?? empty },
    { key: 'code', label: t('detail.code'), value: vehicle.code },
    { key: 'model', label: t('detail.model'), value: model || empty },
    {
      key: 'year',
      label: t('detail.year'),
      value: vehicle.manufactureYear ? String(vehicle.manufactureYear) : empty,
    },
    {
      key: 'seats',
      label: t('detail.seats'),
      value: vehicle.seatCount ? t('detail.seatsValue', { count: vehicle.seatCount }) : empty,
    },
    {
      key: 'transmission',
      label: t('detail.transmission'),
      value: vehicle.transmission
        ? domainLabel('transmissionType', vehicle.transmission, vehicle.transmission)
        : empty,
    },
    {
      key: 'fuel',
      label: t('detail.fuel'),
      value: labels.fuelTypeLabel(vehicle.fuelType) ?? vehicle.fuelType ?? empty,
    },
    { key: 'color', label: t('detail.color'), value: vehicle.color ?? empty },
  ];

  const pricing: WorkDrawerFact[] = [
    { key: 'weekday', label: t('detail.weekdayPrice'), value: money(vehicle.weekdayPrice) },
    { key: 'weekend', label: t('detail.weekendPrice'), value: money(vehicle.weekendPrice) },
    { key: 'hourly', label: t('detail.hourlyPrice'), value: money(vehicle.hourlyPrice) },
    { key: 'monthly', label: t('detail.monthlyPrice'), value: money(vehicle.monthlyPrice) },
    {
      key: 'withDriver',
      label: t('detail.withDriverDailyPrice'),
      value: money(vehicle.withDriverDailyPrice),
    },
    {
      key: 'discount',
      label: t('detail.discount'),
      value: vehicle.discountPercent
        ? t('detail.discountValue', { percent: vehicle.discountPercent })
        : empty,
    },
    {
      key: 'delivery',
      label: t('detail.delivery'),
      value: vehicle.deliveryEnabled ? tCommon('yes') : tCommon('no'),
    },
  ];

  const approval = vehicle.latestApproval;
  const activity: WorkDrawerFact[] = [
    {
      key: 'bookings',
      label: t('detail.bookings'),
      value: (
        <span className={styles.inline}>
          <span className={styles.money}>{fmt.count(vehicle.bookingCount)}</span>
          {vehicle.bookingCount > 0 ? (
            <Link href={adminBookingPath.forVehicle(vehicle.id)}>{t('detail.bookingsLink')}</Link>
          ) : null}
        </span>
      ),
    },
    {
      key: 'reviews',
      label: t('detail.reviews'),
      value: <span className={styles.money}>{fmt.count(vehicle.reviewCount)}</span>,
    },
    {
      key: 'approval',
      label: t('detail.latestApproval'),
      value: approval ? (
        <span className={styles.inline}>
          <StatusTag
            value={approval.status as ApprovalStatus}
            meta={APPROVAL_STATUS_META}
            group="approvalStatus"
          />
          <span className={styles.caption}>
            {fmt.dateTime(approval.reviewedAt ?? approval.submittedAt)}
          </span>
          <Link href={adminApprovalPath.task(approval.taskId)}>{t('detail.openApproval')}</Link>
        </span>
      ) : (
        <span className={styles.muted}>{t('detail.noApproval')}</span>
      ),
    },
    { key: 'created', label: t('detail.created'), value: fmt.dateTime(vehicle.createdAt) },
    { key: 'updated', label: t('detail.updated'), value: fmt.dateTime(vehicle.updatedAt) },
    {
      key: 'audit',
      label: t('detail.audit'),
      value: (
        <Link href={adminAuditPath.forTarget(AUDIT_TARGET_TYPE.VEHICLE, vehicle.id)}>
          {t('detail.auditLink')}
        </Link>
      ),
    },
  ];

  return [
    {
      key: 'gallery',
      label: label(<PictureOutlined aria-hidden />, t('sections.gallery')),
      children: <ReviewGallery vehicle={{ images: vehicle.images, name: vehicle.name }} />,
    },
    {
      key: 'info',
      label: label(<CarOutlined aria-hidden />, t('sections.info')),
      children: <WorkDrawerFacts items={info} />,
    },
    {
      key: 'pricing',
      label: label(<DollarOutlined aria-hidden />, t('sections.pricing')),
      children: <WorkDrawerFacts items={pricing} />,
    },
    ...(vehicle.description
      ? [
          {
            key: 'description',
            label: label(<FileTextOutlined aria-hidden />, t('sections.description')),
            children: <p className={styles.prose}>{vehicle.description}</p>,
          },
        ]
      : []),
    {
      key: 'activity',
      label: label(<HistoryOutlined aria-hidden />, t('sections.activity')),
      children: <WorkDrawerFacts items={activity} />,
    },
  ];
}

/* ──────────────────────── Cột phải: trên chợ + gian hàng ──────────────────────── */

export function VehicleSidePanel({ vehicle }: { vehicle: AdminVehicleDetail }) {
  return (
    <>
      <MarketplaceCard vehicle={vehicle} />
      <ShopCard vehicle={vehicle} />
    </>
  );
}

/**
 * BA trục của việc lên chợ (ADR 0048) và KẾT QUẢ do server gộp, kèm LÝ DO khi đang ẩn.
 *
 * Thiếu bộ này, người kiểm duyệt gỡ ẩn một chiếc xe rồi thấy "Trên sàn: Đã ẩn" và không có gì
 * giải thích tại sao — đúng cái kết luận "hệ thống lỗi" mà bộ ba này sinh ra để chặn. Trục của
 * chủ xe là CHỈ ĐỌC với nền tảng: dấu "i" nói rõ điều đó.
 */
function MarketplaceCard({ vehicle }: { vehicle: AdminVehicleDetail }) {
  const t = useTranslations('AdminVehicles.side');
  const reason = vehicle.marketplaceVisibilityReason as MarketplaceVisibilityReason;

  return (
    <section className={styles.sideCard} aria-label={t('marketplaceTitle')}>
      <h3 className={styles.sideTitle}>{t('marketplaceTitle')}</h3>
      <dl className={styles.axes}>
        <Axis label={t('review')}>
          <StatusTag
            value={vehicle.publicStatus as VehiclePublicStatus}
            meta={VEHICLE_PUBLIC_STATUS_META}
            group="vehiclePublicStatus"
          />
        </Axis>
        <Axis
          label={
            <span className={styles.inline}>
              {t('ownerVisibility')}
              <InfoHint label={t('ownerVisibilityHintLabel')} content={t('ownerVisibilityHint')} />
            </span>
          }
        >
          <Tag color={vehicle.marketplaceEnabled ? STATUS_COLOR.SUCCESS : STATUS_COLOR.NEUTRAL}>
            {vehicle.marketplaceEnabled ? t('ownerVisibilityOn') : t('ownerVisibilityOff')}
          </Tag>
        </Axis>
        <Axis label={t('shopStatus')}>
          <StatusTag
            value={vehicle.tenantStatus as TenantStatus}
            meta={TENANT_STATUS_META}
            group="tenantStatus"
          />
        </Axis>
      </dl>

      <div className={cx(styles.result, vehicle.isMarketplaceVisible && styles.resultLive)}>
        <span className={styles.resultLabel}>{t('effective')}</span>
        {vehicle.isMarketplaceVisible ? (
          <span className={styles.inline}>
            <Tag color={STATUS_COLOR.SUCCESS}>{t('effectiveVisible')}</Tag>
            <a
              href={marketSiteHref(listingPath.detail(vehicle.id))}
              target="_blank"
              rel="noreferrer"
            >
              {t('viewListing')} <ExportOutlined aria-hidden />
            </a>
          </span>
        ) : (
          <span className={styles.inline}>
            <Tag color={STATUS_COLOR.NEUTRAL}>{t('effectiveHidden')}</Tag>
            <StatusTag
              value={reason}
              meta={MARKETPLACE_VISIBILITY_REASON_META}
              group="marketplaceVisibility"
            />
          </span>
        )}
      </div>

      <p className={styles.caption}>
        {t('listing')}:{' '}
        {vehicle.listingStatus ? (
          <StatusTag
            value={vehicle.listingStatus as ListingStatus}
            meta={LISTING_STATUS_META}
            group="listingStatus"
          />
        ) : (
          t('notListed')
        )}
      </p>
    </section>
  );
}

function Axis({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.axis}>
      <dt className={styles.axisLabel}>{label}</dt>
      <dd className={styles.axisValue}>{children}</dd>
    </div>
  );
}

/** Gian hàng chủ quản: nhận diện, người liên hệ, chi nhánh gắn xe, và ba lối đi tiếp. */
function ShopCard({ vehicle }: { vehicle: AdminVehicleDetail }) {
  const t = useTranslations('AdminVehicles.side');
  const { has } = usePermissions();
  const [supportOpen, setSupportOpen] = useState(false);
  // Phiên hỗ trợ là quyền RIÊNG (ADR 0050) — server kiểm lại độc lập khi mở phiên.
  const canSupport = has(PERMISSION.PLATFORM_TENANT_SUPPORT_VIEW);

  const branch = [vehicle.branchName, vehicle.branchAddress].filter(Boolean).join(LIST_SEPARATOR);

  return (
    <section className={styles.sideCard} aria-label={t('shopTitle')}>
      <h3 className={styles.sideTitle}>{t('shopTitle')}</h3>
      <EntityIdentity
        kind="shop"
        size="sm"
        name={vehicle.tenantName}
        subtitle={vehicle.provinceName ?? undefined}
      />
      <WorkDrawerFacts
        items={[
          {
            key: 'owner',
            label: t('owner'),
            value: vehicle.ownerName ? (
              <span className={styles.person}>
                <span>{vehicle.ownerName}</span>
                {vehicle.ownerPhone ? (
                  <a className={styles.caption} href={`tel:${vehicle.ownerPhone}`}>
                    {vehicle.ownerPhone}
                  </a>
                ) : null}
              </span>
            ) : (
              <span className={styles.muted}>{t('noOwner')}</span>
            ),
          },
          {
            key: 'branch',
            label: t('branch'),
            value: branch || <span className={styles.muted}>{t('noBranch')}</span>,
          },
        ]}
      />
      <div className={styles.linkRow}>
        <Link href={adminPartnerPath.resolveTenant(vehicle.tenantId)}>{t('partnerProfile')}</Link>
        <a href={marketSiteHref(shopPath.detail(vehicle.tenantSlug))} target="_blank" rel="noreferrer">
          {t('storefront')} <ExportOutlined aria-hidden />
        </a>
      </div>
      {canSupport ? (
        <>
          <Button
            block
            icon={<CustomerServiceOutlined aria-hidden />}
            onClick={() => setSupportOpen(true)}
          >
            {t('support')}
          </Button>
          <p className={styles.caption}>
            <InfoCircleOutlined aria-hidden /> {t('supportHint')}
          </p>
          <StartSupportDialog
            tenantId={vehicle.tenantId}
            tenantName={vehicle.tenantName}
            open={supportOpen}
            onClose={() => setSupportOpen(false)}
            // Vào thẳng trang sửa CHIẾC XE này trong phiên — không phải đi tìm lại từ gốc.
            next={(contextId) => adminTenantSupportPath.vehicleEdit(contextId, vehicle.id)}
          />
        </>
      ) : null}
    </section>
  );
}
