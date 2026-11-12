'use client';

import {
  CheckCircleOutlined,
  EditOutlined,
  EnvironmentOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { Button, Select, Tag } from 'antd';
import { useTranslations } from 'next-intl';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { useMemo, useState } from 'react';
import {
  BRANCH_STATUS,
  BRANCH_STATUS_META,
  BRANCH_STATUS_VALUES,
  PERMISSION,
  PLAN_FEATURE,
  STATUS_COLOR,
  type BranchStatus,
} from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { FeatureWriteTooltip } from '@/components/feedback/FeatureWriteTooltip';
import { AutoSearchInput } from '@/components/filter/AutoSearchInput';
import { RowActions, type RowAction } from '@/components/data-display/RowActions';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';
import { StatusPill, StatusTag } from '@/components/data-display/StatusTag';
import { InfoCard } from '@/components/layout/InfoCard';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useBranchAction, useBranches } from '../hooks/use-branches';
import type { Branch } from '../types';
import { BranchFormDialog } from './BranchFormDialog';
import styles from './BranchesView.module.css';

/**
 * Quản lý chi nhánh của gian hàng.
 *
 * Chi nhánh là nơi xe THỰC SỰ nằm, nên màn này trả lời đúng ba câu: chi nhánh nào đang chạy,
 * mỗi chi nhánh giữ bao nhiêu xe, và chi nhánh nào là mặc định (xe mới về đó, hồ sơ gian hàng
 * lấy tỉnh từ đó).
 *
 * Dùng `DataTable` chung: bảng ở desktop, thẻ ở ≤640px, và toàn bộ trạng thái (đang tải / rỗng /
 * lỗi / thiếu quyền / lọc không ra) đã nằm trong component đó - không dựng lại ở đây.
 *
 * Hai cách đặt (`variant`):
 *  - `page` - màn riêng, có tiêu đề trang. Còn dùng ở phiên hỗ trợ gian hàng (ADR 0050).
 *  - `section` - thẻ "Chi nhánh" của "Thông tin cửa hàng" ở site partner (design `23999:111349`,
 *    06/11/2026): tiêu đề + dòng đếm ở đầu thẻ, ô tìm · lọc trạng thái · "Thêm chi nhánh" ở góc phải,
 *    dải "chưa có tỉnh/thành" kèm lối "Bổ sung ngay" mở đúng chi nhánh cần sửa.
 */
export function BranchesView({
  variant = 'page',
  sectionId,
}: {
  variant?: 'page' | 'section';
  /** `id` của thẻ ở chế độ `section` - đích của `?section=branches`. */
  sectionId?: string;
}) {
  const t = useTranslations('Branches');
  const tc = useTranslations('Common');
  const tAddr = useTranslations('Address');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  // Chỉ ẩn/hiện UI - guard backend mới là lớp chặn thật (CLAUDE.md mục 6).
  const permissions = usePermissions();
  const canManage = permissions.has(PERMISSION.BRANCH_MANAGE);
  const canView = permissions.has(PERMISSION.BRANCH_VIEW);
  const hideWrites = useSupportHides(SUPPORT_HIDDEN_AREA.DENIED_ACTIONS) && !canManage;
  // Phiên hỗ trợ (ADR 0050 §13): tạo/sửa chi nhánh được; ngưng, mở lại, đổi mặc định thì không.
  const lifecycleHidden = useSupportHides(SUPPORT_HIDDEN_AREA.BRANCH_LIFECYCLE);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<BranchStatus | ''>('');
  const [editing, setEditing] = useState<Branch | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const params = useMemo(
    () => ({ ...(search ? { q: search } : {}), ...(statusFilter ? { status: statusFilter } : {}) }),
    [search, statusFilter],
  );
  const query = useBranches(params);
  const action = useBranchAction();

  const items = query.data?.items ?? [];
  const needsReview = query.data?.needsReviewCount ?? 0;

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(branch: Branch) {
    setEditing(branch);
    setFormOpen(true);
  }

  /**
   * Hành động theo hàng. Nút bị khoá luôn kèm LÝ DO - một nút mờ không giải thích là ngõ cụt
   * (và ở đây lý do là luật nghiệp vụ thật: gian hàng phải luôn có một chi nhánh mặc định).
   */
  function actionsOf(branch: Branch): RowAction[] {
    if (hideWrites) return [];
    const list: RowAction[] = [
      {
        key: 'edit',
        label: tc('actions.edit'),
        icon: <EditOutlined />,
        showLabel: false,
        // Bút chì viền như design - không phải nút chính tô vàng.
        primary: false,
        disabled: !canManage,
        disabledReason: t('blocked.edit'),
        onClick: () => openEdit(branch),
      },
    ];

    if (lifecycleHidden) return list;

    if (!branch.isDefault) {
      list.push({
        key: 'set-default',
        label: t('actions.setDefault'),
        icon: <CheckCircleOutlined />,
        disabled: !canManage || branch.status !== BRANCH_STATUS.ACTIVE || !branch.provinceCode,
        disabledReason:
          branch.status !== BRANCH_STATUS.ACTIVE
            ? t('blocked.inactive')
            : !branch.provinceCode
              ? t('blocked.noProvince')
              : t('blocked.manage'),
        onClick: () => action.mutate({ id: branch.id, action: 'set-default' }),
      });
    }

    list.push(
      branch.status === BRANCH_STATUS.ACTIVE
        ? {
            key: 'deactivate',
            label: t('actions.deactivate'),
            icon: <PauseCircleOutlined />,
            danger: true,
            disabled: !canManage || branch.isDefault,
            disabledReason: branch.isDefault ? t('blocked.isDefault') : t('blocked.manage'),
            confirm: {
              title: t('confirmDeactivate.title'),
              description: t('confirmDeactivate.description'),
            },
            onClick: () => action.mutate({ id: branch.id, action: 'deactivate' }),
          }
        : {
            key: 'activate',
            label: t('actions.activate'),
            icon: <PlayCircleOutlined />,
            disabled: !canManage,
            disabledReason: t('blocked.manage'),
            onClick: () => action.mutate({ id: branch.id, action: 'activate' }),
          },
    );

    return list;
  }

  const columns: DataTableColumn<Branch>[] = [
    {
      title: t('columns.branch'),
      dataIndex: 'name',
      width: 230,
      render: (_v, row) => (
        <div className={styles.stackedCell}>
          <span className={styles.name}>{row.name}</span>
          <span className={styles.cellSub}>
            {row.code}
            {row.isDefault ? (
              <>
                {' · '}
                <span className={styles.defaultMark}>{t('labels.default')}</span>
              </>
            ) : null}
          </span>
        </div>
      ),
    },
    {
      title: t('columns.province'),
      dataIndex: 'provinceName',
      width: 190,
      /*
       * Hai dòng: tỉnh ở trên, xã/phường ở dưới. Mô hình hành chính hai cấp (từ 01/07/2025)
       * nên xã/phường là cấp thứ hai thật sự chứ không phải chi tiết phụ - chi nhánh thiếu nó
       * là chi nhánh chưa khai đủ địa chỉ, và cột này phải nói ra điều đó.
       */
      render: (_v, row) =>
        row.provinceName ? (
          <div className={styles.stackedCell}>
            <span className={styles.cellProvince}>{row.provinceName}</span>
            {row.wardName ? (
              <span className={styles.cellSub}>{row.wardName}</span>
            ) : (
              <StatusPill color={STATUS_COLOR.WARNING}>{tAddr('review.badge')}</StatusPill>
            )}
          </div>
        ) : (
          <StatusPill color={STATUS_COLOR.WARNING}>{t('labels.noProvince')}</StatusPill>
        ),
    },
    {
      title: t('columns.address'),
      dataIndex: 'address',
      width: 204,
      render: (v: string | null) => (
        <span className={styles.cellSecondary}>{v || tc('labels.emptyValue')}</span>
      ),
    },
    {
      title: t('columns.phone'),
      dataIndex: 'phone',
      width: 128,
      render: (v: string | null) => (
        <span className={styles.cellSecondary}>{v || tc('labels.emptyValue')}</span>
      ),
    },
    {
      title: t('columns.vehicleCount'),
      dataIndex: 'vehicleCount',
      width: 80,
      render: (v: number) => <span className={styles.cellSecondary}>{v}</span>,
    },
    {
      title: tc('labels.status'),
      dataIndex: 'status',
      width: 158,
      render: (v: BranchStatus) => (
        <StatusTag value={v} meta={BRANCH_STATUS_META} group="branchStatus" appearance="pill" />
      ),
    },
    ...(hideWrites
      ? []
      : [
          {
            title: tc('labels.actions'),
            key: 'actions',
            width: 100,
            // Cột hành động ghim mép phải: bảng cuộn ngang thì nút vẫn ở trong tầm với.
            fixed: 'right' as const,
            // Design `23999:111355`: bút chì + "…" - đổi mặc định / ngưng / mở lại nằm trong menu.
            render: (_v: unknown, row: Branch) => (
              <RowActions actions={actionsOf(row)} maxInline={1} variant="standard" />
            ),
          },
        ]),
  ];

  /* Nhiều chi nhánh là tính năng của GÓI (ADR 0027) - hết hạn thì xem/sửa chi nhánh hiện có được,
     không mở thêm chi nhánh mới. Server chặn ở POST /branches. */
  const addButton = hideWrites ? null : (
    <FeatureWriteTooltip feature={PLAN_FEATURE.BRANCHES}>
      {(locked) => (
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={openCreate}
          disabled={!canManage || locked}
        >
          {t('page.add')}
        </Button>
      )}
    </FeatureWriteTooltip>
  );
  const isSection = variant === 'section';
  // Design: "Tổng N chi nhánh · M đang hoạt động", phần "đang hoạt động" xanh.
  const summary = t.rich('toolbar.summaryTotal', {
    total: query.data?.total ?? 0,
    active: fmt.count(query.data?.activeCount ?? 0),
    ok: (chunks) => <span className={styles.summaryActive}>{chunks}</span>,
  });
  /** Chi nhánh đầu tiên cần bổ sung địa điểm - đích của "Bổ sung ngay". */
  const firstToReview = items.find((row) => !row.provinceCode || row.needsLocationReview) ?? null;

  const toolbar = (
    <div className={styles.toolbar}>
      <AutoSearchInput
        placeholder={t('toolbar.searchPlaceholder')}
        value={search}
        onSearch={setSearch}
        className={styles.search}
        aria-label={t('toolbar.searchLabel')}
      />
      <Select<BranchStatus | ''>
        className={styles.statusFilter}
        value={statusFilter}
        onChange={setStatusFilter}
        aria-label={t('toolbar.statusLabel')}
        options={[
          { value: '', label: t('toolbar.allStatuses') },
          ...BRANCH_STATUS_VALUES.map((value) => ({
            value,
            label: domainLabel('branchStatus', value),
          })),
        ]}
      />
      {isSection ? addButton : null}
    </div>
  );

  const body = (
    <>
      {needsReview > 0 ? (
        <div className={styles.reviewBanner} role="status">
          <EnvironmentOutlined className={styles.reviewIcon} aria-hidden />
          <p className={styles.reviewText}>
            <strong>{t('page.needsReview', { count: needsReview })}.</strong>{' '}
            {t('page.needsReviewHint')}
          </p>
          {canManage && !hideWrites && firstToReview ? (
            <button
              type="button"
              className={styles.reviewAction}
              onClick={() => openEdit(firstToReview)}
            >
              {t('page.fixNow')}
            </button>
          ) : null}
        </div>
      ) : null}

      <DataTable<Branch>
        label={t('table.label')}
        columns={columns}
        items={items}
        onRowClick={canManage ? openEdit : undefined}
        minWidth={1090}
        loading={query.isLoading}
        error={
          query.isError && !query.data
            ? {
                title: t('table.loadError'),
                description: errorMessage(query.error),
                onRetry: () => void query.refetch(),
              }
            : null
        }
        permission={
          canView
            ? null
            : {
                title: t('table.noPermission'),
                description: t('table.noPermissionHint'),
              }
        }
        filtered={Boolean(search || statusFilter)}
        empty={{
          title: t('table.empty'),
          description: t('table.emptyHint'),
          action: canManage ? (
            <FeatureWriteTooltip feature={PLAN_FEATURE.BRANCHES}>
              {(locked) => (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={openCreate}
                  disabled={locked}
                >
                  {t('page.add')}
                </Button>
              )}
            </FeatureWriteTooltip>
          ) : undefined,
        }}
        noResults={{
          title: t('table.noResults'),
          description: t('table.noResultsHint'),
        }}
        renderCard={(row) => (
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.name}>{row.name}</span>
              {row.isDefault ? <Tag color={STATUS_COLOR.WAITING}>{t('labels.default')}</Tag> : null}
              <StatusTag
                value={row.status as BranchStatus}
                meta={BRANCH_STATUS_META}
                group="branchStatus"
              />
            </div>
            <div className={styles.cardMeta}>
              <EnvironmentOutlined />
              <span>
                {[row.wardName, row.provinceName].filter(Boolean).join(LIST_SEPARATOR) ||
                  t('labels.noProvince')}
              </span>
            </div>
            {row.address ? <div className={styles.cardMeta}>{row.address}</div> : null}
            {row.needsLocationReview ? (
              <Tag color={STATUS_COLOR.WARNING}>{tAddr('review.badge')}</Tag>
            ) : null}
            <div className={styles.cardMeta}>
              {t('labels.vehicles', { count: row.vehicleCount })}
            </div>
            <RowActions actions={actionsOf(row)} align="start" maxInline={2} variant="filled" />
          </div>
        )}
      />

      {formOpen ? (
        // `key` ép remount: mỗi lần mở nạp lại đúng dữ liệu chi nhánh đang sửa.
        <BranchFormDialog
          key={editing?.id ?? 'new'}
          open
          branch={editing}
          onClose={() => setFormOpen(false)}
        />
      ) : null}
    </>
  );

  if (isSection) {
    return (
      <InfoCard
        id={sectionId}
        title={t('page.title')}
        hint={<span className={styles.summaryText}>{summary}</span>}
        extra={toolbar}
      >
        {body}
      </InfoCard>
    );
  }

  return (
    <div className={styles.page}>
      <ManagePageHeader title={t('page.title')} subtitle={t('page.subtitle')} extra={addButton} />
      <div className={styles.pageToolbar}>
        <span className={styles.summaryText}>{summary}</span>
        {toolbar}
      </div>
      {body}
    </div>
  );
}
