import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { BackHandler, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  RENTAL_MODE,
  API_ERROR_CODE,
  LONG_TERM_PACKAGE_MONTHS,
  PERMISSION,
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
import { STALE_TIME } from '@xeprime/api-client';
import { XP_TOKENS, toPx } from '@xeprime/ui';
import {
  appWallClockToIso,
  buildBusyDayIndex,
  longTermReturnFromWallClock,
  nowInAppTz,
  toAppTz,
  type RentalMode,
} from '@xeprime/domain';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { FieldBox } from '@/components/ui/FieldBox';
import { FormSection } from '@/components/ui/FormSection';
import { MomentPickerSheet } from '@/components/ui/MomentPickerSheet';
import { MoneyField } from '@/components/ui/MoneyField';
import { PriceBreakdown } from '@/components/ui/PriceBreakdown';
import { RangeFieldBox } from '@/components/ui/RangeFieldBox';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { Skeleton } from '@/components/ui/Skeleton';
import { TextField } from '@/components/ui/TextField';
import { ScreenLoading } from '@/components/state/ScreenLoading';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { calendarApi } from '@/api/calendar/api';
import { BookingJourney } from '@/features/booking-requests/components/BookingJourney';
import {
  BookingResult,
  BookingResultTotal,
} from '@/features/booking-requests/components/BookingResult';
import {
  BookingTripCardView,
  type BookingTrip,
} from '@/features/booking-requests/components/BookingTripCard';
import {
  PickupOption,
  RouteChip,
  routeDescription,
} from '@/features/booking-requests/components/RequestTripStep';
import { VehicleSummaryCard } from '@/features/booking-requests/components/VehicleSummaryCard';
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
import { VehiclePickerSheet } from './components/VehiclePickerSheet';
import { useBranchReturnParam } from '@/features/branches/hooks/use-branch-filter';
import { useListing } from '@/features/marketplace/hooks/use-marketplace-data';
import { useCheckConflict, useCreateBooking } from './hooks/use-bookings';
import { useCanCreateBooking } from './hooks/use-can-create-booking';
import { bookingsApi } from './api';
import type { CreateBookingInput, VehicleListItem } from './api';
import {
  PICKUP_METHOD,
  STAFF_BOOKING_NOTE_MAX,
  staffBookingSchema,
  type StaffBookingValues,
} from './staff-booking-schema';

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
 * Lập đơn tay chỉ dành cho gian hàng TUYẾN GÓI (`useCanCreateBooking`) — chặn thật là
 * `@SubscriptionTrackOnly()` ở `POST /bookings`.
 */
export function CreateBookingScreen() {
  const t = useTranslations('BookingRequests.staffFlow');
  const tCreate = useTranslations('Bookings.create');
  const tErrors = useTranslations('Errors');
  const router = useRouter();
  const permissions = usePermissions();
  const me = useCurrentUser();
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

  /*
   * Cổng có HAI trục (`useCanCreateBooking`): quyền và TUYẾN. Tuyến đọc từ `/auth/me` — chưa về thì
   * tuyến tính ra "không xác định" và chủ xe tuyến hoa hồng sẽ thoáng thấy luồng trước khi bị chặn.
   * Chờ cả hai rồi mới quyết.
   */
  if (permissions.isLoading || me.isPending) {
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
    /*
     * Nói ĐÚNG lý do: thiếu quyền `bookings.create` là chuyện phân quyền trong gian hàng; còn đủ quyền
     * mà bị chặn là chuyện TUYẾN (chủ xe tuyến hoa hồng) — câu `Errors.appCode.SUBSCRIPTION_TRACK_ONLY`
     * là bản dành cho app (không nhắc mua gói — app Partner đi IAP).
     */
    const message = permissions.has(PERMISSION.BOOKING_CREATE)
      ? tErrors('appCode.SUBSCRIPTION_TRACK_ONLY')
      : tCreate('permissionDenied');
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
type PickedVehicle = Pick<VehicleListItem, 'id' | 'name'> & { imageUrl?: string | null };

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
  const [picking, setPicking] = useState(false);
  /** Đếm lượt chọn xe — khoá của biểu mẫu chuyến, để chọn lại (kể cả CÙNG xe) cũng là form mới. */
  const [pickCount, setPickCount] = useState(0);

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
      <>
        <AppHeader title={t('pickVehicleTitle')} onBack={onBack} />
        <Screen edges={['left', 'right', 'bottom']}>
          <Button
            label={t('pickVehicleTitle')}
            icon="car-outline"
            onPress={() => setPicking(true)}
          />
        </Screen>

        <VehiclePickerSheet
          open={picking}
          onClose={() => setPicking(false)}
          selectedId={vehicle?.id ?? null}
          initialBranchId={hintedBranchId}
          onSelect={(picked) => {
            setVehicle({ id: picked.id, name: picked.name, imageUrl: picked.mainImageUrl ?? null });
            setPickCount((n) => n + 1);
            setPicking(false);
            setChoosing(false);
          }}
        />
      </>
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
      prefill={prefill}
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
  const [created, setCreated] = useState<{ id: string; code: string } | null>(null);
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

  const schema = useMemo(() => staffBookingSchema(t), [t]);
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
   * Cọc thu trực tiếp — điền sẵn từ chính sách thuê của xe MỖI KHI báo giá đổi, trừ khi nhân viên
   * đã tự sửa ô (dirty): con số thoả thuận với khách thắng mức mặc định của xe.
   */
  useEffect(() => {
    if (!quote) return;
    if (formState.dirtyFields.depositAmount) return;
    // TODO(ADR 0007): tiền phải đi dạng CHUỖI — `MoneyField`/schema dùng chung đang nhận `number`, nên
    // còn `Number()` ở đây (web cũng vậy). Người dùng chốt 27/10: ghi nợ kỹ thuật, sửa khi đổi MoneyField.
    setValue('depositAmount', Number(quote.depositAmount ?? 0));
  }, [quote, formState.dirtyFields.depositAmount, setValue]);

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
        // Tiền từ báo giá server (đã gồm giá riêng theo ngày); giảm giá là dòng âm → tách dương.
        baseAmount: quote
          ? (rowAmount(quote, PRICE_ROW.BASE) ?? quote.totalAmount)
          : String(v.manualBaseAmount ?? 0),
        discountAmount: discountRow ? discountRow.replace('-', '') : '0',
        // Giao tận nơi phí 0 lúc tạo — chủ xe chốt phí đã thoả thuận sau.
        deliveryFee: '0',
        depositAmount: String(v.depositAmount ?? 0),
        ...(note ? { note } : {}),
      } satisfies CreateBookingInput,
      {
        onSuccess: (booking) => {
          setCreated({ id: booking.id, code: booking.code });
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
        listing={listing}
        vehicleName={vehicleName}
        vehicleImageUrl={vehicleThumbUrl}
        trip={tripSummary}
        totalAmount={quote?.totalAmount ?? null}
        onClose={onBack}
        onOpenBooking={() => router.replace(ROUTES.manage.bookingDetail(created.id))}
      />
    );
  }

  // --- Màn Xem lại — web `StaffBookingReviewStep` ở breakpoint điện thoại (≤640px): một cột ------
  if (step === STEP.REVIEW) {
    return (
      <>
        <AppHeader title={t('title')} onBack={backToTrip} />
        <Screen edges={['left', 'right', 'bottom']} hideFooterWhileTyping>
          {/* `.review` — các khối cách `space-lg`. */}
          <YStack gap={space.lg}>
            {/* `.head` — tiêu đề + lời dẫn (khe 2), rồi thanh tiến trình; khe `space-md`. */}
            <YStack gap={space.md}>
              <YStack gap={2}>
                {/* `.title` — h2 · semibold · `color-text`. */}
                <Text col={colors.text} fos={fontSize.h2} fow={fontWeight.semibold} accessibilityRole="header">
                  {t('review.title')}
                </Text>
                {/* `.lead` — body-lg · `text-tertiary`. */}
                <Text col={colors.placeholder} fos={fontSize.bodyLg}>
                  {t('review.description')}
                </Text>
              </YStack>
              <BookingJourney audience="staff" current="review" />
            </YStack>

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
            <Card>
              <YStack gap={space.md}>
                <YStack gap={space.xs}>
                  {/* `.cardTitle` — body-lg · semibold. */}
                  <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.semibold} accessibilityRole="header">
                    {t('review.customer.title')}
                  </Text>
                  {/* `.cardLead` — body · `text-tertiary`. */}
                  <Text col={colors.placeholder} fos={fontSize.body}>
                    {t('review.customer.description')}
                  </Text>
                </YStack>
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
                {/* `TextAreaField` 2 dòng, đếm ký tự tới `STAFF_BOOKING_NOTE_MAX`. */}
                <TextField
                  control={control}
                  name="note"
                  label={t('review.customer.noteLabel')}
                  placeholder={t('review.customer.notePlaceholder')}
                  multiline
                  rows={2}
                  maxLength={STAFF_BOOKING_NOTE_MAX}
                />
              </YStack>
            </Card>

            {/* Bảng tiền là MỘT thẻ tự có tiêu đề (`PriceBreakdown`) — không bọc thêm thẻ thứ hai. */}
            {quoteQuery.isLoading ? (
              <Card>
                <Skeleton height={140} />
              </Card>
            ) : quote ? (
              <PriceBreakdown
                rows={quote.rows}
                totalAmount={quote.totalAmount}
                totalLabel={quote.estimateNote ? t('trip.barEstimate') : t('trip.barTotal')}
                title={t('review.costs.title')}
                footer={
                  <Text col={colors.textMuted} fos={fontSize.label}>
                    {/* Web `<strong>` — đậm, KẾ THỪA màu chú thích (không tô màu riêng ở màn này). */}
                    {quote.longTerm?.durationDiscountPercent ? (
                      <Text fow={fontWeight.semibold}>
                        {tFlow('price.savings', {
                          amount: fmt.money(quote.longTerm.durationDiscountAmount),
                          months: quote.longTerm.packageMonths,
                        })}{' '}
                      </Text>
                    ) : null}
                    {quote.estimateNote ? `${quote.estimateNote}. ` : ''}
                    {t('review.costs.systemNote')}
                  </Text>
                }
              />
            ) : quoteUnavailable ? (
              <Card>
                <YStack gap={space.md}>
                  <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.semibold} accessibilityRole="header">
                    {t('review.costs.title')}
                  </Text>
                  {/* Web `<Alert type="warning" showIcon>` → `Callout` (viền + nền cùng tông). */}
                  <Callout tone="warning" title={t('review.costs.noPrice')} />
                  {/* Web `NumberField money` — ô tiền dùng chung (viền `border-input`, bo `radius-control`). */}
                  <MoneyField
                    control={control}
                    name="manualBaseAmount"
                    label={t('review.costs.baseAmount')}
                    required
                  />
                </YStack>
              </Card>
            ) : null}

            {/*
              Cọc gian hàng thu trực tiếp — điền sẵn từ chính sách thuê của xe, sửa theo thoả thuận.
              Thẻ riêng (`.card`), không nằm trong bảng tiền thuê: nó không thuộc tổng, khách nhận lại
              lúc trả xe. Chú thích dưới ô là `help` của web.
            */}
            <Card>
              <MoneyField
                control={control}
                name="depositAmount"
                label={t('review.costs.deposit')}
                hint={t('review.costs.depositHint')}
              />
            </Card>

            {/* `.card.submitCard` — lỗi · nút gradient full · gợi ý body-sm `text-tertiary` căn giữa. */}
            <Card>
              <YStack gap={space.md}>
                {/* Web `<Alert type="error" showIcon role="alert">`. */}
                {stepError ? <Callout tone="danger" title={stepError} /> : null}
                <Button
                  variant="gradient"
                  label={t('review.submit.cta')}
                  size="lg"
                  loading={submitting}
                  onPress={() => void submitBooking()}
                />
                <Text col={colors.placeholder} fos={fontSize.bodySm} ta="center">
                  {t('review.submit.hint')}
                </Text>
              </YStack>
            </Card>

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

  const footer = (
    <YStack gap={space.sm}>
      <XStack ai="center" jc="space-between" gap={space.sm}>
        <Text f={1} col={colors.textMuted} fos={fontSize.bodySm}>
          {barLabel}
        </Text>
        {quote && hasPriceSelection ? (
          <Text col={colors.price} fos={fontSize.h4} fow={fontWeight.bold}>
            {fmt.money(quote.totalAmount)}
          </Text>
        ) : null}
      </XStack>
      <XStack gap={space.sm}>
        <YStack f={1}>
          <Button label={tFlow('actions.cancel')} variant="secondary" onPress={onBack} />
        </YStack>
        <YStack f={1}>
          <Button
            label={checkConflict.isPending ? tFlow('actions.checking') : tFlow('actions.continue')}
            loading={checkConflict.isPending}
            onPress={() => void continueFromTrip()}
          />
        </YStack>
      </XStack>
    </YStack>
  );

  return (
    <>
      <AppHeader title={t('title')} onBack={onBack} />
      <Screen edges={['left', 'right', 'bottom']} hideFooterWhileTyping footer={footer}>
        <YStack gap={layout.section}>
          {/* "Chọn xe khác" — chỉ ở lối vào chưa biết xe (web `onChangeVehicle`): về bước chọn xe, form MỚI. */}
          {onChangeVehicle ? (
            <XStack>
              <Button
                label={t('changeVehicle')}
                icon="arrow-back"
                variant="ghost"
                size="sm"
                block={false}
                onPress={onChangeVehicle}
              />
            </XStack>
          ) : null}

          {listing ? (
            <VehicleSummaryCard
              listing={listing}
              serviceType={serviceType}
              packageMonths={packageMonths}
              showShop={false}
            />
          ) : (
            <VehicleFallbackCard name={vehicleName} imageUrl={vehicleThumbUrl} />
          )}

          <BookingJourney audience="staff" current="trip" />

          {/* Xe phục vụ nhiều dịch vụ → nhân viên chọn dịch vụ cho ĐƠN này. */}
          {vehicleServices.length > 1 ? (
            <FormSection title={tFlow('service.label')} icon="car-sport-outline" boxed={false}>
              <ServiceSelector
                services={vehicleServices}
                active={serviceType}
                onChange={(next) => {
                  setServiceType(next as ServiceType);
                  setStepError(null);
                }}
              />
            </FormSection>
          ) : null}

          {isWithDriver ? (
            <FormSection title={tFlow('service.routeLabel')} icon="navigate-outline">
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
              <Text col={colors.textMuted} fos={fontSize.label}>
                {routeDescription(tFlow, watchedRoute)}
              </Text>
            </FormSection>
          ) : null}

          {/*
            Đơn THUÊ DÀI HẠN có độ dài cố định bằng gói (ADR 0011): nhân viên chọn gói + giờ nhận,
            ngày trả hiện chỉ-đọc. Không có ô chọn khoảng tự do.
          */}
          {isLongTerm ? (
            <>
              <FormSection title={t('trip.packageLabel')} icon="calendar-outline">
                <XStack
                  gap={space.xs}
                  flexWrap="wrap"
                  accessibilityRole="radiogroup"
                  accessibilityLabel={t('trip.packageGroupLabel')}
                >
                  {LONG_TERM_PACKAGE_MONTHS.map((months) => (
                    <Chip
                      key={months}
                      label={fmt.packageLabel(months) ?? String(months)}
                      selected={packageMonths === months}
                      size="sm"
                      onPress={() => {
                        setPackageMonths(months);
                        setStepError(null);
                      }}
                    />
                  ))}
                </XStack>
                {packageMonths == null ? (
                  <Text col={colors.textMuted} fos={fontSize.label}>
                    {t('trip.packageHint')}
                  </Text>
                ) : null}
              </FormSection>

              <FormSection title={t('trip.pickupTimeLabel')} icon="time-outline">
                <FieldBox
                  label={t('trip.pickupTimeField')}
                  icon="calendar-outline"
                  value={watchedPickup ? fmt.dateTime(appWallClockToIso(watchedPickup)) : ''}
                  placeholder={t('trip.pickupTimeField')}
                  hint={
                    derivedReturnAt
                      ? t('trip.returnDerived', {
                          date: fmt.dateTime(appWallClockToIso(derivedReturnAt)),
                        })
                      : t('trip.returnPending')
                  }
                  required
                  {...(rangeError ? { error: rangeError } : {})}
                  onPress={() => setPickingPickup(true)}
                />
              </FormSection>
            </>
          ) : (
            <FormSection title={tFlow('time.label')} icon="calendar-outline">
              <RangeFieldBox
                label={tFlow('time.fieldLabel')}
                startValue={watchedPickup ? fmt.rentalPoint(watchedPickup) : ''}
                endValue={watchedReturn ? fmt.rentalPoint(watchedReturn) : ''}
                {...(watchedPickup && watchedReturn && hasRange
                  ? { durationText: fmt.rentalDuration(watchedPickup, watchedReturn) }
                  : {})}
                hint={
                  hasRange
                    ? `${rentalMode === RENTAL_MODE.HOURLY ? tFlow('time.modeHourly') : tFlow('time.modeDaily')} · ${tFlow('time.changeHint')}`
                    : tFlow('time.empty')
                }
                required
                {...(rangeError ? { error: rangeError } : {})}
                onPress={() => {
                  setRangeDraft({
                    pickupAt: watchedPickup ?? null,
                    returnAt: watchedReturn ?? null,
                  });
                  setScheduling(true);
                }}
              />
            </FormSection>
          )}

          {/* ── Có tài xế: xe ĐẾN ĐÓN — hỏi địa chỉ đón (+ điểm đến khi liên tỉnh) ─────────── */}
          {isWithDriver ? (
            <YStack gap={space.md}>
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
            </YStack>
          ) : (
            /* ── Hình thức nhận xe (tự lái / dài hạn) ─────────────────────────────────── */
            <FormSection title={tFlow('pickup.legend')} icon="location-outline" boxed={false}>
              <YStack gap={space.xs} accessibilityRole="radiogroup" accessibilityLabel={tFlow('pickup.groupLabel')}>
                <PickupOption
                  icon="car-outline"
                  title={tFlow('pickup.self')}
                  subtitle={pickupPointLine || t('trip.selfHint')}
                  selected={pickupMethod === PICKUP_METHOD.SELF}
                  onPress={() =>
                    setValue('pickupMethod', PICKUP_METHOD.SELF, { shouldValidate: true })
                  }
                />
                <PickupOption
                  icon="location-outline"
                  title={tFlow('pickup.delivery')}
                  subtitle={t('trip.deliveryHint')}
                  selected={pickupMethod === PICKUP_METHOD.DELIVERY}
                  onPress={() =>
                    setValue('pickupMethod', PICKUP_METHOD.DELIVERY, { shouldValidate: true })
                  }
                />
              </YStack>
            </FormSection>
          )}

          {isDelivery ? (
            <Card>
              <YStack gap={space.sm}>
                <TextField
                  control={control}
                  name="deliveryAddress"
                  label={t('trip.deliveryAddressLabel')}
                  placeholder={t('trip.deliveryAddressPlaceholder')}
                  required
                />
                <XStack ai="center" jc="space-between" gap={space.sm}>
                  <Text col={colors.text} fos={fontSize.bodySm}>
                    {t('trip.deliveryFeeLabel')}
                  </Text>
                  <Text col={colors.success} fos={fontSize.bodySm} fow={fontWeight.bold}>
                    {t('trip.deliveryFeeLater')}
                  </Text>
                </XStack>
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {t('trip.deliveryFeeNote')}
                </Text>
              </YStack>
            </Card>
          ) : null}

          {/* Web `<Alert type="warning" showIcon>` dưới biểu mẫu. */}
          {stepError ? <Callout tone="warning" title={stepError} /> : null}

          {/* Bảng chi tiết ở cuối thân bước — cuộn chung một mạch với phần nhập liệu phía trên. */}
          {hasPriceSelection ? (
            quoteQuery.isLoading ? (
              <Skeleton height={160} />
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
                {...(quote.estimateNote || quote.longTerm?.durationDiscountPercent
                  ? {
                      footer: (
                        <YStack gap={2}>
                          {quote.longTerm?.durationDiscountPercent ? (
                            /* Web `.savingsText` — `color-success`, không phải màu giảm giá. */
                            <Text col={colors.success} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                              {tFlow('price.savings', {
                                amount: fmt.money(quote.longTerm.durationDiscountAmount),
                                months: quote.longTerm.packageMonths,
                              })}
                            </Text>
                          ) : null}
                          {quote.estimateNote ? (
                            <Text col={colors.textMuted} fos={fontSize.label}>
                              {quote.estimateNote}.
                            </Text>
                          ) : null}
                        </YStack>
                      ),
                    }
                  : {})}
              />
            ) : quoteUnavailable ? (
              <Callout tone="info" title={t('trip.noPrice')} />
            ) : null
          ) : null}
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

/**
 * Hộp "Đã tạo đơn thuê" — CÙNG khuôn `BookingResult` với hộp "Đã gửi yêu cầu" của khách (web
 * `StaffBookingFlow` bước `done`): huy hiệu · tiêu đề · lời dẫn · ô mã đơn chép được, rồi thẻ chuyến
 * bố cục `receipt` kèm dòng tổng `BookingResultTotal`.
 */
function StaffBookingDone({
  code,
  listing,
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
  const t = useTranslations('BookingRequests.staffFlow');

  return (
    <>
      <AppHeader title={t('title')} onBack={onClose} />
      <Screen edges={['left', 'right', 'bottom']}>
        <BookingResult
          title={t('done.title')}
          lead={t('done.lead')}
          code={{ label: t('done.codeLabel'), value: code, copyLabel: t('done.copyCode') }}
          footer={
            /*
              Web `.footer` ≤640px là `column-reverse` (người dùng chốt 27/10: theo web điện thoại):
              nút CHÍNH gradient "Mở chi tiết đơn" lên trên cho ngón cái, "Đóng" (nút phụ, mũi tên
              trái) ở dưới; mỗi nút rộng hết hàng, khe `space-12`.
            */
            <YStack gap={toPx(XP_TOKENS['space-12'])}>
              <Button
                variant="gradient"
                label={t('done.openBooking')}
                size="lg"
                onPress={onOpenBooking}
              />
              <Button
                label={t('done.close')}
                icon="chevron-back"
                variant="secondary"
                size="lg"
                onPress={onClose}
              />
            </YStack>
          }
        >
          <BookingTripCardView
            listing={listing}
            vehicleName={vehicleName}
            vehicleImageUrl={vehicleImageUrl}
            trip={trip}
            showOwner={false}
            selfPickupFallback={t('review.selfPickupBranch')}
          >
            {totalAmount ? <BookingResultTotal label={t('done.total')} amount={totalAmount} /> : null}
          </BookingTripCardView>
        </BookingResult>
      </Screen>
    </>
  );
}

/**
 * Thẻ xe khi không có hồ sơ công khai — xe nội bộ (web `VehicleSummaryPanel` dùng `fallbackName`/
 * `fallbackImageUrl`). Bố cục `.compactMobile`: ảnh 112 × 84 (4/3) bo `border-radius`, khe
 * `space-12`, tên body-lg semibold. Đang tải hồ sơ thì VẪN hiện tên + ảnh — web cố ý không che chúng
 * bằng skeleton ("khách mất mốc mình đang đặt xe nào").
 */
function VehicleFallbackCard({ name, imageUrl }: { name: string; imageUrl: string | null }) {
  const colors = useColors();
  return (
    <Card>
      <XStack gap={toPx(XP_TOKENS['space-12'])} ai="center">
        <YStack w={112} h={84} br={radius.md} ov="hidden">
          <RemoteImage
            uri={imageUrl}
            radius={radius.md}
            fallback={<Ionicons name="car-outline" size={space.lg} color={colors.placeholder} />}
          />
        </YStack>
        <Text f={1} col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.semibold} numberOfLines={2}>
          {name}
        </Text>
      </XStack>
    </Card>
  );
}
