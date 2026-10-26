'use client';

import {
  ArrowLeftOutlined,
  CalendarOutlined,
  CarOutlined,
  ClockCircleOutlined,
  EnvironmentOutlined,
  LeftOutlined,
} from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Form, Radio, Segmented, Skeleton } from 'antd';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  API_ERROR_CODE,
  LONG_TERM_PACKAGE_MONTHS,
  PICKUP_PREFERENCE,
  PRICE_ROW,
  ROUTE_TYPE,
  ROUTE_TYPE_VALUES,
  SERVICE_TYPE,
  addDateKeyDays,
  compactPhoneInput,
  vnDateKey,
  type LongTermPackageMonths,
  type RouteType,
  type ServiceType,
} from '@xeprime/types';
import { longTermReturnFromWallClock } from '@xeprime/domain';
import { PriceBreakdown } from '@/components/data-display/PriceBreakdown';
import { DateTimeField } from '@/components/form/DateTimeField';
import {
  RentalDateTimeRangeField,
  type RentalMode,
} from '@/components/form/RentalDateTimeRangeField';
import { TextField } from '@/components/form/TextField';
import { bookingPath } from '@/constants/routes';
import { checkConflict } from '@/features/bookings/api';
import { useCreateBooking } from '@/features/bookings/hooks/use-booking-mutations';
import { fetchCalendarBusyDays, fetchCalendarQuote } from '@/features/calendar/api';
import type { CalendarQuote } from '@/features/calendar/types/calendar.types';
import { useListingDetail } from '@/features/marketplace/hooks/use-listing-detail';
import { CtaButton } from '@/features/marketplace/components/CtaButton';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { appWallClockToIso, toAppTz } from '@/lib/datetime';
import { buildBusyDayIndex } from '@/lib/rental-busy';
import { getErrorCode } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import { BUSY_DAYS_LOOKAHEAD } from '../api';
import { pickupPointText } from '../pickup-point';
import { PICKUP_METHOD } from '../schema';
import { staffBookingSchema, type StaffBookingValues } from '../staff-booking-schema';
import { BookingJourney } from './BookingJourney';
import { BookingResult, BookingResultTotal } from './BookingResult';
import { StaffBookingReviewStep } from './StaffBookingReviewStep';
import { BookingTripCard, type BookingTrip } from './BookingTripCard';
import { VehicleSummaryPanel } from './VehicleSummaryPanel';
import styles from './RequestBookingFlow.module.css';
import resultStyles from './BookingSuccessStep.module.css';

/** Ba chặng của luồng đặt hộ — cùng tên với `StaffJourneyStage` của thanh tiến trình. */
type StaffStep = 'trip' | 'review' | 'done';

interface StaffBookingFlowProps {
  vehicleId: string;
  vehicleName: string;
  vehicleImageUrl?: string | null;
  /** Prefill từ ô lịch được bấm (ISO). */
  pickupAt?: string | null;
  returnAt?: string | null;
  /** Prefill khách khi lối vào đã biết người thuê (hồ sơ khách — S-01). */
  customerName?: string | null;
  customerPhone?: string | null;
  /**
   * Quay lại bước chọn xe — CHỈ có ở lối vào chưa biết xe (danh sách đơn, hồ sơ khách).
   *
   * Render bên TRONG cột hồ sơ xe thay vì làm anh em của luồng: thân overlay cỡ `xl` cao cố
   * định và `overflow: hidden`, nên mọi thứ chèn cạnh `.layout` (vốn `height: 100%`) đều đẩy
   * hàng nút ở đáy cột phải ra khỏi vùng thấy được. Đặt cạnh thẻ xe cũng đúng chỗ hơn: đây là
   * thao tác về CHIẾC XE, không phải về cả hộp thoại.
   */
  onChangeVehicle?: (() => void) | null;
  onClose: () => void;
  onBusyChange?: (busy: boolean) => void;
  onResultChange?: (isResult: boolean) => void;
}

function rowAmount(quote: CalendarQuote, key: string): string | null {
  return quote.rows.find((r) => r.key === key)?.amount ?? null;
}

/**
 * Luồng "Đặt xe cho khách" của GIAN HÀNG (lập đơn tay) — CÙNG hành trình với luồng thuê xe của
 * khách trên chợ (26/10/2026), để hai bên đặt xe theo một mạch:
 *
 *   Chọn chuyến (cột hồ sơ xe + biểu mẫu, dòng tổng dính đáy)
 *   → Khách & xác nhận (màn Xem lại hai cột, nút tạo đơn ở cột phải)
 *   → Đã tạo đơn (hộp kết quả 600 của khách, mã đơn chép được).
 *
 * Bước Chuyến đi giữ đúng các khối của khách — dịch vụ, lộ trình, khoảng thuê có tô lịch bận, cách
 * nhận xe — và bỏ những gì chỉ có nghĩa trên chợ:
 *  - KHÔNG bảo hiểm (`IV`/`IP`), mã khuyến mãi nền tảng, phí sàn hay tiền giữ chỗ: đơn lập tay nằm
 *    ngoài chợ (ADR 0028 điều 9 · ADR 0046 · ADR 0064).
 *  - KHÔNG đăng nhập, OTP, bằng lái của tài khoản, ô đồng ý điều khoản: người bấm là nhân viên đã
 *    đăng nhập, khách là người vãng lai — giấy tờ đối chiếu lúc giao xe.
 *  - Dài hạn: gian hàng là bên CHỐT lịch, nên chọn gói + giờ nhận thật; ngày trả suy từ gói bằng
 *    tháng lịch (ADR 0011) — không có "nguyện vọng ngày nhận" như phía khách.
 *
 * Gửi xong là ĐƠN THẬT (`POST /bookings`, trạng thái `reserved`, giữ chỗ ngay trong cùng
 * transaction — ADR 0006), không phải yêu cầu chờ chính mình duyệt lại. Tiền lấy từ báo giá NỘI
 * BỘ `/calendar/quote` (cùng PricingService với báo giá công khai — FE không tự cộng trừ); xe chưa
 * cấu hình giá thì server 400 và màn Xem lại rơi về ô nhập tiền tay. Giao tận nơi: phí 0 lúc tạo
 * (chốt sau), địa chỉ đi vào ghi chú của đơn vì đơn trực tiếp không có cột địa chỉ giao.
 */
export function StaffBookingFlow({
  vehicleId,
  vehicleName,
  vehicleImageUrl,
  pickupAt,
  returnAt,
  customerName,
  customerPhone,
  onChangeVehicle,
  onClose,
  onBusyChange,
  onResultChange,
}: StaffBookingFlowProps) {
  const t = useTranslations('BookingRequests.staffFlow');
  const tFlow = useTranslations('BookingRequests.flow');
  const fmt = useAppFormat();
  const dl = useDomainLabel();
  const errorMessage = useErrorMessage();
  const router = useRouter();

  const [step, setStep] = useState<StaffStep>('trip');
  const [rentalMode, setRentalMode] = useState<RentalMode>('daily');
  // Dịch vụ của ĐƠN — mặc định tự lái; đối chiếu với năng lực xe khi hồ sơ về.
  const [serviceType, setServiceType] = useState<ServiceType>(SERVICE_TYPE.SELF_DRIVE);
  /**
   * Gói thuê dài hạn (ADR 0011). Đơn dài hạn có độ dài CỐ ĐỊNH theo gói: nhân viên chỉ chốt giờ
   * nhận, giờ trả do server suy ra bằng tháng lịch — không có ô nhập ngày trả.
   */
  const [packageMonths, setPackageMonths] = useState<LongTermPackageMonths | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; code: string } | null>(null);
  /** Chặn bấm đúp "Tạo đơn" trước khi `isPending` kịp bật (Enter + click cùng lúc). */
  const submitLock = useRef(false);

  /**
   * Hồ sơ xe cho cột trái — CHỈ có với xe đang công khai; xe nội bộ thì panel dùng fallback
   * (tên + ảnh từ hàng lịch). 404 ở đây là trạng thái hợp lệ, không phải lỗi.
   */
  const listingQ = useListingDetail(vehicleId);
  const listing = listingQ.data ?? null;
  const vehicleServices: string[] = listing?.serviceTypes ?? [];

  // Xe không phục vụ dịch vụ đang chọn (hồ sơ vừa về) → rơi về dịch vụ đầu tiên của xe.
  // Điều chỉnh NGAY TRONG RENDER — pattern "derived state" chính tắc, không setState trong effect.
  if (vehicleServices.length > 0 && !vehicleServices.includes(serviceType)) {
    setServiceType(vehicleServices[0] as ServiceType);
  }

  const schema = useMemo(() => staffBookingSchema(t), [t]);
  const { control, trigger, getValues, setValue, formState } = useForm<StaffBookingValues>({
    resolver: yupResolver(schema),
    // Dịch vụ nằm ở state (Segmented) — đưa vào schema qua yup context ($serviceType).
    context: { serviceType },
    defaultValues: {
      // Đến từ hồ sơ khách thì không bắt nhân viên gõ lại tên + SĐT đã có trong sổ.
      customerName: customerName ?? '',
      customerPhone: customerPhone ?? '',
      // Mốc từ ô lịch là UTC; ô chọn phải hiện GIỜ VIỆT NAM (CLAUDE.md §9).
      pickupAt: pickupAt ? toAppTz(pickupAt) : null,
      returnAt: returnAt ? toAppTz(returnAt) : null,
      pickupMethod: PICKUP_METHOD.SELF,
      deliveryAddress: '',
      routeType: ROUTE_TYPE.IN_CITY,
      pickupAddress: '',
      destination: '',
      note: '',
      manualBaseAmount: null,
      depositAmount: null,
    },
  });

  const watchedPickup = useWatch({ control, name: 'pickupAt' });
  const watchedReturn = useWatch({ control, name: 'returnAt' });
  const pickupMethod = useWatch({ control, name: 'pickupMethod' });
  const watchedRoute = useWatch({ control, name: 'routeType' }) as RouteType;
  const isWithDriver = serviceType === SERVICE_TYPE.WITH_DRIVER;
  const isLongTerm = serviceType === SERVICE_TYPE.LONG_TERM;
  /** Ngày trả suy từ gói — chỉ để HIỂN THỊ; con số ghi vào đơn do server tính lại. */
  const derivedReturnAt =
    isLongTerm && packageMonths != null && watchedPickup
      ? longTermReturnFromWallClock(watchedPickup, packageMonths)
      : null;
  const effectiveReturn = isLongTerm ? derivedReturnAt : (watchedReturn ?? null);
  // Chuyến có tài xế: xe đến ĐÓN khách — "giao xe tận nơi" không có nghĩa.
  const isDelivery = !isWithDriver && pickupMethod === PICKUP_METHOD.DELIVERY;
  const hasRange = isLongTerm
    ? Boolean(watchedPickup && packageMonths != null)
    : Boolean(watchedPickup && watchedReturn && watchedReturn.isAfter(watchedPickup));
  /** Đủ để server báo giá — dài hạn chỉ cần gói (giá gói không phụ thuộc giờ nhận). */
  const hasPriceSelection = isLongTerm ? packageMonths != null : hasRange;

  /**
   * Báo giá nội bộ — CÙNG hàm với báo giá công khai, nên nhân viên và khách thấy đúng một con
   * số cho cùng một gói. 400 (xe chưa có giá) là trạng thái hợp lệ: rơi về nhập tiền tay.
   */
  const quoteParams = !hasPriceSelection
    ? null
    : isLongTerm
      ? { vehicleId, serviceType, packageMonths: packageMonths! }
      : {
          vehicleId,
          pickupAt: appWallClockToIso(watchedPickup!),
          returnAt: appWallClockToIso(watchedReturn!),
          // Giá theo DỊCH VỤ + LỘ TRÌNH — staff thấy đúng số khách sẽ trả.
          serviceType,
          ...(isWithDriver ? { routeType: watchedRoute } : {}),
        };
  const quoteQ = useQuery({
    queryKey: queryKeys.calendar.quote(quoteParams ?? {}),
    queryFn: () => fetchCalendarQuote(quoteParams!),
    enabled: quoteParams != null,
    staleTime: 60_000,
    retry: false,
  });
  const quote = quoteQ.data ?? null;
  const quoteUnavailable = hasPriceSelection && quoteQ.isError;

  /*
   * Cọc thu trực tiếp — điền sẵn từ chính sách thuê của xe MỖI KHI báo giá đổi, trừ khi nhân viên
   * đã tự sửa ô (dirty): con số thoả thuận với khách thắng mức mặc định của xe.
   */
  useEffect(() => {
    if (!quote) return;
    if (formState.dirtyFields.depositAmount) return;
    setValue('depositAmount', Number(quote.depositAmount ?? 0));
  }, [quote, formState.dirtyFields.depositAmount, setValue]);

  /**
   * Lịch bận của xe — CÙNG phép tính với luồng của khách nhưng qua cửa NỘI BỘ của gian hàng
   * (`/calendar/busy-days`), nên mọi xe — kể cả xe chưa lên chợ — đều khoá sẵn ngày đã kín (gạch
   * chéo) thay vì để nhân viên chọn rồi mới bị báo trùng. Phép kiểm trùng ở "Tiếp tục" vẫn chạy,
   * và constraint lúc tạo đơn vẫn là chốt chặn (ADR 0006).
   *
   * Dài hạn không có ô chọn khoảng (giờ nhận + gói) nên query tắt ở đó.
   */
  const busyWindow = useMemo(() => {
    const from = addDateKeyDays(vnDateKey(new Date()), -1);
    return { from, to: addDateKeyDays(from, BUSY_DAYS_LOOKAHEAD) };
  }, []);
  const busyDaysQ = useQuery({
    queryKey: queryKeys.calendar.busyDays(vehicleId, busyWindow.from, busyWindow.to),
    queryFn: () => fetchCalendarBusyDays(vehicleId, busyWindow.from, busyWindow.to),
    enabled: !isLongTerm,
    staleTime: 60_000,
  });
  const busyDays = useMemo(() => buildBusyDayIndex(busyDaysQ.data?.days), [busyDaysQ.data]);

  const availabilityM = useMutation({
    mutationFn: () => {
      const v = getValues();
      const end = isLongTerm ? derivedReturnAt : v.returnAt;
      return checkConflict({
        vehicleId,
        startAt: v.pickupAt ? appWallClockToIso(v.pickupAt) : '',
        // Dài hạn: khoảng cần kiểm là [nhận, nhận + gói tháng lịch) — chính khoảng đơn sẽ chiếm.
        // `appWallClockToIso` đọc MẶT ĐỒNG HỒ nên đúng cho cả mốc suy từ gói lẫn giờ trên ô chọn.
        endAt: end ? appWallClockToIso(end) : '',
      });
    },
    onSuccess: (res) => {
      if (res.hasConflict) {
        setStepError(tFlow('time.unavailable'));
      } else {
        setStepError(null);
        setStep('review');
      }
    },
    onError: (e) => setStepError(errorMessage(e)),
  });

  const create = useCreateBooking();
  const submitting = create.isPending;

  useEffect(() => {
    onBusyChange?.(submitting);
  }, [submitting, onBusyChange]);
  const isResult = step === 'done';
  useEffect(() => {
    onResultChange?.(isResult);
  }, [isResult, onResultChange]);

  async function continueFromTrip() {
    setStepError(null);
    if (isLongTerm && packageMonths == null) {
      setStepError(t('trip.packageRequired'));
      return;
    }
    // Kiểm luôn hành trình ở bước này — nó nằm trên màn này, không để lỗi nổ ra ở bước sau.
    const fields = [
      'pickupAt',
      ...(isLongTerm ? [] : (['returnAt'] as const)),
      ...(isWithDriver
        ? (['pickupAddress', 'destination'] as const)
        : (['deliveryAddress'] as const)),
    ] as const;
    // Kiểm trùng lịch là PREVIEW — constraint DB mới là chốt chặn (ADR 0006).
    if (await trigger([...fields])) availabilityM.mutate();
  }

  async function submitBooking() {
    if (submitLock.current || submitting) return;
    submitLock.current = true;
    setStepError(null);
    const fields = ['customerName', 'customerPhone', 'note', 'depositAmount'] as const;
    if (
      !(await trigger([...fields, ...(quoteUnavailable ? (['manualBaseAmount'] as const) : [])]))
    ) {
      submitLock.current = false;
      return;
    }
    // Không có báo giá server thì tiền thuê nhập tay là BẮT BUỘC — không tạo đơn 0đ âm thầm.
    if (quoteUnavailable && getValues('manualBaseAmount') == null) {
      setStepError(t('validation.baseAmountRequired'));
      submitLock.current = false;
      return;
    }

    const v = getValues();
    const discountRow = quote ? rowAmount(quote, PRICE_ROW.DISCOUNT) : null;
    const deliveryLine = isDelivery
      ? t('deliveryNoteLine', { address: v.deliveryAddress.trim() })
      : '';
    const note = [deliveryLine, v.note.trim()].filter(Boolean).join('\n');

    create.mutate(
      {
        vehicleId,
        customerName: v.customerName.trim(),
        // `getValues` trả giá trị THÔ — phép `transform` của schema chỉ chạy lúc validate. Số chép từ
        // danh bạ ("0912 345 678") phải gọn lại trước khi lên dây, cùng luật với lúc validate.
        customerPhone: compactPhoneInput(v.customerPhone),
        serviceType,
        // Hành trình with_driver — server validate lại (route bắt buộc, liên tỉnh cần điểm đến).
        ...(isWithDriver
          ? {
              routeType: v.routeType,
              pickupAddress: v.pickupAddress.trim(),
              ...(v.routeType !== ROUTE_TYPE.IN_CITY ? { destination: v.destination.trim() } : {}),
            }
          : {}),
        pickupAt: appWallClockToIso(v.pickupAt!),
        // Dài hạn: KHÔNG gửi ngày trả — server suy từ gói bằng tháng lịch (ADR 0011).
        ...(isLongTerm
          ? { longTermPackageMonths: packageMonths ?? undefined }
          : { returnAt: appWallClockToIso(v.returnAt!) }),
        // Tiền từ báo giá server (đã gồm giá riêng theo ngày); giảm giá là dòng âm → tách dương.
        baseAmount: quote
          ? (rowAmount(quote, PRICE_ROW.BASE) ?? quote.totalAmount)
          : String(v.manualBaseAmount ?? 0),
        discountAmount: discountRow ? discountRow.replace('-', '') : '0',
        // Giao tận nơi phí 0 lúc tạo — chủ xe chốt phí đã thoả thuận sau.
        deliveryFee: '0',
        depositAmount: String(v.depositAmount ?? 0),
        ...(note ? { note } : {}),
      },
      {
        onSuccess: (booking) => {
          setCreated({ id: booking.id, code: booking.code });
          setStep('done');
        },
        onError: (e) => {
          setStepError(
            getErrorCode(e) === API_ERROR_CODE.BOOKING_SCHEDULE_CONFLICT
              ? t('scheduleConflict')
              : errorMessage(e),
          );
        },
        onSettled: () => {
          submitLock.current = false;
        },
      },
    );
  }

  const vehicleThumbUrl = listing?.mainImageUrl ?? vehicleImageUrl ?? null;
  const pickupPoint = listing?.pickupPoint ?? null;

  /** Chuyến đang chọn — MỘT bản cho màn Xem lại và hộp kết quả (`BookingTripCard`). */
  const tripSummary: BookingTrip = {
    serviceType,
    routeType: watchedRoute,
    rentalMode,
    pickupAt: watchedPickup ?? null,
    returnAt: effectiveReturn,
    packageMonths,
    // Dài hạn của luồng đặt hộ là lịch ĐÃ CHỐT, không có nguyện vọng — trường này chỉ để đủ kiểu.
    pickupPreference: PICKUP_PREFERENCE.SPECIFIC_DATE,
    requestedPickupDate: null,
    expectedReturnDate: null,
    scheduleFixed: true,
    isDelivery,
    deliveryAddress: getValues('deliveryAddress')?.trim() || null,
    driverPickupAddress: getValues('pickupAddress')?.trim() || null,
    destination: getValues('destination')?.trim() || null,
  };

  // --- Đã tạo đơn: hộp kết quả 600 của khách, đổi chữ + hàng nút ------------------------------
  if (step === 'done' && created) {
    return (
      <BookingResult
        title={t('done.title')}
        lead={t('done.lead')}
        code={{ label: t('done.codeLabel'), value: created.code, copyLabel: t('done.copyCode') }}
        footer={
          <>
            <Button
              size="large"
              icon={<LeftOutlined aria-hidden />}
              onClick={onClose}
              className={resultStyles.secondary}
            >
              {t('done.close')}
            </Button>
            <CtaButton
              variant="gradient"
              size="form"
              className={resultStyles.primary}
              onClick={() => {
                onClose();
                router.push(bookingPath.detail(created.id));
              }}
            >
              {t('done.openBooking')}
            </CtaButton>
          </>
        }
      >
        <BookingTripCard
          listing={listing}
          vehicleName={vehicleName}
          vehicleImageUrl={vehicleThumbUrl}
          trip={tripSummary}
          variant="receipt"
          showOwner={false}
          selfPickupFallback={t('review.selfPickupBranch')}
        >
          {quote ? <BookingResultTotal label={t('done.total')} amount={quote.totalAmount} /> : null}
        </BookingTripCard>
      </BookingResult>
    );
  }

  // --- Màn Xem lại — chiếm trọn thân hộp thoại, hai cột riêng ----------------------------------
  if (step === 'review') {
    return (
      <StaffBookingReviewStep
        listing={listing}
        vehicleName={vehicleName}
        vehicleImageUrl={vehicleThumbUrl}
        trip={tripSummary}
        control={control}
        quote={quote}
        quoteLoading={quoteQ.isLoading}
        quoteUnavailable={quoteUnavailable}
        stepError={stepError}
        submitting={submitting}
        onSubmit={() => void submitBooking()}
        onEdit={() => {
          setStepError(null);
          setStep('trip');
        }}
      />
    );
  }

  /* ── Dòng tổng dính đáy: số đang nói tới, hoặc lời nhắc cần chọn gì để có số ──────────────── */
  const barLabel = !hasPriceSelection
    ? isLongTerm
      ? t('trip.barChoosePackage')
      : t('trip.barChooseTime')
    : quoteUnavailable
      ? t('trip.barNoPrice')
      : quote?.estimateNote
        ? t('trip.barEstimate')
        : t('trip.barTotal');

  return (
    <div className={styles.layout}>
      <div className={styles.left}>
        {onChangeVehicle ? (
          <Button
            type="text"
            size="small"
            icon={<ArrowLeftOutlined />}
            className={styles.changeVehicle}
            onClick={onChangeVehicle}
          >
            {t('changeVehicle')}
          </Button>
        ) : null}
        <VehicleSummaryPanel
          listing={listing}
          fallbackName={vehicleName}
          fallbackImageUrl={vehicleImageUrl}
          loading={listingQ.isLoading}
          serviceType={serviceType}
          packageMonths={packageMonths}
          compactOnMobile
          showShop={false}
        />
      </div>

      <div className={styles.right}>
        <BookingJourney audience="staff" current="trip" />

        <section className={styles.stepBody}>
          {/* Xe phục vụ nhiều dịch vụ → staff chọn dịch vụ cho ĐƠN này. */}
          {vehicleServices.length > 1 ? (
            <div className={styles.serviceField}>
              <span className={styles.rangeFieldLabel}>{tFlow('service.label')}</span>
              <Segmented
                block
                value={serviceType}
                onChange={(v) => {
                  setServiceType(v as ServiceType);
                  setStepError(null);
                }}
                /* Nhãn tab là TÊN DỊCH VỤ — mức ưu đãi dài hạn khác nhau theo từng gói nên
                   không gắn được một con số chung lên tab (ADR 0011). */
                options={vehicleServices.map((value) => ({
                  value,
                  label: dl('serviceType', value),
                }))}
              />
            </div>
          ) : null}

          {isWithDriver ? (
            <div className={styles.serviceField}>
              <span className={styles.rangeFieldLabel}>{tFlow('service.routeLabel')}</span>
              <Radio.Group
                value={watchedRoute}
                onChange={(e) =>
                  setValue('routeType', e.target.value as RouteType, { shouldValidate: true })
                }
                options={ROUTE_TYPE_VALUES.map((value) => ({
                  value,
                  label: dl('routeType', value),
                }))}
              />
              <p className={styles.rangeHint}>{tFlow(`route.description.${watchedRoute}`)}</p>
            </div>
          ) : null}

          {/*
            Đơn THUÊ DÀI HẠN có độ dài cố định bằng gói (ADR 0011): nhân viên chọn gói + giờ
            nhận, ngày trả hiện read-only. Không có ô chọn khoảng tự do — nếu có, đơn sẽ dài
            ngắn khác gói khách mua mà không ai thấy.
          */}
          {isLongTerm ? (
            <>
              <div className={styles.serviceField}>
                <span className={styles.rangeFieldLabel}>{t('trip.packageLabel')}</span>
                <div
                  className={styles.packageRow}
                  role="radiogroup"
                  aria-label={t('trip.packageGroupLabel')}
                >
                  {LONG_TERM_PACKAGE_MONTHS.map((months) => (
                    <button
                      key={months}
                      type="button"
                      role="radio"
                      aria-checked={packageMonths === months}
                      className={cx(
                        styles.packageBtn,
                        packageMonths === months && styles.packageBtnActive,
                      )}
                      onClick={() => {
                        setPackageMonths(months);
                        setStepError(null);
                      }}
                    >
                      {fmt.packageLabel(months)}
                    </button>
                  ))}
                </div>
                {packageMonths == null ? (
                  <p className={styles.rangeHint}>{t('trip.packageHint')}</p>
                ) : null}
              </div>

              <div className={styles.rangeField}>
                <span className={styles.rangeFieldLabel}>{t('trip.pickupTimeLabel')}</span>
                <DateTimeField
                  control={control}
                  name="pickupAt"
                  label={t('trip.pickupTimeField')}
                />
                <p className={styles.rangeHint}>
                  {derivedReturnAt
                    ? t('trip.returnDerived', {
                        date: fmt.dateTime(appWallClockToIso(derivedReturnAt)),
                      })
                    : t('trip.returnPending')}
                </p>
              </div>
            </>
          ) : (
            <div className={styles.rangeField}>
              <span className={styles.rangeFieldLabel}>{tFlow('time.label')}</span>
              <div
                className={cx(
                  styles.rangeBox,
                  (formState.errors.pickupAt || formState.errors.returnAt) && styles.rangeBoxError,
                )}
              >
                <RentalDateTimeRangeField
                  value={{ pickupAt: watchedPickup ?? null, returnAt: watchedReturn ?? null }}
                  onChange={(next) => {
                    setValue('pickupAt', next.pickupAt, { shouldValidate: true });
                    setValue('returnAt', next.returnAt, { shouldValidate: true });
                    if (stepError) setStepError(null);
                  }}
                  mode={rentalMode}
                  onModeChange={setRentalMode}
                  variant="labelled"
                  prefix={<CalendarOutlined />}
                  busyDays={busyDays}
                  busyLoading={busyDaysQ.isLoading}
                />
              </div>
              <p className={styles.rangeHint}>
                {hasRange ? (
                  <>
                    <ClockCircleOutlined aria-hidden />{' '}
                    {rentalMode === 'hourly' ? tFlow('time.modeHourly') : tFlow('time.modeDaily')} ·{' '}
                    {tFlow('time.changeHint')}
                  </>
                ) : (
                  tFlow('time.empty')
                )}
              </p>
            </div>
          )}

          {formState.errors.pickupAt || formState.errors.returnAt ? (
            <p className={styles.fieldError} role="alert">
              {formState.errors.pickupAt?.message ?? formState.errors.returnAt?.message}
            </p>
          ) : null}

          {/* Nhãn nằm TRÊN ô như luồng của khách — `Form.Item` đứng một mình đặt nhãn bên trái. */}
          <Form component={false} layout="vertical" colon={false}>
            {/* ── Có tài xế: xe ĐẾN ĐÓN — hỏi địa chỉ đón (+ điểm đến khi liên tỉnh) ─────── */}
            {isWithDriver ? (
              <div className={styles.deliveryBlock}>
                <TextField
                  control={control}
                  name="pickupAddress"
                  label={t('trip.driverPickupLabel')}
                  placeholder={t('trip.driverPickupPlaceholder')}
                  autoComplete="off"
                  required
                />
                {watchedRoute !== ROUTE_TYPE.IN_CITY ? (
                  <TextField
                    control={control}
                    name="destination"
                    label={t('trip.destinationLabel')}
                    placeholder={t('trip.destinationPlaceholder')}
                    autoComplete="off"
                    required
                  />
                ) : null}
              </div>
            ) : (
              /* ── Hình thức nhận xe (tự lái / dài hạn) ─────────────────────────────── */
              <fieldset className={styles.pickupGroup}>
                <legend className={styles.fieldLabel}>{tFlow('pickup.legend')}</legend>
                <div
                  className={styles.pickupOptions}
                  role="radiogroup"
                  aria-label={tFlow('pickup.groupLabel')}
                >
                  {(
                    [
                      {
                        key: PICKUP_METHOD.SELF,
                        label: tFlow('pickup.self'),
                        hint: pickupPoint ? pickupPointText(pickupPoint) : t('trip.selfHint'),
                        icon: <CarOutlined />,
                      },
                      {
                        key: PICKUP_METHOD.DELIVERY,
                        label: tFlow('pickup.delivery'),
                        hint: t('trip.deliveryHint'),
                        icon: <EnvironmentOutlined />,
                      },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      role="radio"
                      aria-checked={pickupMethod === option.key}
                      className={cx(
                        styles.pickupOption,
                        pickupMethod === option.key && styles.pickupOptionActive,
                      )}
                      onClick={() => setValue('pickupMethod', option.key, { shouldValidate: true })}
                    >
                      <span className={styles.pickupIcon} aria-hidden>
                        {option.icon}
                      </span>
                      <span className={styles.pickupText}>
                        <span className={styles.pickupLabel}>{option.label}</span>
                        <span className={styles.pickupHint}>{option.hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            {isDelivery ? (
              <div className={styles.deliveryBlock}>
                <TextField
                  control={control}
                  name="deliveryAddress"
                  label={t('trip.deliveryAddressLabel')}
                  placeholder={t('trip.deliveryAddressPlaceholder')}
                  autoComplete="off"
                  required
                />
                <div className={styles.deliveryFeeRow}>
                  <span>{t('trip.deliveryFeeLabel')}</span>
                  <b className={styles.freeTag}>{t('trip.deliveryFeeLater')}</b>
                </div>
                <p className={styles.deliveryNote}>{t('trip.deliveryFeeNote')}</p>
              </div>
            ) : null}
          </Form>

          {stepError ? (
            <Alert type="warning" showIcon title={stepError} className={styles.err} role="alert" />
          ) : null}

          {/* Bảng chi tiết ở cuối thân bước — cuộn chung một mạch với phần nhập liệu phía trên. */}
          {hasPriceSelection ? (
            quoteQ.isLoading ? (
              <Skeleton active paragraph={{ rows: 3 }} title={false} />
            ) : quote ? (
              <PriceBreakdown
                rows={quote.rows}
                totalAmount={quote.totalAmount}
                totalLabel={quote.estimateNote ? t('trip.barEstimate') : t('trip.barTotal')}
                title={
                  quote.longTerm
                    ? t('trip.packagePriceTitle', { months: quote.longTerm.packageMonths })
                    : t('trip.priceTitle')
                }
                footer={
                  quote.estimateNote || quote.longTerm?.durationDiscountPercent ? (
                    <>
                      {quote.longTerm?.durationDiscountPercent ? (
                        <strong className={styles.savingsText}>
                          {tFlow('price.savings', {
                            amount: fmt.money(quote.longTerm.durationDiscountAmount),
                            months: quote.longTerm.packageMonths,
                          })}
                        </strong>
                      ) : null}
                      {quote.estimateNote ? (
                        <span className={styles.deliveryFootnote}>{quote.estimateNote}.</span>
                      ) : null}
                    </>
                  ) : undefined
                }
              />
            ) : quoteUnavailable ? (
              <Alert type="info" showIcon className={styles.err} title={t('trip.noPrice')} />
            ) : null
          ) : null}
        </section>

        {/* Dòng tổng + nút: MỘT khối dính đáy cột phải, như luồng của khách. */}
        <div className={styles.dock}>
          <div className={styles.staffBar}>
            <span className={styles.staffBarLabel}>{barLabel}</span>
            {quote && hasPriceSelection ? (
              <b className={styles.staffBarAmount}>{fmt.money(quote.totalAmount)}</b>
            ) : null}
          </div>
          <footer className={styles.footer}>
            <Button onClick={onClose}>{tFlow('actions.cancel')}</Button>
            <Button
              type="primary"
              loading={availabilityM.isPending}
              onClick={() => void continueFromTrip()}
            >
              {availabilityM.isPending ? tFlow('actions.checking') : tFlow('actions.continue')}
            </Button>
          </footer>
        </div>
      </div>
    </div>
  );
}
