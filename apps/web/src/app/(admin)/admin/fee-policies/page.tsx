'use client';

import { EditOutlined, PlusOutlined, PoweroffOutlined, DeleteOutlined } from '@ant-design/icons';
import { App, Button } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { FEE_POLICY_STATUS, FEE_POLICY_STATUS_META, type FeePolicyStatus } from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { FeePolicyFormModal } from '@/features/fee-policies/components/FeePolicyFormModal';
import {
  useActivateFeePolicy,
  useDiscardFeePolicyDraft,
  useFeePolicies,
} from '@/features/fee-policies/hooks/use-fee-policies';
import type { FeePolicy } from '@/features/fee-policies/types';

const MIN_TABLE_WIDTH = 900;

/**
 * Quản trị chính sách phí có phiên bản — ADR 0028 điều 2–3, ADR 0029 (R3).
 *
 * Đúng MỘT bản `active` tại mọi thời điểm; kích hoạt một bản mới tự lưu trữ bản cũ trong cùng
 * transaction (server). Sửa số ở đây KHÔNG hồi tố — đơn/hold đã tạo giữ snapshot riêng.
 */
export default function AdminFeePoliciesPage() {
  const t = useTranslations('FeePolicies');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();

  const { data, isError, isFetching, refetch } = useFeePolicies();
  const activate = useActivateFeePolicy();
  const discard = useDiscardFeePolicyDraft();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FeePolicy | null>(null);

  const items = data ?? [];

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(policy: FeePolicy) {
    if (policy.status !== FEE_POLICY_STATUS.DRAFT) return;
    setEditing(policy);
    setFormOpen(true);
  }

  function handleActivate(policy: FeePolicy) {
    activate.mutate(policy.id, {
      onSuccess: () => message.success(t('page.activateSuccess')),
      onError: (err) => message.error(errorMessage(err)),
    });
  }

  function handleDiscard(policy: FeePolicy) {
    discard.mutate(policy.id, {
      onSuccess: () => message.success(t('page.discardSuccess')),
      onError: (err) => message.error(errorMessage(err)),
    });
  }

  const createButton = (
    <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
      {t('page.createButton')}
    </Button>
  );

  const columns: DataTableColumn<FeePolicy>[] = [
    {
      title: t('page.columns.name'),
      key: 'name',
      render: (_, p) => (
        <div>
          <div>{p.name}</div>
          <div>{t('page.version', { version: p.version })}</div>
        </div>
      ),
    },
    {
      title: t('page.columns.serviceFee'),
      key: 'serviceFee',
      width: 110,
      align: 'right',
      render: (_, p) => `${p.serviceFeePercent}%`,
    },
    {
      title: t('page.columns.holdMinAmount'),
      key: 'holdMinAmount',
      width: 130,
      align: 'right',
      render: (_, p) => fmt.money(p.holdMinAmount),
    },
    {
      title: t('page.columns.freeCancelHours'),
      key: 'freeCancelHours',
      width: 110,
      align: 'right',
      render: (_, p) => t('page.hours', { hours: p.freeCancelHours }),
    },
    {
      title: t('page.columns.status'),
      key: 'status',
      width: 120,
      render: (_, p) => (
        <StatusTag value={p.status as FeePolicyStatus} meta={FEE_POLICY_STATUS_META} group="feePolicyStatus" />
      ),
    },
    {
      title: t('page.columns.activatedAt'),
      key: 'activatedAt',
      width: 160,
      render: (_, p) => (p.activatedAt ? fmt.dateTime(p.activatedAt) : tCommon('labels.emptyValue')),
    },
    actionColumn<FeePolicy>(
      (p) => [
        {
          key: 'edit',
          label: t('page.editAction'),
          icon: <EditOutlined />,
          hidden: p.status !== FEE_POLICY_STATUS.DRAFT,
          onClick: () => openEdit(p),
        },
        {
          key: 'activate',
          label: t('page.activateAction'),
          icon: <PoweroffOutlined />,
          hidden: p.status !== FEE_POLICY_STATUS.DRAFT,
          disabled: p.activationBlockers.length > 0,
          loading: activate.isPending && activate.variables === p.id,
          confirm: {
            title: t('page.activateConfirmTitle'),
            okText: t('page.activateConfirmOk'),
            cancelText: tCommon('actions.cancel'),
          },
          onClick: () => handleActivate(p),
        },
        {
          key: 'discard',
          label: t('page.discardAction'),
          icon: <DeleteOutlined />,
          danger: true,
          hidden: p.status !== FEE_POLICY_STATUS.DRAFT,
          loading: discard.isPending && discard.variables === p.id,
          confirm: {
            title: t('page.discardConfirmTitle'),
            okText: t('page.discardConfirmOk'),
            cancelText: tCommon('actions.cancel'),
          },
          onClick: () => handleDiscard(p),
        },
      ],
      { width: 280, maxInline: 2 },
    ),
  ];

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

      <FeePolicyFormModal key={editing?.id ?? 'new'} open={formOpen} policy={editing} onClose={() => setFormOpen(false)} />
    </div>
  );
}
