'use client';

import { App, Button, Pagination, Skeleton, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { HANDOVER_TYPE, PERMISSION, type PaginationMeta } from '@xeprime/types';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PermissionState } from '@/components/feedback/PermissionState';
import { bookingPath, vehiclePath } from '@/constants/routes';
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
 *
 * `requestedBookingId` là đích của nút "Xử lý ngay" ở Hồ sơ xe (`?resolve=<bookingId>`): mở
 * thẳng hộp bổ sung KM của biên bản đó, kể cả khi nó không nằm ở trang đang xem. Thiếu quyền
 * chỉnh KM thì bỏ qua và chỉ hiện hàng đợi. Đóng hộp ⇒ `onRequestHandled` xoá tham số khỏi URL
 * để F5 không bật lại hộp cũ.
 */
export function MissingReturnKmQueue({
  items,
  meta,
  loading,
  error,
  onPageChange,
  onResolved,
  requestedBookingId,
  onRequestHandled,
}: {
  items: MissingOdometerItem[];
  meta: PaginationMeta;
  loading: boolean;
  error?: { onRetry: () => void } | null;
  onPageChange: (page: number, pageSize: number) => void;
  onResolved: () => void;
  requestedBookingId?: string;
  onRequestHandled?: () => void;
}) {
  const t = useTranslations('Maintenance.missingKmQueue');
  const fmt = useAppFormat();

  const { has } = usePermissions();
  const isMobile = useIsMobile();
  const [resolving, setResolving] = useState<string | null>(null);

  const canView = has(PERMISSION.HANDOVER_VIEW);
  const canResolve = has(PERMISSION.VEHICLE_ODOMETER_CORRECT);

  // Bấm một dòng thắng biên bản từ URL; đóng hộp thì dọn cả hai.
  const openBookingId = resolving ?? (canResolve ? (requestedBookingId ?? null) : null);
  const closeResolve = () => {
    setResolving(null);
    if (requestedBookingId) onRequestHandled?.();
  };

  if (!canView) {
    return (
      <PermissionState
        kind="forbidden"
        title={t('forbidden')}
        description={t('forbiddenHint')}
        missingPermissions={[PERMISSION.HANDOVER_VIEW]}
      />
    );
  }

  /*
   * Hộp bổ sung KM đứng NGOÀI các nhánh rỗng/lỗi/đang tải của danh sách: biên bản mở từ link có
   * thể không thuộc trang (hay chi nhánh) đang lọc, và nó tự tải ngữ cảnh của riêng nó.
   */
  const resolveDialog = openBookingId ? (
    <ResolveQueueItem
      key={openBookingId}
      bookingId={openBookingId}
      onClose={closeResolve}
      onSaved={onResolved}
    />
  ) : null;

  if (error) {
    return (
      <>
        <EmptyState
          variant="error"
          title={t('loadError')}
          description={t('loadErrorHint')}
          onRetry={error.onRetry}
        />
        {resolveDialog}
      </>
    );
  }

  if (loading && items.length === 0) {
    return (
      <>
        <Skeleton active paragraph={{ rows: 4 }} />
        {resolveDialog}
      </>
    );
  }

  if (items.length === 0) {
    return (
      <>
        <EmptyState variant="empty" title={t('empty')} description={t('emptyHint')} />
        {resolveDialog}
      </>
    );
  }

  const columns: ColumnsType<MissingOdometerItem> = [
    {
      title: t('columns.vehicle'),
      key: 'vehicle',
      width: 260,
      render: (_, row) => (
        <div className={styles.vehicleCell}>
          <Link href={vehiclePath.detail(row.vehicleId)}>{row.vehicleName}</Link>
          <span className={styles.sub}>{row.plateNumber ?? t('noPlate')}</span>
        </div>
      ),
    },
    {
      title: t('columns.booking'),
      key: 'booking',
      width: 180,
      render: (_, row) => <Link href={bookingPath.detail(row.bookingId)}>{row.bookingCode}</Link>,
    },
    {
      title: t('columns.confirmedAt'),
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
      title: t('columns.pickupKm'),
      key: 'pickupKm',
      width: 160,
      align: 'end',
      // Chưa có số thì nói "Chưa có" — KHÔNG dựng 0 km (docs §9).
      render: (_, row) => fmt.km(row.pickupOdometerKm),
    },
    {
      title: t('columns.actions'),
      key: 'actions',
      width: 160,
      fixed: 'right',
      render: (_, row) =>
        canResolve ? (
          <Button size="small" type="primary" onClick={() => setResolving(row.bookingId)}>
            {t('resolve')}
          </Button>
        ) : (
          // Không có quyền thì KHÔNG hiện nút chết — nói thẳng cần quyền gì.
          <span className={styles.sub}>{t('needPermission')}</span>
        ),
    },
  ];

  return (
    <section className={styles.root} aria-label={t('listLabel')}>
      {isMobile ? (
        <ul className={styles.cards} aria-label={t('listLabel')}>
          {items.map((row) => (
            <li key={row.handoverId} className={styles.card}>
              <div className={styles.cardHead}>
                <Link href={vehiclePath.detail(row.vehicleId)} className={styles.cardTitle}>
                  {row.vehicleName}
                </Link>
                <span className={styles.sub}>{row.plateNumber ?? t('noPlate')}</span>
              </div>
              <p className={styles.cardMeta}>
                {t.rich('cardBooking', {
                  code: row.bookingCode,
                  time: fmt.dateTime(row.confirmedAt),
                  link: (chunks) => <Link href={bookingPath.detail(row.bookingId)}>{chunks}</Link>,
                })}
              </p>
              <p className={styles.cardMeta}>
                {t('cardPickupKm', { km: fmt.km(row.pickupOdometerKm) })}
              </p>
              {canResolve ? (
                <Button
                  type="primary"
                  block
                  className={styles.cardButton}
                  onClick={() => setResolving(row.bookingId)}
                >
                  {t('resolve')}
                </Button>
              ) : (
                <p className={styles.sub}>{t('needPermission')}</p>
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

      {resolveDialog}
    </section>
  );
}

/**
 * Mở hộp bổ sung KM cho một biên bản trả xe, theo `bookingId` của đơn.
 *
 * Tải ngữ cảnh bàn giao của đúng đơn đó rồi dùng LẠI `ResolveOdometerDialog` của Wave 7 — cùng
 * luật lý do bắt buộc, cùng xử lý giảm KM và cùng UX 409. Dựng một hộp thoại thứ hai ở đây là
 * cách để hai chỗ trôi khỏi nhau. Chỉ cần `bookingId` (xe đọc từ ngữ cảnh) để mở được cả biên
 * bản đến từ link "Xử lý ngay", vốn không chắc nằm trong trang hàng đợi đang tải.
 */
function ResolveQueueItem({
  bookingId,
  onClose,
  onSaved,
}: {
  bookingId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('Maintenance.missingKmQueue');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const { data, isLoading, isError, error, refetch } = useHandoverContext(bookingId);
  const invalidate = useInvalidateHandovers(bookingId, data?.vehicleId);
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
    // Nói ra lý do hộp không mở — nhất là khi người dùng đến từ link "Xử lý ngay" cũ.
    message.info(t('alreadyResolved'));
    onClose();
    onSaved();
  }, [resolvedElsewhere, onClose, onSaved, message, t]);

  if (isLoading) return <Skeleton active paragraph={{ rows: 2 }} />;

  if (isError) {
    // Thiếu quyền là câu trả lời cuối cùng, không phải sự cố tạm — không mời thử lại.
    if (getErrorCode(error) === 'FORBIDDEN' || getErrorCode(error) === 'MISSING_PERMISSION') {
      return (
        <PermissionState
          kind="forbidden"
          title={t('resolveForbidden')}
          description={t('resolveForbiddenHint')}
        />
      );
    }
    // Lỗi mạng/máy chủ: GIỮ nguyên bề mặt và cho thử lại — không âm thầm coi việc là đã xong.
    return (
      <EmptyState
        variant="error"
        title={t('resolveLoadError')}
        description={t('resolveLoadErrorHint')}
        onRetry={() => void refetch()}
        secondaryAction={<Button onClick={onClose}>{tCommon('actions.close')}</Button>}
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
