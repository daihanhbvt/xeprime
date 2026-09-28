'use client';

import { InfoCircleOutlined, LockOutlined, UnlockOutlined } from '@ant-design/icons';
import { App, Button, Input, Popconfirm, Spin } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PERMISSION, TENANT_STATUS } from '@xeprime/types';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { TenantPlanSection } from '@/features/admin-plans/components/TenantPlanSection';
import { usePermissions } from '@/hooks/use-permissions';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { useAdminTenant, useTenantActions } from '../hooks/use-admin-tenants';
import styles from './PartnerDetail.module.css';

/**
 * "Thao tác quản trị nền tảng" — NGOẠI LỆ có chủ đích của drawer chỉ đọc (quyết định 28/09/2026).
 *
 * Hai việc ở đây là quyết định CỦA NỀN TẢNG về đối tác, không phải sửa dữ liệu thay chủ xe:
 *  - khoá / mở khoá (`platform.tenants.manage`, có audit — `PlatformTenantsService`);
 *  - gán / gia hạn / huỷ gói (`platform.billing.manage`) — đường DUY NHẤT bán bậc `salesOnly`
 *    (ADR 0041 điều 5).
 * Phiên hỗ trợ cấm cả hai (ADR 0050 §13), nên chúng không thể dời vào đó. Chúng sống trong hộp thoại
 * riêng, mở từ menu "…", để các tab của drawer vẫn không có một nút ghi nào.
 */
export function PartnerAdminDialog({
  tenantId,
  tenantName,
  open,
  onClose,
}: {
  tenantId: string;
  tenantName: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('AdminTenants.partnerDetail.admin');
  const tTab = useTranslations('AdminTenants.partnerDetail');
  // Chi tiết gian hàng mang gói HIỆN HÀNH cho khối gói; chỉ tải khi hộp thoại mở.
  const detail = useAdminTenant(open ? tenantId : null);

  return (
    <ResponsiveDialog
      title={t('title', { name: tenantName })}
      open={open}
      size="lg"
      footer={null}
      onClose={onClose}
    >
      <div className={styles.stack}>
        <div className={cx(styles.banner, styles.bannerInfo)}>
          <InfoCircleOutlined className={styles.bannerIcon} />
          <span>{t('note')}</span>
        </div>
        {detail.data ? (
          <>
            <StatusSection tenantId={tenantId} status={detail.data.status} />
            <TenantPlanSection tenantId={tenantId} currentPlan={detail.data.currentPlan ?? null} />
          </>
        ) : detail.isError ? (
          <span className={styles.muted}>{tTab('states.loadError')}</span>
        ) : (
          <Spin />
        )}
      </div>
    </ResponsiveDialog>
  );
}

function StatusSection({ tenantId, status }: { tenantId: string; status: string }) {
  const t = useTranslations('AdminTenants.detail');
  const tAdmin = useTranslations('AdminTenants.partnerDetail.admin');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();
  const actions = useTenantActions(tenantId);
  const [lockOpen, setLockOpen] = useState(false);
  const [reason, setReason] = useState('');

  // Khoá/mở khoá là quyền QUẢN LÝ — người thiếu quyền không thấy nút nào để rồi bị 403.
  if (!has(PERMISSION.PLATFORM_TENANT_MANAGE)) return null;
  const isActive = status === TENANT_STATUS.ACTIVE;
  const isSuspended = status === TENANT_STATUS.SUSPENDED;

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

  return (
    <section className={styles.stack}>
      <strong>{tAdmin('statusTitle')}</strong>
      {isActive ? (
        <Button
          danger
          icon={<LockOutlined />}
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
          onConfirm={() =>
            actions.mutate(
              { kind: 'unlock' },
              {
                onSuccess: () => message.success(t('unlock.done')),
                onError: (err) => message.error(errorMessage(err)),
              },
            )
          }
        >
          <Button type="primary" icon={<UnlockOutlined />} loading={actions.isPending}>
            {t('unlock.button')}
          </Button>
        </Popconfirm>
      ) : (
        <span className={styles.muted}>{t('lock.unavailable')}</span>
      )}
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
        <p className={styles.bio}>{t('lock.note')}</p>
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
    </section>
  );
}
