import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';
import { useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { ScreenLoading } from '@/components/state/ScreenLoading';
import { rememberedOrDefaultRentalRange } from '@/lib/rental-range-memory';
import { useQueryClient } from '@tanstack/react-query';
import {
  RENTAL_MODE,
  ADDRESS_LINE_MAX_LENGTH,
  isRouteType,
  LOCATION_SOURCE,
  PICKUP_PREFERENCE,
  ROUTE_TYPE,
  SERVICE_TYPE,
  serviceRequiresDriverLicence,
  type PublicListingDetail,
} from '@xeprime/types';
import { readDeliveryAddress, rememberDeliveryAddress } from '@/lib/delivery-address-memory';
import {
  appWallClockToIso,
  dayjs,
  DRIVER_LICENCE_TRIP_GATE,
  evaluateDriverLicenceForTrip,
  type RentalMode,
} from '@xeprime/domain';
import { driverLicenceApi } from '@/api/driver-licence/api';
import {
  useAccountPhonePrompt,
  useSuppressAccountPhoneReminder,
} from '@/features/auth/AccountPhoneGate';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { useCurrentAppPath } from '@/features/auth/auth-next';
import { deepLinkPended } from '@/features/shell/shell-scope.slice';
import { useAppDispatch } from '@/store/hooks';
import { clearBookingDraft, readBookingDraft, saveBookingDraft } from './booking-draft';
import { DriverLicenceVerifier } from '@/features/driver-licence/components/DriverLicenceVerifier';
import { useDriverLicence } from '@/features/driver-licence/hooks/use-driver-licence';
import { isUnauthenticated } from '@/lib/api-client';
import { queryKeys } from '@/queries/query-keys';
import { buildLicenceTrip } from './licence-trip';
import {
  buildBookingRequestSchema,
  DESTINATION_MAX,
  NOTE_MAX,
  CUSTOMER_NAME_MAX,
  type BookingRequestFormValues,
} from './booking-schema';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { ListingDetailSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { useListing } from '@/features/marketplace/hooks/use-marketplace-data';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useErrorMessage } from '@/i18n/use-error-message';
import { goBackOr } from '@/navigation/go-back-or';
import { logger } from '@/lib/logger';
import { ROUTES } from '@/navigation/routes';
import type { BookingRequestPrefillParams } from '@/navigation/routes-base';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { BookingPriceSummary } from './components/BookingPriceSummary';
import { NearPickupHoldNotice } from './components/NearPickupHoldNotice';
import { PromoCodeField } from '@/features/promo-codes/PromoCodeField';
import { usePromoCode } from '@/features/promo-codes/use-promo-code';
import { VehicleSummaryCard } from './components/VehicleSummaryCard';
import { RequestTripStep } from './components/RequestTripStep';
import { RequestReviewStep, type BookingReviewNextStep } from './components/RequestReviewStep';
import { BookingJourney } from './components/BookingJourney';
import { RequestResultStep } from './components/RequestResultStep';
import {
  isAwaitingHoldReceipt,
  isHoldLimitBlocked,
  REQUEST_STEP,
  useBookingRequestFlow,
  usePublicQuote,
  useQuoteWithPromo,
  useVehicleBusyDaysState,
  type RequestStep,
} from './hooks/use-booking-request-flow';
import { toQuoteParams } from './quote-params';
import { toRequestBody } from './request-body';
import { useUnpaidHolds } from '@/features/trips/hooks/use-trips';

/**
 * Hình dạng form của wizard, suy từ chính `useForm` thay vì viết tay `UseFormReturn<...>`:
 * react-hook-form có ba tham số generic và tham số thứ ba (giá trị sau transform) đổi theo
 * resolver, nên bản viết tay lệch với bản thật ngay khi schema có một `transform`.
 */
export type RequestForm = ReturnType<typeof useForm<BookingRequestFormValues>>;

/** Mốc giờ mang từ trang xe — liên kết sâu hỏng thì bỏ, không đưa một ngày sai vào form. */
function validInstant(raw: string | undefined): string {
  return raw && dayjs(raw).isValid() ? raw : '';
}

/** Cặp giờ mang từ trang xe — giờ trả phải SAU giờ nhận, không thì bỏ CẢ CẶP. */
function prefillRange(prefill: BookingRequestPrefillParams | undefined): {
  pickupAt: string;
  returnAt: string;
} {
  const pickupAt = validInstant(prefill?.pickupAt);
  const returnAt = validInstant(prefill?.returnAt);
  return pickupAt && returnAt && dayjs(returnAt).isAfter(dayjs(pickupAt))
    ? { pickupAt, returnAt }
    : { pickupAt: '', returnAt: '' };
}

/** Số tháng gói mang từ trang xe — chỉ nhận một gói chủ xe THẬT SỰ niêm yết. */
function prefilledPackageMonths(
  listing: PublicListingDetail,
  raw: string | undefined,
): number | null {
  const months = raw ? Number(raw) : NaN;
  return (listing.longTermPackages ?? []).some((pkg) => pkg.packageMonths === months)
    ? months
    : null;
}

/** Màn chờ "tự đi tiếp" tối đa bao lâu trước khi trả lại biểu mẫu (mạng treo). */
const PREPARE_TIMEOUT_MS = 15_000;

/**
 * Wizard gửi yêu cầu thuê (BKG-01) — `trip` → (`licence`) → `review` → `done`.
 *
 * Một MÀN riêng chứ không phải bottom sheet như các hộp thoại khác: bốn bước, một bàn phím và
 * một lịch tháng không sống được trong 90% chiều cao màn.
 *
 * **Không có ô liên hệ, không có OTP** (ADR 0060). Gửi yêu cầu cần TÀI KHOẢN KHÁCH đã đăng nhập
 * có SĐT đã xác minh; họ tên + SĐT người thuê đọc từ tài khoản ở server.
 *
 * **Chưa đăng nhập mà bấm "Tiếp tục"** ⇒ kiểm khung giờ trống như thường, GIỮ thứ khách vừa nhập
 * trong bộ nhớ (`booking-draft.ts`) và sang màn đăng nhập; đăng nhập xong app quay lại đúng màn
 * này, dựng lại bản nháp và tự đi tiếp (kiểm lại khung giờ → bằng lái → Xác nhận). KHÔNG bao giờ
 * tự gửi — khách tự bấm "Gửi yêu cầu thuê".
 */
export function RequestBookingScreen({
  vehicleId,
  initialServiceType,
  deliveryProvinceCode,
  prefill,
}: {
  vehicleId: string;
  initialServiceType?: string;
  /** Chuyến đã cấu hình ở trang xe (web #205 `prefill`) — chỉ dùng khi KHÔNG có bản nháp. */
  prefill?: BookingRequestPrefillParams;
  /**
   * Tỉnh GỢI Ý cho ô địa chỉ giao xe — tỉnh khách đang lọc, hoặc tỉnh của chính chiếc xe.
   * Native không có URL để mang ngữ cảnh nên nó đi qua tham số điều hướng (ADR 0035).
   */
  deliveryProvinceCode?: string;
}) {
  const t = useTranslations('BookingRequests.flow');
  const router = useRouter();
  const listing = useListing(vehicleId);

  if (listing.isPending) {
    return (
      <>
        <AppHeader title={t('title')} onBack={() => goBackOr(router, ROUTES.explore.home())} />
        <Screen edges={['left', 'right', 'bottom']}>
          <ListingDetailSkeleton />
        </Screen>
      </>
    );
  }

  if (listing.isError) {
    return (
      <>
        <AppHeader title={t('title')} onBack={() => goBackOr(router, ROUTES.explore.home())} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenError error={listing.error} onRetry={() => void listing.refetch()} />
        </Screen>
      </>
    );
  }

  return (
    <RequestBookingBody
      listing={listing.data}
      {...(initialServiceType ? { initialServiceType } : {})}
      {...(deliveryProvinceCode ? { deliveryProvinceCode } : {})}
      {...(prefill ? { prefill } : {})}
    />
  );
}

function RequestBookingBody({
  listing,
  initialServiceType,
  deliveryProvinceCode,
  prefill,
}: {
  listing: PublicListingDetail;
  prefill?: BookingRequestPrefillParams;
  initialServiceType?: string;
  deliveryProvinceCode?: string;
}) {
  const colors = useColors();
  const t = useTranslations('BookingRequests.flow');
  const tFormErrors = useTranslations('BookingRequests.form.errors');
  const tCommon = useTranslations('Common.actions');
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const toast = useAppToast();

  const flow = useBookingRequestFlow(listing.id);
  const { state, setStep: setStepRaw, setDuplicate, setBlocked, setError } = flow;
  const dispatch = useAppDispatch();
  const currentPath = useCurrentAppPath();

  /** Bản nháp đang chờ đăng nhập của CHÍNH xe này (ADR 0060) — đọc một lần lúc dựng màn. */
  const [restoredDraft] = useState(() => readBookingDraft(listing.id));
  /** Đang chờ khách đăng nhập để đi tiếp từ bản nháp. */
  const [awaitingAuth, setAwaitingAuth] = useState(restoredDraft !== null);
  /**
   * Mốc mời đăng nhập (ms). Chỉ một `/auth/me` NẠP SAU mốc này mới tính là "đã có phiên" — cache
   * còn giữ người dùng CŨ sau một lượt 401 thì không được coi là vừa đăng nhập (như web).
   */
  const [signInRequestedAt, setSignInRequestedAt] = useState(() => restoredDraft?.savedAt ?? 0);

  /*
   * Trạng thái mở của khối tiền do LUỒNG giữ, không phải component: hai hình thái nằm ở hai
   * nhánh cây khác nhau (dòng tổng dính đáy vs bảng cuối thân bước), và nút mở ở hình thái này
   * còn nội dung mở ra ở hình thái kia.
   */
  const [priceExpanded, setPriceExpanded] = useState(false);

  /**
   * Đổi bước — MỘT cửa duy nhất, vì rời bước là THU khối tiền lại (bước Xác nhận đã có bảng giá
   * đầy đủ của riêng nó, mở cả hai là in một báo giá hai lần).
   *
   * Đặt ở đây thay vì `useEffect` theo dõi `step`: hiệu ứng chỉ chạy SAU khi bước mới đã render
   * một lần với giá trị cũ, và nó đè luôn lựa chọn khách vừa bấm.
   */
  const setStep = useCallback(
    (next: RequestStep) => {
      setStepRaw(next);
      setPriceExpanded(false);
    },
    [setStepRaw],
  );

  const services: readonly string[] = listing.serviceTypes ?? [];
  const defaultService =
    initialServiceType && services.includes(initialServiceType)
      ? initialServiceType
      : services.includes(SERVICE_TYPE.SELF_DRIVE)
        ? SERVICE_TYPE.SELF_DRIVE
        : (services[0] ?? SERVICE_TYPE.SELF_DRIVE);

  /*
   * Dựng lại schema khi ngôn ngữ đổi — `t` đổi định danh theo locale. Dựng mỗi lần render thì
   * `yupResolver` nhận một object mới mỗi nhịp và RHF phải xác thực lại toàn form sau
   * từng phím gõ.
   */
  const schema = useMemo(
    () =>
      buildBookingRequestSchema({
        /*
         * Câu lỗi theo đúng `BookingRequests.form.errors.*` mà `requestFormSchema` bên web dùng.
         * Chỉ những ô web KHÔNG có câu riêng mới còn đọc `flow.validation.*` (độ dài họ tên —
         * web để yup tự sinh câu tiếng Anh; loại dịch vụ, lộ trình, nguyện vọng — web chọn sẵn
         * mặc định nên không bao giờ báo thiếu).
         */
        serviceRequired: t('validation.serviceRequired'),
        pickupAtRequired: tFormErrors('pickupAt'),
        returnAtRequired: tFormErrors('returnAt'),
        returnAfterPickup: tFormErrors('returnAfterPickup'),
        packageRequired: tFormErrors('longTermPackage'),
        pickupPreferenceRequired: t('validation.pickupPreferenceRequired'),
        requestedPickupDateRequired: tFormErrors('requestedPickupDate'),
        routeRequired: t('validation.routeRequired'),
        pickupAddressRequired: tFormErrors('pickupAddressLine'),
        destinationRequired: tFormErrors('destination'),
        deliveryAddressRequired: tFormErrors('deliveryAddressLine'),
        addressLineMax: tFormErrors('addressLineMax', { max: ADDRESS_LINE_MAX_LENGTH }),
        destinationMax: tFormErrors('destinationMax', { max: DESTINATION_MAX }),
        noteTooLong: t('validation.noteTooLong', { max: NOTE_MAX }),
        customerNameRequired: tFormErrors('customerName'),
        customerNameMax: tFormErrors('customerNameMax', { max: CUSTOMER_NAME_MAX }),
        customerPhoneRequired: tFormErrors('customerPhone'),
        customerPhoneFormat: tFormErrors('customerPhoneFormat'),
      }),
    [t, tFormErrors],
  );

  const form = useForm<BookingRequestFormValues>({
    resolver: yupResolver(schema),
    mode: 'onTouched',
    defaultValues: restoredDraft?.values ?? {
      acceptedTerms: false,
      vehicleProtectionSelected: prefill?.vehicleProtection === '1',
      personalAccidentSelected: prefill?.personalAccident === '1',
      serviceType: defaultService as BookingRequestFormValues['serviceType'],
      pickupAt: prefillRange(prefill).pickupAt,
      returnAt: prefillRange(prefill).returnAt,
      longTermPackageMonths: prefilledPackageMonths(listing, prefill?.packageMonths),
      // Web chọn sẵn "trong 7 ngày" và "nội thành" (`requestFormSchema` `.default(...)`).
      pickupPreference:
        prefill?.pickupPreference === PICKUP_PREFERENCE.SPECIFIC_DATE
          ? PICKUP_PREFERENCE.SPECIFIC_DATE
          : PICKUP_PREFERENCE.WITHIN_7_DAYS,
      requestedPickupDate: '',
      routeType: isRouteType(prefill?.routeType) ? prefill.routeType : ROUTE_TYPE.IN_CITY,
      pickupProvinceCode: '',
      pickupWardCode: '',
      pickupAddressLine: '',
      pickupPlaceId: null,
      pickupLatitude: null,
      pickupLongitude: null,
      pickupLocationSource: null,
      destination: '',
      // Chuyến có tài xế thì tài xế đón — cờ giao xe chỉ có nghĩa với dịch vụ còn lại.
      deliveryRequested: prefill?.delivery === '1' && defaultService !== SERVICE_TYPE.WITH_DRIVER,
      deliveryProvinceCode: '',
      deliveryWardCode: '',
      deliveryAddressLine: '',
      deliveryPlaceId: null,
      deliveryLatitude: null,
      deliveryLongitude: null,
      deliveryLocationSource: null,
      note: '',
      customerName: '',
      customerPhone: '',
    },
  });

  /**
   * Điền sẵn ĐỊA CHỈ GIAO XE — chạy MỘT LẦN sau khi mount, cùng thứ tự ưu tiên với
   * `RequestBookingFlow` của web.
   *
   * Mỗi bậc là một loại bằng chứng khác nhau về ý định của khách:
   *   1. **Địa chỉ lần trước** (`delivery-address-memory`) — chính họ đã gõ và xác nhận ghim.
   *      Điền cả cụm, kể cả toạ độ, để họ không phải ghim lại chỗ cũ.
   *   2. **Tỉnh đang lọc / tỉnh của xe** (`deliveryProvinceCode` từ ngữ cảnh điều hướng) — chỉ
   *      điền được mã tỉnh.
   *
   * `shouldDirty: false`: đây là GỢI Ý, không phải thao tác của người dùng. Đánh dấu form bẩn ở
   * đây sẽ làm cảnh báo "còn thay đổi chưa lưu" bật lên khi khách mới chỉ mở màn.
   *
   * Đọc là bất đồng bộ (`expo-secure-store`), nên có chốt `alive`: khách thoát màn trước khi
   * Keystore trả lời thì không còn form nào để điền.
   */
  const deliveryPrefilled = useRef(false);
  useEffect(() => {
    if (deliveryPrefilled.current) return;
    deliveryPrefilled.current = true;
    // Dựng lại từ bản nháp ⇒ địa chỉ khách đã nhập thắng mọi gợi ý.
    if (restoredDraft) return;
    /*
     * Địa chỉ khách vừa xác nhận ở thẻ đặt xe (`prefill.delivery` web) thắng bộ nhớ — chỉ khi khách
     * chọn giao tận nơi. Ghim chỉ nhận khi đủ cả hai toạ độ.
     */
    const prefillLine = prefill?.delivery === '1' ? prefill.deliveryAddressLine?.trim() : '';
    if (prefillLine) {
      const quiet = { shouldDirty: false } as const;
      const lat = Number(prefill?.deliveryLat);
      const lng = Number(prefill?.deliveryLng);
      const pinned =
        Boolean(prefill?.deliveryLat && prefill?.deliveryLng) &&
        Number.isFinite(lat) &&
        Number.isFinite(lng);
      form.setValue('deliveryProvinceCode', deliveryProvinceCode ?? '', quiet);
      form.setValue('deliveryAddressLine', prefillLine, quiet);
      form.setValue('deliveryPlaceId', prefill?.deliveryPlaceId ?? null, quiet);
      form.setValue('deliveryLatitude', pinned ? lat : null, quiet);
      form.setValue('deliveryLongitude', pinned ? lng : null, quiet);
      form.setValue(
        'deliveryLocationSource',
        pinned ? LOCATION_SOURCE.GOOGLE_PLACE : LOCATION_SOURCE.MANUAL,
        quiet,
      );
      return;
    }

    let alive = true;
    void readDeliveryAddress().then((remembered) => {
      if (!alive) return;
      const quiet = { shouldDirty: false } as const;

      if (remembered) {
        form.setValue('deliveryProvinceCode', remembered.provinceCode, quiet);
        form.setValue('deliveryWardCode', remembered.wardCode, quiet);
        form.setValue('deliveryAddressLine', remembered.addressLine, quiet);
        form.setValue('deliveryPlaceId', remembered.placeId, quiet);
        form.setValue('deliveryLatitude', remembered.latitude, quiet);
        form.setValue('deliveryLongitude', remembered.longitude, quiet);
        form.setValue('deliveryLocationSource', remembered.locationSource, quiet);
        return;
      }
      if (deliveryProvinceCode && !form.getValues('deliveryProvinceCode')) {
        form.setValue('deliveryProvinceCode', deliveryProvinceCode, quiet);
      }
    });
    return () => {
      alive = false;
    };
    // Chạy một lần cho vòng đời của màn; `form` ổn định theo RHF.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Tỉnh của CHIẾC XE điền sẵn vào cả hai ô địa chỉ khi chúng còn trống.
   *
   * Luồng khách không còn bộ chọn tỉnh nào (ADR 0042 điều 4), nên giá trị này là thứ duy nhất
   * giữ cho yêu cầu có mã tỉnh khi bản đồ không quy ra được — và mã tỉnh là thứ mọi thống kê
   * theo khu vực đọc. Lấy từ HỒ SƠ XE trước, rồi mới tới tỉnh mang sang từ bộ lọc: bộ lọc là
   * nơi khách vừa đi qua, còn hồ sơ xe là nơi chiếc xe thật sự đang đỗ.
   *
   * `shouldDirty: false` và chỉ điền ô TRỐNG: đây là gợi ý, và bộ nhớ địa chỉ giao xe ở effect
   * trên có quyền cao hơn.
   */
  const vehicleProvinceCode = listing?.provinceCode ?? deliveryProvinceCode ?? null;
  useEffect(() => {
    if (!vehicleProvinceCode) return;
    for (const name of ['deliveryProvinceCode', 'pickupProvinceCode'] as const) {
      if (!form.getValues(name)) form.setValue(name, vehicleProvinceCode, { shouldDirty: false });
    }
  }, [form, vehicleProvinceCode]);

  const [rentalMode, setRentalMode] = useState<RentalMode>(restoredDraft?.rentalMode ?? RENTAL_MODE.DAILY);
  /*
   * Như `seededRange` web: không bản nháp, không có cặp giờ từ trang xe và không phải dài hạn ⇒
   * điền khoảng thuê (kèm CHẾ ĐỘ ngày/giờ) từ bộ nhớ khoảng thuê. Có cặp giờ từ trang xe thì chế
   * độ là "theo ngày" — web không mang chế độ sang luồng.
   */
  useEffect(() => {
    if (restoredDraft) return;
    if (prefillRange(prefill).pickupAt) return;
    if (defaultService === SERVICE_TYPE.LONG_TERM) return;
    let alive = true;
    void rememberedOrDefaultRentalRange().then((range) => {
      if (!alive) return;
      const quiet = { shouldDirty: false } as const;
      if (!form.getValues('pickupAt') && range.pickupAt && range.returnAt) {
        form.setValue('pickupAt', appWallClockToIso(range.pickupAt), quiet);
        form.setValue('returnAt', appWallClockToIso(range.returnAt), quiet);
      }
      setRentalMode(range.mode);
    });
    return () => {
      alive = false;
    };
    // Một lần khi mở luồng.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /*
   * `useWatch` chứ không phải `form.watch()`: bản kia trả về một HÀM mà React Compiler không
   * memo hoá an toàn được, nên nó bỏ tối ưu cho cả component. Cùng dữ liệu, không mất gì.
   */
  const serviceType = useWatch({ control: form.control, name: 'serviceType' });
  const isLongTerm = serviceType === SERVICE_TYPE.LONG_TERM;

  /**
   * Điều khoản chủ xe công bố cho ĐÚNG dịch vụ đang chọn — cùng phép chọn với web
   * `RequestBookingFlow`. Server đã tính giấy tờ hiệu lực và cờ bắt đồng ý; client chỉ hiển thị
   * và bắt tick khi được yêu cầu.
   */
  const activeTerms = listing.rentalTerms?.find((term) => term.serviceType === serviceType) ?? null;
  const requiresTermsAcceptance = Boolean(activeTerms?.requireTermsAcceptance);
  /**
   * Ô đồng ý của màn Xem lại có phủ ĐIỀU KHOẢN CỦA CHỦ XE không — chủ xe CÓ điều khoản (công bố,
   * hoặc bắt buộc đồng ý). Không có thì ô chỉ là lời đồng ý văn bản của XePrime, và lượt gửi KHÔNG
   * mang `acceptedTerms` (server đóng băng nó cùng nội dung điều khoản của chủ xe).
   */
  const agreementCoversHostTerms = Boolean(activeTerms?.termsText) || requiresTermsAcceptance;
  /** Khách bấm gửi khi chưa tick — câu lỗi nằm ngay dưới ô, tắt khi khách tick. */
  const [agreementMissing, setAgreementMissing] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);
  const consentRef = useRef<View>(null);
  /** Cuộn ô ĐỒNG Ý vào giữa tầm nhìn — bấm Gửi mà chưa tick thì khách thấy NGAY lỗi ở đâu. */
  const revealConsent = useCallback(() => {
    const inner = scrollRef.current?.getNativeScrollRef();
    if (!inner || !consentRef.current) return;
    try {
      consentRef.current.measureLayout(inner, (_x, y) =>
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 120), animated: true }),
      );
    } catch {
      // Đo hụt (đang chuyển bước) ⇒ thôi cuộn; dòng lỗi đỏ vẫn hiện.
    }
  }, []);
  const watchedAccepted = useWatch({ control: form.control, name: 'acceptedTerms' });

  /*
   * Lịch bận chỉ có nghĩa với dịch vụ theo NGÀY. Dài hạn chưa có khung giờ cụ thể — khách nêu
   * nguyện vọng, gian hàng chốt lịch khi duyệt (ADR 0011) — nên không tải lịch cho nó.
   */
  const { busyDays, busyLoading } = useVehicleBusyDaysState(listing.id, !isLongTerm);

  /*
   * Báo giá SERVER cho lựa chọn hiện tại — khối tiền đọc chung nó ở cả hai hình thái, nên chỉ
   * có MỘT lần gọi và không bao giờ hai chỗ nói hai con số.
   */
  const packageMonths = useWatch({ control: form.control, name: 'longTermPackageMonths' });
  const routeType = useWatch({ control: form.control, name: 'routeType' });
  const deliveryRequested = useWatch({ control: form.control, name: 'deliveryRequested' });
  const pickupAt = useWatch({ control: form.control, name: 'pickupAt' });
  const returnAt = useWatch({ control: form.control, name: 'returnAt' });
  const vehicleProtectionSelected = useWatch({
    control: form.control,
    name: 'vehicleProtectionSelected',
  });
  const personalAccidentSelected = useWatch({
    control: form.control,
    name: 'personalAccidentSelected',
  });

  const quoteParams = toQuoteParams({
    serviceType,
    longTermPackageMonths: packageMonths,
    pickupAt,
    returnAt,
    routeType,
    vehicleProtectionSelected,
    personalAccidentSelected,
  });
  const quote = usePublicQuote(listing.id, quoteParams);

  /*
   * MÃ KHUYẾN MÃI — ADR 0046.
   *
   * Tham số chuyến dựng từ CHÍNH `quoteParams` mà báo giá dùng: hai bên phải nói về đúng một
   * chuyến, nếu không số giảm được tính trên một báo giá khác với báo giá đang hiện trên màn hình.
   * `null` khi chưa chọn đủ ⇒ ô áp mã tự ẩn.
   */
  const promoTrip = quoteParams ? { vehicleId: listing.id, ...quoteParams } : null;
  const promo = usePromoCode(promoTrip);
  /*
   * Chuyến KHÔNG thu trước thì không có dòng tiền nào để tài trợ vào (báo giá tạm tính, dài hạn
   * chưa chốt lịch — ADR 0046 điều 2). Đọc `holdAmount` của SERVER, không tự suy theo dịch vụ.
   */
  const promoUnavailable = quote.data != null && quote.data.breakdown.fees?.holdAmount == null;

  /**
   * Báo giá đã ÁP MÃ — cùng luật với bản web (`RequestBookingFlow`).
   *
   * Báo giá công khai không nhận mã, nên bảng phí có mã đến từ endpoint xem trước. Thay CẢ
   * `fees` chứ không ghép từng số: ghép tay là lỗi 24/09/2026 — dòng giảm hiện ra mà tổng và
   * tiền giữ chỗ vẫn nguyên giá vì chúng đọc từ một bảng phí khác.
   */
  const quoteWithPromo = useQuoteWithPromo(quote.data, promo.applied?.fees);

  const promoField = (
    <PromoCodeField
      trip={promoTrip}
      appliedCode={promo.appliedCode}
      applied={promo.applied}
      checking={promo.checking}
      reason={promo.reason}
      unavailable={promoUnavailable}
      droppedCode={promo.droppedCode}
      onApply={promo.apply}
      onRemove={promo.remove}
    />
  );

  const queryClient = useQueryClient();
  const meQuery = useCurrentUser();
  const me = meQuery.data;
  /*
   * Tài khoản chưa có SĐT đã xác minh (ADR 0071) đi hết các bước như mọi phiên khác và được hỏi
   * số ĐÚNG lúc bấm "Gửi yêu cầu"; trong lúc luồng này mở, lời nhắc chung của vỏ app không tự bật.
   */
  const promptAccountPhone = useAccountPhonePrompt();
  useSuppressAccountPhoneReminder();
  /** Khách vừa xác minh SĐT trong tấm hỏi lúc gửi — lượt gửi đi tiếp khi `/auth/me` mang số mới. */
  const [submitAfterPhone, setSubmitAfterPhone] = useState(false);
  /*
   * Liên hệ mặc định = của TÀI KHOẢN, điền khi `/auth/me` về — chỉ vào ô còn TRỐNG, để không đè lên
   * thứ khách đã sửa hay bản nháp vừa khôi phục. Cùng hành vi `RequestBookingFlow` web (#207).
   */
  useEffect(() => {
    if (!me) return;
    if (!form.getValues('customerName') && me.displayName) {
      form.setValue('customerName', me.displayName, { shouldValidate: false });
    }
    if (!form.getValues('customerPhone') && me.phone) {
      form.setValue('customerPhone', me.phone, { shouldValidate: false });
    }
  }, [me, form]);
  /*
   * Khách đang giữ những chuyến nào chưa trả — đọc NGAY khi mở luồng (web `useUnpaidHolds`). Đã
   * chạm trần thì server từ chối mọi yêu cầu mới (`HOLD_LIMIT_REACHED`), nên nói trước khi khách
   * mất công điền form. Trả xong thì lời nhắc làm mới và luồng tự mở lại.
   */
  const unpaidHolds = useUnpaidHolds(Boolean(me));
  /**
   * Server vừa từ chối lượt gửi vì đã chạm trần — nguồn DỰ PHÒNG khi chưa đọc được lời nhắc; có
   * dữ liệu thì tin `unpaidHolds`.
   */
  const [submitHitHoldLimit, setSubmitHitHoldLimit] = useState(false);

  /*
   * BẰNG LÁI — ADR 0057. Tự lái / dài hạn ⇒ khách phải có bằng hợp lệ cho CHÍNH chuyến này (đúng
   * hạng loại xe, còn hạn tới hết ngày cuối). Cùng phép dựng chuyến với web và với cổng ở server.
   */
  const pickupPreference = useWatch({ control: form.control, name: 'pickupPreference' });
  const requestedPickupDate = useWatch({ control: form.control, name: 'requestedPickupDate' });
  const needsLicence = serviceRequiresDriverLicence(serviceType);
  const licenceTrip = useMemo(
    () =>
      buildLicenceTrip({
        serviceType,
        vehicleType: listing.vehicleType,
        packageMonths,
        pickupPreference,
        requestedPickupDate,
        returnAt,
      }),
    [
      serviceType,
      listing.vehicleType,
      packageMonths,
      pickupPreference,
      requestedPickupDate,
      returnAt,
    ],
  );

  /** Đang đọc bằng lái để quyết định có cần bước bằng lái — giữ nút ở trạng thái chờ. */
  const [checkingLicence, setCheckingLicence] = useState(false);

  /**
   * Mời đăng nhập, GIỮ NGUYÊN thứ khách đã nhập (ADR 0060).
   *
   * Bản nháp chỉ ở bộ nhớ. Đích quay về cất vào ngăn "deep link đang chờ" — cùng ngăn mà
   * `RequireSession` dùng — nên đăng nhập/đăng ký xong `useEnterApp` đưa khách về lại đúng màn
   * này. `replace` chứ không `push`: lượt quay về dựng một màn mới, giữ màn cũ bên dưới là hai
   * bản của cùng một luồng trong ngăn xếp.
   */
  const requestSignIn = useCallback(() => {
    saveBookingDraft(listing.id, {
      values: form.getValues(),
      rentalMode,
      promoCode: promo.appliedCode,
    });
    setAwaitingAuth(true);
    setSignInRequestedAt(Date.now());
    dispatch(deepLinkPended(currentPath));
    router.replace(ROUTES.account.login());
  }, [currentPath, dispatch, form, listing.id, promo.appliedCode, rentalMode, router]);

  /**
   * Đã có phiên. Tự lái/dài hạn thì soát bằng lái cho CHÍNH chuyến này trước bước Xác nhận —
   * hợp lệ rồi thì khách không thấy bước bằng lái. Đọc MỚI từ server (khách có thể vừa nộp ở màn
   * Giấy tờ).
   */
  const continueToReview = useCallback(async () => {
    if (!needsLicence || !licenceTrip) {
      // Thiếu dữ liệu chuyến (`licenceTrip` null) thì không soát được ở đây — bỏ bước là AN TOÀN vì
      // cổng thật nằm ở server (`submitPublic`, ADR 0057): bằng lái sai hạng/hết hạn vẫn bị từ chối.
      setStep(REQUEST_STEP.REVIEW);
      return;
    }
    setCheckingLicence(true);
    try {
      const overview = await queryClient.fetchQuery({
        queryKey: queryKeys.driverLicence.overview,
        queryFn: () => driverLicenceApi.overview(),
        staleTime: 0,
      });
      const gate = evaluateDriverLicenceForTrip(overview, licenceTrip);
      setStep(gate === DRIVER_LICENCE_TRIP_GATE.OK ? REQUEST_STEP.REVIEW : REQUEST_STEP.LICENCE);
    } catch (error) {
      // Mất phiên: mời đăng nhập lại thay vì để khách bấm "Thử lại" vào một 401 mãi mãi.
      if (isUnauthenticated(error)) {
        requestSignIn();
        return;
      }
      // Lỗi khác: bộ xác thực tự hiện lỗi tải + nút Thử lại.
      setStep(REQUEST_STEP.LICENCE);
    } finally {
      setCheckingLicence(false);
    }
  }, [licenceTrip, needsLicence, queryClient, requestSignIn, setStep]);

  /** Bằng lái ở bước bằng lái — nút Tiếp tục chỉ mở khi bằng đã hợp lệ cho chuyến này. */
  const licenceQ = useDriverLicence({
    enabled:
      (state.step === REQUEST_STEP.LICENCE ||
        (state.step === REQUEST_STEP.REVIEW && needsLicence)) &&
      Boolean(me),
  });
  const licenceReady =
    licenceTrip !== null &&
    licenceQ.data !== undefined &&
    evaluateDriverLicenceForTrip(licenceQ.data, licenceTrip) === DRIVER_LICENCE_TRIP_GATE.OK;

  /*
   * Bằng vừa hợp lệ cho chuyến này (máy đọc xong ngay tại bước) ⇒ tự sang Xác nhận và báo ngắn,
   * như web — không bắt khách bấm "Tiếp tục" cho một bước đã xong.
   */
  const licenceFetching = licenceQ.isFetching;
  // Đổi bước NGAY TRONG render (mẫu "điều chỉnh state theo dữ liệu", như web); effect chỉ báo.
  const [licenceAdvances, setLicenceAdvances] = useState(0);
  if (state.step === REQUEST_STEP.LICENCE && licenceReady && !licenceFetching) {
    setStepRaw(REQUEST_STEP.REVIEW);
    // Như web: tự sang Xác nhận thì MỞ khối giá — khách cần thấy con số trước khi gửi.
    setPriceExpanded(true);
    setLicenceAdvances((n) => n + 1);
  }
  // Báo theo SỐ LẦN đã báo, không theo lần chạy effect: `toast` đổi danh tính mỗi lần provider
  // render, nên effect chạy lại mà `licenceAdvances` không đổi — thiếu ref là toast lặp.
  const licenceAdvancesAnnounced = useRef(0);
  useEffect(() => {
    if (licenceAdvances <= licenceAdvancesAnnounced.current) return;
    licenceAdvancesAnnounced.current = licenceAdvances;
    toast.showSuccess(t('licence.verified'));
  }, [licenceAdvances, t, toast]);

  /** Rời bước Chuyến đi: chưa đăng nhập ⇒ giữ bản nháp + mời đăng nhập; có phiên ⇒ đi tiếp. */
  const afterTripStep = useCallback(async () => {
    if (!me) {
      requestSignIn();
      return;
    }
    await continueToReview();
  }, [continueToReview, me, requestSignIn]);

  /** Một nút "Tiếp tục": kiểm dữ liệu → kiểm khung giờ còn trống → mời đăng nhập hoặc đi tiếp. */
  const continueFromTrip = useCallback(async () => {
    setError(null);

    const fields: Array<keyof BookingRequestFormValues> = isLongTerm
      ? ['longTermPackageMonths', 'pickupPreference', 'requestedPickupDate']
      : ['pickupAt', 'returnAt'];
    /*
     * Cặp TOẠ ĐỘ phải có mặt trong danh sách này, không chỉ phần chữ: đó là chỗ duy nhất chặn
     * một địa chỉ chưa được bản đồ xác nhận. Thiếu nó thì khách gõ tay một dòng chữ, bấm Tiếp
     * tục, và yêu cầu đi tiếp với một địa chỉ mà quãng đường giao xe không tính được (ADR 0018).
     *
     * Mã tỉnh/xã KHÔNG còn trong danh sách: luồng khách không có ô nào để chọn chúng, nên bắt
     * chúng hợp lệ là chặn bằng một lỗi không có ô nào để sửa.
     */
    fields.push(
      'deliveryAddressLine',
      'deliveryLatitude',
      'deliveryLongitude',
      'pickupAddressLine',
      'pickupLatitude',
      'pickupLongitude',
      'destination',
    );

    if (!(await form.trigger(fields))) return;

    // Dài hạn không có khung giờ để kiểm lịch — bỏ qua bước kiểm và đi tiếp.
    if (isLongTerm) {
      await afterTripStep();
      return;
    }

    const values = form.getValues();
    flow.availability.mutate(
      { pickupAt: values.pickupAt, returnAt: values.returnAt },
      {
        onSuccess: (result) => {
          // KHÔNG nói xe "đã được đặt" và không hé lộ đơn của người khác — chỉ nói khung giờ bận.
          if (!result.available) {
            setError(t('time.unavailable'));
            return;
          }
          void afterTripStep();
        },
        onError: (error) => setError(errorMessage(error)),
      },
    );
  }, [afterTripStep, errorMessage, flow.availability, form, isLongTerm, setError, t]);

  /** Lui về bước Chuyến đi — mọi thứ đã nhập giữ nguyên. */
  const backToTrip = useCallback(() => {
    // Khách đã thấy bước Chuyến đi — từ giờ nút lui ở Xem lại về lại bước đó.
    enteredAtReview.current = false;
    setStep(REQUEST_STEP.TRIP);
    setError(null);
  }, [setError, setStep]);

  /**
   * Khoá gửi ĐỒNG BỘ: `isPending` chỉ đổi ở lượt render SAU, nên hai cú bấm trong cùng một nhịp
   * đều thấy `false` và cùng gửi. Index chống trùng ở DB vẫn là chốt cuối.
   */
  const submitLock = useRef(false);

  /**
   * Mở tấm xác minh SĐT của vỏ app, điền sẵn SĐT liên hệ khách vừa gõ ở màn Xem lại (tài khoản
   * Google/Facebook chưa có số nào khác). Xác minh xong ⇒ lượt gửi đi tiếp; "Để sau" ⇒ ở lại.
   */
  function askAccountPhone() {
    promptAccountPhone?.({
      phone: form.getValues('customerPhone'),
      onVerified: () => setSubmitAfterPhone(true),
    });
  }

  const submitRequest = useCallback(async () => {
    setError(null);
    /*
     * Ô đồng ý của màn Xem lại là BẮT BUỘC cho mọi chuyến (web #205); khi chủ xe có điều khoản
     * riêng, CÙNG ô đó phủ luôn điều khoản ấy và server kiểm lại khi xe bắt buộc.
     */
    if (!form.getValues('acceptedTerms')) {
      setAgreementMissing(true);
      // Đợi một khung để dòng lỗi đỏ dựng xong rồi mới đo.
      requestAnimationFrame(revealConsent);
      return;
    }
    if (submitLock.current) return;
    // Khoá TRƯỚC lượt chờ kiểm lời nhắn — cú bấm thứ hai trong lúc chờ không được lọt qua.
    submitLock.current = true;
    // Lời nhắn là ô nhập duy nhất của màn này — quá trần thì báo ngay dưới ô, không gửi.
    let noteValid = false;
    try {
      // Lời nhắn + liên hệ là các ô nhập của màn này — sai thì báo ngay dưới ô, không gửi.
      noteValid = await form.trigger(['note', 'customerName', 'customerPhone']);
    } finally {
      if (!noteValid) submitLock.current = false;
    }
    if (!noteValid) return;
    /*
     * Tài khoản chưa có SĐT đã xác minh (ADR 0071) — hỏi NGAY đây, sau khi mọi ô đã hợp lệ: khách
     * đã xem hết chuyến, giá và vừa gõ SĐT liên hệ. Ngoài vỏ app khách (không có tấm) thì gửi luôn,
     * server trả `PHONE_NOT_VERIFIED`.
     */
    if (me && !me.phoneVerified && promptAccountPhone) {
      submitLock.current = false;
      askAccountPhone();
      return;
    }
    flow.submit.mutate(
      toRequestBody(form.getValues(), promo.appliedCode, agreementCoversHostTerms),
      {
        onSettled: () => {
          submitLock.current = false;
        },
        /*
         * Nhớ địa chỉ giao xe CHỈ khi đã gửi thành công — đúng chỗ web gọi
         * `rememberDeliveryAddress`.
         *
         * Ghi lúc đang gõ dở sẽ đóng dấu một địa chỉ chưa hoàn chỉnh lên mọi lần đặt sau; ghi khi
         * gửi hỏng thì nhớ đúng cái địa chỉ vừa bị từ chối.
         */
        onSuccess: (receipt) => {
          // Đã gửi — bản nháp (nếu còn) không được dựng lại ở lần mở màn sau.
          clearBookingDraft();
          const v = form.getValues();
          if (v.deliveryRequested && v.deliveryProvinceCode) {
            rememberDeliveryAddress({
              provinceCode: v.deliveryProvinceCode,
              wardCode: v.deliveryWardCode,
              addressLine: v.deliveryAddressLine,
              latitude: v.deliveryLatitude,
              longitude: v.deliveryLongitude,
              placeId: v.deliveryPlaceId,
              locationSource: v.deliveryLocationSource,
            });
          }
          /*
           * Chuyến được NHẬN NGAY ⇒ sang thẳng MÀN THANH TOÁN của chuyến (web: `paymentPath.trip`):
           * chuyển khoản VietQR và ví điện tử ở cùng một chỗ, đồng hồ đang chạy. Luồng đặt xe được
           * THAY bằng Chuyến của tôi → Chi tiết → Thanh toán — lui đi ngược đúng đường đó.
           */
          if (isAwaitingHoldReceipt(receipt)) {
            // Đường như web (người dùng chốt 28/10/2026): Chuyến của tôi → Chi tiết chuyến → Thanh toán giữ
            // chỗ (QR). Lui từ màn QR về chi tiết chuyến, lui tiếp về Chuyến của tôi.
            router.replace(ROUTES.booking.list());
            router.push(ROUTES.booking.detail(receipt.id));
            router.push(ROUTES.booking.payment(receipt.id));
          }
        },
        onError: (error) => {
          if (flow.isHoldLimit(error)) {
            setSubmitHitHoldLimit(true);
            void queryClient.invalidateQueries({ queryKey: queryKeys.trips.unpaidHolds() });
            return;
          }
          // Trùng yêu cầu là một NHÁNH riêng, không phải lỗi đỏ: khách đã gửi yêu cầu này rồi.
          if (flow.isDuplicate(error)) {
            setDuplicate(true);
            return;
          }
          /*
           * Tài khoản gian hàng, hoặc xe của chính gian hàng mình (ADR 0038 điều 6). Thay CẢ luồng
           * bằng một màn kết quả giải thích, không phải một dòng lỗi đỏ dưới nút Gửi: người dùng
           * không sửa được gì trong biểu mẫu để qua được cổng này.
           */
          const blockedReason = flow.blockedReason(error);
          if (blockedReason) {
            setBlocked(blockedReason);
            return;
          }
          /*
           * MÃ KHUYẾN MÃI bị SERVER từ chối ở cửa gửi (ADR 0046) — mã vừa hết lượt, hoặc điều kiện
           * vừa đổi. Bỏ mã, làm mới báo giá, và KHÔNG hiện thêm một lỗi chung: giao diện đã nói
           * đúng chỗ (ngay cạnh ô mã), còn một dòng đỏ thứ hai chỉ làm người ta đi tìm hai vấn đề.
           */
          if (promo.rejectByServer(error)) {
            void quote.refetch();
            setError(null);
            return;
          }
          /*
           * Phiên vừa hết hạn giữa chừng ⇒ mời đăng nhập lại, GIỮ NGUYÊN mọi thứ đã nhập; đăng nhập
           * xong luồng tự đi tiếp tới bước Xác nhận để khách bấm gửi lại.
           */
          if (isUnauthenticated(error)) {
            backToTrip();
            requestSignIn();
            return;
          }
          /*
           * Server nói SĐT của tài khoản chưa xác minh trong khi `/auth/me` đang giữ bản cũ. Làm mới
           * nó và mở tấm xác minh số ngay trên màn này; xác minh xong lượt gửi tự đi tiếp. Lỗi vẫn
           * hiện để khách bấm "Để sau" còn biết vì sao chưa gửi được.
           */
          if (flow.isPhoneUnverified(error)) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
            askAccountPhone();
            setError(errorMessage(error));
            return;
          }
          /*
           * Cổng BẰNG LÁI ở server (ADR 0057) nói "chưa" trong khi giao diện tưởng là "được" — bằng
           * vừa hết hạn, vừa bị thay, hoặc phiên vừa mất. Lùi về bước bằng lái với dữ liệu MỚI.
           */
          if (flow.isDriverLicenceGate(error)) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.driverLicence.overview });
            setError(null);
            setStep(REQUEST_STEP.LICENCE);
            return;
          }
          setError(errorMessage(error));
        },
      },
    );
    // `askAccountPhone` là hàm khai báo lại mỗi render, chỉ đọc `getValues` + `promptAccountPhone`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    backToTrip,
    errorMessage,
    agreementCoversHostTerms,
    me,
    promptAccountPhone,
    flow,
    form,
    promo,
    queryClient,
    quote,
    requestSignIn,
    router,
    setBlocked,
    setDuplicate,
    setError,
    setStep,
  ]);

  /*
   * QUAY LẠI SAU ĐĂNG NHẬP — đang chờ đăng nhập mà phiên đã có (nạp SAU mốc mời) ⇒ đi tiếp đúng từ
   * chỗ khách bấm "Tiếp tục". Tài khoản chưa xác minh SĐT cũng đi tiếp (ADR 0071): số được hỏi lúc
   * bấm "Gửi yêu cầu", không phải ở đây.
   *
   * Đổi state NGAY TRONG render (như web) để mỗi lượt đăng nhập kích đúng MỘT lần đi tiếp; effect
   * chỉ chạy phần bất đồng bộ. Không TỰ GỬI gì.
   */
  const [resumeTick, setResumeTick] = useState(0);
  if (awaitingAuth && me && meQuery.dataUpdatedAt > signInRequestedAt) {
    setAwaitingAuth(false);
    setError(null);
    setResumeTick((n) => n + 1);
  }
  /*
   * Gửi tiếp sau khi xác minh SĐT — chờ `/auth/me` làm mới mang số đã xác minh, không thì
   * `submitRequest` lại thấy bản cũ và hỏi số lần nữa.
   */
  const [submitTick, setSubmitTick] = useState(0);
  if (submitAfterPhone && me?.phoneVerified) {
    setSubmitAfterPhone(false);
    setSubmitTick((n) => n + 1);
  }
  // Lượt gửi tiếp sau khi xác minh SĐT — vẫn qua đủ các phép kiểm của nút gửi.
  useEffect(() => {
    if (submitTick > 0) void submitRequest();
    // Chỉ chạy cho MỖI lượt xác minh mới; `submitRequest` đọc form qua `getValues`/`trigger`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitTick]);
  useEffect(() => {
    if (resumeTick === 0) return;
    const draftPromo = restoredDraft?.promoCode ?? null;
    clearBookingDraft();
    // Lời đồng ý điều khoản là của MỘT người — người vừa đăng nhập tự tick lại ở bước Xác nhận.
    form.setValue('acceptedTerms', false);
    if (draftPromo && !promo.appliedCode) promo.apply(draftPromo);
    // Sau lượt render này (không đổi state đồng bộ trong effect) — cùng lượt kiểm của "Tiếp tục".
    void Promise.resolve().then(continueFromTrip);
    // Chỉ chạy cho MỖI lượt quay lại mới.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeTick]);

  /*
   * Mã đang áp ở thẻ đặt xe (`prefill.promoCode` web) — áp MỘT lần khi chưa có bản nháp; bản nháp
   * có mã riêng ở lượt quay lại sau đăng nhập.
   */
  /*
   * TỰ ĐI TIẾP KHI MỞ — thẻ đặt xe đã đủ chuyến (`prefill.autoContinue` web): trong lúc chạy, màn
   * hiện trạng thái chờ (`flow.preparing`) thay cho biểu mẫu, như hộp đặt xe web. Chạy MỘT lần sau
   * khi `/auth/me` đã rõ; không bao giờ GỬI (ADR 0060). Bản nháp chờ đăng nhập có đường riêng.
   */
  const [preparing, setPreparing] = useState(
    () => prefill?.autoContinue === '1' && restoredDraft === null,
  );
  logger.warn('[auto-continue] mở màn', { prefill: prefill?.autoContinue, draft: restoredDraft !== null, preparing });
  const autoContinueStarted = useRef(false);
  /** Lượt tự đi tiếp KHÔNG qua được ⇒ đóng luồng, về trang xe và báo lý do. */
  const bounceToListing = (message: string | null) => {
    toast.showError(message ?? t('tripNeedsFix'));
    clearBookingDraft();
    goBackOr(router, ROUTES.explore.listingDetail(listing.id));
  };
  /** Luồng tự đi thẳng tới Xem lại lúc mở (không qua bước Chuyến đi) — quyết định đích của nút lui. */
  const enteredAtReview = useRef(false);
  useEffect(() => {
    if (!preparing || autoContinueStarted.current || meQuery.isPending) return;
    autoContinueStarted.current = true;
    logger.warn('[auto-continue] bắt đầu', { prefill: prefill?.autoContinue, draft: restoredDraft !== null });
    enteredAtReview.current = true;
    /*
     * KHÔNG tắt màn chờ ngay khi `continueFromTrip` trả về: nó chỉ GỬI lượt kiểm lịch, kết quả và
     * lượt sang bước Xem lại tới SAU — tắt sớm là bước Chuyến đi chớp lên một nhịp rồi mới nhảy
     * (người dùng báo 28/10/2026). Màn chờ tắt khi luồng rời bước Chuyến đi / báo lỗi (effect
     * dưới), hoặc ngay khi form không qua kiểm (khách phải thấy ô cần sửa).
     */
    void Promise.resolve()
      .then(continueFromTrip)
      .then(() => {
        logger.warn('[auto-continue] xong lượt', { errors: Object.keys(form.formState.errors), step: state.step, error: state.error });
        // Form không qua kiểm (giờ thuê sai/thiếu) ⇒ về trang xe sửa lịch, không mở bước Chuyến đi.
        if (Object.keys(form.formState.errors).length > 0) bounceToListing(null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preparing, meQuery.isPending]);
  useEffect(() => {
    if (!preparing || !autoContinueStarted.current) return;
    if (state.step === REQUEST_STEP.TRIP && state.error) {
      // Kiểm lịch báo TRÙNG / không hợp lệ ⇒ trả khách về trang xe kèm lỗi (người dùng chốt
      // 28/10/2026): bước Chuyến đi không còn dùng cho luồng "Chọn thuê" — sửa giờ ở thẻ đặt xe.
      bounceToListing(state.error);
      return;
    }
    if (state.step !== REQUEST_STEP.TRIP) {
      setPreparing(false);
      return;
    }
    // Lưới an toàn: mạng treo thì trả lại biểu mẫu thay vì quay vô hạn.
    const timer = setTimeout(() => setPreparing(false), PREPARE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [preparing, state.step, state.error]);

  /*
   * Mã đang áp ở thẻ đặt xe (`prefill.promoCode`) — như web: chỉ xét khi KHÔNG chờ đăng nhập và
   * KHÔNG đang tự đi tiếp, để lượt xem trước mã chạy dưới đúng phiên khách (ADR 0046 điều 5).
   */
  const promoToEvaluate = useRef<string | null>(
    restoredDraft ? null : prefill?.promoCode?.trim() || null,
  );
  useEffect(() => {
    if (awaitingAuth || preparing || !promoTrip) return;
    const code = promoToEvaluate.current;
    if (!code) return;
    promoToEvaluate.current = null;
    if (!promo.appliedCode) promo.apply(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingAuth, preparing, promoTrip !== null]);

  const closeFlow = useCallback(() => {
    clearBookingDraft();
    goBackOr(router, ROUTES.explore.listingDetail(listing.id));
  }, [listing.id, router]);

  const holdLimitBlocked = isHoldLimitBlocked({
    step: state.step,
    receipt: state.receipt,
    limitReached: unpaidHolds.data?.limitReached,
    submitHitHoldLimit,
  });

  if (preparing) return <ScreenLoading label={t('preparing')} />;

  /** Các nhánh KẾT THÚC dùng chung một màn kết quả — không nhánh nào là lỗi đỏ. */
  if (holdLimitBlocked || state.blocked || state.duplicate || state.step === REQUEST_STEP.DONE) {
    return (
      <RequestResultStep
        holdLimit={holdLimitBlocked}
        unpaidHolds={unpaidHolds.data}
        blocked={state.blocked}
        duplicate={state.duplicate}
        receipt={state.receipt}
        values={form.getValues()}
        rentalMode={rentalMode}
        listing={listing}
        quote={quoteWithPromo}
        onClose={closeFlow}
        onLeave={clearBookingDraft}
      />
    );
  }

  /**
   * Chuyến có khoản thu trước không — `fees.holdAmount` của báo giá SERVER. Chưa có báo giá thì
   * coi là CÓ (đa số chuyến có), như web: thanh không co lại rồi giãn ra khi báo giá về.
   */
  const hasHoldStage = quote.data ? quote.data.breakdown.fees?.holdAmount != null : true;
  /*
   * Câu "chuyện xảy ra sau khi gửi" thì KHÁC thanh tiến trình, như web (`quoteHasHold`): chỉ hứa
   * bước thanh toán khi báo giá THẬT SỰ có khoản giữ chỗ — chưa có báo giá ⇒ `general`.
   */
  const quoteHasHold = quote.data?.breakdown.fees?.holdAmount != null;
  /** Chuyện xảy ra sau khi gửi — "Đặt ngay" do server xem trước (`quote.autoAccept`). */
  const nextStep: BookingReviewNextStep = quote.data?.autoAccept?.eligible
    ? quoteHasHold
      ? 'instantHold'
      : 'instantConfirmed'
    : quoteHasHold
      ? 'hold'
      : 'general';

  /*
   * Khối DÍNH ĐÁY (tiền + lỗi + nút) — bản native của `.dock` bên web: khách đổi lựa chọn ở nửa
   * trên và thấy con số đổi theo ngay dưới mắt, thay vì khuất ở cuối một form dài.
   *
   * Bước bằng lái không có khối tiền nhưng vẫn có dòng lỗi + nút Tiếp tục.
   */
  const showDock = state.step !== REQUEST_STEP.LICENCE;
  const footer =
    showDock || state.error || state.step === REQUEST_STEP.LICENCE ? (
      <>
        {/*
          Màn Xem lại có HAI THẺ TIỀN ngay trong trang (web develop `variant="review"`) — thanh tổng
          dính đáy ở bước đó chỉ nói lại một con số đã có, nên dock chỉ còn hàng nút.
        */}
        {showDock && state.step !== REQUEST_STEP.REVIEW ? (
          <BookingPriceSummary
            listing={listing}
            serviceType={serviceType}
            routeType={routeType}
            quote={quoteWithPromo}
            quoteLoading={quote.isPending && quoteParams !== null}
            hasSelection={quoteParams !== null}
            isDelivery={deliveryRequested}
            variant="bar"
            expanded={priceExpanded}
            onExpandedChange={setPriceExpanded}
          />
        ) : null}

        {state.error ? (
          <XStack
            ai="flex-start"
            gap={space.sm}
            p={space.sm}
            br={radius.md}
            bg={colors.dangerSurface}
          >
            <Ionicons name="alert-circle" size={iconSize.sm} color={colors.danger} />
            <Text f={1} col={colors.danger} fos={fontSize.bodySm}>
              {state.error}
            </Text>
          </XStack>
        ) : null}

        {state.step === REQUEST_STEP.TRIP ? (
          <Button variant="gradient"
            label={flow.availability.isPending ? t('actions.checking') : t('actions.continue')}
            icon="arrow-forward"
            size="lg"
            loading={flow.availability.isPending || checkingLicence}
            onPress={() => void continueFromTrip()}
          />
        ) : null}

        {state.step === REQUEST_STEP.LICENCE ? (
          <Button variant="gradient"
            label={t('actions.continue')}
            icon="arrow-forward"
            size="lg"
            // Chỉ mở khi bằng đã hợp lệ CHO CHUYẾN NÀY — cùng phép soát với cổng ở server.
            disabled={!licenceReady}
            onPress={() => setStep(REQUEST_STEP.REVIEW)}
          />
        ) : null}

        {state.step === REQUEST_STEP.REVIEW ? (
          <XStack gap={space.sm}>
            {/*
              KHÔNG gắn icon cho nút lùi này: nó chỉ được f={1} cạnh một nút f={2}, tức ~104dp; trừ 48dp
              đệm ngang còn 56dp, vừa đúng cho chữ "Quay lại" và không còn chỗ cho 22dp icon + khe. Icon
              đi cho nút CHÍNH của hàng, nơi có dư bề ngang — nút phụ hẹp thì chữ quan trọng hơn hình.
            */}
            <YStack flexShrink={0}>
              <Button
                label={tCommon('back')}
                variant="secondary"
                size="lg"
                onPress={() => backToTrip()}
              />
            </YStack>
            {/*
              "Quay lại" co vừa chữ, nút gửi lấy phần còn lại. Ở cỡ `lg` (chữ 16px) mỗi ký tự
              rộng hơn hẳn, nên "Gửi yêu cầu thuê" cần trọn phần còn lại của hàng.
            */}
            <YStack f={1}>
              <Button variant="gradient"
                label={t('reviewPage.submit.cta')}
                icon="send-outline"
                size="lg"
                loading={flow.submit.isPending}
                onPress={() => void submitRequest()}
              />
            </YStack>
          </XStack>
        ) : null}
      </>
    ) : undefined;

  return (
    <>
      <AppHeader
        title={t('title')}
        below={<BookingJourney current="request" hasHoldStage={hasHoldStage} variant="inline" />}
        /*
          Quay lại = về NƠI KHÁCH VỪA ĐỨNG. Mở từ "Chọn thuê" của trang xe thì luồng tự nhảy thẳng tới
          Xem lại (`autoContinue`) — khách chưa hề thấy bước Chuyến đi, nên lui phải về trang xe chứ
          không mở ra một bước lạ (người dùng báo lỗi 28/10/2026). Sửa chuyến vẫn qua "Chỉnh sửa".
        */
        onBack={
          state.step === REQUEST_STEP.TRIP || enteredAtReview.current ? closeFlow : () => backToTrip()
        }
      />
      <Screen
        edges={['left', 'right', 'bottom']}
        hideFooterWhileTyping
        scrollRef={scrollRef}
        {...(footer ? { footer } : {})}
      >
        <YStack gap={layout.section}>
          {/*
            Hồ sơ xe ở ĐẦU bước Chuyến đi — mốc "mình đang đặt xe nào". Bước Xem lại KHÔNG có (web
            `BookingReviewStep`): thẻ chuyến ở đó đã mang ảnh, tên xe và chủ xe — vẽ hai lần là thừa.
          */}
          {state.step === REQUEST_STEP.REVIEW ? null : (
            <VehicleSummaryCard
              listing={listing}
              serviceType={serviceType}
              packageMonths={packageMonths}
            />
          )}

          {state.step === REQUEST_STEP.TRIP ? (
            <RequestTripStep
              form={form}
              listing={listing}
              services={services}
              busyDays={busyDays}
              busyLoading={busyLoading}
              rentalMode={rentalMode}
              onRentalModeChange={setRentalMode}
              quote={quote.data}
            />
          ) : null}

          {/* Bằng lái — giữa hai bước, chỉ khi thuê tự lái/dài hạn (ADR 0057). */}
          {state.step === REQUEST_STEP.LICENCE && licenceTrip ? (
            <YStack gap={space.sm}>
              <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
                {t('licence.title')}
              </Text>
              <DriverLicenceVerifier trip={licenceTrip} />
            </YStack>
          ) : null}

          {state.step === REQUEST_STEP.REVIEW ? (
            <RequestReviewStep
              values={form.getValues()}
              form={form}
              listing={listing}
              rentalMode={rentalMode}
              renter={
                me
                  ? {
                      name: me.displayName,
                      phone: me.phone ?? null,
                      email: me.email ?? null,
                      verified: Boolean(me.phoneVerified),
                    }
                  : null
              }
              licence={{ required: needsLicence, current: licenceQ.data?.verified ?? null }}
              agreementCoversHostTerms={agreementCoversHostTerms}
              nextStep={nextStep}
              agreementMissing={agreementMissing && !watchedAccepted}
              consentRef={consentRef}
              disabled={flow.submit.isPending}
              breakdown={quoteWithPromo?.breakdown ?? null}
              isDelivery={deliveryRequested}
              costs={
                <>
                  <BookingPriceSummary
                    listing={listing}
                    serviceType={serviceType}
                    routeType={routeType}
                    quote={quoteWithPromo}
                    quoteLoading={quote.isPending && quoteParams !== null}
                    hasSelection={quoteParams !== null}
                    isDelivery={deliveryRequested}
                    variant="review"
                    showDeposit={false}
                    expanded
                    onExpandedChange={setPriceExpanded}
                    promoSlot={promoField}
                  />
                  {/*
                    Đặt sát giờ ⇒ hạn thanh toán ngắn, có thể không có huỷ miễn phí — nói TRƯỚC khi
                    gửi (ADR 0032 điều 5 · ADR 0064), như web. Dài hạn chưa có giờ nhận nên không ước.
                  */}
                  {serviceType === SERVICE_TYPE.LONG_TERM ? null : (
                    <NearPickupHoldNotice
                      pickupAt={pickupAt}
                      fees={quoteWithPromo?.breakdown.fees}
                    />
                  )}
                </>
              }
            />
          ) : null}

          {/* Bảng "chi tiết" của bước Chuyến đi — bước Xem lại có hai thẻ tiền riêng (`costs`). */}
          {state.step === REQUEST_STEP.TRIP ? (
            <BookingPriceSummary
              listing={listing}
              serviceType={serviceType}
              routeType={routeType}
              quote={quoteWithPromo}
              quoteLoading={quote.isPending && quoteParams !== null}
              hasSelection={quoteParams !== null}
              isDelivery={deliveryRequested}
              variant="detail"
              expanded={priceExpanded}
              onExpandedChange={setPriceExpanded}
              promoSlot={promoField}
            />
          ) : null}
        </YStack>
      </Screen>
    </>
  );
}
