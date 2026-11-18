'use client';

import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  PoweroffOutlined,
} from '@ant-design/icons';
import { Alert, App, Button, Popconfirm, Skeleton, Space } from 'antd';
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
import { EmptyState } from '@/components/feedback/EmptyState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { QueueViewSwitch } from '@/features/platform-money/components/QueueViewSwitch';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { FeePolicyDetailDrawer } from '@/features/fee-policies/components/FeePolicyDetailDrawer';
import {
  FeePolicyFormModal,
  type FeePolicySaveResult,
} from '@/features/fee-policies/components/FeePolicyFormModal';
import { FeePolicySummary } from '@/features/fee-policies/components/FeePolicySummary';
import {
  useActivateFeePolicy,
  useDiscardFeePolicyDraft,
  useFeePolicies,
} from '@/features/fee-policies/hooks/use-fee-policies';
import {
  FEE_POLICY_FORM_TAB,
  FEE_POLICY_VEHICLE_TYPES,
  TAX_SERVICE_TYPES,
  type FeePolicyFormTab,
} from '@/features/fee-policies/form';
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

/** Form đang mở: sửa một bản nháp, soạn nháp từ một phiên bản, hay nháp trống. */
type FormTarget =
  | { kind: 'create' }
  | { kind: 'edit'; policy: FeePolicy; tab?: FeePolicyFormTab }
  | { kind: 'duplicate'; source: FeePolicy; keepName: boolean; tab?: FeePolicyFormTab };

/**
 * Quản trị chính sách phí có phiên bản — ADR 0028 điều 2–3, ADR 0029 (R3), luồng tiền v2.
 *
 * Đúng MỘT bản `active` tại mọi thời điểm; kích hoạt một bản mới tự lưu trữ bản cũ trong cùng
 * transaction (server). Sửa số KHÔNG hồi tố — đơn/hold đã tạo giữ snapshot riêng (ADR 0024).
 *
 * Trang mở ở sổ "Đang áp dụng" và trình bày CHÍNH bản đang chạy dưới dạng thẻ theo khối nghiệp vụ
 * (không phải một bảng một dòng). Nút chính là "Sửa chính sách": người dùng không phải biết khái
 * niệm bản nháp — form soạn một bản nháp từ bản đang chạy (hoặc mở tiếp bản nháp đang có) và cho
 * "Lưu và áp dụng" ngay. Mỗi thẻ có nút "Sửa" mở thẳng tab tương ứng. Bản nháp và lịch sử ở hai sổ
 * riêng dạng bảng để so các phiên bản (`policy-views.ts`).
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

  const { data, isError, isLoading, isFetching, refetch } = useFeePolicies();
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
  // Bản nháp mới nhất — "Sửa chính sách" mở tiếp nó thay vì đẻ thêm một bản nháp thứ hai.
  const latestDraft = feePoliciesInView(items, FEE_POLICY_VIEW.DRAFT)[0] ?? null;
  // Panel tìm trong TOÀN BỘ danh sách: kích hoạt một nháp đang mở làm nó rời sổ nháp, panel vẫn đứng.
  const viewing = viewingId ? (items.find((p) => p.id === viewingId) ?? null) : null;

  const showView = (next: FeePolicyView) =>
    setFilters({ view: next === FEE_POLICY_VIEW.ACTIVE ? undefined : next });

  /** "Sửa chính sách" (và nút Sửa của từng thẻ): mở tiếp bản nháp đang có, không thì soạn từ bản đang chạy. */
  function startEdit(tab?: FeePolicyFormTab) {
    if (latestDraft) setFormTarget({ kind: 'edit', policy: latestDraft, tab });
    else if (active) setFormTarget({ kind: 'duplicate', source: active, keepName: true, tab });
    else setFormTarget({ kind: 'create' });
  }

  function onSaved(result: FeePolicySaveResult) {
    // Áp dụng xong ⇒ về sổ đang áp dụng; chỉ lưu nháp ⇒ ở yên, sổ mặc định nhắc bản nháp chờ.
    if (result.applied) showView(FEE_POLICY_VIEW.ACTIVE);
  }

  function handleActivate(policy: FeePolicy) {
    if (activate.isPending) return;
    activate.mutate(policy.id, {
      onSuccess: () => {
        message.success(t('page.activateSuccess'));
        // Bản vừa áp dụng rời sổ nháp — đưa người dùng tới nơi nó đang ở.
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

  const blockersOf = (p: FeePolicy) =>
    p.activationBlockers
      .map((code) => domainLabel('feePolicyActivationBlocker', code))
      .join(LIST_SEPARATOR);

  const headerAction = isLoading ? null : (
    <Button type="primary" icon={<EditOutlined aria-hidden />} onClick={() => startEdit()}>
      {latestDraft
        ? t('page.continueDraft')
        : active
          ? t('page.editButton')
          : t('page.createButton')}
    </Button>
  );

  const columns: DataTableColumn<FeePolicy>[] = [
    {
      title: t('page.columns.name'),
      key: 'name',
      width: 300,
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
      // Mỗi loại xe một dòng kèm cách tính: "50.000 ₫/chuyến" · "30.000 ₫/ngày" (ADR 0098).
      render: (_, p) => (
        <div className={styles.feeCell}>
          {FEE_POLICY_VEHICLE_TYPES.map((type) => (
            <span key={type}>
              {pf.platformFeeOf(p.customerPlatformFee, p.customerPlatformFeeBasis, type)}
            </span>
          ))}
        </div>
      ),
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
      // Thuế khấu trừ theo loại dịch vụ (ADR 0068): "7% · 7% · 4,5%", chi tiết GTGT/TNCN ở tooltip.
      title: t('page.columns.tax'),
      key: 'tax',
      width: 160,
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
      width: 120,
      render: (_, p) => (
        <StatusTag
          value={p.status as FeePolicyStatus}
          meta={FEE_POLICY_STATUS_META}
          group="feePolicyStatus"
        />
      ),
    },
    {
      title:
        view === FEE_POLICY_VIEW.DRAFT
          ? t('page.columns.createdAt')
          : t('page.columns.activatedAt'),
      key: 'date',
      width: 150,
      render: (_, p) => fmt.dateTime(view === FEE_POLICY_VIEW.DRAFT ? p.createdAt : p.activatedAt),
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
            disabledReason: blockersOf(p),
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
            hidden: isDraft,
            onClick: () => setFormTarget({ kind: 'duplicate', source: p, keepName: false }),
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
      { width: 240, maxInline: 2 },
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

  /** Sổ mặc định: bản đang chạy dạng thẻ, kèm nhắc bản nháp đang chờ. */
  function renderActive() {
    if (isLoading) return <Skeleton active paragraph={{ rows: 8 }} />;
    if (isError && !data) {
      return (
        <EmptyState variant="error" title={t('page.loadError')} onRetry={() => void refetch()} />
      );
    }
    return (
      <div className={styles.activeView}>
        {latestDraft ? (
          <Alert
            type="info"
            showIcon
            title={
              counts.draft > 1
                ? t('page.draftPendingMany', { count: counts.draft })
                : t('page.draftPending', { version: latestDraft.version })
            }
            description={
              latestDraft.activationBlockers.length > 0
                ? t('page.draftBlocked', { reasons: blockersOf(latestDraft) })
                : t('page.draftPendingHint')
            }
            action={
              <Space wrap>
                <Button
                  size="small"
                  icon={<EditOutlined aria-hidden />}
                  onClick={() => setFormTarget({ kind: 'edit', policy: latestDraft })}
                >
                  {t('page.draftContinue')}
                </Button>
                <Popconfirm
                  title={t('page.activateConfirmTitle')}
                  okText={t('page.activateConfirmOk')}
                  cancelText={tCommon('actions.cancel')}
                  onConfirm={() => handleActivate(latestDraft)}
                  disabled={latestDraft.activationBlockers.length > 0}
                >
                  <Button
                    size="small"
                    type="primary"
                    icon={<PoweroffOutlined aria-hidden />}
                    disabled={latestDraft.activationBlockers.length > 0}
                    loading={activate.isPending && activate.variables === latestDraft.id}
                  >
                    {t('page.activateAction')}
                  </Button>
                </Popconfirm>
                {counts.draft > 1 ? (
                  <Button size="small" onClick={() => showView(FEE_POLICY_VIEW.DRAFT)}>
                    {t('page.draftPendingAction')}
                  </Button>
                ) : (
                  <Popconfirm
                    title={t('page.discardConfirmTitle')}
                    okText={t('page.discardConfirmOk')}
                    cancelText={tCommon('actions.cancel')}
                    onConfirm={() => handleDiscard(latestDraft)}
                  >
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined aria-hidden />}
                      loading={discard.isPending && discard.variables === latestDraft.id}
                    >
                      {t('page.discardAction')}
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            }
          />
        ) : null}

        {active ? (
          <>
            <section className={styles.hero} aria-label={t('page.currentLabel')}>
              <div className={styles.heroMain}>
                <span className={styles.heroEyebrow}>{t('page.currentLabel')}</span>
                <h2 className={styles.heroTitle}>
                  {active.name}
                  {active.note ? (
                    <InfoHint label={t('page.noteHintLabel')} content={active.note} />
                  ) : null}
                </h2>
                <span className={styles.heroMeta}>
                  {[
                    t('page.version', { version: active.version }),
                    t('page.appliedSince', { at: fmt.dateTime(active.effectiveFrom) }),
                    active.activatedByName
                      ? t('page.appliedBy', { name: active.activatedByName })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(LIST_SEPARATOR)}
                </span>
              </div>
              <StatusTag
                value={active.status as FeePolicyStatus}
                meta={FEE_POLICY_STATUS_META}
                group="feePolicyStatus"
              />
            </section>
            <FeePolicySummary policy={active} layout="grid" onEdit={startEdit} />
          </>
        ) : (
          <EmptyState
            variant="empty"
            title={t('page.emptyActive')}
            action={
              latestDraft ? null : (
                <Button
                  type="primary"
                  icon={<PlusOutlined aria-hidden />}
                  onClick={() => startEdit()}
                >
                  {t('page.createButton')}
                </Button>
              )
            }
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <ManagePageHeader
        title={t('page.title')}
        subtitle={t('page.subtitle')}
        extra={headerAction}
      />

      <div className={styles.toolbar}>
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
        {view === FEE_POLICY_VIEW.DRAFT ? (
          <Button
            icon={<PlusOutlined aria-hidden />}
            onClick={() => setFormTarget({ kind: 'create' })}
          >
            {t('page.createBlank')}
          </Button>
        ) : null}
      </div>

      {view === FEE_POLICY_VIEW.ACTIVE ? (
        renderActive()
      ) : (
        <>
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
              isError && !data
                ? { title: t('page.loadError'), onRetry: () => void refetch() }
                : null
            }
            empty={
              view === FEE_POLICY_VIEW.DRAFT
                ? { title: t('page.emptyDraft') }
                : { title: t('page.emptyArchived') }
            }
          />
        </>
      )}

      {formTarget ? (
        <FeePolicyFormModal
          key={formKey}
          open
          policy={formTarget.kind === 'edit' ? formTarget.policy : null}
          duplicateFrom={formTarget.kind === 'duplicate' ? formTarget.source : null}
          keepName={formTarget.kind === 'duplicate' && formTarget.keepName}
          initialTab={
            formTarget.kind === 'create' ? undefined : (formTarget.tab ?? FEE_POLICY_FORM_TAB.FEES)
          }
          onClose={() => setFormTarget(null)}
          onSaved={onSaved}
        />
      ) : null}

      <FeePolicyDetailDrawer policy={viewing} onClose={() => setViewingId(null)} />
    </div>
  );
}
