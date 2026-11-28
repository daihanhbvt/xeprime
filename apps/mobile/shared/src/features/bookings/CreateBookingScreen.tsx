import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Ionicons } from '@/components/icons/Ionicons';
import { BackHandler, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  RENTAL_MODE,
  API_ERROR_CODE,
  LONG_TERM_PACKAGE_MONTHS,
  PICKUP_PREFERENCE,
  PRICE_ROW,
  BOOKING_SOURCE_LABEL_MAX,
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
import { STALE_TIME } from '@xeprime/api-client';
import {
  appWallClockToIso,
  buildBusyDayIndex,
  longTermReturnFromWallClock,
  nowInAppTz,
  toAppTz,
  LIST_SEPARATOR,
  type RentalMode,
  bestDiscountPackageMonths,
} from '@xeprime/domain';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { MomentPickerSheet } from '@/components/ui/MomentPickerSheet';
import { RangeSelectBox } from '@/components/ui/RangeSelectBox';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { LineIcon, type LineIconName } from '@/components/icons/LineIcon';
import { useDomainLabel } from '@/i18n/domain';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { IconButton } from '@/components/ui/IconButton';
import { useCopy } from '@/hooks/use-copy';
import { TextField } from '@/components/ui/TextField';
import { ScreenLoading } from '@/components/state/ScreenLoading';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { calendarApi } from '@/api/calendar/api';
import {
  BookingResult,
} from '@/features/booking-requests/components/BookingResult';
import {
  BookingTripCardView,
  type BookingTrip,
} from '@/features/booking-requests/components/BookingTripCard';
import {
  RouteChip,
  routeDescription,
} from '@/features/booking-requests/components/RequestTripStep';
import { BUSY_DAYS_LOOKAHEAD } from '@/features/booking-requests/api';
import { pickupPointText } from '@/features/booking-requests/pickup-point';
import { RentalRangeSheet } from '@/features/marketplace/components/RentalRangeSheet';
import { ServiceSelector } from '@/features/marketplace/components/ServiceSelector';
import { useVehicle } from '@/features/vehicles/hooks/use-vehicle';
import { getErrorCode } from '@/lib/api-client';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { queryKeys } from '@/queries/query-keys';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { StaffBookingCollateralCard } from './components/StaffBookingCollateralCard';
import { StaffBookingPriceCard } from './components/StaffBookingPriceCard';
import { DiscountTag } from '@/components/ui/DiscountTag';
import { InfoHint } from '@/components/ui/InfoHint';
import { StaffVehiclePicker, type PickedRange } from './components/StaffVehiclePicker';
import { useBranchReturnParam } from '@/features/branches/hooks/use-branch-filter';
import { useListing } from '@/features/marketplace/hooks/use-marketplace-data';
import { useCheckConflict, useCreateBooking } from './hooks/use-bookings';
import { useCanCreateBooking } from './hooks/use-can-create-booking';
import { bookingsApi } from './api';
import type { CreateBookingInput, VehicleListItem } from './api';
import {
  PICKUP_METHOD,
  STAFF_BOOKING_NOTE_MAX,
  negotiatedTotal,
  staffBookingSchema,
  type StaffBookingValues,
} from './staff-booking-schema';
import { bookingSourcePayload } from './source-schema';
import { BookingSourceFields } from './components/BookingSourceFields';

/**
 * Ba chặng của biểu mẫu chuyến (web `StaffBookingFlow`) — cùng tên với `StaffJourneyStage` của thanh
 * tiến trình. Bước CHỌN XE thuộc lớp ngoài (`StaffBookingFlow`), như web `StaffBookingDialog`.
 */
const STEP = {
  TRIP: 'trip',
  REVIEW: 'review',
  DONE: 'done',
} as const;
type Step = (typeof STEP)[keyof typeof STEP];

/**
 * Đặt xe cho khách — bản native của `StaffBookingFlow` (web, 26/10/2026): CÙNG hành trình với luồng
 * thuê xe của khách trên chợ.
 *
 *   Chọn chuyến (hồ sơ xe + biểu mẫu, dòng tổng dính đáy)
 *   → Khách & xác nhận (thẻ chuyến · thông tin khách · tiền thuê · cọc · nút tạo đơn)
 *   → Đã tạo đơn (hộp kết quả như của khách, mã đơn chép được).
 *
 * Gửi xong là ĐƠN THẬT (`POST /bookings`, `reserved`, giữ chỗ ngay — ADR 0006). Tiền lấy từ báo giá
 * NỘI BỘ `/calendar/quote` (cùng `PricingService` với báo giá công khai — client không cộng trừ);
 * xe chưa cấu hình giá thì server 400 và màn Xem lại rơi về ô nhập tiền tay.
 *
 * Lập đơn tay mở cho MỌI chủ xe, cả hai tuyến (ADR 0110) - chỉ còn quyền `bookings.create`
 * (`useCanCreateBooking`); chặn thật là `@RequirePermissions` ở `POST /bookings`. Đơn tự lập nằm ngoài
 * sàn và mang nguồn chủ xe chọn.
 */
export function CreateBookingScreen() {
  const t = useTranslations('BookingRequests.staffFlow');
  const tCreate = useTranslations('Bookings.create');
  const router = useRouter();
  const permissions = usePermissions();
  const canCreate = useCanCreateBooking();
  /*
   * Điền sẵn khách khi vào từ hồ sơ một khách đã có trong sổ — cùng tham số web đặt lên URL
   * (`?customerName=&customerPhone=`), nên một deep link sinh ở bên nào cũng tới đúng chỗ.
   */
  const { customerName, customerPhone, vehicleId, vehicleName, vehicleImageUrl, pickupAt, returnAt } =
    useLocalSearchParams<{
      customerName?: string;
      customerPhone?: string;
      vehicleId?: string;
      vehicleName?: string;
      vehicleImageUrl?: string;
      pickupAt?: string;
      returnAt?: string;
    }>();
  const prefill: StaffBookingPrefill = {
    customerName,
    customerPhone,
    vehicleId,
    vehicleName,
    vehicleImageUrl,
    pickupAt,
    returnAt,
  };

  const back = () => goBackOr(router, ROUTES.manage.bookings());

  // Cổng chỉ còn quyền (ADR 0110) - chờ bộ quyền về rồi mới quyết.
  if (permissions.isLoading) {
    return (
      <>
        <AppHeader title={t('title')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenLoading />
        </Screen>
      </>
    );
  }

  if (!canCreate) {
    const message = tCreate('permissionDenied');
    return (
      <>
        <AppHeader title={t('title')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage icon="lock-closed-outline" title={message} />
        </Screen>
      </>
    );
  }

  return <StaffBookingFlow onBack={back} prefill={prefill} />;
}

/**
 * Tên + SĐT điền sẵn khi vào từ hồ sơ một khách đã có trong sổ (CUS-02 "Tạo đơn thuê").
 *
 * Chỉ ĐIỀN SẴN, không khoá: nhân viên vẫn sửa được, và luật gộp khách vẫn là SĐT đã chuẩn hoá ở
 * server. Đây cũng là lý do màn này KHÔNG nhận `tenantCustomerId` — client không chọn hồ sơ
 * khách nào được gắn vào đơn, `resolveWithinTx` của backend làm việc đó trong cùng transaction.
 */
export interface StaffBookingPrefill {
  customerName?: string | undefined;
  customerPhone?: string | undefined;
  /**
   * Xe + khoảng thuê điền sẵn khi vào từ một Ô TRÊN LỊCH ("Đặt xe" của `CalendarScreen`).
   *
   * Web giải cùng bài này bằng `StaffBookingDialog` nhận thẳng ba giá trị đó, nên luồng bắt đầu ở
   * bước CHUYẾN ĐI chứ không phải bước chọn xe — người dùng đã chọn xe bằng chính cú chạm vào ô.
   *
   * `pickupAt`/`returnAt` là ISO-8601 **UTC**: mốc tuyệt đối dựng từ ngày lịch của ô.
   */
  vehicleId?: string | undefined;
  /** Tên xe đi CÙNG id — xem `BookingCreatePrefill` ở `navigation/routes.ts`. */
  vehicleName?: string | undefined;
  /** Ảnh xe đi cùng id — web `vehicleImageUrl` (ô lịch / bộ chọn xe). */
  vehicleImageUrl?: string | undefined;
  pickupAt?: string | undefined;
  returnAt?: string | undefined;
}

/** Ô lịch chỉ biết `vehicleId`; luồng này chỉ đọc `id` + `name`, nên đó là tất cả những gì cần. */
type PickedVehicle = Pick<VehicleListItem, 'id' | 'name'> & {
  imageUrl?: string | null;
  /** Biển số (bước chọn xe có) - viên biển số ở "Tóm tắt lịch trình". */
  plate?: string | null;
};

/** Số tiền của MỘT dòng trong bảng giá server. Không có dòng đó thì `null`, không phải `0`. */
function rowAmount(
  quote: { rows: readonly { key: string; amount: string }[] } | null,
  key: string,
): string | null {
  return quote?.rows.find((row) => row.key === key)?.amount ?? null;
}

/**
 * Lớp NGOÀI của luồng đặt hộ — giữ XE và bước chọn xe, như web `StaffBookingDialog` giữ `picked`.
 *
 * Phần chuyến đi / xem lại / kết quả (`StaffBookingTrip`) render với `key` theo LƯỢT CHỌN XE: đổi xe
 * là một biểu mẫu MỚI hoàn toàn (dịch vụ, gói, chế độ thuê, giá trị form, cờ "đã sửa cọc"), y như web
 * `setPicked(null)` gỡ `StaffBookingFlow` khỏi cây. Giữ state cũ sang xe mới là ghi cọc/dịch vụ của
 * xe trước vào đơn của xe sau mà không ai thấy.
 */
function StaffBookingFlow({
  onBack,
  prefill,
}: {
  onBack: () => void;
  prefill: StaffBookingPrefill;
}) {
  const t = useTranslations('BookingRequests.staffFlow');
  /* Chi nhánh danh sách đơn đang lọc (`?branchId=`) — bộ chọn xe mở sẵn ở đó (ADR 0052 điều 6). */
  const hintedBranchId = useBranchReturnParam();

  /*
   * Vào từ một ô lịch thì XE đã được chọn bằng chính cú chạm đó — bắt đầu ở bước CHUYẾN ĐI, y như
   * `StaffBookingDialog` bên web mở thẳng vào form với xe đã cố định.
   */
  const [vehicle, setVehicle] = useState<PickedVehicle | null>(null);
  const [choosing, setChoosing] = useState(!prefill.vehicleId);
  /** Đếm lượt chọn xe — khoá của biểu mẫu chuyến, để chọn lại (kể cả CÙNG xe) cũng là form mới. */
  const [pickCount, setPickCount] = useState(0);
  /**
   * Khung giờ chọn ở bước chọn xe (web `StaffBookingDialog.pickedRange`) — thành giá trị mở đầu của
   * bước Chuyến đi, và được giữ lại khi quay về "Chọn xe khác" để không phải chọn giờ lần nữa.
   */
  const [pickedRange, setPickedRange] = useState<PickedRange | null>(null);

  /*
   * Xe điền sẵn dựng từ CHÍNH tham số route, không chờ một request nào: `GET /vehicles/:id` đòi
   * `vehicles.view` — quyền `bookings.create` KHÔNG bao hàm. Đặt NGAY TRONG RENDER (derived state).
   */
  if (prefill.vehicleId && prefill.vehicleName && !vehicle) {
    setVehicle({
      id: prefill.vehicleId,
      name: prefill.vehicleName,
      imageUrl: prefill.vehicleImageUrl ?? null,
    });
  }
  /* Nạp lại chỉ để LÀM MỊN tên (deep link không mang tên) — không phải điều kiện để luồng chạy. */
  const needsVehicleLookup = Boolean(prefill.vehicleId) && !prefill.vehicleName;
  const prefillVehicle = useVehicle(prefill.vehicleId, needsVehicleLookup);
  if (needsVehicleLookup && !vehicle && prefillVehicle.data) {
    setVehicle({
      id: prefillVehicle.data.id,
      name: prefillVehicle.data.name,
      imageUrl: prefill.vehicleImageUrl ?? prefillVehicle.data.mainImageUrl ?? null,
    });
  }
  /* Không tra được tên và cũng không được mang tên sang ⇒ QUAY VỀ bước chọn xe. */
  if (needsVehicleLookup && !vehicle && prefillVehicle.isError && !choosing) {
    setChoosing(true);
  }

  // Bước chọn xe — lối vào chưa biết xe (danh sách đơn, hồ sơ khách), hoặc "Chọn xe khác".
  if (choosing || (!vehicle && !needsVehicleLookup)) {
    return (
      <StaffVehiclePicker
        defaultBranchId={hintedBranchId}
        initialRange={pickedRange}
        onCancel={onBack}
        onContinue={(picked, range) => {
          setPickedRange(range);
          setVehicle({
            id: picked.id,
            name: picked.name,
            imageUrl: picked.mainImageUrl ?? null,
            plate: picked.plateNumber || null,
          });
          setPickCount((n) => n + 1);
          setChoosing(false);
        }}
      />
    );
  }

  // Deep link chỉ mang id: chờ tra tên xe (không quá một nhịp) thay vì dựng form với xe rỗng.
  if (!vehicle) {
    return (
      <>
        <AppHeader title={t('title')} onBack={onBack} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenLoading />
        </Screen>
      </>
    );
  }

  return (
    <StaffBookingTrip
      key={`${vehicle.id}:${pickCount}`}
      vehicle={vehicle}
      /* Ô lịch cố định giờ của nó; lối vào chưa biết xe lấy giờ chọn ở bước chọn xe (web). */
      prefill={
        prefill.vehicleId
          ? prefill
          : {
              ...prefill,
              pickupAt: pickedRange?.pickupAt ?? prefill.pickupAt,
              returnAt: pickedRange?.returnAt ?? prefill.returnAt,
            }
      }
      onBack={onBack}
      /* "Chọn xe khác" chỉ có ở lối vào chưa biết xe — ô lịch đã cố định xe (web `onChangeVehicle`). */
      {...(prefill.vehicleId ? {} : { onChangeVehicle: () => setChoosing(true) })}
    />
  );
}

/** Ba chặng của biểu mẫu chuyến — cùng tên với `StaffJourneyStage` của thanh tiến trình. */
function StaffBookingTrip({
  vehicle,
  prefill,
  onBack,
  onChangeVehicle,
}: {
  vehicle: PickedVehicle;
  prefill: StaffBookingPrefill;
  onBack: () => void;
  onChangeVehicle?: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('BookingRequests.staffFlow');
  const tFlow = useTranslations('BookingRequests.flow');
  const tApp = useTranslations('BookingRequests.staffFlow.app');
  const tPicker = useTranslations('BookingRequests.vehiclePicker');
  const dl = useDomainLabel();
  const tSource = useTranslations('Bookings.source');
  const fmt = useAppFormat();
  const router = useRouter();
  const errorMessage = useErrorMessage();

  const [step, setStep] = useState<Step>(STEP.TRIP);
  const [scheduling, setScheduling] = useState(false);
  /** Tấm chọn MỘT MỐC — chỉ dùng cho đơn dài hạn, nơi không có ngày trả để chọn. */
  const [pickingPickup, setPickingPickup] = useState(false);
  const [rentalMode, setRentalMode] = useState<RentalMode>(RENTAL_MODE.DAILY);
  // Dịch vụ của ĐƠN — mặc định tự lái; đối chiếu với năng lực xe khi hồ sơ về.
  const [serviceType, setServiceType] = useState<ServiceType>(SERVICE_TYPE.SELF_DRIVE);
  /**
   * Gói thuê dài hạn (ADR 0011). Đơn dài hạn có độ dài CỐ ĐỊNH theo gói: nhân viên chỉ chốt giờ
   * nhận, giờ trả do server suy ra bằng tháng lịch — không có ô nhập ngày trả.
   */
  const [packageMonths, setPackageMonths] = useState<LongTermPackageMonths | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; code: string; totalAmount: string } | null>(
    null,
  );
  /** Chặn bấm đúp "Tạo đơn" trước khi `isPending` kịp bật. */
  const submitLock = useRef(false);

  const vehicleId = vehicle.id;

  /**
   * Hồ sơ xe — CHỈ có với xe đang công khai; xe nội bộ thì thẻ dùng fallback (tên từ lối vào).
   * 404 ở đây là trạng thái hợp lệ, không phải lỗi.
   */
  const listingQuery = useListing(vehicleId);
  const listing = listingQuery.data ?? null;
  const vehicleServices: string[] = listing?.serviceTypes ?? [];

  // Xe không phục vụ dịch vụ đang chọn (hồ sơ vừa về) → rơi về dịch vụ đầu tiên của xe.
  if (vehicleServices.length > 0 && !vehicleServices.includes(serviceType)) {
    setServiceType(vehicleServices[0] as ServiceType);
  }

  const schema = useMemo(
    () =>
      staffBookingSchema(t, {
        required: tSource('validation.required'),
        nameRequired: tSource('validation.nameRequired'),
        nameMax: tSource('validation.nameMax', { max: BOOKING_SOURCE_LABEL_MAX }),
      }),
    [t, tSource],
  );
  const { control, trigger, getValues, setValue, formState } = useForm<StaffBookingValues>({
    resolver: yupResolver(schema),
    // Dịch vụ nằm ở state — đưa vào schema qua yup context ($serviceType).
    context: { serviceType },
    defaultValues: {
      // Đến từ hồ sơ khách thì không bắt nhân viên gõ lại tên + SĐT đã có trong sổ.
      customerName: prefill.customerName ?? '',
      customerPhone: prefill.customerPhone ?? '',
      // Mốc từ ô lịch là UTC; ô chọn phải hiện GIỜ VIỆT NAM (CLAUDE.md §9).
      pickupAt: prefill.pickupAt ? toAppTz(prefill.pickupAt) : null,
      returnAt: prefill.returnAt ? toAppTz(prefill.returnAt) : null,
      pickupMethod: PICKUP_METHOD.SELF,
      deliveryAddress: '',
      routeType: ROUTE_TYPE.IN_CITY,
      pickupAddress: '',
      destination: '',
      note: '',
      source: '',
      sourceLabel: '',
      manualBaseAmount: null,
      depositAmount: null,
      negotiated: false,
      manualDiscount: null,
      manualDeliveryFee: null,
      extraCharges: [],
      collaterals: [],
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
  const quoteParams =
    !hasPriceSelection
      ? null
      : isLongTerm
        ? { vehicleId, serviceType, packageMonths: packageMonths! }
        : {
            vehicleId,
            pickupAt: appWallClockToIso(watchedPickup!),
            returnAt: appWallClockToIso(watchedReturn!),
            serviceType,
            ...(isWithDriver ? { routeType: watchedRoute } : {}),
          };
  const quoteQuery = useQuery({
    queryKey: queryKeys.calendar.quote(quoteParams ?? {}),
    queryFn: () => bookingsApi.quote(quoteParams!),
    enabled: quoteParams != null,
    staleTime: STALE_TIME.STANDARD,
    retry: false,
  });
  const quote = quoteQuery.data ?? null;
  const quoteUnavailable = hasPriceSelection && quoteQuery.isError;

  /*
   * % ưu đãi cam kết của TỪNG gói, để gắn nhãn góc như trang khách. Đọc từ chính báo giá server
   * (cùng `longTermAmounts`), không tự suy % ở client. Không cần giờ nhận nên chạy ngay khi có xe;
   * gói đang chọn trùng khoá với `quoteQuery` nên không gọi lặp.
   */
  const packageQuotes = useQueries({
    queries: LONG_TERM_PACKAGE_MONTHS.map((months) => {
      const params = { vehicleId, serviceType, packageMonths: months };
      return {
        queryKey: queryKeys.calendar.quote(params),
        queryFn: () => bookingsApi.quote(params),
        enabled: isLongTerm && Boolean(vehicleId),
        staleTime: STALE_TIME.STANDARD,
        retry: false,
      };
    }),
  });
  const packageOptions = LONG_TERM_PACKAGE_MONTHS.map((months, i) => ({
    packageMonths: months,
    durationDiscountPercent: packageQuotes[i]?.data?.longTerm?.durationDiscountPercent ?? null,
  }));
  const bestPackageMonths = bestDiscountPackageMonths(packageOptions);

  /*
   * Cọc thu trực tiếp — điền sẵn từ chính sách thuê của xe MỖI KHI báo giá đổi, trừ khi nhân viên
   * đã tự sửa ô (dirty): con số thoả thuận với khách thắng mức mặc định của xe.
   */
  useEffect(() => {
    if (!quote) return;
    // TODO(ADR 0007): tiền phải đi dạng CHUỖI — `MoneyField`/schema dùng chung đang nhận `number`, nên
    // còn `Number()` ở đây (web cũng vậy). Người dùng chốt 27/10: ghi nợ kỹ thuật, sửa khi đổi MoneyField.
    if (!formState.dirtyFields.depositAmount) {
      setValue('depositAmount', Number(quote.depositAmount ?? 0));
    }
  }, [quote, formState.dirtyFields.depositAmount, setValue]);

  /**
   * Bật "Giá thoả thuận" (ADR 0109): giá hệ thống thành GỢI Ý — điền sẵn các ô còn trống từ báo giá
   * để nhân viên chỉ sửa chỗ khác. Tắt thì đơn quay về đúng báo giá, các ô đã gõ vẫn giữ để bật lại.
   * Native port of web `StaffBookingFlow.toggleNegotiated`.
   */
  function toggleNegotiated(on: boolean) {
    setValue('negotiated', on, { shouldDirty: true });
    if (!on || !quote) return;
    if (getValues('manualBaseAmount') == null) {
      setValue('manualBaseAmount', Number(rowAmount(quote, PRICE_ROW.BASE) ?? quote.totalAmount));
    }
    if (getValues('manualDiscount') == null) {
      const discountRow = rowAmount(quote, PRICE_ROW.DISCOUNT);
      setValue('manualDiscount', discountRow ? Number(discountRow.replace('-', '')) : 0);
    }
  }

  /**
   * Lịch bận của xe — CÙNG phép tính với luồng của khách nhưng qua cửa NỘI BỘ của gian hàng
   * (`/calendar/busy-days`), nên mọi xe — kể cả xe chưa lên chợ — đều khoá sẵn ngày đã kín.
   * Phép kiểm trùng ở "Tiếp tục" vẫn chạy, và constraint lúc tạo đơn vẫn là chốt chặn (ADR 0006).
   * Dài hạn không có ô chọn khoảng nên query tắt ở đó.
   */
  const busyWindow = useMemo(() => {
    const from = addDateKeyDays(vnDateKey(new Date()), -1);
    return { from, to: addDateKeyDays(from, BUSY_DAYS_LOOKAHEAD) };
  }, []);
  const busyDaysQuery = useQuery({
    queryKey: queryKeys.calendar.busyDays(vehicleId, busyWindow.from, busyWindow.to),
    queryFn: () => calendarApi.busyDays(vehicleId, busyWindow.from, busyWindow.to),
    enabled: !isLongTerm,
    staleTime: STALE_TIME.STANDARD,
  });
  const busyDays = useMemo(
    () => buildBusyDayIndex(busyDaysQuery.data?.days),
    [busyDaysQuery.data],
  );

  /* Nháp của tấm chọn khoảng — chỉ đổ vào form khi bấm Áp dụng. */
  const [rangeDraft, setRangeDraft] = useState<{
    pickupAt: StaffBookingValues['pickupAt'];
    returnAt: StaffBookingValues['returnAt'];
  }>({ pickupAt: null, returnAt: null });

  const checkConflict = useCheckConflict();
  const create = useCreateBooking();
  const submitting = create.isPending;

  /*
   * Tổng ở chân trang bước Xem lại phải KHỚP thẻ "Tiền thuê": giá thoả thuận (hoặc xe chưa có
   * giá) thì cộng đúng như thẻ - tiền thuê - giảm + phí giao + phụ phí theo dòng; còn giá hệ
   * thống thì là tổng báo giá.
   */
  /*
   * Theo dõi CẢ form (không theo mảng tên): `useWatch` theo tên của một field array có lúc trả bản
   * cũ sau `append/update` ở component con - đó là gốc của lệch tổng. Một nguồn tính duy nhất, thẻ
   * "Tiền thuê" nhận lại đúng con số này qua prop.
   */
  const watchedAll = useWatch({ control });
  const negotiatedOn = watchedAll.negotiated;
  const manualBase = watchedAll.manualBaseAmount;
  const manualDiscount = watchedAll.manualDiscount;
  const manualDelivery = watchedAll.manualDeliveryFee;
  const extraRows = watchedAll.extraCharges;
  const manualMode = negotiatedOn || quoteUnavailable;
  const reviewTotal = manualMode
    ? String(
        negotiatedTotal({
          base: manualBase,
          discount: manualDiscount,
          delivery: isDelivery ? manualDelivery : 0,
          extras: extraRows,
        }),
      )
    : (quote?.totalAmount ?? null);

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
    if (!(await trigger([...fields]))) return;
    const v = getValues();
    const end = isLongTerm ? derivedReturnAt : v.returnAt;
    // Kiểm trùng lịch là PREVIEW — constraint DB mới là chốt chặn (ADR 0006).
    checkConflict.mutate(
      {
        vehicleId,
        startAt: v.pickupAt ? appWallClockToIso(v.pickupAt) : '',
        // Dài hạn: khoảng cần kiểm là [nhận, nhận + gói tháng lịch) — chính khoảng đơn sẽ chiếm.
        endAt: end ? appWallClockToIso(end) : '',
      },
      {
        onSuccess: (res) => {
          if (res.hasConflict) {
            setStepError(tFlow('time.unavailable'));
          } else {
            setStepError(null);
            setStep(STEP.REVIEW);
          }
        },
        onError: (e) => setStepError(errorMessage(e)),
      },
    );
  }

  async function submitBooking() {
    if (submitLock.current || submitting) return;
    submitLock.current = true;
    setStepError(null);
    // Xe chưa có giá ⇒ giá thoả thuận là con đường DUY NHẤT (không tạo đơn 0đ âm thầm).
    const negotiated = quoteUnavailable || getValues('negotiated');
    const fields = [
      'customerName',
      'customerPhone',
      'note',
      'source',
      'sourceLabel',
      'depositAmount',
      'collaterals',
      ...(negotiated
        ? ([
            'manualBaseAmount',
            'manualDiscount',
            ...(isDelivery ? (['manualDeliveryFee'] as const) : []),
            'extraCharges',
          ] as const)
        : []),
    ] as const;
    if (!(await trigger([...fields]))) {
      submitLock.current = false;
      return;
    }
    if (negotiated && getValues('manualBaseAmount') == null) {
      setStepError(t('validation.baseAmountRequired'));
      submitLock.current = false;
      return;
    }
    if (negotiated && (getValues('manualDiscount') ?? 0) > (getValues('manualBaseAmount') ?? 0)) {
      setStepError(t('validation.discountExceedsBase'));
      submitLock.current = false;
      return;
    }

    const v = getValues();
    const discountRow = rowAmount(quote, PRICE_ROW.DISCOUNT);
    const deliveryLine = isDelivery
      ? t('deliveryNoteLine', { address: v.deliveryAddress.trim() })
      : '';
    const note = [deliveryLine, v.note.trim()].filter(Boolean).join('\n');

    create.mutate(
      {
        vehicleId,
        customerName: v.customerName.trim(),
        // `getValues` trả giá trị THÔ — `transform` của schema chỉ chạy lúc validate.
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
          ? packageMonths != null
            ? { longTermPackageMonths: packageMonths }
            : {}
          : { returnAt: appWallClockToIso(v.returnAt!) }),
        ...(negotiated
          ? {
              // Giá thoả thuận (ADR 0109): mọi khoản do gian hàng nhập; server tính lại tổng.
              baseAmount: String(v.manualBaseAmount ?? 0),
              discountAmount: String(v.manualDiscount ?? 0),
              deliveryFee: isDelivery ? String(v.manualDeliveryFee ?? 0) : '0',
              extraCharges: v.extraCharges.map((c) => ({
                label: c.label.trim(),
                amount: String(c.amount ?? 0),
              })),
              negotiatedPrice: true,
            }
          : {
              // Tiền từ báo giá server (đã gồm giá riêng theo ngày); giảm giá là dòng âm → tách dương.
              baseAmount: quote ? (rowAmount(quote, PRICE_ROW.BASE) ?? quote.totalAmount) : '0',
              discountAmount: discountRow ? discountRow.replace('-', '') : '0',
              // Giao tận nơi phí 0 lúc tạo — chủ xe chốt phí đã thoả thuận sau.
              deliveryFee: '0',
            }),
        // Cọc & thế chấp (ADR 0109): nhập khoản nào ghi khoản đó - cọc 0 và không tài sản là không cọc.
        depositAmount: String(v.depositAmount ?? 0),
        ...(v.collaterals.length > 0
          ? {
              collaterals: v.collaterals.map((c) => ({
                collateralType: c.collateralType,
                description: c.description.trim() || null,
              })),
            }
          : {}),
        // Nguồn đơn (ADR 0110) — server từ chối `xeprime`; nhãn chỉ đi kèm nguồn nhận nhãn.
        ...bookingSourcePayload(v),
        ...(note ? { note } : {}),
      } satisfies CreateBookingInput,
      {
        onSuccess: (booking) => {
          setCreated({ id: booking.id, code: booking.code, totalAmount: booking.totalAmount });
          setStep(STEP.DONE);
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

  const vehicleName = listing?.name ?? vehicle?.name ?? '';
  const vehicleThumbUrl = listing?.mainImageUrl ?? vehicle?.imageUrl ?? null;
  const pickupPoint = listing?.pickupPoint ?? null;
  /* Cùng một cách viết điểm nhận với thẻ chuyến (`pickupPointText` — web `pickup-point.ts`). */
  const pickupPointLine = pickupPoint ? pickupPointText(pickupPoint) : '';

  /** Chuyến đang chọn — MỘT bản cho màn Xem lại và hộp kết quả. */
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

  /** Lui từ màn Xem lại về bước Chuyến đi — không lui khi đang gửi (đơn có thể đã ra đời). */
  const backToTrip = () => {
    if (submitting) return;
    setStepError(null);
    setStep(STEP.TRIP);
  };

  /*
   * Phím LÙI cứng của Android ở màn Xem lại = lùi MỘT bước về Chuyến đi, như nút lùi trên header
   * (người dùng chốt 27/10) — không thoát cả luồng làm mất tên/SĐT khách vừa gõ. Đang gửi thì nuốt
   * phím: đơn có thể đã ra đời ở server. Ở bước Chuyến đi phím lùi giữ mặc định (thoát màn).
   */
  useFocusEffect(
    useCallback(() => {
      if (step !== STEP.REVIEW) return undefined;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (!submitting) {
          setStepError(null);
          setStep(STEP.TRIP);
        }
        return true;
      });
      return () => subscription.remove();
    }, [step, submitting]),
  );

  // --- Đã tạo đơn: hộp kết quả như của khách, đổi chữ + hàng nút --------------------------------
  if (step === STEP.DONE && created) {
    return (
      <StaffBookingDone
        code={created.code}
        vehicleName={vehicleName}
        vehicleImageUrl={vehicleThumbUrl}
        trip={tripSummary}
        totalAmount={created.totalAmount}
        onClose={onBack}
        onOpenBooking={() => router.replace(ROUTES.manage.bookingDetail(created.id))}
      />
    );
  }

  // --- Màn Xem lại — web `StaffBookingReviewStep` ở breakpoint điện thoại (≤640px): một cột ------
  if (step === STEP.REVIEW) {
    return (
      <>
        <AppHeader
          title={tPicker('title')}
          onBack={backToTrip}
          right={
            <Text col={colors.placeholder} fos={14} lh={20}>
              {tApp('reviewStep')}
            </Text>
          }
        />
        <Screen
          edges={['left', 'right', 'bottom']}
          hideFooterWhileTyping
          footer={
            /* Cùng chân trang bước 2 (Figma "Sticky Footer"): tạm tính + [Quay lại][Tạo đơn]. */
            <YStack gap={12}>
              {reviewTotal != null ? (
                <XStack ai="center" jc="space-between" gap={space.sm}>
                  <Text f={1} col={colors.placeholder} fos={12} lh={18}>
                    {manualMode
                      ? t('trip.barTotal')
                      : quote?.days && !quote.estimateNote
                        ? tPicker('estimateDaysLabel', { days: quote.days })
                        : tPicker('estimateLabel')}
                  </Text>
                  <Text col={colors.primary} fos={16} lh={24} fow={fontWeight.semibold}>
                    {fmt.money(reviewTotal)}
                  </Text>
                </XStack>
              ) : null}
              <XStack gap={8}>
                <Button
                  label={tFlow('actions.back')}
                  variant="secondary"
                  block={false}
                  disabled={submitting}
                  onPress={backToTrip}
                />
                <YStack f={1}>
                  <Button
                    variant="gradient"
                    label={t('review.submit.cta')}
                    loading={submitting}
                    onPress={() => void submitBooking()}
                  />
                </YStack>
              </XStack>
            </YStack>
          }
        >
          {/* `.review` — các khối cách `space-lg`. */}
          <YStack gap={16}>
            {/* Thẻ chuyến bố cục `review` (ảnh lớn hết bề rộng, một cột) + nút chữ "Chỉnh sửa". */}
            <BookingTripCardView
              listing={listing}
              vehicleName={vehicleName}
              vehicleImageUrl={vehicleThumbUrl}
              trip={tripSummary}
              variant="review"
              showMileage
              showOwner={false}
              selfPickupFallback={t('review.selfPickupBranch')}
              action={
                <Pressable
                  onPress={backToTrip}
                  disabled={submitting}
                  accessibilityRole="button"
                  accessibilityLabel={tFlow('reviewPage.trip.editLabel')}
                  hitSlop={space.sm}
                >
                  {/* `.editLink` — body · semibold · `color-primary-hover` (Text/Brand/primary 2). */}
                  <Text col={colors.primaryHover} fos={fontSize.body} fow={fontWeight.semibold}>
                    {tFlow('reviewPage.trip.edit')}
                  </Text>
                </Pressable>
              }
            />

            {/*
              `.card` "Thông tin khách" — viền 1px `color-border`, bo `radius-card`, đệm `space-md`
              (≤640px), khe `space-md`. Ô nhập là `TextField` dùng chung (viền `border-input`
              1px, bo `radius-control`) — nhãn NẰM TRÊN ô như web `layout="vertical"`.
            */}
            <InfoGroup title={t('review.customer.title')} hint={t('review.customer.description')}>
                <TextField
                  control={control}
                  name="customerName"
                  label={t('review.customer.name')}
                  placeholder={t('review.customer.namePlaceholder')}
                  required
                />
                <TextField
                  control={control}
                  name="customerPhone"
                  label={t('review.customer.phone')}
                  placeholder={t('review.customer.phonePlaceholder')}
                  keyboardType="phone-pad"
                  required
                />
                {/* Nguồn đơn (ADR 0110): khách tới từ kênh nào — nhãn để lọc và thống kê về sau. */}
                <BookingSourceFields control={control} sourceName="source" labelName="sourceLabel" />
                {/* `TextAreaField` 2 dòng, đếm ký tự tới `STAFF_BOOKING_NOTE_MAX`. */}
                <TextField
                  control={control}
                  name="note"
                  label={t('review.customer.noteLabel')}
                  placeholder={t('review.customer.notePlaceholder')}
                  multiline scrollable
                  rows={3}
                  maxLength={STAFF_BOOKING_NOTE_MAX}
                />
            </InfoGroup>

            {/*
              Tiền thuê (giá hệ thống hoặc "Giá thoả thuận") + Cọc & thế chấp theo đơn (ADR 0109) —
              web `StaffBookingPriceCard` / `StaffBookingCollateralCard`.
            */}
            <StaffBookingPriceCard
              control={control}
              quote={quote}
              quoteLoading={quoteQuery.isLoading}
              quoteUnavailable={quoteUnavailable}
              isDelivery={isDelivery}
              onToggleNegotiated={toggleNegotiated}
              manualTotal={manualMode ? reviewTotal : null}
            />
            <StaffBookingCollateralCard control={control} />

            {stepError ? <Callout tone="danger" title={stepError} /> : null}

            {/*
              `.next` "Sau khi tạo đơn" — KHÔNG phải hộp thông báo: dòng tiêu đề body semibold kèm
              icon thông tin `color-primary` cỡ 20 (khe `space-sm`), rồi thân body `text-tertiary`.
            */}
            <YStack gap={6} accessibilityLabel={t('review.next.title')}>
              <XStack ai="center" gap={space.sm}>
                <Ionicons name="information-circle-outline" size={iconSize.md} color={colors.primary} />
                <Text f={1} col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                  {t('review.next.title')}
                </Text>
              </XStack>
              <Text col={colors.placeholder} fos={fontSize.body}>
                {t('review.next.body')}
              </Text>
            </YStack>
          </YStack>
        </Screen>
      </>
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
  const rangeError = formState.errors.pickupAt?.message ?? formState.errors.returnAt?.message;

  /* Figma "Sticky Footer" `24576:131649`: "Tạm tính N ngày" + tổng vàng; [Quay lại][Xem lại yêu cầu]. */
  const footer = (
    <YStack gap={12}>
      <XStack ai="center" jc="space-between" gap={space.sm}>
        {/* Chi tiết giá (giá gói, ưu đãi, ghi chú) nằm trong dấu (i) cạnh nhãn tổng. */}
        <XStack f={1} ai="center" gap={4}>
          <Text col={colors.placeholder} fos={12} lh={18}>
            {quote && hasPriceSelection && quote.days && !quote.estimateNote
              ? tPicker('estimateDaysLabel', { days: quote.days })
              : barLabel}
          </Text>
          {quote && hasPriceSelection ? (
          <InfoHint
            // Tiêu đề tấm chi tiết = "Giá gói N tháng".
            label={
              quote.longTerm
                ? t('trip.packagePriceTitle', { months: quote.longTerm.packageMonths })
                : t('trip.priceTitle')
            }
            size={12}
            content={
              <YStack gap={8}>
                {quote.rows.map((row) => {
                  // Dòng giảm (ưu đãi cam kết, khuyến mãi) - cả nhãn lẫn số tô đỏ.
                  const minus = String(row.amount).startsWith('-');
                  return (
                    <XStack key={`${row.key}-${row.label}`} jc="space-between" gap={space.md}>
                      <Text f={1} col={minus ? colors.danger : colors.textMuted} fos={14} lh={20}>
                        {row.label}
                      </Text>
                      <Text
                        col={minus ? colors.danger : colors.text}
                        fos={14}
                        lh={20}
                        fow={fontWeight.medium}
                      >
                        {fmt.money(row.amount)}
                      </Text>
                    </XStack>
                  );
                })}
                {quote.longTerm?.durationDiscountPercent ? (
                  <Text col={colors.success} fos={14} lh={20} fow={fontWeight.semibold}>
                    {tFlow('price.savings', {
                      amount: fmt.money(quote.longTerm.durationDiscountAmount),
                      months: quote.longTerm.packageMonths,
                    })}
                  </Text>
                ) : null}
                {quote.estimateNote ? (
                  <Text col={colors.textMuted} fos={12} lh={18}>
                    {quote.estimateNote}.
                  </Text>
                ) : null}
              </YStack>
            }
          />
          ) : null}
        </XStack>
        {quote && hasPriceSelection ? (
          <Text col={colors.primary} fos={16} lh={24} fow={fontWeight.semibold}>
            {fmt.money(quote.totalAmount)}
          </Text>
        ) : null}
      </XStack>
      <XStack gap={8}>
        <Button
          label={tFlow('actions.back')}
          variant="secondary"
          block={false}
          onPress={onChangeVehicle ?? onBack}
        />
        <YStack f={1}>
          <Button
            label={checkConflict.isPending ? tFlow('actions.checking') : tApp('reviewAction')}
            variant="gradient"
            loading={checkConflict.isPending}
            onPress={() => void continueFromTrip()}
          />
        </YStack>
      </XStack>
    </YStack>
  );

  const serviceIcon: Record<string, LineIconName> = {
    [SERVICE_TYPE.SELF_DRIVE]: 'car',
    [SERVICE_TYPE.WITH_DRIVER]: 'profile',
    [SERVICE_TYPE.LONG_TERM]: 'calendar',
  };
  const serviceOptions = vehicleServices.length > 0 ? vehicleServices : [serviceType];
  const pickupIso = watchedPickup ? appWallClockToIso(watchedPickup) : null;
  const returnIso = effectiveReturn ? appWallClockToIso(effectiveReturn) : null;
  const pickupPlace = isWithDriver
    ? getValues('pickupAddress')
    : isDelivery
      ? getValues('deliveryAddress')
      : pickupPointLine;
  const returnPlace = isWithDriver ? getValues('destination') || pickupPlace : pickupPlace;

  return (
    <>
      <AppHeader
        title={tPicker('title')}
        onBack={onBack}
        right={
          <Text col={colors.placeholder} fos={14} lh={20}>
            {tPicker('stepOf', { current: 2, total: 2 })}
          </Text>
        }
      />
      <Screen edges={['left', 'right', 'bottom']} hideFooterWhileTyping footer={footer}>
        {/*
          Figma "Create Order" bước 2/2 `24576:130579`: các thẻ "Nhóm thông tin" (trắng, viền mảnh,
          bo 16, đệm 16, tiêu đề 16 đậm, khe 12) cách nhau 16. Nghiệp vụ giữ như web `StaffBookingFlow`.
        */}
        <YStack gap={16}>
          <InfoGroup
            title={tApp('serviceTitle')}
            hint={isWithDriver ? routeDescription(tFlow, watchedRoute) : undefined}
          >
            <YStack gap={8} accessibilityRole="radiogroup" accessibilityLabel={tApp('serviceTitle')}>
              {serviceOptions.map((value) => (
                <ChoiceRow
                  key={value}
                  icon={serviceIcon[value] ?? 'car'}
                  title={dl('serviceType', value)}
                  subtitle={tApp(`serviceDesc.${value as ServiceType}`)}
                  selected={serviceType === value}
                  onPress={() => {
                    setServiceType(value as ServiceType);
                    setStepError(null);
                  }}
                />
              ))}
            </YStack>
            {isWithDriver ? (
              <YStack gap={6}>
                <Text col={colors.text} fos={14} lh={20} fow={fontWeight.medium}>
                  {tFlow('service.routeLabel')}
                </Text>
                <XStack gap={space.xs} flexWrap="wrap">
                  {ROUTE_TYPE_VALUES.map((value) => (
                    <RouteChip
                      key={value}
                      value={value}
                      selected={watchedRoute === value}
                      onPress={() => setValue('routeType', value, { shouldValidate: true })}
                    />
                  ))}
                </XStack>
              </YStack>
            ) : null}
          </InfoGroup>

          <InfoGroup
            title={tApp('timeTitle')}
            hint={
              isLongTerm
                ? packageMonths == null
                  ? t('trip.packageHint')
                  : derivedReturnAt
                    ? t('trip.returnDerived', { date: fmt.rentalAt(appWallClockToIso(derivedReturnAt)) })
                    : t('trip.returnPending')
                : undefined
            }
          >
            {/* Dài hạn (ADR 0011): chọn gói + giờ nhận, ngày trả suy ra (chỉ đọc). */}
            {isLongTerm ? (
              <>
                {/* Lưới 3 cột giống ô chọn gói của trang khách (`ListingBookingCard` › PackageChip). */}
                <XStack
                  flexWrap="wrap"
                  mx={-space.xs / 2}
                  rowGap={space.sm}
                  accessibilityRole="radiogroup"
                  accessibilityLabel={t('trip.packageGroupLabel')}
                >
                  {LONG_TERM_PACKAGE_MONTHS.map((months, index) => {
                    const active = packageMonths === months;
                    return (
                      <Pressable
                        key={months}
                        style={PACKAGE_CELL}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        onPress={() => {
                          setPackageMonths(months);
                          setStepError(null);
                        }}
                      >
                        <YStack
                          px={space.xs}
                          py={space.sm}
                          minHeight={44}
                          ai="center"
                          jc="center"
                          br={radius.md}
                          bw={1}
                          bc={active ? colors.primary : colors.border}
                          bg={active ? colors.primarySubtle : colors.surface}
                          overflow="hidden"
                        >
                          <Text
                            col={active ? colors.primary : colors.text}
                            fos={fontSize.body}
                            fow={active ? fontWeight.semibold : fontWeight.medium}
                            numberOfLines={1}
                          >
                            {fmt.packageLabel(months) ?? String(months)}
                          </Text>
                          {packageOptions[index]?.durationDiscountPercent ? (
                            <DiscountTag
                              percent={packageOptions[index]!.durationDiscountPercent!}
                              variant="corner"
                              active={active}
                              best={bestPackageMonths === months}
                            />
                          ) : null}
                        </YStack>
                      </Pressable>
                    );
                  })}
                </XStack>
                <RangeSelectBox
                  label={t('trip.pickupTimeField')}
                  placeholder={t('trip.pickupTimeField')}
                  value={
                    pickupIso
                      ? derivedReturnAt
                        ? fmt.dateTimeRange(pickupIso, appWallClockToIso(derivedReturnAt))
                        : fmt.dateTime(pickupIso)
                      : ''
                  }
                  onPress={() => setPickingPickup(true)}
                />
              </>
            ) : (
              <>
                <RangeSelectBox
                  label={tFlow('time.fieldLabel')}
                  placeholder={tFlow('time.empty')}
                  value={pickupIso && returnIso ? fmt.dateTimeRange(pickupIso, returnIso) : ''}
                  onPress={() => {
                    setRangeDraft({
                      pickupAt: watchedPickup ?? null,
                      returnAt: watchedReturn ?? null,
                    });
                    setScheduling(true);
                  }}
                />
                {watchedPickup && watchedReturn && hasRange ? (
                  <XStack ai="flex-start" gap={8} px={12} py={8} br={12} bg={colors.successSurface}>
                    <YStack pt={2}>
                      <LineIcon name="tick" size={16} color={colors.success} />
                    </YStack>
                    <Text f={1} col={colors.success} fos={14} lh={20}>
                      {tApp('durationNote', {
                        duration: fmt.rentalDuration(watchedPickup, watchedReturn),
                        mode:
                          rentalMode === RENTAL_MODE.HOURLY
                            ? tFlow('time.modeHourly')
                            : tFlow('time.modeDaily'),
                      })}
                    </Text>
                  </XStack>
                ) : null}
              </>
            )}
            {rangeError ? (
              <Text col={colors.danger} fos={12} lh={18}>
                {rangeError}
              </Text>
            ) : null}
          </InfoGroup>

          {/* Có tài xế: xe ĐẾN ĐÓN - địa chỉ đón (+ điểm đến khi liên tỉnh). */}
          {isWithDriver ? (
            <InfoGroup title={tApp('driverTitle')}>
              <TextField
                control={control}
                name="pickupAddress"
                label={t('trip.driverPickupLabel')}
                placeholder={t('trip.driverPickupPlaceholder')}
                required
              />
              {watchedRoute !== ROUTE_TYPE.IN_CITY ? (
                <TextField
                  control={control}
                  name="destination"
                  label={t('trip.destinationLabel')}
                  placeholder={t('trip.destinationPlaceholder')}
                  required
                />
              ) : null}
            </InfoGroup>
          ) : (
            <InfoGroup
              title={tApp('addressTitle')}
              hint={
                /* API chưa có địa chỉ trả riêng - trả xe tại chính điểm nhận (người dùng 28/11/2026). */
                isDelivery ? (
                  <YStack gap={8}>
                    <Text col={colors.textMuted} fos={14} lh={20}>
                      {tApp('returnSameNote')}
                    </Text>
                    <Text col={colors.textMuted} fos={14} lh={20}>
                      {t('trip.deliveryFeeNote')}
                    </Text>
                  </YStack>
                ) : (
                  tApp('returnSameNote')
                )
              }
            >
              <SegmentedTabs
                items={[
                  { key: PICKUP_METHOD.SELF, label: tApp('selfTab') },
                  { key: PICKUP_METHOD.DELIVERY, label: tFlow('pickup.delivery') },
                ]}
                value={pickupMethod}
                onChange={(next) => setValue('pickupMethod', next, { shouldValidate: true })}
              />
              {isDelivery ? (
                <>
                  <TextField
                    control={control}
                    name="deliveryAddress"
                    label={t('trip.deliveryAddressLabel')}
                    placeholder={t('trip.deliveryAddressPlaceholder')}
                    required
                  />
                  <XStack ai="center" jc="space-between" gap={space.sm}>
                    <Text col={colors.text} fos={14} lh={20}>
                      {t('trip.deliveryFeeLabel')}
                    </Text>
                    <Text col={colors.success} fos={14} lh={20} fow={fontWeight.semibold}>
                      {t('trip.deliveryFeeLater')}
                    </Text>
                  </XStack>
                </>
              ) : (
                <YStack gap={6}>
                  <Text col={colors.text} fos={14} lh={20} fow={fontWeight.medium}>
                    {tApp('pickupAddressLabel')}
                    <Text col={colors.danger}> *</Text>
                  </Text>
                  <XStack
                    ai="center"
                    gap={8}
                    minHeight={40}
                    px={14}
                    py={8}
                    br={12}
                    bw={1}
                    bc={colors.borderInput}
                    bg={colors.surface}
                  >
                    <Text f={1} col={colors.text} fos={14} lh={20} numberOfLines={1}>
                      {pickupPointLine || t('trip.selfHint')}
                    </Text>
                    <LineIcon name="location" size={20} color={colors.placeholder} />
                  </XStack>
                </YStack>
              )}
            </InfoGroup>
          )}

          {stepError ? <Callout tone="warning" title={stepError} /> : null}
          {quoteUnavailable ? <Callout tone="info" title={t('trip.noPrice')} /> : null}

          {/* Figma "Tóm tắt lịch trình": xe (ảnh 82×52 + tên + viên biển số), hình thức, nhận, trả. */}
          <InfoGroup title={tApp('summaryTitle')}>
            <XStack ai="center" gap={12}>
              <YStack w={82} h={52} br={8} ov="hidden" bg={colors.surfaceMuted}>
                <RemoteImage
                  uri={vehicleThumbUrl}
                  recyclingKey={vehicleId}
                  fallback={<Ionicons name="car-outline" size={iconSize.lg} color={colors.placeholder} />}
                />
              </YStack>
              <YStack f={1} minWidth={0} gap={4}>
                <Text col={colors.text} fos={16} lh={24} fow={fontWeight.semibold} numberOfLines={1}>
                  {vehicleName}
                </Text>
                {vehicle.plate ? (
                  <XStack alignSelf="flex-start" px={8} py={2} br={6} bg={colors.background}>
                    <Text col={colors.textMuted} fos={12} lh={18} fow={fontWeight.medium}>
                      {vehicle.plate}
                    </Text>
                  </XStack>
                ) : null}
              </YStack>
            </XStack>
            <YStack gap={12}>
              <SummaryRow
                label={tApp('rowService')}
                value={[
                  dl('serviceType', serviceType),
                  isLongTerm
                    ? packageMonths
                      ? fmt.packageLabel(packageMonths)
                      : null
                    : rentalMode === RENTAL_MODE.HOURLY
                      ? tFlow('time.modeHourly')
                      : tFlow('time.modeDaily'),
                ]
                  .filter(Boolean)
                  .join(LIST_SEPARATOR)}
              />
              <SummaryRow
                label={tApp('rowPickup')}
                value={pickupIso ? fmt.dateTime(pickupIso) : '-'}
                sub={pickupPlace}
              />
              <SummaryRow
                label={tApp('rowReturn')}
                value={returnIso ? fmt.dateTime(returnIso) : '-'}
                sub={returnPlace}
              />
            </YStack>
          </InfoGroup>
        </YStack>
      </Screen>

      {/* Không chặn hai đầu: đơn đặt trước cho tuần sau là chuyện thường, và web cũng không chặn. */}
      {pickingPickup ? (
        <MomentPickerSheet
          open
          onClose={() => setPickingPickup(false)}
          value={watchedPickup ?? nowInAppTz()}
          onChange={(next) => {
            setValue('pickupAt', next, { shouldValidate: true });
            if (stepError) setStepError(null);
          }}
          title={t('trip.pickupTimeField')}
        />
      ) : null}

      <RentalRangeSheet
        open={scheduling}
        value={rangeDraft}
        mode={rentalMode}
        busyDays={busyDays}
        busyLoading={busyDaysQuery.isLoading}
        onChange={setRangeDraft}
        onModeChange={setRentalMode}
        onApply={() => {
          setValue('pickupAt', rangeDraft.pickupAt, { shouldValidate: true });
          setValue('returnAt', rangeDraft.returnAt, { shouldValidate: true });
          if (stepError) setStepError(null);
          setScheduling(false);
        }}
        onCancel={() => setScheduling(false)}
      />
    </>
  );
}

/** Thẻ "Nhóm thông tin" của Figma tạo đơn: trắng, viền mảnh, bo 16, đệm 16, tiêu đề 16 đậm, khe 12. */
function InfoGroup({
  title,
  hint,
  children,
}: {
  title: string;
  /** Ghi chú của khối - nằm sau dấu (i) cạnh tiêu đề thay vì in dưới các ô. */
  hint?: ReactNode;
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <YStack bg={colors.surface} bw={1} bc={colors.border} br={16} p={16} gap={12}>
      <XStack ai="center" gap={4}>
        <Text col={colors.text} fos={16} lh={24} fow={fontWeight.semibold}>
          {title}
        </Text>
        {hint ? <InfoHint label={title} content={hint} size={16} /> : null}
      </XStack>
      {children}
    </YStack>
  );
}

/** Một lựa chọn "Hình thức thuê": ô icon 40 + tên + mô tả; chọn = viền vàng, nền ngà, tên vàng. */
function ChoiceRow({
  icon,
  title,
  subtitle,
  selected,
  onPress,
}: {
  icon: LineIconName;
  title: string;
  subtitle: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={title}
    >
      <XStack
        ai="center"
        gap={12}
        px={12}
        py={9}
        br={12}
        bw={1}
        bc={selected ? colors.primary : colors.border}
        bg={selected ? colors.brandWash : colors.surface}
      >
        <YStack
          w={40}
          h={40}
          br={999}
          ai="center"
          jc="center"
          bg={selected ? colors.brandIconBg : colors.background}
        >
          <LineIcon name={icon} size={24} color={selected ? colors.primary : colors.textMuted} />
        </YStack>
        <YStack f={1} minWidth={0} gap={4}>
          <Text col={selected ? colors.primary : colors.text} fos={14} lh={20} fow={fontWeight.medium}>
            {title}
          </Text>
          <Text col={colors.textMuted} fos={14} lh={20} numberOfLines={1}>
            {subtitle}
          </Text>
        </YStack>
      </XStack>
    </Pressable>
  );
}

/** Hàng "Tóm tắt lịch trình": nhãn 14 mờ trái, giá trị 14 vừa phải, địa điểm 12 mờ dưới (canh phải). */
function SummaryRow({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  const colors = useColors();
  return (
    <XStack ai="flex-start" jc="space-between" gap={space.sm}>
      <Text col={colors.placeholder} fos={14} lh={20}>
        {label}
      </Text>
      <YStack f={1} minWidth={0} ai="flex-end" gap={2}>
        <Text col={colors.text} fos={14} lh={20} fow={fontWeight.medium} ta="right">
          {value}
        </Text>
        {sub ? (
          <Text col={colors.placeholder} fos={12} lh={18} ta="right">
            {sub}
          </Text>
        ) : null}
      </YStack>
    </XStack>
  );
}

/**
 * Hộp "Đã tạo đơn thuê" - khuôn `BookingResult` (huy hiệu thành công như cũ) · tiêu đề ·
 * lời dẫn · ô mã đơn, rồi MỘT thẻ tóm tắt (xe, hình thức, nhận, trả, tổng). Hai nút dính đáy một hàng.
 */
function StaffBookingDone({
  code,
  vehicleName,
  vehicleImageUrl,
  trip,
  totalAmount,
  onClose,
  onOpenBooking,
}: {
  code: string;
  listing: Parameters<typeof BookingTripCardView>[0]['listing'];
  vehicleName: string;
  vehicleImageUrl: string | null;
  trip: BookingTrip;
  totalAmount: string | null;
  onClose: () => void;
  onOpenBooking: () => void;
}) {
  const tPicker = useTranslations('BookingRequests.vehiclePicker');
  const t = useTranslations('BookingRequests.staffFlow');
  const tFlow = useTranslations('BookingRequests.flow');
  const tApp = useTranslations('BookingRequests.staffFlow.app');
  const dl = useDomainLabel();
  const fmt = useAppFormat();
  const colors = useColors();
  const copy = useCopy();
  const pickupIso = trip.pickupAt ? appWallClockToIso(trip.pickupAt) : null;
  const returnIso = trip.returnAt ? appWallClockToIso(trip.returnAt) : null;

  return (
    <>
      <AppHeader title={tPicker('title')} onBack={onClose} />
      <Screen
        edges={['left', 'right', 'bottom']}
        footer={
          /* Hai nút DÍNH ĐÁY trên MỘT hàng: [Đóng] [Mở chi tiết đơn] - nút chính bên phải. */
          <XStack gap={8}>
            <YStack f={1}>
              <Button label={t('done.close')} variant="secondary" onPress={onClose} />
            </YStack>
            <YStack f={1}>
              <Button variant="gradient" label={t('done.openBooking')} onPress={onOpenBooking} />
            </YStack>
          </XStack>
        }
      >
        {/* Bản GỌN cho điện thoại: huy hiệu thành công + mã đơn, rồi một thẻ tóm tắt (xe · lịch · tổng). */}
        <BookingResult
          title={t('done.title')}
          lead={t('done.lead')}
          code={null}
          footer={null}
        >
          <YStack bg={colors.surface} bw={1} bc={colors.border} br={16} p={16} gap={12}>
            {/* Mã đơn gom vào thẻ (người dùng 28/11/2026): nhãn · mã · nút chép. */}
            <XStack ai="center" jc="space-between" gap={space.sm}>
              <Text col={colors.placeholder} fos={14} lh={20}>
                {t('done.codeLabel')}
              </Text>
              <XStack ai="center" gap={4} flexShrink={1}>
                <Text col={colors.text} fos={14} lh={20} fow={fontWeight.semibold} numberOfLines={1}>
                  {code}
                </Text>
                <IconButton icon="copy-outline" label={t('done.copyCode')} onPress={() => void copy(code)} />
              </XStack>
            </XStack>
            <YStack h={1} bg={colors.borderSubtle} />
            <XStack ai="center" gap={12}>
              <YStack w={64} h={42} br={8} ov="hidden" bg={colors.surfaceMuted}>
                <RemoteImage
                  uri={vehicleImageUrl}
                  fallback={<Ionicons name="car-outline" size={iconSize.md} color={colors.placeholder} />}
                />
              </YStack>
              <Text f={1} col={colors.text} fos={16} lh={24} fow={fontWeight.semibold} numberOfLines={2}>
                {vehicleName}
              </Text>
            </XStack>
            <YStack gap={8}>
              <SummaryRow
                label={tApp('rowService')}
                value={[
                  dl('serviceType', trip.serviceType),
                  trip.packageMonths ? fmt.packageLabel(trip.packageMonths) : null,
                ]
                  .filter(Boolean)
                  .join(LIST_SEPARATOR)}
              />
              <SummaryRow label={tApp('rowPickup')} value={pickupIso ? fmt.dateTime(pickupIso) : '-'} />
              <SummaryRow label={tApp('rowReturn')} value={returnIso ? fmt.dateTime(returnIso) : '-'} />
              {trip.isDelivery && trip.deliveryAddress ? (
                <SummaryRow label={tFlow('pickup.delivery')} value={trip.deliveryAddress} />
              ) : null}
            </YStack>
            {totalAmount ? (
              <>
                <YStack h={1} bg={colors.borderSubtle} />
                <XStack ai="center" jc="space-between" gap={space.sm}>
                  <Text col={colors.text} fos={14} lh={20} fow={fontWeight.semibold}>
                    {t('done.total')}
                  </Text>
                  <Text col={colors.primary} fos={18} lh={28} fow={fontWeight.semibold}>
                    {fmt.money(totalAmount)}
                  </Text>
                </XStack>
              </>
            ) : null}
          </YStack>
        </BookingResult>
      </Screen>
    </>
  );
}

/** Một ô trong lưới 3 cột chọn gói tháng. */
const PACKAGE_CELL = { width: '33.333%', paddingHorizontal: space.xs / 2 } as const;
