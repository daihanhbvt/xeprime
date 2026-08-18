'use client';

import { useQuery } from '@tanstack/react-query';
import { Alert, DatePicker, Modal, Select, Skeleton } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import {
  LONG_TERM_PACKAGE_MONTHS,
  longTermPackageLabel,
  longTermReturnAt,
  PICKUP_PREFERENCE,
  PICKUP_PREFERENCE_LABEL,
  type LongTermPackageMonths,
} from '@xeprime/types';
import { PriceBreakdown } from '@/components/data-display/PriceBreakdown';
import { fetchCalendarQuote } from '@/features/calendar/api';
import { queryKeys } from '@/services/query-keys';
import type { ApproveBookingRequestInput, BookingRequestItem } from '../types';

import styles from './ApproveLongTermDialog.module.css';

interface Props {
  request: BookingRequestItem | null;
  submitting: boolean;
  /** Lỗi từ lần duyệt vừa rồi (vd trùng lịch 409) — hộp thoại ở lại để chọn giờ khác. */
  error: string | null;
  onCancel: () => void;
  onConfirm: (body: ApproveBookingRequestInput) => void;
}

/**
 * Ruột hộp thoại. Tách ra để `key={request.id}` REMOUNT khi đổi yêu cầu — state nạp lại từ
 * chính yêu cầu đó thay vì phải setState trong effect (state khởi tạo, không đồng bộ).
 */
function ApproveLongTermForm({
  request,
  submitting,
  error,
  onCancel,
  onConfirm,
}: Props & { request: BookingRequestItem }) {
  const requestPackage = request.longTermPackageMonths ?? null;

  const [pickupAt, setPickupAt] = useState<Dayjs | null>(() =>
    request.requestedPickupDate
      ? dayjs(request.requestedPickupDate).hour(9).startOf('hour')
      : request.pickupWindowStartDate
        ? dayjs(request.pickupWindowStartDate).hour(9).startOf('hour')
        : request.pickupAt
          ? dayjs(request.pickupAt)
          : null,
  );
  /** Chỉ dùng cho yêu cầu LEGACY chưa mang gói — yêu cầu mới lấy gói của khách, không sửa được. */
  const [packageMonths, setPackageMonths] = useState<LongTermPackageMonths | null>(
    (requestPackage as LongTermPackageMonths | null) ?? null,
  );

  const effectivePackage = requestPackage ?? packageMonths;

  /** Ngày trả suy từ gói — hiển thị read-only; server tính lại đúng con số này khi tạo đơn. */
  const returnAt = useMemo(
    () =>
      pickupAt && effectivePackage != null
        ? dayjs(longTermReturnAt(pickupAt.toDate(), effectivePackage))
        : null,
    [pickupAt, effectivePackage],
  );

  const quoteQ = useQuery({
    queryKey: queryKeys.calendar.quote({
      vehicleId: request.vehicleId,
      packageMonths: effectivePackage ?? 0,
    }),
    queryFn: () =>
      fetchCalendarQuote({
        vehicleId: request.vehicleId,
        serviceType: 'long_term',
        packageMonths: effectivePackage!,
      }),
    enabled: effectivePackage != null,
    staleTime: 60_000,
    retry: false,
  });

  /**
   * Khoá ngày ra ngoài nguyện vọng của khách: đổi lịch khách yêu cầu không được làm im lặng ở
   * bước duyệt — hoặc chốt đúng nguyện vọng, hoặc từ chối để hai bên thoả thuận lại.
   */
  function disabledDate(current: Dayjs): boolean {
    if (request.pickupPreference === PICKUP_PREFERENCE.SPECIFIC_DATE) {
      return !current.isSame(dayjs(request.requestedPickupDate ?? undefined), 'day');
    }
    if (request.pickupPreference === PICKUP_PREFERENCE.WITHIN_7_DAYS) {
      const start = dayjs(request.pickupWindowStartDate ?? undefined).startOf('day');
      const end = dayjs(request.pickupWindowEndDate ?? undefined).endOf('day');
      return current.isBefore(start) || current.isAfter(end);
    }
    // Yêu cầu LEGACY không có nguyện vọng: chỉ chặn ngày quá khứ.
    return current.isBefore(dayjs().startOf('day'));
  }

  const wishText =
    request.pickupPreference === PICKUP_PREFERENCE.SPECIFIC_DATE
      ? `${PICKUP_PREFERENCE_LABEL[PICKUP_PREFERENCE.SPECIFIC_DATE]} · ${dayjs(request.requestedPickupDate ?? undefined).format('DD/MM/YYYY')}`
      : request.pickupPreference === PICKUP_PREFERENCE.WITHIN_7_DAYS
        ? `${PICKUP_PREFERENCE_LABEL[PICKUP_PREFERENCE.WITHIN_7_DAYS]} · ${dayjs(request.pickupWindowStartDate ?? undefined).format('DD/MM')} – ${dayjs(request.pickupWindowEndDate ?? undefined).format('DD/MM/YYYY')}`
        : 'Yêu cầu cũ — khách chưa nêu nguyện vọng theo mẫu mới';

  return (
    <Modal
      open
      title="Duyệt yêu cầu thuê dài hạn"
      okText="Duyệt và tạo đơn"
      cancelText="Đóng"
      confirmLoading={submitting}
      okButtonProps={{ disabled: !pickupAt || effectivePackage == null }}
      onCancel={onCancel}
      onOk={() =>
        pickupAt && effectivePackage != null
          ? onConfirm({
              scheduledPickupAt: pickupAt.toISOString(),
              // Chỉ gửi gói khi yêu cầu chưa có — không được đổi gói khách đã chọn.
              ...(requestPackage == null ? { longTermPackageMonths: effectivePackage } : {}),
            })
          : undefined
      }
    >
      <div className={styles.body}>
        <dl className={styles.facts}>
          <div className={styles.row}>
            <dt>Khách</dt>
            <dd>
              {request.customerName} · {request.customerPhone}
            </dd>
          </div>
          <div className={styles.row}>
            <dt>Xe</dt>
            <dd>{request.vehicleName}</dd>
          </div>
          <div className={styles.row}>
            <dt>Nguyện vọng nhận xe</dt>
            <dd>{wishText}</dd>
          </div>
        </dl>

        {requestPackage == null ? (
          <label className={styles.field}>
            <span className={styles.label}>Gói thuê (yêu cầu cũ chưa có gói)</span>
            <Select<LongTermPackageMonths>
              value={packageMonths ?? undefined}
              onChange={setPackageMonths}
              placeholder="Chọn gói thuê"
              options={LONG_TERM_PACKAGE_MONTHS.map((m) => ({
                value: m,
                label: longTermPackageLabel(m),
              }))}
            />
            <span className={styles.hint}>
              Yêu cầu gửi trước khi chuyển sang mô hình gói nên không mang gói nào. Chọn gói đã thoả
              thuận với khách — hệ thống cố ý không tự suy từ khoảng ngày cũ.
            </span>
          </label>
        ) : (
          <div className={styles.field}>
            <span className={styles.label}>Gói khách đã chọn</span>
            <strong>{longTermPackageLabel(requestPackage)}</strong>
          </div>
        )}

        <label className={styles.field}>
          <span className={styles.label}>Ngày và giờ nhận xe (bắt buộc)</span>
          <DatePicker
            showTime={{ format: 'HH:mm', minuteStep: 15 }}
            format="DD/MM/YYYY HH:mm"
            value={pickupAt}
            onChange={setPickupAt}
            disabledDate={disabledDate}
            placeholder="Chọn ngày giờ nhận xe"
            aria-label="Ngày và giờ nhận xe"
          />
          <span className={styles.hint}>
            Chỉ chọn được trong nguyện vọng khách đã nêu. Muốn ngày khác thì từ chối yêu cầu và trao
            đổi lại với khách.
          </span>
        </label>

        <div className={styles.field}>
          <span className={styles.label}>Ngày trả (tự tính theo tháng lịch)</span>
          <strong>{returnAt ? returnAt.format('DD/MM/YYYY HH:mm') : '—'}</strong>
          <span className={styles.hint}>
            Độ dài đơn bằng đúng gói khách mua — không sửa tay được.
          </span>
        </div>

        {effectivePackage != null ? (
          quoteQ.isLoading ? (
            <Skeleton active paragraph={{ rows: 3 }} title={false} />
          ) : quoteQ.data ? (
            <PriceBreakdown
              rows={quoteQ.data.rows}
              totalAmount={quoteQ.data.totalAmount}
              depositAmount={quoteQ.data.depositAmount}
              title={`Giá gói ${longTermPackageLabel(effectivePackage)}`}
            />
          ) : (
            <Alert
              type="warning"
              showIcon
              message="Chưa tải được giá gói — kiểm tra giá thuê dài hạn của xe trước khi duyệt."
            />
          )
        ) : null}

        {error ? <Alert type="error" showIcon message={error} /> : null}
      </div>
    </Modal>
  );
}

/**
 * Duyệt một yêu cầu THUÊ DÀI HẠN (ADR 0011).
 *
 * Khách chỉ nêu nguyện vọng — gian hàng là bên CHỐT ngày/giờ nhận chính xác. Hộp thoại này vì
 * thế bắt buộc chọn giờ nhận, khoá ngày ra ngoài nguyện vọng của khách (server kiểm lại), hiện
 * ngày trả do gói suy ra dưới dạng CHỈ ĐỌC, và cho xem giá gói trước khi bấm duyệt.
 *
 * Trùng lịch trả 409: hộp thoại KHÔNG đóng, giữ nguyên lựa chọn để chọn giờ khác — constraint
 * DB mới là chỗ quyết định (ADR 0006), preview ở đây không thay thế nó.
 *
 * Remount theo `request.id` để state luôn khớp yêu cầu đang mở.
 */
export function ApproveLongTermDialog(props: Props) {
  if (!props.request) return null;
  return <ApproveLongTermForm key={props.request.id} {...props} request={props.request} />;
}
