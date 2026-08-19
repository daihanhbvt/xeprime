'use client';

import { useQuery } from '@tanstack/react-query';
import { Alert, DatePicker, Modal, Select, Skeleton } from 'antd';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  LONG_TERM_PACKAGE_MONTHS,
  longTermReturnAt,
  PICKUP_PREFERENCE,
  SERVICE_TYPE,
  type LongTermPackageMonths,
} from '@xeprime/types';
import { PriceBreakdown } from '@/components/data-display/PriceBreakdown';
import { fetchCalendarQuote } from '@/features/calendar/api';
import { useAppFormat, useDatePickerPattern } from '@/i18n/use-app-format';
import { dayjs, startOfAppDay, toAppTz, type Dayjs } from '@/lib/datetime';
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

/** Giờ nhận gợi ý khi khách chỉ nêu NGÀY — 9h sáng, giờ mở cửa thường thấy của gian hàng. */
const DEFAULT_PICKUP_HOUR = 9;

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
  const t = useTranslations('BookingRequests');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  /*
   * Mẫu ngày của ô chọn đổi theo ngôn ngữ (`DD/MM/YYYY` ↔ `MM/DD/YYYY`). Nó vừa HIỂN THỊ vừa
   * PHÂN TÍCH thứ người dùng gõ, nên để nguyên mẫu Việt ở giao diện tiếng Anh sẽ nhận nhầm
   * ngày thành tháng suốt nửa đầu mỗi tháng — sai âm thầm, không báo lỗi.
   */
  const pattern = useDatePickerPattern();

  const requestPackage = request.longTermPackageMonths ?? null;

  /*
   * `requestedPickupDate`/`pickupWindow*` là NGÀY LỊCH `YYYY-MM-DD` theo giờ Việt Nam, không
   * phải mốc thời gian — dựng bằng `startOfAppDay` chứ không `dayjs(value)`, vì `dayjs` của
   * một chuỗi ngày trần lấy nửa đêm THEO MÁY người dùng và máy ở UTC+10 sẽ lùi mất một ngày.
   */
  const [pickupAt, setPickupAt] = useState<Dayjs | null>(() =>
    request.requestedPickupDate
      ? startOfAppDay(request.requestedPickupDate).hour(DEFAULT_PICKUP_HOUR)
      : request.pickupWindowStartDate
        ? startOfAppDay(request.pickupWindowStartDate).hour(DEFAULT_PICKUP_HOUR)
        : request.pickupAt
          ? toAppTz(request.pickupAt)
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
        ? toAppTz(longTermReturnAt(pickupAt.toDate(), effectivePackage))
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
        serviceType: SERVICE_TYPE.LONG_TERM,
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
    if (request.pickupPreference === PICKUP_PREFERENCE.SPECIFIC_DATE && request.requestedPickupDate) {
      return !current.isSame(startOfAppDay(request.requestedPickupDate), 'day');
    }
    if (
      request.pickupPreference === PICKUP_PREFERENCE.WITHIN_7_DAYS &&
      request.pickupWindowStartDate &&
      request.pickupWindowEndDate
    ) {
      const start = startOfAppDay(request.pickupWindowStartDate);
      const end = startOfAppDay(request.pickupWindowEndDate).endOf('day');
      return current.isBefore(start) || current.isAfter(end);
    }
    // Yêu cầu LEGACY (hoặc thiếu dữ liệu nguyện vọng): chỉ chặn ngày quá khứ.
    return current.isBefore(dayjs().startOf('day'));
  }

  /*
   * Câu chữ nguyện vọng đi qua ĐÚNG cửa `useAppFormat().pickupWish` như bốn bề mặt còn lại
   * (ADR 0011/0012) — không `dayjs.format('DD/MM/YYYY')` tại chỗ, thứ vừa bỏ qua ngôn ngữ vừa
   * làm hộp thoại này nói khác inbox ngay bên cạnh.
   */
  const wishText =
    request.pickupPreference == null ? t('longTerm.wishLegacy') : fmt.pickupWish(request);

  return (
    <Modal
      open
      title={t('longTerm.title')}
      okText={t('longTerm.confirm')}
      cancelText={tCommon('actions.cancel')}
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
            <dt>{t('longTerm.customer')}</dt>
            <dd>
              {request.customerName} · {request.customerPhone}
            </dd>
          </div>
          <div className={styles.row}>
            <dt>{t('longTerm.vehicle')}</dt>
            <dd>{request.vehicleName}</dd>
          </div>
          <div className={styles.row}>
            <dt>{t('longTerm.pickupWish')}</dt>
            <dd>{wishText}</dd>
          </div>
        </dl>

        {requestPackage == null ? (
          <label className={styles.field}>
            <span className={styles.label}>{t('longTerm.legacyPackageLabel')}</span>
            <Select<LongTermPackageMonths>
              value={packageMonths ?? undefined}
              onChange={setPackageMonths}
              placeholder={t('longTerm.legacyPackagePlaceholder')}
              options={LONG_TERM_PACKAGE_MONTHS.map((m) => ({
                value: m,
                label: fmt.packageLabel(m),
              }))}
            />
            <span className={styles.hint}>{t('longTerm.legacyPackageHint')}</span>
          </label>
        ) : (
          <div className={styles.field}>
            <span className={styles.label}>{t('longTerm.chosenPackageLabel')}</span>
            <strong>{fmt.packageLabel(requestPackage)}</strong>
          </div>
        )}

        <label className={styles.field}>
          <span className={styles.label}>{t('longTerm.pickupLabel')}</span>
          <DatePicker
            showTime={{ format: 'HH:mm', minuteStep: 15 }}
            format={pattern.dateTime}
            value={pickupAt}
            onChange={setPickupAt}
            disabledDate={disabledDate}
            placeholder={t('longTerm.pickupPlaceholder')}
            aria-label={t('longTerm.pickupLabel')}
          />
          <span className={styles.hint}>{t('longTerm.pickupHint')}</span>
        </label>

        <div className={styles.field}>
          <span className={styles.label}>{t('longTerm.returnLabel')}</span>
          <strong>
            {returnAt ? fmt.rentalPoint(returnAt) : tCommon('labels.emptyValue')}
          </strong>
          <span className={styles.hint}>{t('longTerm.returnHint')}</span>
        </div>

        {effectivePackage != null ? (
          quoteQ.isLoading ? (
            <Skeleton active paragraph={{ rows: 3 }} title={false} />
          ) : quoteQ.data ? (
            <PriceBreakdown
              rows={quoteQ.data.rows}
              totalAmount={quoteQ.data.totalAmount}
              depositAmount={quoteQ.data.depositAmount}
              title={t('longTerm.quoteTitle', { package: fmt.packageLabel(effectivePackage) ?? '' })}
            />
          ) : (
            <Alert type="warning" showIcon message={t('longTerm.quoteUnavailable')} />
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
