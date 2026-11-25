'use client';

import { CalendarOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Result, Segmented, Skeleton, Spin } from 'antd';
import type { Dayjs } from 'dayjs';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { defaultRentalRange } from '@xeprime/domain';
import {
  RENTAL_MODE,
  ROUTE_TYPE,
  SERVICE_TYPE,
  VEHICLE_TYPE,
  VEHICLE_TYPE_VALUES,
  type VehicleType,
} from '@xeprime/types';
import { EmptyState } from '@/components/feedback/EmptyState';
import { AutoSearchInput } from '@/components/filter/AutoSearchInput';
import segmentedStyles from '@/components/filter/segmented.module.css';
import {
  RentalDateTimeRangeField,
  type RentalMode,
  type RentalRange,
} from '@/components/form/RentalDateTimeRangeField';
import { BranchFilterSelect } from '@/features/branches/components/BranchFilterSelect';
import { useBranchFilter } from '@/features/branches/hooks/use-branch-filter';
import { fetchCalendarQuote } from '@/features/calendar/api';
import { useBookingPickerVehicles } from '@/features/vehicles/hooks/use-booking-picker-vehicles';
import type { VehicleBookingPickerItem } from '@/features/vehicles/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { appWallClockToIso, toAppTz } from '@/lib/datetime';
import { getErrorMessage } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import { StaffVehicleCard } from './StaffVehicleCard';
import styles from './StaffVehiclePicker.module.css';

/** Nạp trang kế TRƯỚC khi chạm đáy — người dùng không thấy khoảng chờ giữa hai trang. */
const PREFETCH_MARGIN = '400px 0px';

/** Khoảng thuê đã chọn — ISO UTC, đúng dạng luồng đặt hộ nhận làm giá trị mở đầu. */
export interface PickedRange {
  pickupAt: string;
  returnAt: string;
}

interface StaffVehiclePickerProps {
  /** Chi nhánh màn gọi đang lọc — GỢI Ý mở đầu, đổi được ngay tại đây (ADR 0052). */
  defaultBranchId?: string;
  /** Khung giờ đã chọn lần trước (quay lại từ "Chọn xe khác") — không bắt chọn lại. */
  initialRange?: PickedRange | null;
  onCancel: () => void;
  onContinue: (vehicle: VehicleBookingPickerItem, range: PickedRange) => void;
}

function initialRangeOf(initial?: PickedRange | null): RentalRange {
  if (initial) return { pickupAt: toAppTz(initial.pickupAt), returnAt: toAppTz(initial.returnAt) };
  return defaultRentalRange();
}

/** Dịch vụ để TẠM TÍNH ở chân hộp: tự lái nếu xe có, không thì có tài xế (nội thành). */
function estimateServiceOf(vehicle: VehicleBookingPickerItem) {
  if (vehicle.serviceTypes.includes(SERVICE_TYPE.SELF_DRIVE)) {
    return { serviceType: SERVICE_TYPE.SELF_DRIVE };
  }
  if (vehicle.serviceTypes.includes(SERVICE_TYPE.WITH_DRIVER)) {
    return { serviceType: SERVICE_TYPE.WITH_DRIVER, routeType: ROUTE_TYPE.IN_CITY };
  }
  // Chỉ thuê dài hạn: giá theo GÓI, chọn ở bước sau — chưa có gì để tạm tính theo khung giờ.
  return null;
}

/**
 * Bước CHỌN XE của hộp "Tạo đơn thuê xe cho khách" (Figma Partner `24565:59738`), chỉ có ở lối
 * vào chưa biết xe (danh sách đơn, hồ sơ khách). Trên lịch, ô được bấm đã nói rõ xe nào.
 *
 * Hàng lọc: Chi nhánh · Loại (ô tô/xe máy) · Tìm kiếm · Thời gian nhận/trả (bắt buộc). Khung giờ
 * là lý do của bước này: server đẩy xe TRỐNG lên đầu, xe đã có lịch vẫn hiện nhưng mờ và không
 * chọn được (chốt 25/11/2026) — `busy` chỉ là gợi ý giao diện, lượt tạo đơn vẫn đi qua constraint
 * chống trùng lịch (ADR 0006). Khung giờ chọn ở đây thành giá trị mở đầu của bước Chuyến đi.
 *
 * Chọn một thẻ rồi bấm "Tiếp tục" (không nhảy bước ngay khi bấm thẻ), để chân hộp kịp hiện TẠM
 * TÍNH của xe đó trong khung giờ — từ báo giá nội bộ `/calendar/quote`, FE không tự cộng trừ.
 *
 * Danh sách TẢI DẦN theo cuộn. Chi nhánh là GỢI Ý, không phải rào chắn (ADR 0052): người điều phối
 * đang lọc Ninh Kiều thấy ngay xe Ninh Kiều, nhưng vẫn đổi được để điều xe từ nơi khác sang.
 */
export function StaffVehiclePicker({
  defaultBranchId,
  initialRange,
  onCancel,
  onContinue,
}: StaffVehiclePickerProps) {
  const fmt = useAppFormat();
  const dl = useDomainLabel();
  const t = useTranslations('BookingRequests.vehiclePicker');
  const tCommon = useTranslations('Common');

  const [q, setQ] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>(VEHICLE_TYPE.CAR);
  // State cục bộ, KHÔNG lên URL: hộp thoại không phải màn chia sẻ link được, và ghi vào URL sẽ
  // đụng chính `?branchId=` của trang đứng sau nó.
  const [branchId, setBranchId] = useState<string | undefined>(defaultBranchId);
  const branch = useBranchFilter({ value: branchId, onChange: setBranchId, local: true });
  const [range, setRange] = useState<RentalRange>(() => initialRangeOf(initialRange));
  const [rentalMode, setRentalMode] = useState<RentalMode>(RENTAL_MODE.DAILY);
  const [selected, setSelected] = useState<VehicleBookingPickerItem | null>(null);

  const pickedRange: PickedRange | null =
    range.pickupAt && range.returnAt && range.returnAt.isAfter(range.pickupAt)
      ? {
          pickupAt: appWallClockToIso(range.pickupAt as Dayjs),
          returnAt: appWallClockToIso(range.returnAt as Dayjs),
        }
      : null;

  const {
    vehicles,
    total,
    isInitialLoading,
    initialError,
    appendError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    retryInitial,
    retryNextPage,
  } = useBookingPickerVehicles({
    q,
    branchId,
    vehicleType,
    pickupAt: pickedRange?.pickupAt ?? null,
    returnAt: pickedRange?.returnAt ?? null,
  });

  /*
   * Xe đang chọn phải còn CHỌN ĐƯỢC theo bộ lọc hiện tại: đổi khung giờ làm nó bận, hay đổi loại /
   * chi nhánh làm nó rời danh sách ⇒ bỏ chọn, để "Tiếp tục" không mang một chiếc xe đã khuất.
   */
  const current = selected ? (vehicles.find((v) => v.id === selected.id) ?? null) : null;
  const selectable = current && !current.busy ? current : null;

  const estimateService = selectable ? estimateServiceOf(selectable) : null;
  const quoteParams =
    selectable && estimateService && pickedRange
      ? { vehicleId: selectable.id, ...pickedRange, ...estimateService }
      : null;
  const quoteQ = useQuery({
    queryKey: queryKeys.calendar.quote(quoteParams ?? {}),
    queryFn: () => fetchCalendarQuote(quoteParams!),
    enabled: quoteParams != null,
    staleTime: 60_000,
    retry: false,
  });

  // Sentinel tải trang kế — guard trùng/hết trang nằm trong hook, ở đây chỉ việc gọi.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) fetchNextPage();
      },
      { root: el.parentElement, rootMargin: PREFETCH_MARGIN },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchNextPage, vehicles.length]);

  function renderEstimate() {
    if (!selectable) return <span className={styles.estimateHint}>{t('pickHint')}</span>;
    if (!quoteParams) return null;
    if (quoteQ.isLoading)
      return <span className={styles.estimateHint}>{t('estimateLoading')}</span>;
    if (quoteQ.isError || !quoteQ.data) {
      return <span className={styles.estimateHint}>{t('estimateUnavailable')}</span>;
    }
    const value = fmt.money(quoteQ.data.totalAmount);
    const amount = (chunks: ReactNode) => <b className={styles.estimateAmount}>{chunks}</b>;
    return (
      <span className={styles.estimate}>
        {quoteQ.data.days
          ? t.rich('estimateDays', { days: quoteQ.data.days, value, amount })
          : t.rich('estimate', { value, amount })}
      </span>
    );
  }

  return (
    <div className={styles.picker}>
      <div className={styles.filters}>
        <div className={styles.fieldBranch}>
          <span className={styles.label}>{t('branchLabel')}</span>
          <BranchFilterSelect branch={branch} value={branchId} className={styles.control} />
        </div>
        <div className={styles.fieldType}>
          <span className={styles.label} id="staff-picker-type">
            {t('typeLabel')}
          </span>
          <Segmented
            aria-labelledby="staff-picker-type"
            className={segmentedStyles.outlined}
            value={vehicleType}
            onChange={(value) => setVehicleType(value as VehicleType)}
            options={VEHICLE_TYPE_VALUES.map((type) => ({
              value: type,
              label: dl('vehicleType', type),
            }))}
          />
        </div>
        <div className={styles.fieldSearch}>
          <span className={styles.label}>{t('searchLabel')}</span>
          <AutoSearchInput
            className={styles.control}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchAriaLabel')}
            value={q}
            onSearch={setQ}
          />
        </div>
        <div className={styles.fieldTime}>
          <span className={styles.label}>
            {t('timeLabel')} <span className={styles.required}>*</span>
          </span>
          <div className={styles.rangeBox}>
            <RentalDateTimeRangeField
              value={range}
              onChange={setRange}
              mode={rentalMode}
              onModeChange={setRentalMode}
              placeholder={t('timePlaceholder')}
              ariaLabel={t('timeLabel')}
              suffix={<CalendarOutlined aria-hidden />}
            />
          </div>
        </div>
      </div>

      {!pickedRange ? (
        <div className={styles.state}>
          <EmptyState variant="empty" title={t('timeRequired')} />
        </div>
      ) : null}

      {isInitialLoading ? (
        <div className={styles.state}>
          <Skeleton active paragraph={{ rows: 6 }} />
        </div>
      ) : null}

      {initialError ? (
        <Result
          className={styles.state}
          status="warning"
          title={t('loadFailed')}
          subTitle={getErrorMessage(initialError)}
          extra={<Button onClick={retryInitial}>{t('retry')}</Button>}
        />
      ) : null}

      {pickedRange && !isInitialLoading && !initialError && vehicles.length === 0 ? (
        <div className={styles.state}>
          <EmptyState
            variant={q || branchId ? 'no-results' : 'empty'}
            /*
             * Câu nói đúng lý do: "chưa có xe máy nào" khi thật ra chỉ là chi nhánh đang lọc chưa có
             * xe sẽ khiến người dùng đi tìm một lỗi không tồn tại.
             */
            title={
              q
                ? t('emptySearch')
                : branchId
                  ? t('emptyBranch')
                  : t('emptyType', { type: vehicleType })
            }
          />
        </div>
      ) : null}

      {pickedRange && vehicles.length > 0 ? (
        <div className={styles.scroller}>
          <ul className={styles.grid} aria-label={t('gridLabel')}>
            {vehicles.map((vehicle) => (
              <li key={vehicle.id}>
                <StaffVehicleCard
                  vehicle={vehicle}
                  selected={selectable?.id === vehicle.id}
                  onSelect={() => setSelected(vehicle)}
                />
              </li>
            ))}
          </ul>

          {/* Đáy danh sách: sentinel + trạng thái của TRANG KẾ (không đụng tới xe đã hiện). */}
          <div ref={sentinelRef} className={styles.sentinel}>
            {isFetchingNextPage ? (
              <span className={styles.loadingMore}>
                <Spin size="small" /> {t('loadingMore')}
              </span>
            ) : appendError ? (
              <span className={styles.loadingMore}>
                {t('appendFailed')}{' '}
                <Button type="link" size="small" onClick={retryNextPage}>
                  {t('retry')}
                </Button>
              </span>
            ) : !hasNextPage ? (
              <span className={styles.loadingMore}>{t('allShown', { count: total })}</span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className={styles.footer}>
        <div className={styles.estimateSlot} aria-live="polite">
          {renderEstimate()}
        </div>
        <Button size="large" onClick={onCancel}>
          {tCommon('actions.back')}
        </Button>
        <Button
          size="large"
          type="primary"
          className={styles.continue}
          disabled={!selectable || !pickedRange}
          onClick={() => {
            if (selectable && pickedRange) onContinue(selectable, pickedRange);
          }}
        >
          {tCommon('actions.next')}
        </Button>
      </div>
    </div>
  );
}
