'use client';

import { CustomerServiceOutlined, LockOutlined, UnlockOutlined } from '@ant-design/icons';
import { App, Button, Descriptions, Input, Popconfirm } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  PERMISSION,
  TENANT_STATUS,
  TENANT_STATUS_META,
  type TenantStatus,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { StatusTag } from '@/components/data-display/StatusTag';
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { TenantPlanSection } from '@/features/admin-plans/components/TenantPlanSection';
import { StartSupportDialog } from '@/features/tenant-support/components/StartSupportDialog';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useAdminTenant, useTenantActions } from '../hooks/use-admin-tenants';
import type { AdminTenantDetail } from '../types';
import styles from './AdminTenantDetailDrawer.module.css';

export function AdminTenantDetailDrawer({
  tenantId,
  onClose,
}: {
  tenantId: string | null;
  onClose: () => void;
}) {
  const t = useTranslations('AdminTenants.detail');
  const { data, isLoading } = useAdminTenant(tenantId);

  return (
    <DetailDrawer
      title={data ? data.name : t('fallbackTitle')}
      size="md"
      open={Boolean(tenantId)}
      onClose={onClose}
      loading={isLoading || !data}
      extra={
        data ? (
          <StatusTag
            value={data.status as TenantStatus}
            meta={TENANT_STATUS_META}
            group="tenantStatus"
          />
        ) : null
      }
    >
      {data ? <Body tenant={data} /> : null}
    </DetailDrawer>
  );
}

function Body({ tenant }: { tenant: AdminTenantDetail }) {
  const t = useTranslations('AdminTenants.detail');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();
  const actions = useTenantActions(tenant.id);
  const [lockOpen, setLockOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [reason, setReason] = useState('');

  const isActive = tenant.status === TENANT_STATUS.ACTIVE;
  const isSuspended = tenant.status === TENANT_STATUS.SUSPENDED;
  // Phiên hỗ trợ là quyền RIÊNG (ADR 0050), không suy từ `platform.tenants.manage`.
  const canSupport = has(PERMISSION.PLATFORM_TENANT_SUPPORT_VIEW);
  // Khoá/mở khoá là quyền QUẢN LÝ — người chỉ xem (vai support) không thấy nút nào để rồi bị 403.
  const canManage = has(PERMISSION.PLATFORM_TENANT_MANAGE);

  function submitLock() {
    actions.mutate(
      { kind: 'lock', reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          message.success(t('lock.done'));
          setLockOpen(false);
          setReason('');
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  function submitUnlock() {
    actions.mutate(
      { kind: 'unlock' },
      {
        onSuccess: () => message.success(t('unlock.done')),
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  return (
    <div>
      <Descriptions column={1} size="small" bordered items={useDetailItems(tenant)} />

      <TenantPlanSection tenantId={tenant.id} currentPlan={tenant.currentPlan ?? null} />

      <div className={styles.actions}>
        {canSupport ? (
          <Button
            type="primary"
            icon={<CustomerServiceOutlined />}
            block
            className={styles.supportAction}
            onClick={() => setSupportOpen(true)}
          >
            {t('support.open')}
          </Button>
        ) : null}
        {!canManage ? null : isActive ? (
          <Button
            danger
            icon={<LockOutlined />}
            block
            loading={actions.isPending}
            onClick={() => setLockOpen(true)}
          >
            {t('lock.button')}
          </Button>
        ) : isSuspended ? (
          <Popconfirm
            title={t('unlock.confirm')}
            okText={t('unlock.ok')}
            cancelText={t('unlock.cancel')}
            onConfirm={submitUnlock}
          >
            <Button type="primary" icon={<UnlockOutlined />} block loading={actions.isPending}>
              {t('unlock.button')}
            </Button>
          </Popconfirm>
        ) : (
          <div className={styles.hint}>{t('lock.unavailable')}</div>
        )}
      </div>

      <ResponsiveDialog
        title={t('lock.title')}
        open={lockOpen}
        size="sm"
        okText={t('lock.ok')}
        cancelText={t('lock.cancel')}
        destructive
        confirmLoading={actions.isPending}
        onOk={submitLock}
        onClose={() => setLockOpen(false)}
      >
        <p className={styles.lockNote}>{t('lock.note')}</p>
        <Input.TextArea
          rows={3}
          maxLength={1000}
          showCount
          value={reason}
          placeholder={t('lock.reasonPlaceholder')}
          aria-label={t('lock.reasonPlaceholder')}
          onChange={(e) => setReason(e.target.value)}
        />
      </ResponsiveDialog>

      {canSupport ? (
        <StartSupportDialog
          tenantId={tenant.id}
          tenantName={tenant.name}
          open={supportOpen}
          onClose={() => setSupportOpen(false)}
        />
      ) : null}
    </div>
  );
}

function useDetailItems(tenant: AdminTenantDetail) {
  const t = useTranslations('AdminTenants.detail.fields');
  const tCommon = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const empty = tCommon('emptyValue');

  return [
    { key: 'code', label: t('code'), children: tenant.code },
    {
      key: 'type',
      label: t('type'),
      children: domainLabel('tenantType', tenant.tenantType, tenant.tenantType),
    },
    { key: 'owner', label: t('owner'), children: tenant.ownerName ?? empty },
    {
      key: 'ownerContact',
      label: t('ownerContact'),
      children: [tenant.ownerPhone, tenant.ownerEmail].filter(Boolean).join(LIST_SEPARATOR) || empty,
    },
    { key: 'phone', label: t('phone'), children: tenant.phone ?? empty },
    { key: 'province', label: t('province'), children: tenant.provinceName ?? empty },
    { key: 'address', label: t('address'), children: tenant.address ?? empty },
    ...(tenant.taxCode ? [{ key: 'tax', label: t('taxCode'), children: tenant.taxCode }] : []),
    ...(tenant.businessLicenseNo
      ? [{ key: 'license', label: t('businessLicense'), children: tenant.businessLicenseNo }]
      : []),
    { key: 'vehicles', label: t('vehicleCount'), children: String(tenant.vehicleCount) },
    { key: 'bookings', label: t('bookingCount'), children: String(tenant.bookingCount) },
    { key: 'created', label: t('createdAt'), children: fmt.date(tenant.createdAt) },
  ];
}
