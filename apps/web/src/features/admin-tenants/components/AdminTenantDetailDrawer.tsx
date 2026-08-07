'use client';

import { LockOutlined, UnlockOutlined } from '@ant-design/icons';
import { App, Button, Descriptions, Input, Popconfirm } from 'antd';
import { useState } from 'react';
import { TENANT_STATUS, TENANT_STATUS_META, TENANT_TYPE_LABEL, type TenantStatus, type TenantType } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { formatDate } from '@/lib/datetime';
import { getErrorMessage } from '@/services/api-client';
import { TenantPlanSection } from '@/features/admin-plans/components/TenantPlanSection';
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
  const { data, isLoading } = useAdminTenant(tenantId);

  return (
    <DetailDrawer
      title={data ? data.name : 'Gian hàng'}
      size="md"
      open={Boolean(tenantId)}
      onClose={onClose}
      loading={isLoading || !data}
      extra={data ? <StatusTag value={data.status as TenantStatus} meta={TENANT_STATUS_META} /> : null}
    >
      {data ? <Body tenant={data} /> : null}
    </DetailDrawer>
  );
}

function Body({ tenant }: { tenant: AdminTenantDetail }) {
  const { message } = App.useApp();
  const actions = useTenantActions(tenant.id);
  const [lockOpen, setLockOpen] = useState(false);
  const [reason, setReason] = useState('');

  const isActive = tenant.status === TENANT_STATUS.ACTIVE;
  const isSuspended = tenant.status === TENANT_STATUS.SUSPENDED;

  function submitLock() {
    actions.mutate(
      { kind: 'lock', reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          message.success('Đã khoá gian hàng');
          setLockOpen(false);
          setReason('');
        },
        onError: (err) => message.error(getErrorMessage(err)),
      },
    );
  }

  function submitUnlock() {
    actions.mutate(
      { kind: 'unlock' },
      {
        onSuccess: () => message.success('Đã mở khoá gian hàng'),
        onError: (err) => message.error(getErrorMessage(err)),
      },
    );
  }

  return (
    <div>
      <Descriptions column={1} size="small" bordered items={detailItems(tenant)} />

      <TenantPlanSection tenantId={tenant.id} currentPlan={tenant.currentPlan ?? null} />

      <div className={styles.actions}>
        {isActive ? (
          <Button danger icon={<LockOutlined />} block loading={actions.isPending} onClick={() => setLockOpen(true)}>
            Khoá gian hàng
          </Button>
        ) : isSuspended ? (
          <Popconfirm
            title="Mở khoá gian hàng này?"
            okText="Mở khoá"
            cancelText="Đóng"
            onConfirm={submitUnlock}
          >
            <Button type="primary" icon={<UnlockOutlined />} block loading={actions.isPending}>
              Mở khoá gian hàng
            </Button>
          </Popconfirm>
        ) : (
          <div className={styles.hint}>Chỉ khoá/mở khoá gian hàng đang hoạt động hoặc bị khoá.</div>
        )}
      </div>

      <ResponsiveDialog
        title="Khoá gian hàng"
        open={lockOpen}
        size="sm"
        okText="Khoá"
        cancelText="Huỷ"
        destructive
        confirmLoading={actions.isPending}
        onOk={submitLock}
        onClose={() => setLockOpen(false)}
      >
        <p className={styles.lockNote}>
          Xe của gian hàng sẽ bị ẩn khỏi marketplace ngay lập tức. Nhập lý do (tuỳ chọn) để lưu vào
          nhật ký.
        </p>
        <Input.TextArea
          rows={3}
          maxLength={1000}
          showCount
          value={reason}
          placeholder="Lý do khoá…"
          onChange={(e) => setReason(e.target.value)}
        />
      </ResponsiveDialog>
    </div>
  );
}

function detailItems(t: AdminTenantDetail) {
  return [
    { key: 'code', label: 'Mã', children: t.code },
    { key: 'type', label: 'Loại', children: TENANT_TYPE_LABEL[t.tenantType as TenantType] ?? t.tenantType },
    { key: 'owner', label: 'Chủ shop', children: t.ownerName ?? '—' },
    { key: 'ownerContact', label: 'Liên hệ chủ', children: [t.ownerPhone, t.ownerEmail].filter(Boolean).join(' · ') || '—' },
    { key: 'phone', label: 'SĐT shop', children: t.phone ?? '—' },
    { key: 'province', label: 'Tỉnh/TP', children: t.provinceName ?? '—' },
    { key: 'address', label: 'Địa chỉ', children: t.address ?? '—' },
    ...(t.taxCode ? [{ key: 'tax', label: 'MST', children: t.taxCode }] : []),
    ...(t.businessLicenseNo ? [{ key: 'license', label: 'GPKD', children: t.businessLicenseNo }] : []),
    { key: 'vehicles', label: 'Số xe', children: String(t.vehicleCount) },
    { key: 'bookings', label: 'Số đơn', children: String(t.bookingCount) },
    { key: 'created', label: 'Ngày tạo', children: formatDate(t.createdAt) },
  ];
}
