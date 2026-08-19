'use client';

import { Button, Pagination, Skeleton, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { HANDOVER_TYPE, PERMISSION, type PaginationMeta } from '@xeprime/types';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ROUTES, vehiclePath } from '@/constants/routes';
import { useIsMobile } from '@/hooks/use-media-query';
import { usePermissions } from '@/hooks/use-permissions';
import { getErrorCode } from '@/services/api-client';
import { useHandoverContext, useInvalidateHandovers } from '../hooks';
import type { MissingOdometerItem } from '../types';
import { ResolveOdometerDialog } from './ResolveOdometerDialog';
import styles from './MissingReturnKmQueue.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

/** Bề rộng sàn để bảng cuộn ngang thay vì nén cột (cùng kỷ luật `MaintenanceBoardTable`). */
const TABLE_MIN_WIDTH = 980;

/**
 * Hàng đợi "Thiếu KM trả" toàn gian hàng (Wave 8).
 *
 * Đây là VIỆC VẬN HÀNH, không phải phiếu bảo dưỡng: biên bản trả xe đã chốt nhưng chưa có KM,
 * nên KM có thẩm quyền của xe đang treo và mốc bảo dưỡng chưa tính được. Giải quyết xong,
 * biên bản tự rời hàng đợi — không có bước "đánh dấu đã xong" thủ công.
 *
 * Xem việc cần `handovers.view`; BỔ SUNG KM cần `vehicles.odometer.correct` — hàng đợi không
 * tự cấp thêm quyền nào, và backend vẫn là nơi chặn thật.
 */
export function MissingReturnKmQueue({
  items,
  meta,
  loading,
  error,
  onPageChange,
  onResolved,
}: {
  items: MissingOdometerItem[];
  meta: PaginationMeta;
  loading: boolean;
  error?: { onRetry: () => void } | null;
  onPageChange: (page: number, pageSize: number) => void;
  onResolved: () => void;
}) {
  const fmt = useAppFormat();

  const { has } = usePermissions();
  const isMobile = useIsMobile();
  const [resolving, setResolving] = useState<MissingOdometerItem | null>(null);

  const canView = has(PERMISSION.HANDOVER_VIEW);
  const canResolve = has(PERMISSION.VEHICLE_ODOMETER_CORRECT);

  if (!canView) {
    return (
      <PermissionState
        kind="forbidden"
        title="Không có quyền xem việc bàn giao"
        description="Danh sách này thuộc biên bản bàn giao. Liên hệ quản trị viên nếu bạn cần quyền xem."
        missingPermissions={[PERMISSION.HANDOVER_VIEW]}
      />
    );
  }

  if (error) {
    return (
      <EmptyState
        variant="error"
        title="Không tải được danh sách việc thiếu KM"
        description="Kết nối có thể bị gián đoạn. Thử lại để xem việc còn tồn đọng."
        onRetry={error.onRetry}
      />
    );
  }

  if (loading && items.length === 0) {
    return <Skeleton active paragraph={{ rows: 4 }} />;
  }

  if (items.length === 0) {
    return (
      <EmptyState
        variant="empty"
        title="Không còn việc thiếu KM trả"
        description="Mọi biên bản trả xe đã có chỉ số KM — số KM của đội xe đang đầy đủ."
      />
    );
  }

  const columns: ColumnsType<MissingOdometerItem> = [
    {
      title: 'Xe',
      key: 'vehicle',
      width: 260,
      render: (_, row) => (
        <div className={styles.vehicleCell}>
          <Link href={vehiclePath.detail(row.vehicleId)}>{row.vehicleName}</Link>
          <span className={styles.sub}>{row.plateNumber ?? 'Chưa có biển số'}</span>
        </div>
      ),
    },
    {
      title: 'Đơn thuê',
      key: 'booking',
      width: 180,
      render: (_, row) => (
        <Link href={`${ROUTES.MANAGE.BOOKINGS}?booking=${row.bookingId}`}>{row.bookingCode}</Link>
      ),
    },
    {
      title: 'Xác nhận trả lúc',
      key: 'confirmedAt',
      width: 220,
      render: (_, row) => (
        <div className={styles.vehicleCell}>
          <span>{fmt.dateTime(row.confirmedAt)}</span>
          {row.confirmedByName ? <span className={styles.sub}>{row.confirmedByName}</span> : null}
        </div>
      ),
    },
    {
      title: 'KM lúc giao',
      key: 'pickupKm',
      width: 160,
      align: 'end',
      // Chưa có số thì nói "Chưa có" — KHÔNG dựng 0 km (docs §9).
      render: (_, row) => fmt.km(row.pickupOdometerKm),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 160,
      fixed: 'right',
      render: (_, row) =>
        canResolve ? (
          <Button size="small" type="primary" onClick={() => setResolving(row)}>
            Bổ sung KM
          </Button>
        ) : (
          // Không có quyền thì KHÔNG hiện nút chết — nói thẳng cần quyền gì.
          <span className={styles.sub}>Cần quyền chỉnh KM</span>
        ),
    },
  ];

  return (
    <section className={styles.root} aria-label="Việc thiếu KM trả">
      {isMobile ? (
        <ul className={styles.cards} aria-label="Việc thiếu KM trả">
          {items.map((row) => (
            <li key={row.handoverId} className={styles.card}>
              <div className={styles.cardHead}>
                <Link href={vehiclePath.detail(row.vehicleId)} className={styles.cardTitle}>
                  {row.vehicleName}
                </Link>
                <span className={styles.sub}>{row.plateNumber ?? 'Chưa có biển số'}</span>
              </div>
              <p className={styles.cardMeta}>
                Đơn{' '}
                <Link href={`${ROUTES.MANAGE.BOOKINGS}?booking=${row.bookingId}`}>
                  {row.bookingCode}
                </Link>{' '}
                · {fmt.dateTime(row.confirmedAt)}
              </p>
              <p className={styles.cardMeta}>KM lúc giao: {fmt.km(row.pickupOdometerKm)}</p>
              {canResolve ? (
                <Button
                  type="primary"
                  block
                  className={styles.cardButton}
                  onClick={() => setResolving(row)}
                >
                  Bổ sung KM
                </Button>
              ) : (
                <p className={styles.sub}>Cần quyền chỉnh KM</p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.tableRoot}>
          <Table
            rowKey="handoverId"
            columns={columns}
            dataSource={items}
            pagination={false}
            size="middle"
            scroll={{ x: TABLE_MIN_WIDTH }}
          />
        </div>
      )}

      <div className={styles.footer}>
        <Pagination
          current={meta.page}
          pageSize={meta.limit}
          total={meta.total}
          showSizeChanger={false}
          size="small"
          onChange={onPageChange}
        />
      </div>

      {resolving ? (
        <ResolveQueueItem item={resolving} onClose={() => setResolving(null)} onSaved={onResolved} />
      ) : null}
    </section>
  );
}

/**
 * Mở hộp bổ sung KM cho một việc trong hàng đợi.
 *
 * Tải ngữ cảnh bàn giao của đúng đơn đó rồi dùng LẠI `ResolveOdometerDialog` của Wave 7 — cùng
 * luật lý do bắt buộc, cùng xử lý giảm KM và cùng UX 409. Dựng một hộp thoại thứ hai ở đây là
 * cách để hai chỗ trôi khỏi nhau.
 */
function ResolveQueueItem({
  item,
  onClose,
  onSaved,
}: {
  item: MissingOdometerItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data, isLoading, isError, error, refetch } = useHandoverContext(item.bookingId);
  const invalidate = useInvalidateHandovers(item.bookingId, item.vehicleId);
  const handover = data?.return ?? null;

  /**
   * Việc đã được người khác xử lý xong (hoặc biên bản không còn) — CHỈ khi server trả lời
   * thành công mà không còn việc phải làm. Lỗi mạng/500 KHÔNG rơi vào nhánh này.
   *
   * Wave 8.1: trước đây `onClose()`/`onSaved()` được gọi ngay trong thân render, nên React
   * cảnh báo cập nhật state khi đang render, và một lần rớt mạng bị tính là "đã xử lý xong" —
   * việc biến khỏi hàng đợi dù KM vẫn thiếu.
   */
  const resolvedElsewhere = !isLoading && !isError && (!data || !handover?.odometerMissing);

  // Chốt "đã báo rồi" bằng ref: cha truyền callback dạng arrow nên identity đổi mỗi lần render,
  // không có chốt này thì effect chạy lại liên tục và thành vòng làm mới vô hạn.
  const notified = useRef(false);
  useEffect(() => {
    if (!resolvedElsewhere || notified.current) return;
    notified.current = true;
    onClose();
    onSaved();
  }, [resolvedElsewhere, onClose, onSaved]);

  if (isLoading) return <Skeleton active paragraph={{ rows: 2 }} />;

  if (isError) {
    // Thiếu quyền là câu trả lời cuối cùng, không phải sự cố tạm — không mời thử lại.
    if (getErrorCode(error) === 'FORBIDDEN' || getErrorCode(error) === 'MISSING_PERMISSION') {
      return (
        <PermissionState
          kind="forbidden"
          title="Không có quyền mở biên bản bàn giao này"
          description="Bổ sung KM cần quyền xem bàn giao của đơn tương ứng."
        />
      );
    }
    // Lỗi mạng/máy chủ: GIỮ nguyên bề mặt và cho thử lại — không âm thầm coi việc là đã xong.
    return (
      <EmptyState
        variant="error"
        title="Không tải được biên bản để bổ sung KM"
        description="Kết nối có thể bị gián đoạn. Việc này vẫn còn trong hàng đợi."
        onRetry={() => void refetch()}
        secondaryAction={<Button onClick={onClose}>Đóng</Button>}
      />
    );
  }

  if (resolvedElsewhere || !data || !handover) return null;

  return (
    <ResolveOdometerDialog
      open
      type={HANDOVER_TYPE.RETURN}
      context={data}
      handover={handover}
      onClose={onClose}
      onSaved={() => {
        // `invalidate()` lo các nhánh của đơn/xe; `onSaved()` lo hàng đợi + số đếm ở trang cha.
        // Hai phạm vi khác nhau, gọi đúng một lần mỗi bên — không có vòng làm mới lặp.
        invalidate();
        onSaved();
      }}
    />
  );
}
