'use client';

import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  PoweroffOutlined,
} from '@ant-design/icons';
import { Alert, App, Button } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { LIST_SEPARATOR } from '@xeprime/domain';
import {
  FEE_POLICY_STATUS,
  FEE_POLICY_STATUS_META,
  parseTaxRates,
  taxRateTotalPercent,
  type FeePolicyStatus,
} from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { InfoHint } from '@/components/data-display/InfoHint';
import { StatusTag } from '@/components/data-display/StatusTag';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { QueueViewSwitch } from '@/features/platform-money/components/QueueViewSwitch';
import { useUrlFilters } from '@/hooks/use-url-filters';
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
import { TAX_SERVICE_TYPES } from '@/features/fee-policies/form';
import { useFeePolicyFormat } from '@/features/fee-policies/hooks/use-fee-policy-format';
import {
  FEE_POLICY_VIEW,
  activeFeePolicy,
  countFeePoliciesByView,
  feePoliciesInView,
  feePolicyViewOf,
  parseFeePolicyFilters,
  type FeePolicyFilters,
  type FeePolicyView,
} from '@/features/fee-policies/policy-views';
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
 * chục dòng — server trả trọn danh sách. Bảng chia theo SỔ (`policy-views.ts`): mặc định chỉ bản
 * đang áp dụng, bản nháp và lịch sử lưu trữ ở hai sổ riêng — trải phẳng mọi phiên bản làm người
 * đọc tưởng nhiều chính sách đang chạy song song.
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
  const { filters, setFilters } = useUrlFilters<FeePolicyFilters>(parseFeePolicyFilters);

  const [formTarget, setFormTarget] = useState<FormTarget | null>(null);
  // Giữ MÃ chứ không giữ bản ghi: panel luôn đọc bản mới nhất sau khi danh sách tải lại.
  const [viewingId, setViewingId] = useState<string | null>(null);

  const items = data ?? [];
  const view = feePolicyViewOf(filters);
  const rows = feePoliciesInView(items, view);
  const counts = countFeePoliciesByView(items);
  const active = activeFeePolicy(items);
  // Panel tìm trong TOÀN BỘ danh sách: kích hoạt một nháp đang mở làm nó rời sổ nháp, panel vẫn đứng.
  const viewing = viewingId ? (items.find((p) => p.id === viewingId) ?? null) : null;

  const showView = (next: FeePolicyView) =>
    setFilters({ view: next === FEE_POLICY_VIEW.ACTIVE ? undefined : next });

  function handleActivate(policy: FeePolicy) {
    if (activate.isPending) return;
    activate.mutate(policy.id, {
      onSuccess: () => {
        message.success(t('page.activateSuccess'));
        // Bản vừa kích hoạt rời sổ nháp — đưa người dùng tới nơi nó đang ở.
        showView(FEE_POLICY_VIEW.ACTIVE);
      },
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
      // Nấc lũy tiến chỉ áp cho tuyến hoa hồng; gian hàng có gói được miễn (H = 0 — ADR 0064 điều 3).
      title: (
        <span className={styles.columnTitle}>
          {t('page.columns.commissionTiers')}
          <InfoHint label={t('commissionScope.hintLabel')} content={t('commissionScope.hint')} />
        </span>
      ),
      key: 'commissionTiers',
      width: 200,
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
      // Thuế khấu trừ theo loại dịch vụ (ADR 0068): "7% · 7% · 4,5%", chi tiết GTGT/TNCN ở tooltip.
      title: t('page.columns.tax'),
      key: 'tax',
      width: 180,
      render: (_, p) => {
        if (!p.taxEnabled) return t('page.taxOff');
        const rates = parseTaxRates(p.taxRates);
        if (!rates) {
          return p.taxPercent != null
            ? t('page.taxLegacy', { value: p.taxPercent })
            : tCommon('labels.emptyValue');
        }
        return (
          <span className={styles.columnTitle}>
            {pf.taxRatesSummary(rates)}
            <InfoHint
              label={t('page.taxRatesHintLabel')}
              content={TAX_SERVICE_TYPES.map((type) => (
                <div key={type}>
                  {t('page.taxRateLine', {
                    service: domainLabel('serviceType', type),
                    vat: rates[type].vatPercent,
                    pit: rates[type].pitPercent,
                    total: taxRateTotalPercent(rates[type]),
                  })}
                </div>
              ))}
            />
          </span>
        );
      },
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

      <QueueViewSwitch<FeePolicyView>
        label={t('page.view.label')}
        value={view}
        options={[
          { value: FEE_POLICY_VIEW.ACTIVE, label: t('page.view.active') },
          { value: FEE_POLICY_VIEW.DRAFT, label: t('page.view.draft', { count: counts.draft }) },
          {
            value: FEE_POLICY_VIEW.ARCHIVED,
            label: t('page.view.archived', { count: counts.archived }),
          },
        ]}
        onChange={showView}
      />

      {view === FEE_POLICY_VIEW.ACTIVE && counts.draft > 0 ? (
        <Alert
          type="info"
          showIcon
          className={styles.notice}
          title={t('page.draftPending', { count: counts.draft })}
          action={
            <Button size="small" onClick={() => showView(FEE_POLICY_VIEW.DRAFT)}>
              {t('page.draftPendingAction')}
            </Button>
          }
        />
      ) : null}
      {view === FEE_POLICY_VIEW.ARCHIVED && rows.length > 0 ? (
        <Alert
          type="info"
          showIcon
          className={styles.notice}
          title={
            active
              ? t('page.archivedHint', { name: active.name, version: active.version })
              : t('page.archivedHintNoActive')
          }
          action={
            active ? (
              <Button size="small" onClick={() => showView(FEE_POLICY_VIEW.ACTIVE)}>
                {t('page.backToActive')}
              </Button>
            ) : undefined
          }
        />
      ) : null}

      <DataTable<FeePolicy>
        label={t('page.title')}
        columns={columns}
        items={rows}
        rowKey={(row) => row.id}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={
          isError && !data ? { title: t('page.loadError'), onRetry: () => void refetch() } : null
        }
        empty={
          items.length === 0
            ? { title: t('page.empty'), action: createButton }
            : view === FEE_POLICY_VIEW.DRAFT
              ? { title: t('page.emptyDraft'), action: createButton }
              : view === FEE_POLICY_VIEW.ARCHIVED
                ? { title: t('page.emptyArchived') }
                : { title: t('page.emptyActive'), action: createButton }
        }
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
