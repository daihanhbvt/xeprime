'use client';

import {
  CheckCircleOutlined,
  EditOutlined,
  EnvironmentOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { Alert, Button, Input, Tag } from 'antd';
import { useMemo, useState } from 'react';
import { BRANCH_STATUS, BRANCH_STATUS_META, PERMISSION, type BranchStatus } from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { RowActions, type RowAction } from '@/components/data-display/RowActions';
import { StatusTag } from '@/components/data-display/StatusTag';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { usePermissions } from '@/hooks/use-permissions';
import { getErrorMessage } from '@/services/api-client';
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
        label: 'Sửa',
        icon: <EditOutlined />,
        disabled: !canManage,
        disabledReason: 'Bạn không có quyền sửa chi nhánh',
        onClick: () => openEdit(branch),
      },
    ];

    if (!branch.isDefault) {
      list.push({
        key: 'set-default',
        label: 'Đặt làm mặc định',
        icon: <CheckCircleOutlined />,
        disabled: !canManage || branch.status !== BRANCH_STATUS.ACTIVE || !branch.provinceCode,
        disabledReason:
          branch.status !== BRANCH_STATUS.ACTIVE
            ? 'Chi nhánh đang ngừng hoạt động'
            : !branch.provinceCode
              ? 'Chi nhánh chưa có tỉnh/thành'
              : 'Bạn không có quyền quản lý chi nhánh',
        onClick: () => action.mutate({ id: branch.id, action: 'set-default' }),
      });
    }

    list.push(
      branch.status === BRANCH_STATUS.ACTIVE
        ? {
            key: 'deactivate',
            label: 'Ngừng hoạt động',
            icon: <PauseCircleOutlined />,
            danger: true,
            disabled: !canManage || branch.isDefault,
            disabledReason: branch.isDefault
              ? 'Chi nhánh mặc định không thể ngừng — đặt chi nhánh khác làm mặc định trước'
              : 'Bạn không có quyền quản lý chi nhánh',
            confirm: {
              title: 'Ngừng hoạt động chi nhánh?',
              description:
                'Chi nhánh sẽ không nhận xe mới. Xe và đơn đang chạy phải được chuyển/hoàn tất trước.',
            },
            onClick: () => action.mutate({ id: branch.id, action: 'deactivate' }),
          }
        : {
            key: 'activate',
            label: 'Bật lại',
            icon: <PlayCircleOutlined />,
            disabled: !canManage,
            disabledReason: 'Bạn không có quyền quản lý chi nhánh',
            onClick: () => action.mutate({ id: branch.id, action: 'activate' }),
          },
    );

    return list;
  }

  const columns: DataTableColumn<Branch>[] = [
    {
      title: 'Chi nhánh',
      dataIndex: 'name',
      render: (_v, row) => (
        <div className={styles.identity}>
          <span className={styles.name}>{row.name}</span>
          <span className={styles.code}>{row.code}</span>
          {row.isDefault ? <Tag color="gold">Mặc định</Tag> : null}
        </div>
      ),
    },
    {
      title: 'Tỉnh/thành',
      dataIndex: 'provinceName',
      width: 180,
      render: (_v, row) =>
        row.provinceName ? (
          <span>{row.provinceName}</span>
        ) : (
          <Tag color="warning">Chưa có tỉnh/thành</Tag>
        ),
    },
    { title: 'Địa chỉ', dataIndex: 'address', render: (v: string | null) => v || '—' },
    { title: 'Điện thoại', dataIndex: 'phone', width: 140, render: (v: string | null) => v || '—' },
    {
      title: 'Số xe',
      dataIndex: 'vehicleCount',
      width: 90,
      align: 'right',
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 150,
      render: (v: BranchStatus) => <StatusTag value={v} meta={BRANCH_STATUS_META} />,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 150,
      // Cột hành động ghim mép phải: bảng cuộn ngang thì nút vẫn ở trong tầm với.
      fixed: 'right',
      // Tối đa 3 hành động và cả ba đều là việc thường làm (sửa, đổi mặc định, ngừng/bật) —
      // giấu sau menu ⋮ chỉ thêm một cú bấm cho mọi thao tác.
      render: (_v, row) => <RowActions actions={actionsOf(row)} maxInline={3} />,
    },
  ];

  return (
    <div className={styles.page}>
      <ManagePageHeader
        title="Chi nhánh"
        subtitle="Nơi xe của bạn đang đỗ. Chi nhánh quyết định xe hiển thị ở tỉnh/thành nào trên marketplace."
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreate}
            disabled={!canManage}
          >
            Thêm chi nhánh
          </Button>
        }
      />

      {needsReview > 0 ? (
        <Alert
          type="warning"
          showIcon
          className={styles.alert}
          icon={<EnvironmentOutlined />}
          message={`${needsReview} chi nhánh chưa có tỉnh/thành`}
          description="Xe thuộc các chi nhánh này KHÔNG hiển thị trên marketplace cho tới khi bạn bổ sung tỉnh/thành."
        />
      ) : null}

      <div className={styles.toolbar}>
        <Input.Search
          allowClear
          placeholder="Tìm theo tên, mã hoặc địa chỉ"
          onSearch={setSearch}
          className={styles.search}
          aria-label="Tìm chi nhánh"
        />
        <div className={styles.summary}>
          <span>
            {query.data?.total ?? 0} chi nhánh · {query.data?.activeCount ?? 0} đang hoạt động
          </span>
          <Button
            size="small"
            type={statusFilter === BRANCH_STATUS.ACTIVE ? 'primary' : 'default'}
            onClick={() =>
              setStatusFilter((v) => (v === BRANCH_STATUS.ACTIVE ? '' : BRANCH_STATUS.ACTIVE))
            }
          >
            Chỉ đang hoạt động
          </Button>
        </div>
      </div>

      <DataTable<Branch>
        label="Danh sách chi nhánh"
        columns={columns}
        items={items}
        minWidth={900}
        loading={query.isLoading}
        error={
          query.isError && !query.data
            ? {
                title: 'Không tải được danh sách chi nhánh',
                description: getErrorMessage(query.error),
                onRetry: () => void query.refetch(),
              }
            : null
        }
        permission={
          canView
            ? null
            : {
                title: 'Bạn không có quyền xem chi nhánh',
                description: 'Liên hệ chủ gian hàng để được cấp quyền.',
              }
        }
        filtered={Boolean(search || statusFilter)}
        empty={{
          title: 'Chưa có chi nhánh nào',
          description: 'Thêm chi nhánh để khai báo nơi xe của bạn đang đỗ.',
          action: canManage ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Thêm chi nhánh
            </Button>
          ) : undefined,
        }}
        noResults={{
          title: 'Không có chi nhánh khớp bộ lọc',
          description: 'Thử xoá từ khoá hoặc bỏ lọc trạng thái.',
        }}
        renderCard={(row) => (
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.name}>{row.name}</span>
              {row.isDefault ? <Tag color="gold">Mặc định</Tag> : null}
              <StatusTag value={row.status as BranchStatus} meta={BRANCH_STATUS_META} />
            </div>
            <div className={styles.cardMeta}>
              <EnvironmentOutlined />
              <span>{row.provinceName ?? 'Chưa có tỉnh/thành'}</span>
            </div>
            {row.address ? <div className={styles.cardMeta}>{row.address}</div> : null}
            <div className={styles.cardMeta}>{row.vehicleCount} xe</div>
            <RowActions actions={actionsOf(row)} align="start" maxInline={2} />
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
