'use client';

import {
  CheckCircleOutlined,
  EditOutlined,
  EnvironmentOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { Alert, Button, Tag } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  BRANCH_STATUS,
  BRANCH_STATUS_META,
  PERMISSION,
  PLAN_FEATURE,
  STATUS_COLOR,
  type BranchStatus,
} from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { FeatureWriteTooltip } from '@/components/feedback/FeatureWriteTooltip';
import { AutoSearchInput } from '@/components/filter/AutoSearchInput';
import { RowActions, type RowAction } from '@/components/data-display/RowActions';
import { StatusTag } from '@/components/data-display/StatusTag';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
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
 * lỗi / thiếu quyền / lọc không ra) đã nằm trong component đó — không dựng lại ở đây.
 */
export function BranchesView() {
  const t = useTranslations('Branches');
  const tc = useTranslations('Common');
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  // Chỉ ẩn/hiện UI — guard backend mới là lớp chặn thật (CLAUDE.md mục 6).
  const permissions = usePermissions();
  const canManage = permissions.has(PERMISSION.BRANCH_MANAGE);
  const canView = permissions.has(PERMISSION.BRANCH_VIEW);
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
   * Hành động theo hàng. Nút bị khoá luôn kèm LÝ DO — một nút mờ không giải thích là ngõ cụt
   * (và ở đây lý do là luật nghiệp vụ thật: gian hàng phải luôn có một chi nhánh mặc định).
   */
  function actionsOf(branch: Branch): RowAction[] {
    const list: RowAction[] = [
      {
        key: 'edit',
        label: tc('actions.edit'),
        icon: <EditOutlined />,
        disabled: !canManage,
        disabledReason: t('blocked.edit'),
        onClick: () => openEdit(branch),
      },
    ];

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
      width: 220,
      render: (_v, row) => (
        <div className={styles.identity}>
          <span className={styles.name}>{row.name}</span>
          <span className={styles.code}>{row.code}</span>
          {row.isDefault ? <Tag color={STATUS_COLOR.WAITING}>{t('labels.default')}</Tag> : null}
        </div>
      ),
    },
    {
      title: t('columns.province'),
      dataIndex: 'provinceName',
      width: 180,
      render: (_v, row) =>
        row.provinceName ? (
          <span>{row.provinceName}</span>
        ) : (
          <Tag color={STATUS_COLOR.WARNING}>{t('labels.noProvince')}</Tag>
        ),
    },
    {
      title: t('columns.address'),
      dataIndex: 'address',
      width: 280,
      render: (v: string | null) => v || tc('labels.emptyValue'),
    },
    {
      title: t('columns.phone'),
      dataIndex: 'phone',
      width: 140,
      render: (v: string | null) => v || tc('labels.emptyValue'),
    },
    {
      title: t('columns.vehicleCount'),
      dataIndex: 'vehicleCount',
      width: 90,
      align: 'right',
    },
    {
      title: tc('labels.status'),
      dataIndex: 'status',
      width: 150,
      render: (v: BranchStatus) => (
        <StatusTag value={v} meta={BRANCH_STATUS_META} group="branchStatus" />
      ),
    },
    {
      title: tc('labels.actions'),
      key: 'actions',
      width: 420,
      // Cột hành động ghim mép phải: bảng cuộn ngang thì nút vẫn ở trong tầm với.
      fixed: 'right',
      // Desktop để ba thao tác thường dùng có nhãn rõ; thẻ mobile vẫn chỉ giữ hai icon rồi gom dư.
      render: (_v, row) => <RowActions actions={actionsOf(row)} maxInline={3} variant="filled" />,
    },
  ];

  return (
    <div className={styles.page}>
      <ManagePageHeader
        title={t('page.title')}
        subtitle={t('page.subtitle')}
        extra={
          /* Nhiều chi nhánh là tính năng của GÓI (ADR 0027) — hết hạn thì xem/sửa chi nhánh
             hiện có được, không mở thêm chi nhánh mới. Server chặn ở POST /branches. */
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
        }
      />

      {needsReview > 0 ? (
        <Alert
          type="warning"
          showIcon
          className={styles.alert}
          icon={<EnvironmentOutlined />}
          message={t('page.needsReview', { count: needsReview })}
          description={t('page.needsReviewHint')}
        />
      ) : null}

      <div className={styles.toolbar}>
        <AutoSearchInput
          placeholder={t('toolbar.searchPlaceholder')}
          value={search}
          onSearch={setSearch}
          className={styles.search}
          aria-label={t('toolbar.searchLabel')}
        />
        <div className={styles.summary}>
          <span>
            {t('toolbar.summary', {
              total: query.data?.total ?? 0,
              active: fmt.count(query.data?.activeCount ?? 0),
            })}
          </span>
          <Button
            size="small"
            type={statusFilter === BRANCH_STATUS.ACTIVE ? 'primary' : 'default'}
            onClick={() =>
              setStatusFilter((v) => (v === BRANCH_STATUS.ACTIVE ? '' : BRANCH_STATUS.ACTIVE))
            }
          >
            {t('toolbar.activeOnly')}
          </Button>
        </div>
      </div>

      <DataTable<Branch>
        label={t('table.label')}
        columns={columns}
        items={items}
        onRowClick={canManage ? openEdit : undefined}
        minWidth={1200}
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
              <span>{row.provinceName ?? t('labels.noProvince')}</span>
            </div>
            {row.address ? <div className={styles.cardMeta}>{row.address}</div> : null}
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
    </div>
  );
}
