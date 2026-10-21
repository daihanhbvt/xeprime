'use client';

import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  PoweroffOutlined,
} from '@ant-design/icons';
import { App, Button } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { FEE_POLICY_STATUS, FEE_POLICY_STATUS_META, type FeePolicyStatus } from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { FeePolicyDetailDrawer } from '@/features/fee-policies/components/FeePolicyDetailDrawer';
import { FeePolicyFormModal } from '@/features/fee-policies/components/FeePolicyFormModal';
import {
  useActivateFeePolicy,
  useDiscardFeePolicyDraft,
  useFeePolicies,
} from '@/features/fee-policies/hooks/use-fee-policies';
import { useFeePolicyFormat } from '@/features/fee-policies/hooks/use-fee-policy-format';
import type { FeePolicy } from '@/features/fee-policies/types';

import styles from './page.module.css';

const MIN_TABLE_WIDTH = 1180;

/** Form đang mở: tạo mới, sửa một bản nháp, hay nhân bản một phiên bản thành nháp mới. */
type FormTarget =
  | { kind: 'create' }
  | { kind: 'edit'; policy: FeePolicy }
  | { kind: 'duplicate'; source: FeePolicy };

/**
 * Quản trị chính sách phí có phiên bản — ADR 0028 điều 2–3, ADR 0029 (R3), luồng tiền v2.
 *
 * Đúng MỘT bản `active` tại mọi thời điểm; kích hoạt một bản mới tự lưu trữ bản cũ trong cùng
 * transaction (server). Sửa số ở đây KHÔNG hồi tố — đơn/hold đã tạo giữ snapshot riêng.
 *
 * Danh sách không phân trang: mỗi lần đổi số là MỘT phiên bản, nên cả vòng đời sản phẩm chỉ có vài
 * chục dòng — server trả trọn danh sách.
 */
export default function AdminFeePoliciesPage() {
  const t = useTranslations('FeePolicies');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const pf = useFeePolicyFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();

  const { data, isError, isFetching, refetch } = useFeePolicies();
  const activate = useActivateFeePolicy();
  const discard = useDiscardFeePolicyDraft();

  const [formTarget, setFormTarget] = useState<FormTarget | null>(null);
  // Giữ MÃ chứ không giữ bản ghi: panel luôn đọc bản mới nhất sau khi danh sách tải lại.
  const [viewingId, setViewingId] = useState<string | null>(null);

  const items = data ?? [];
  const viewing = viewingId ? (items.find((p) => p.id === viewingId) ?? null) : null;

  function handleActivate(policy: FeePolicy) {
    if (activate.isPending) return;
    activate.mutate(policy.id, {
      onSuccess: () => message.success(t('page.activateSuccess')),
      onError: (err) => message.error(errorMessage(err)),
    });
  }

  function handleDiscard(policy: FeePolicy) {
    if (discard.isPending) return;
    discard.mutate(policy.id, {
      onSuccess: () => {
        message.success(t('page.discardSuccess'));
        if (viewingId === policy.id) setViewingId(null);
      },
      onError: (err) => message.error(errorMessage(err)),
    });
  }

  const createButton = (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormTarget({ kind: 'create' })}>
      {t('page.createButton')}
    </Button>
  );

  const columns: DataTableColumn<FeePolicy>[] = [
    {
      title: t('page.columns.name'),
      key: 'name',
      render: (_, p) => (
        <div className={styles.nameCell}>
          <span className={styles.name}>{p.name}</span>
          <span className={styles.sub}>{t('page.version', { version: p.version })}</span>
        </div>
      ),
    },
    {
      title: t('page.columns.platformFee'),
      key: 'platformFee',
      width: 190,
      align: 'right',
      render: (_, p) => pf.perVehicle(p.customerPlatformFee),
    },
    {
      title: t('page.columns.commissionTiers'),
      key: 'commissionTiers',
      width: 170,
      render: (_, p) => pf.tierSummary(p.ownerCommissionTiers) || tCommon('labels.emptyValue'),
    },
    {
      title: t('page.columns.depositPercent'),
      key: 'depositPercent',
      width: 110,
      align: 'right',
      render: (_, p) => pf.percent(p.depositPercent),
    },
    {
      title: t('page.columns.insurance'),
      key: 'insurance',
      width: 170,
      render: (_, p) => {
        const on = [
          p.vehicleProtectionEnabled ? t('page.insuranceVehicle') : null,
          p.tripInsuranceEnabled ? t('page.insurancePersonal') : null,
        ].filter(Boolean);
        return on.length > 0 ? on.join(LIST_SEPARATOR) : t('page.insuranceOff');
      },
    },
    {
      title: t('page.columns.tax'),
      key: 'tax',
      width: 110,
      align: 'right',
      render: (_, p) =>
        p.taxEnabled && p.taxPercent != null ? pf.percent(p.taxPercent) : t('page.taxOff'),
    },
    {
      title: t('page.columns.status'),
      key: 'status',
      width: 130,
      render: (_, p) => (
        <StatusTag value={p.status as FeePolicyStatus} meta={FEE_POLICY_STATUS_META} group="feePolicyStatus" />
      ),
    },
    {
      title: t('page.columns.activatedAt'),
      key: 'activatedAt',
      width: 150,
      render: (_, p) => fmt.dateTime(p.activatedAt),
    },
    actionColumn<FeePolicy>(
      (p) => {
        const isDraft = p.status === FEE_POLICY_STATUS.DRAFT;
        return [
          {
            key: 'edit',
            label: t('page.editAction'),
            icon: <EditOutlined />,
            hidden: !isDraft,
            onClick: () => setFormTarget({ kind: 'edit', policy: p }),
          },
          {
            key: 'activate',
            label: t('page.activateAction'),
            icon: <PoweroffOutlined />,
            hidden: !isDraft,
            disabled: p.activationBlockers.length > 0,
            disabledReason: p.activationBlockers
              .map((code) => domainLabel('feePolicyActivationBlocker', code))
              .join(LIST_SEPARATOR),
            loading: activate.isPending && activate.variables === p.id,
            confirm: {
              title: t('page.activateConfirmTitle'),
              okText: t('page.activateConfirmOk'),
              cancelText: tCommon('actions.cancel'),
            },
            onClick: () => handleActivate(p),
          },
          {
            key: 'view',
            label: t('page.viewAction'),
            icon: <EyeOutlined />,
            onClick: () => setViewingId(p.id),
          },
          {
            key: 'duplicate',
            label: t('page.duplicateAction'),
            icon: <CopyOutlined />,
            onClick: () => setFormTarget({ kind: 'duplicate', source: p }),
          },
          {
            key: 'discard',
            label: t('page.discardAction'),
            icon: <DeleteOutlined />,
            danger: true,
            hidden: !isDraft,
            loading: discard.isPending && discard.variables === p.id,
            confirm: {
              title: t('page.discardConfirmTitle'),
              okText: t('page.discardConfirmOk'),
              cancelText: tCommon('actions.cancel'),
            },
            onClick: () => handleDiscard(p),
          },
        ];
      },
      { width: 280, maxInline: 2 },
    ),
  ];

  const formKey =
    formTarget == null
      ? 'closed'
      : formTarget.kind === 'edit'
        ? `edit-${formTarget.policy.id}`
        : formTarget.kind === 'duplicate'
          ? `duplicate-${formTarget.source.id}`
          : 'create';

  return (
    <div>
      <ManagePageHeader title={t('page.title')} subtitle={t('page.subtitle')} extra={createButton} />

      <DataTable<FeePolicy>
        label={t('page.title')}
        columns={columns}
        items={items}
        rowKey={(row) => row.id}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={
          isError && !data ? { title: t('page.loadError'), onRetry: () => void refetch() } : null
        }
        empty={{ title: t('page.empty'), action: createButton }}
      />

      {formTarget ? (
        <FeePolicyFormModal
          key={formKey}
          open
          policy={formTarget.kind === 'edit' ? formTarget.policy : null}
          duplicateFrom={formTarget.kind === 'duplicate' ? formTarget.source : null}
          onClose={() => setFormTarget(null)}
        />
      ) : null}

      <FeePolicyDetailDrawer policy={viewing} onClose={() => setViewingId(null)} />
    </div>
  );
}
