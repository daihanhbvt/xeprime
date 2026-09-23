'use client';

import { CarOutlined, EyeOutlined, SwapRightOutlined } from '@ant-design/icons';
import { Button, Tag } from 'antd';
import { PICKUP_URGENCY, pickupUrgency, type PickupUrgency } from '@xeprime/domain';
import {
  BOOKING_STATUS_META,
  HANDOVER_STATUS,
  HANDOVER_STATUS_META,
  STATUS_COLOR,
  type BookingStatus,
  type PaginationMeta,
} from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import type { BookingListItem } from '../types';
import styles from './BookingTable.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useTranslations } from 'next-intl';

interface BookingTableProps {
  items: BookingListItem[];
  meta: PaginationMeta;
  loading: boolean;
  error?: { onRetry: () => void } | null;
  filtered?: boolean;
  onClearFilters?: () => void;
  /** Nút tạo đơn đầu tiên — trang quyết theo quyền `BOOKING_CREATE`. */
  emptyAction?: React.ReactNode;
  /**
   * Bảng đang phục vụ nhóm việc "Chờ giao xe".
   *
   * Đổi CỘT, không chỉ thêm: một hàng đợi giao xe cần giờ hẹn, nơi giao và trạng thái biên bản;
   * tổng tiền, khoảng thuê và CỘT TRẠNG THÁI ĐƠN là câu hỏi của màn tra cứu, không phải của
   * người đang đứng ở quầy. Cột trạng thái đơn còn bị bỏ hẳn (ADR 0047): sau khi `confirmed`
   * rời khỏi luồng thật, mọi hàng ở đây chỉ còn đúng MỘT giá trị (`reserved`) — một cột luôn
   * hiện cùng một chữ không phải thông tin, nó là trang trí.
   */
  awaitingPickup?: boolean;
  onView: (id: string) => void;
  onPageChange: (page: number, pageSize: number) => void;
}

/** Figma `127:1725` ghi 1050px cho bảng Bookings (10 cột); code có 6 cột. */
const MIN_TABLE_WIDTH = 1060;

/** Màu của mức khẩn — quá giờ là việc phải xử lý ngay, không phải một lỗi của khách. */
const URGENCY_COLOR: Readonly<Record<PickupUrgency, string>> = {
  [PICKUP_URGENCY.OVERDUE]: STATUS_COLOR.DANGER,
  [PICKUP_URGENCY.TODAY]: STATUS_COLOR.WAITING,
  [PICKUP_URGENCY.UPCOMING]: STATUS_COLOR.NEUTRAL,
};

/**
 * Ba trạng thái biên bản GIAO XE mà cột "Bàn giao" ở "Chờ giao xe" có thể thấy — đã xác minh qua
 * `bookings-awaiting-pickup.spec.ts`: `pickupHandoverStatus` reaching this screen is never
 * `confirmed` (đơn đó đã rời danh sách) hay `canceled` (API đọc thành `null`).
 *
 * Nhãn RIÊNG cho màn này, không dùng chung `Domain.handoverStatus.*` (khoá đó đúng nghĩa hơn ở
 * trang chi tiết biên bản — "Bản nháp"/"Chờ xác nhận" — còn ở đây câu hỏi là "việc chuẩn bị xe
 * tới đâu rồi", nên chữ phải trả lời đúng câu đó). Màu vẫn mượn từ `HANDOVER_STATUS_META` để
 * nhất quán với mọi nơi khác vẽ trạng thái biên bản.
 */
const AWAITING_PICKUP_HANDOVER_LABEL_KEY = {
  none: 'awaitingPickup.handoverNotStarted',
  [HANDOVER_STATUS.DRAFT]: 'awaitingPickup.handoverPreparing',
  [HANDOVER_STATUS.READY]: 'awaitingPickup.handoverReady',
} as const;

export function BookingTable({
  items,
  meta,
  loading,
  error = null,
  filtered = false,
  onClearFilters,
  emptyAction,
  awaitingPickup = false,
  onView,
  onPageChange,
}: BookingTableProps) {
  const fmt = useAppFormat();
  const t = useTranslations('Bookings');
  const tCommon = useTranslations('Common');
  const label = useDomainLabel();

  const customerColumn: DataTableColumn<BookingListItem> = {
    title: t('card.customer'),
    key: 'customer',
    width: 240,
    render: (_, row) => (
      <div>
        <div className={styles.name}>{row.customerName}</div>
        <div className={styles.meta}>
          {row.code}
          {row.customerPhone ? ` · ${row.customerPhone}` : ''}
        </div>
      </div>
    ),
  };

  const vehicleColumn: DataTableColumn<BookingListItem> = {
    title: t('card.vehicle'),
    key: 'vehicle',
    width: 220,
    render: (_, row) => (
      <div className={styles.cell}>
        <CarOutlined className={styles.carIcon} aria-hidden="true" />
        <div>
          <div className={styles.name}>{row.vehicleName}</div>
          {row.vehiclePlate ? <div className={styles.meta}>{row.vehiclePlate}</div> : null}
        </div>
      </div>
    ),
  };

  const statusColumn: DataTableColumn<BookingListItem> = {
    title: t('card.status'),
    key: 'status',
    width: 140,
    render: (_, row) => (
      <StatusTag
        value={row.status as BookingStatus}
        meta={BOOKING_STATUS_META}
        group="bookingStatus"
      />
    ),
  };

  /** Cột riêng của hàng đợi giao xe: giờ hẹn + mức khẩn, nơi giao, trạng thái biên bản. */
  const awaitingColumns: DataTableColumn<BookingListItem>[] = [
    {
      title: t('awaitingPickup.whenColumn'),
      key: 'pickupAt',
      width: 220,
      render: (_, row) => {
        const urgency = pickupUrgency(row.pickupAt);
        return (
          <div>
            <div className={styles.name}>{fmt.shortDateTime(row.pickupAt)}</div>
            <Tag className={styles.urgency} color={URGENCY_COLOR[urgency]}>
              {t(`awaitingPickup.${urgency}`)}
            </Tag>
          </div>
        );
      },
    },
    {
      title: t('awaitingPickup.placeColumn'),
      key: 'handoverPlace',
      width: 260,
      render: (_, row) =>
        row.handoverPlaceKind ? (
          <div>
            {/* Mã → nhãn ở client (ADR 0012); chuỗi địa chỉ/tên chi nhánh là dữ liệu, không dịch. */}
            <div className={styles.meta}>
              {label('bookingHandoverPlace', row.handoverPlaceKind)}
            </div>
            <div className={styles.place}>
              {row.handoverPlace ?? t('awaitingPickup.placeUnknown')}
            </div>
          </div>
        ) : (
          <span className={styles.meta}>{t('awaitingPickup.placeUnknown')}</span>
        ),
    },
    {
      title: t('awaitingPickup.handoverColumn'),
      key: 'pickupHandoverStatus',
      width: 150,
      render: (_, row) => {
        /*
         * Phòng thủ: `pickupHandoverStatus` không đáng lẽ khác `null/draft/ready` ở đây (biên
         * bản đã xác nhận thì đơn đã rời danh sách "Chờ giao xe"), nhưng đọc dữ liệu server
         * không nên GIẢ ĐỊNH điều đó bằng một ép kiểu — rơi về nhãn "Chưa chuẩn bị" thay vì vẽ
         * một khoá dịch không tồn tại nếu một ngày nào đó điều kiện lọc đổi.
         */
        const status = row.pickupHandoverStatus;
        const labelKey =
          status && status in AWAITING_PICKUP_HANDOVER_LABEL_KEY
            ? AWAITING_PICKUP_HANDOVER_LABEL_KEY[status as 'draft' | 'ready']
            : AWAITING_PICKUP_HANDOVER_LABEL_KEY.none;
        const color = status
          ? (HANDOVER_STATUS_META[status as keyof typeof HANDOVER_STATUS_META]?.color ??
            STATUS_COLOR.NEUTRAL)
          : STATUS_COLOR.NEUTRAL;
        return <Tag color={color}>{t(labelKey)}</Tag>;
      },
    },
  ];

  const browseColumns: DataTableColumn<BookingListItem>[] = [
    {
      title: t('card.period'),
      key: 'period',
      width: 260,
      render: (_, row) => (
        <span className={styles.period}>{fmt.shortDateTimeRange(row.pickupAt, row.returnAt)}</span>
      ),
    },
    {
      title: t('card.total'),
      key: 'total',
      align: 'right',
      width: 140,
      render: (_, row) => <span className={styles.price}>{fmt.money(row.totalAmount)}</span>,
    },
  ];

  const columns: DataTableColumn<BookingListItem>[] = [
    customerColumn,
    vehicleColumn,
    ...(awaitingPickup ? awaitingColumns : [...browseColumns, statusColumn]),
    /*
     * Hàng đợi vẫn đi qua TRANG CHI TIẾT để bàn giao — ở đó mới có biên bản, số KM, ảnh hiện
     * trạng và các phép kiểm quyền của chính luồng đó. Một nút "xác nhận đã giao" ngay trên
     * dòng sẽ là một đường thứ hai đi tắt quy trình, và nó cũng buộc mỗi dòng tự hỏi trạng thái
     * biên bản của riêng mình (N+1).
     */
    actionColumn<BookingListItem>((row) => [
      {
        key: 'view',
        label: awaitingPickup ? t('awaitingPickup.action') : tCommon('actions.viewDetail'),
        icon: awaitingPickup ? <SwapRightOutlined /> : <EyeOutlined />,
        onClick: () => onView(row.id),
      },
    ]),
  ];

  return (
    <DataTable<BookingListItem>
      label={awaitingPickup ? t('awaitingPickup.tableLabel') : t('list.tableLabel')}
      columns={columns}
      items={items}
      minWidth={MIN_TABLE_WIDTH}
      loading={loading}
      error={
        error
          ? {
              title: t('list.errorTitle'),
              description: tCommon('states.errorHint'),
              onRetry: error.onRetry,
            }
          : null
      }
      filtered={filtered}
      empty={{
        title: awaitingPickup ? t('awaitingPickup.emptyTitle') : t('list.emptyTitle'),
        description: awaitingPickup ? t('awaitingPickup.emptyBody') : t('list.emptyBody'),
        action: emptyAction,
      }}
      noResults={{
        title: awaitingPickup
          ? t('awaitingPickup.emptyFilteredTitle')
          : t('list.emptyFilteredTitle'),
        description: awaitingPickup
          ? t('awaitingPickup.emptyFilteredBody')
          : t('list.emptyFilteredBody'),
        action: onClearFilters ? (
          <Button onClick={onClearFilters}>{tCommon('actions.clear')}</Button>
        ) : undefined,
      }}
      onRowClick={(row) => onView(row.id)}
      pagination={{
        meta,
        onChange: onPageChange,
        totalLabel: (total) =>
          awaitingPickup
            ? t('awaitingPickup.totalLabel', { count: total })
            : t('list.totalLabel', { count: total }),
      }}
    />
  );
}
