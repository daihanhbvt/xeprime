'use client';

import { Pagination, Table } from 'antd';
import type { ColumnType } from 'antd/es/table';
import { isValidElement, type Key, type MouseEvent, type ReactNode } from 'react';

import { EmptyState } from '@/components/feedback/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { PermissionState, type PermissionStateProps } from '@/components/feedback/PermissionState';
import { useIsMobile } from '@/hooks/use-media-query';
import type { PaginationMeta } from '@xeprime/types';

import type { RowAction } from './RowActions';
import { RowActions } from './RowActions';
import styles from './DataTable.module.css';

/**
 * Cột giữ nguyên hợp đồng của AntD — dùng lại chứ không bọc thêm một tầng: mọi bảng trong repo
 * đã viết `ColumnsType<T>`, và định nghĩa lại `title/render/align` chỉ tạo tầng dịch vô ích.
 */
export type DataTableColumn<T> = ColumnType<T>;

interface DataTableEmptySlot {
  title: string;
  description?: ReactNode;
  /** Nút do feature quyết (thường phụ thuộc quyền tạo). */
  action?: ReactNode;
}

interface DataTableError {
  title: string;
  description?: ReactNode;
  onRetry: () => void;
}

export interface DataTableProps<T> {
  /**
   * Tên khả truy cập của danh sách — "Danh sách xe". Bắt buộc: Figma `130:1658` §2.8 yêu cầu mỗi
   * bảng có caption/nhãn, và hiện KHÔNG bảng nào trong repo có.
   */
  label: string;
  columns: DataTableColumn<T>[];
  items: T[];
  /** Mặc định lấy `row.id` — đúng với 14/14 bảng hiện tại (một bảng dùng `bookingId`, truyền tay). */
  rowKey?: (row: T) => string;
  /**
   * Tổng bề rộng tối thiểu của các cột (px). Figma `127:2097` R1–R2: mỗi bảng có
   * `MIN_TABLE_WIDTH` cố định, hẹp hơn thì **cuộn ngang**, tuyệt đối không nén cột (R8).
   * Thay cho `scroll={{ x: 'max-content' }}` mà 15/15 bảng đang dùng — `max-content` không đặt sàn.
   */
  minWidth: number;
  /**
   * Bỏ trống = **không phân trang**.
   *
   * Không phải mọi bảng đều phân trang: `/manage/admin/plans` lấy toàn bộ gói trong một lần gọi
   * (`fetchPlans` trả `Plan[]`, không có `meta`) và Figma `130:1752` ghi nhận "Pricing Plans —
   * fixed layout, không paginated" là ngoại lệ hợp lệ. Ép một `meta` giả vào đó sẽ dựng thanh
   * phân trang một-trang vô nghĩa.
   */
  pagination?: {
    meta: PaginationMeta;
    onChange: (page: number, pageSize: number) => void;
    /** "245 xe" / "245 phiếu" — đơn vị là chuyện của feature. */
    totalLabel: (total: number) => string;
  };
  /** Đang tải (lần đầu hoặc nền). Nền → giữ dữ liệu, chỉ làm mờ (Figma `134:2011` R4). */
  loading?: boolean;
  /**
   * **Chỉ truyền khi tải lần đầu hỏng và không còn dữ liệu hợp lệ để hiển thị**
   * (tức `isError && !data`). Lỗi refetch nền mà vẫn có dữ liệu cũ thì đừng truyền — thay bảng
   * đang đọc dở bằng màn lỗi là mất việc của người dùng.
   */
  error?: DataTableError | null;
  /** Thiếu quyền xem — chỉ hiển thị, guard backend mới là lớp chặn thật. */
  permission?: PermissionStateProps | null;
  /** Có bộ lọc nào đang bật không → quyết định dùng `noResults` hay `empty` (`134:2093`). */
  filtered?: boolean;
  empty: DataTableEmptySlot;
  /** Bỏ trống thì khi lọc không ra kết quả sẽ rơi về `empty` — chấp nhận được với bảng không có filter. */
  noResults?: DataTableEmptySlot;
  onRowClick?: (row: T) => void;
  /**
   * Ở ≤640px render thẻ do feature thiết kế. Không truyền thì `DataTable` tự chuyển các cột
   * thành thẻ nhãn–giá trị, để không còn bảng desktop bị ép ngang trên điện thoại.
   */
  renderCard?: (row: T) => ReactNode;
  loadingLabel?: string;
  /**
   * Zebra hàng chẵn/lẻ (mặc định BẬT — chuẩn bảng desktop của XePrime). Tính theo CHỈ SỐ dữ
   * liệu qua `rowClassName`, không phải `nth-child` — hàng đo lường/expand của AntD không phá
   * được nhịp. Hover/chọn/lỗi vẫn thắng zebra; chế độ thẻ mobile không nhận zebra.
   * Tắt (`striped={false}`) cho bảng ngoại lệ có nền hàng riêng.
   */
  striped?: boolean;
}

function defaultRowKey<T>(row: T): string {
  return String((row as { id?: unknown }).id ?? '');
}

interface MobileColumnShape<T> {
  key?: Key | null;
  title?: ReactNode | ((props: unknown) => ReactNode);
  dataIndex?: unknown;
  hidden?: boolean;
  render?: (value: unknown, row: T, index: number) => unknown;
}

function asMobileColumn<T>(column: DataTableColumn<T>): MobileColumnShape<T> {
  // `ColumnType` có generic rất sâu; thẻ mobile chỉ cần tập thuộc tính nhỏ, ổn định này.
  return column as unknown as MobileColumnShape<T>;
}

function columnValue<T>(row: T, dataIndex: unknown): unknown {
  if (dataIndex === undefined) return undefined;
  const path = Array.isArray(dataIndex) ? dataIndex : [dataIndex];
  return path.reduce<unknown>((value, key) => {
    if (value === null || value === undefined || typeof value !== 'object') return undefined;
    if (typeof key !== 'string' && typeof key !== 'number' && typeof key !== 'symbol') {
      return undefined;
    }
    return (value as Record<PropertyKey, unknown>)[key];
  }, row);
}

function renderedColumn<T>(column: MobileColumnShape<T>, row: T, index: number): ReactNode {
  const value = columnValue(row, column.dataIndex);
  const rendered = column.render ? column.render(value, row, index) : value;

  // AntD cho phép `render` trả `{ children, props }`; mobile chỉ cần phần nội dung của ô.
  if (
    rendered &&
    typeof rendered === 'object' &&
    !isValidElement(rendered) &&
    'children' in rendered
  ) {
    return (rendered as { children?: ReactNode }).children ?? '—';
  }
  return (rendered ?? '—') as ReactNode;
}

function columnTitle<T>(column: MobileColumnShape<T>): ReactNode {
  return typeof column.title === 'function' ? String(column.key ?? '') : (column.title ?? '');
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(target.closest('a, button, input, select, textarea, [role="button"]'))
  );
}

function GenericMobileCard<T>({
  columns,
  row,
  index,
}: {
  columns: DataTableColumn<T>[];
  row: T;
  index: number;
}) {
  const visible = columns.map(asMobileColumn).filter((column) => !column.hidden);
  const actions = visible.find((column) => column.key === 'actions');
  const dataColumns = visible.filter((column) => column.key !== 'actions');
  const [primary, ...details] = dataColumns;

  return (
    <article className={styles.autoCard}>
      {primary ? (
        <div className={styles.autoCardPrimary}>{renderedColumn(primary, row, index)}</div>
      ) : null}
      {details.length > 0 ? (
        <dl className={styles.autoCardFields}>
          {details.map((column, columnIndex) => (
            <div className={styles.autoCardField} key={String(column.key ?? columnIndex)}>
              <dt>{columnTitle(column)}</dt>
              <dd>{renderedColumn(column, row, index)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {actions ? (
        <div className={styles.autoCardActions}>{renderedColumn(actions, row, index)}</div>
      ) : null}
    </article>
  );
}

/**
 * Bảng dữ liệu dùng chung.
 *
 * API dựng từ 14 bảng có thật (Batch 1C-A), **không** phản chiếu toàn bộ API của AntD Table.
 *
 * **Cố ý KHÔNG có** — vì kiểm kê 1C-A đo được 0 nơi dùng, mà quy tắc của repo là component chung
 * cần ≥2 consumer thật ([03](../../../../docs/implementation/03_COMPONENT_REGISTRY.md)):
 *  - **sắp xếp theo cột** (`sorter`): 0/14 bảng có. Sắp xếp chỉ tồn tại ở `vehicles`/`bookings`
 *    dưới dạng một `Select` trong thanh lọc, đẩy thẳng lên tham số `sort` của API.
 *  - **chọn hàng / hành động hàng loạt** (`rowSelection`): 0 nơi.
 * Thêm khi có consumer đầu tiên, không thêm trước.
 *
 * **Thứ tự ưu tiên trạng thái** (cố định, có test):
 *   quyền → lỗi tải lần đầu → đang tải & chưa có dữ liệu → rỗng/không-kết-quả → dữ liệu
 */
export function DataTable<T>({
  label,
  columns,
  items,
  rowKey = defaultRowKey,
  minWidth,
  pagination,
  loading = false,
  error = null,
  permission = null,
  filtered = false,
  empty,
  noResults,
  onRowClick,
  renderCard,
  loadingLabel,
  striped = true,
}: DataTableProps<T>) {
  const isMobile = useIsMobile();
  const asCards = isMobile;

  if (permission) return <PermissionState {...permission} />;

  if (error) {
    return (
      <EmptyState
        variant="error"
        title={error.title}
        description={error.description}
        onRetry={error.onRetry}
      />
    );
  }

  if (loading && items.length === 0) {
    return (
      <LoadingState
        variant={asCards ? 'cards' : 'table'}
        label={loadingLabel ?? `Đang tải ${label.toLocaleLowerCase('vi-VN')}…`}
      />
    );
  }

  if (items.length === 0) {
    const slot = filtered && noResults ? noResults : empty;
    return (
      <EmptyState
        variant={filtered && noResults ? 'no-results' : 'empty'}
        title={slot.title}
        description={slot.description}
        action={slot.action}
      />
    );
  }

  if (asCards) {
    return (
      <div className={styles.cardsRoot}>
        <ul className={styles.cards} aria-label={label} aria-busy={loading || undefined}>
          {items.map((row, index) => (
            <li
              key={rowKey(row)}
              className={[styles.card, onRowClick ? styles.cardClickable : '']
                .filter(Boolean)
                .join(' ')}
              onClick={
                onRowClick
                  ? (event: MouseEvent<HTMLLIElement>) => {
                      if (!isInteractiveTarget(event.target)) onRowClick(row);
                    }
                  : undefined
              }
            >
              {renderCard ? (
                renderCard(row)
              ) : (
                <GenericMobileCard columns={columns} row={row} index={index} />
              )}
            </li>
          ))}
        </ul>
        {pagination ? (
          <div className={styles.cardsPagination}>
            <Pagination
              size="small"
              current={pagination.meta.page}
              pageSize={pagination.meta.limit}
              total={pagination.meta.total}
              showSizeChanger={false}
              showTotal={pagination.totalLabel}
              onChange={pagination.onChange}
            />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    // `region` + nhãn: AntD không chuyển `aria-label` xuống thẻ `<table>`, nên đặt ở vùng bao.
    <div className={styles.tableRoot} role="region" aria-label={label}>
      <Table<T>
        rowKey={rowKey}
        columns={columns}
        dataSource={items}
        loading={loading}
        tableLayout="auto"
        scroll={{ x: minWidth }}
        rowClassName={(_, index) =>
          [striped && index % 2 === 1 ? styles.rowStriped : ''].filter(Boolean).join(' ')
        }
        onRow={
          onRowClick
            ? (row) => ({
                onClick: (event) => {
                  // Link/nút/select trong ô có hành vi riêng; không được mở hàng thêm lần nữa.
                  if (!isInteractiveTarget(event.target)) onRowClick(row);
                },
                className: styles.rowClickable,
              })
            : undefined
        }
        pagination={
          pagination
            ? {
                current: pagination.meta.page,
                pageSize: pagination.meta.limit,
                total: pagination.meta.total,
                showSizeChanger: true,
                showTotal: pagination.totalLabel,
                onChange: pagination.onChange,
              }
            : false
        }
      />
    </div>
  );
}

/**
 * Cột hành động chuẩn: luôn dính phải, luôn cùng bề rộng, luôn canh phải.
 *
 * Gom vì 14 bảng đang khai lại cụm này mỗi nơi một kiểu và **13/14 quên `fixed: 'right'`**
 * (D15.1) — cuộn ngang là mất nút thao tác. Figma `127:2060` R1–R2.
 *
 * `width` mặc định 160px để hành động chính có nhãn rõ trên desktop; mobile tự ẩn nhãn khi nút
 * có icon và gom phần dư vào menu.
 * R10: bảng không có hành động thì **đừng gọi hàm này** — cột rỗng còn tệ hơn không có cột.
 */
export function actionColumn<T>(
  getActions: (row: T) => RowAction[],
  options: { width?: number; title?: ReactNode; maxInline?: number } = {},
): DataTableColumn<T> {
  return {
    key: 'actions',
    title: options.title ?? 'Thao tác',
    align: 'right',
    fixed: 'right',
    width: options.width ?? 160,
    className: styles.actionsCell,
    render: (_, row) => (
      <RowActions actions={getActions(row)} maxInline={options.maxInline ?? 1} variant="filled" />
    ),
  };
}
