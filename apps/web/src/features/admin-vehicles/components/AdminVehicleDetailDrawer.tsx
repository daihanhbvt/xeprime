'use client';

import { EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons';
import { App, Button, Descriptions, Input, Popconfirm, Tag } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  LISTING_STATUS_META,
  MARKETPLACE_VISIBILITY_REASON_META,
  PERMISSION,
  STATUS_COLOR,
  TENANT_STATUS_META,
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_PUBLIC_STATUS_META,
  serviceTypesLabel,
  type ListingStatus,
  type MarketplaceVisibilityReason,
  type TenantStatus,
  type VehicleOperationStatus,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { InfoHint } from '@/components/data-display/InfoHint';
import { StatusTag } from '@/components/data-display/StatusTag';
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import { useCatalogLabels, type CatalogLabels } from '@/features/catalog/use-catalog';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { listingPath, shopPath } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { getErrorMessage } from '@/services/api-client';
import { useAdminVehicle, useVehicleModeration } from '../hooks/use-admin-vehicles';
import type { AdminVehicleDetail } from '../types';
import styles from './AdminVehicleDetailDrawer.module.css';
import { useAppFormat, type AppFormat } from '@/i18n/use-app-format';
import { LIST_SEPARATOR } from '@xeprime/domain';

export function AdminVehicleDetailDrawer({
  vehicleId,
  onClose,
}: {
  vehicleId: string | null;
  onClose: () => void;
}) {
  const t = useTranslations('AdminVehicles.drawer');
  const { data, isLoading, isError, refetch } = useAdminVehicle(vehicleId);

  return (
    <DetailDrawer
      title={data ? data.name : t('fallbackTitle')}
      size="md"
      open={Boolean(vehicleId)}
      onClose={onClose}
      loading={!isError && (isLoading || !data)}
      error={isError}
      errorTitle={t('loadError')}
      onRetry={() => void refetch()}
      extra={
        data ? (
          <StatusTag
            value={data.publicStatus as VehiclePublicStatus}
            meta={VEHICLE_PUBLIC_STATUS_META}
            group="vehiclePublicStatus"
          />
        ) : null
      }
    >
      {data ? <Body vehicle={data} /> : null}
    </DetailDrawer>
  );
}

function Body({ vehicle }: { vehicle: AdminVehicleDetail }) {
  const t = useTranslations('AdminVehicles.moderation');
  const tCommon = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const detail = useDetailItems();
  const { message } = App.useApp();
  const { has } = usePermissions();
  const moderation = useVehicleModeration(vehicle.id);
  const labels = useCatalogLabels();
  const [hideOpen, setHideOpen] = useState(false);
  const [reason, setReason] = useState('');

  const canModerate = has(PERMISSION.PLATFORM_VEHICLE_MODERATE);
  const isPublic = vehicle.publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC;
  const isHidden = vehicle.publicStatus === VEHICLE_PUBLIC_STATUS.HIDDEN;
  const trimmedReason = reason.trim();

  /*
   * Gỡ ẩn CHỈ trả lại trạng thái kiểm duyệt (ADR 0048 điều 4): nếu chủ xe đang tắt công tắc của
   * họ thì xe vẫn nằm ngoài chợ sau thao tác này. Người kiểm duyệt phải biết điều đó TRƯỚC khi
   * bấm và được nhắc lại sau khi bấm — nếu không, họ thấy `listingStatus` vẫn `hidden` và kết
   * luận rằng hệ thống hỏng.
   */
  const stillPausedByOwner = !vehicle.marketplaceEnabled;

  function submitHide() {
    if (!trimmedReason) return;
    moderation.mutate(
      { kind: 'hide', reason: trimmedReason },
      {
        onSuccess: () => {
          message.success(t('hideSuccess'));
          setHideOpen(false);
          setReason('');
        },
        onError: (err) => message.error(getErrorMessage(err)),
      },
    );
  }

  function submitUnhide() {
    moderation.mutate(
      { kind: 'unhide' },
      {
        onSuccess: () =>
          message.success(stillPausedByOwner ? t('unhideSuccessOwnerPaused') : t('unhideSuccess')),
        onError: (err) => message.error(getErrorMessage(err)),
      },
    );
  }

  return (
    <div>
      <Descriptions column={1} size="small" bordered items={detail(vehicle, labels, fmt)} />

      <div className={styles.actions}>
        {!canModerate ? (
          <div className={styles.hint}>{t('noPermission')}</div>
        ) : isPublic ? (
          <Button
            danger
            block
            icon={<EyeInvisibleOutlined />}
            loading={moderation.isPending}
            onClick={() => setHideOpen(true)}
          >
            {t('hide')}
          </Button>
        ) : isHidden ? (
          <Popconfirm
            title={t('unhideTitle')}
            description={stillPausedByOwner ? t('unhideNoteOwnerPaused') : t('unhideNote')}
            okText={t('unhideOk')}
            cancelText={tCommon('close')}
            onConfirm={submitUnhide}
          >
            <Button type="primary" block icon={<EyeOutlined />} loading={moderation.isPending}>
              {t('unhide')}
            </Button>
          </Popconfirm>
        ) : (
          <div className={styles.hint}>{t('unavailable')}</div>
        )}
      </div>

      <ResponsiveDialog
        title={t('hide')}
        open={hideOpen}
        size="sm"
        okText={t('hideOk')}
        cancelText={tCommon('cancel')}
        destructive
        okDisabled={!trimmedReason}
        confirmLoading={moderation.isPending}
        onOk={submitHide}
        onClose={() => setHideOpen(false)}
      >
        <p className={styles.note}>{t('hideNote')}</p>
        <Input.TextArea
          rows={3}
          maxLength={500}
          showCount
          value={reason}
          placeholder={t('reasonPlaceholder')}
          onChange={(e) => setReason(e.target.value)}
        />
      </ResponsiveDialog>
    </div>
  );
}

/**
 * Bảng thuộc tính của một xe trên màn kiểm duyệt.
 *
 * Là HOOK trả về hàm dựng (chứ không một hàm thuần như trước) vì mọi nhãn ở đây đã đi qua `t()`.
 * Ba dòng cuối cùng của khối trạng thái là phần thêm ngày 23/09/2026 và chúng đi thành một BỘ:
 *
 *  - **Bản ghi trên sàn** — `public_listings.status`, tức dữ liệu thô;
 *  - **Chủ xe cho hiển thị** — `marketplace_enabled`, CHỈ ĐỌC với nền tảng (ADR 0048 điều 4);
 *  - **Kết quả trên chợ** — phép gộp do SERVER suy, kèm LÝ DO khi đang ẩn.
 *
 * Thiếu hai dòng sau, người kiểm duyệt bỏ ẩn một chiếc xe rồi thấy "Trên sàn: Đã ẩn" và không
 * có gì giải thích tại sao — đúng cái kết luận "hệ thống lỗi" mà bộ ba này sinh ra để chặn.
 */
function useDetailItems() {
  const t = useTranslations('AdminVehicles.detail');
  const domainLabel = useDomainLabel();

  return (v: AdminVehicleDetail, labels: CatalogLabels, fmt: AppFormat) => {
    const specs = [
      labels.brandLabel(v.brand),
      v.model,
      v.manufactureYear ? String(v.manufactureYear) : null,
      v.seatCount ? t('seats', { count: v.seatCount }) : null,
      labels.fuelTypeLabel(v.fuelType),
    ]
      .filter(Boolean)
      .join(LIST_SEPARATOR);

    const empty = '—';
    const reason = v.marketplaceVisibilityReason as MarketplaceVisibilityReason;

    return [
      { key: 'code', label: t('code'), children: v.code },
      { key: 'plate', label: t('plate'), children: v.plateNumber ?? empty },
      {
        key: 'type',
        label: t('type'),
        children: `${domainLabel('vehicleType', v.vehicleType)} · ${serviceTypesLabel(v.serviceTypes ?? [])}`,
      },
      ...(specs ? [{ key: 'specs', label: t('specs'), children: specs }] : []),
      {
        key: 'tenant',
        label: t('tenant'),
        children: (
          <span className={styles.inline}>
            <Link href={shopPath.detail(v.tenantSlug)} target="_blank">
              {v.tenantName}
            </Link>
            <StatusTag
              value={v.tenantStatus as TenantStatus}
              meta={TENANT_STATUS_META}
              group="tenantStatus"
            />
          </span>
        ),
      },
      { key: 'owner', label: t('owner'), children: v.ownerName ?? empty },
      { key: 'province', label: t('province'), children: v.provinceName ?? empty },
      {
        key: 'operation',
        label: t('operation'),
        children: (
          <StatusTag
            value={v.operationStatus as VehicleOperationStatus}
            meta={VEHICLE_OPERATION_STATUS_META}
            group="vehicleOperationStatus"
          />
        ),
      },
      {
        key: 'listing',
        label: t('listing'),
        children: v.listingStatus ? (
          <StatusTag
            value={v.listingStatus as ListingStatus}
            meta={LISTING_STATUS_META}
            group="listingStatus"
          />
        ) : (
          t('notListed')
        ),
      },
      {
        key: 'ownerVisibility',
        label: (
          <span className={styles.inline}>
            {t('ownerVisibility')}
            {/* Dấu "i" nói rõ đây là ô CHỈ ĐỌC với nền tảng — không có endpoint admin nào ghi nó. */}
            <InfoHint label={t('ownerVisibilityHintLabel')} content={t('ownerVisibilityHint')} />
          </span>
        ),
        children: (
          <Tag color={v.marketplaceEnabled ? STATUS_COLOR.SUCCESS : STATUS_COLOR.NEUTRAL}>
            {v.marketplaceEnabled ? t('ownerVisibilityOn') : t('ownerVisibilityOff')}
          </Tag>
        ),
      },
      {
        key: 'effective',
        label: t('effective'),
        children: v.isMarketplaceVisible ? (
          <span className={styles.inline}>
            <Tag color={STATUS_COLOR.SUCCESS}>{t('effectiveVisible')}</Tag>
            <Link href={listingPath.detail(v.id)} target="_blank">
              {t('viewListing')}
            </Link>
          </span>
        ) : (
          <span className={styles.inline}>
            <Tag color={STATUS_COLOR.NEUTRAL}>{t('effectiveHidden')}</Tag>
            {/* LÝ DO hiệu lực — thứ trả lời "gỡ ẩn xong rồi sao vẫn không thấy xe". */}
            <StatusTag
              value={reason}
              meta={MARKETPLACE_VISIBILITY_REASON_META}
              group="marketplaceVisibility"
            />
          </span>
        ),
      },
      {
        key: 'prices',
        label: t('prices'),
        children: `${fmt.money(v.weekdayPrice)} · ${fmt.money(v.weekendPrice)} · ${fmt.money(v.hourlyPrice)}`,
      },
      { key: 'bookings', label: t('bookings'), children: String(v.bookingCount) },
      { key: 'reviews', label: t('reviews'), children: String(v.reviewCount) },
      { key: 'created', label: t('created'), children: fmt.date(v.createdAt) },
      { key: 'updated', label: t('updated'), children: fmt.date(v.updatedAt) },
    ];
  };
}
