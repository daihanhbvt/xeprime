import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';
import { useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useQueryClient } from '@tanstack/react-query';
import {
  ADDRESS_LINE_MAX_LENGTH,
  PICKUP_PREFERENCE,
  ROUTE_TYPE,
  SERVICE_TYPE,
  serviceRequiresDriverLicence,
  type PublicListingDetail,
} from '@xeprime/types';
import { readDeliveryAddress, rememberDeliveryAddress } from '@/lib/delivery-address-memory';
import {
  DRIVER_LICENCE_TRIP_GATE,
  evaluateDriverLicenceForTrip,
  type RentalMode,
} from '@xeprime/domain';
import { driverLicenceApi } from '@/api/driver-licence/api';
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
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { BookingPriceSummary } from './components/BookingPriceSummary';
import { PromoCodeField } from '@/features/promo-codes/PromoCodeField';
import { usePromoCode } from '@/features/promo-codes/use-promo-code';
import { VehicleSummaryCard } from './components/VehicleSummaryCard';
import { RequestTripStep } from './components/RequestTripStep';
import { RequestReviewStep } from './components/RequestReviewStep';
import { RequestResultStep } from './components/RequestResultStep';
import {
  REQUEST_STEP,
  useBookingRequestFlow,
  usePublicQuote,
  useVehicleBusyDays,
  type RequestStep,
} from './hooks/use-booking-request-flow';
import { toQuoteParams } from './quote-params';
import { toRequestBody } from './request-body';

/**
 * Hình dạng form của wizard, suy từ chính `useForm` thay vì viết tay `UseFormReturn<...>`:
 * react-hook-form có ba tham số generic và tham số thứ ba (giá trị sau transform) đổi theo
 * resolver, nên bản viết tay lệch với bản thật ngay khi schema có một `transform`.
 */
export type RequestForm = ReturnType<typeof useForm<BookingRequestFormValues>>;

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
}: {
  vehicleId: string;
  initialServiceType?: string;
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
    />
  );
}

function RequestBookingBody({
  listing,
  initialServiceType,
  deliveryProvinceCode,
}: {
  listing: PublicListingDetail;
  initialServiceType?: string;
  deliveryProvinceCode?: string;
}) {
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

  /**
   * Dịch vụ địa điểm còn sống không — quyết định có ĐÒI toạ độ hay không.
   *
   * Khởi tạo `true` (coi như sống): ô địa chỉ vẫn đòi xác nhận, và khách chưa gõ gì thì chưa có
   * gì để mất. Chỉ một câu trả lời tường minh `available: false` từ `/places/search` mới hạ cờ,
   * và lúc đó schema dựng lại mà không còn ràng buộc toạ độ — bản đồ hỏng không được phép trở
   * thành "không đặt được xe" (ADR 0035 điều 6).
   */
  const [canConfirmLocation, setCanConfirmLocation] = useState(true);

  /*
   * Dựng lại schema khi ngôn ngữ hoặc cờ trên đổi — `t` đổi định danh theo locale. Dựng mỗi lần
   * render thì `yupResolver` nhận một object mới mỗi nhịp và RHF phải xác thực lại toàn form sau
   * từng phím gõ.
   */
  const schema = useMemo(
    () =>
      buildBookingRequestSchema(
        {
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
          addressNotConfirmed: tFormErrors('addressNotConfirmed'),
          noteTooLong: t('validation.noteTooLong', { max: NOTE_MAX }),
        },
        { canConfirmLocation },
      ),
    [canConfirmLocation, t, tFormErrors],
  );

  const form = useForm<BookingRequestFormValues>({
    resolver: yupResolver(schema),
    mode: 'onTouched',
    defaultValues: restoredDraft?.values ?? {
      acceptedTerms: false,
      serviceType: defaultService as BookingRequestFormValues['serviceType'],
      pickupAt: '',
      returnAt: '',
      longTermPackageMonths: null,
      // Web chọn sẵn "trong 7 ngày" và "nội thành" (`requestFormSchema` `.default(...)`).
      pickupPreference: PICKUP_PREFERENCE.WITHIN_7_DAYS,
      requestedPickupDate: '',
      routeType: ROUTE_TYPE.IN_CITY,
      pickupProvinceCode: '',
      pickupWardCode: '',
      pickupAddressLine: '',
      pickupPlaceId: null,
      pickupLatitude: null,
      pickupLongitude: null,
      pickupLocationSource: null,
      destination: '',
      deliveryRequested: false,
      deliveryProvinceCode: '',
      deliveryWardCode: '',
      deliveryAddressLine: '',
      deliveryPlaceId: null,
      deliveryLatitude: null,
      deliveryLongitude: null,
      deliveryLocationSource: null,
      note: '',
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

  const [rentalMode, setRentalMode] = useState<RentalMode>(restoredDraft?.rentalMode ?? 'daily');
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

  /*
   * Lịch bận chỉ có nghĩa với dịch vụ theo NGÀY. Dài hạn chưa có khung giờ cụ thể — khách nêu
   * nguyện vọng, gian hàng chốt lịch khi duyệt (ADR 0011) — nên không tải lịch cho nó.
   */
  const busyDays = useVehicleBusyDays(listing.id, !isLongTerm);

  /*
   * Báo giá SERVER cho lựa chọn hiện tại — khối tiền đọc chung nó ở cả hai hình thái, nên chỉ
   * có MỘT lần gọi và không bao giờ hai chỗ nói hai con số.
   */
  const packageMonths = useWatch({ control: form.control, name: 'longTermPackageMonths' });
  const routeType = useWatch({ control: form.control, name: 'routeType' });
  const deliveryRequested = useWatch({ control: form.control, name: 'deliveryRequested' });
  const pickupAt = useWatch({ control: form.control, name: 'pickupAt' });
  const returnAt = useWatch({ control: form.control, name: 'returnAt' });

  const quoteParams = toQuoteParams({
    serviceType,
    longTermPackageMonths: packageMonths,
    pickupAt,
    returnAt,
    routeType,
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
  const quoteWithPromo = useMemo(() => {
    const q = quote.data ?? null;
    const promoFees = promo.applied?.fees;
    if (!q || !promoFees) return q;
    return { ...q, breakdown: { ...q.breakdown, fees: promoFees } };
  }, [quote.data, promo.applied]);

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
    [serviceType, listing.vehicleType, packageMonths, pickupPreference, requestedPickupDate, returnAt],
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
  const licenceQ = useDriverLicence({ enabled: state.step === REQUEST_STEP.LICENCE && Boolean(me) });
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
    setStep(REQUEST_STEP.TRIP);
    setError(null);
  }, [setError, setStep]);

  const submitRequest = useCallback(() => {
    setError(null);
    // Xe bắt đồng ý điều khoản cho dịch vụ này mà khách chưa tick ⇒ dừng lại, như web.
    if (requiresTermsAcceptance && !form.getValues('acceptedTerms')) {
      setError(t('review.termsRequired'));
      return;
    }
    flow.submit.mutate(toRequestBody(form.getValues(), promo.appliedCode), {
      /*
       * Nhớ địa chỉ giao xe CHỈ khi đã gửi thành công — đúng chỗ web gọi
       * `rememberDeliveryAddress`.
       *
       * Ghi lúc đang gõ dở sẽ đóng dấu một địa chỉ chưa hoàn chỉnh lên mọi lần đặt sau; ghi khi
       * gửi hỏng thì nhớ đúng cái địa chỉ vừa bị từ chối.
       */
      onSuccess: () => {
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
      },
      onError: (error) => {
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
         * nó để cổng xác minh số của app hiện ra, rồi khách bấm gửi lại.
         */
        if (flow.isPhoneUnverified(error)) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
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
    });
  }, [
    backToTrip,
    errorMessage,
    requiresTermsAcceptance,
    flow,
    form,
    promo,
    queryClient,
    quote,
    requestSignIn,
    setBlocked,
    setDuplicate,
    setError,
    setStep,
    t,
  ]);

  /*
   * QUAY LẠI SAU ĐĂNG NHẬP — đang chờ đăng nhập mà phiên đã có (nạp SAU mốc mời) và SĐT đã xác
   * minh ⇒ đi tiếp đúng từ chỗ khách bấm "Tiếp tục". Tài khoản chưa xác minh SĐT thì ĐỢI: cổng xác
   * minh số của app đang hỏi, và đi tiếp lúc này chỉ để server từ chối ở nút cuối.
   *
   * Đổi state NGAY TRONG render (như web) để mỗi lượt đăng nhập kích đúng MỘT lần đi tiếp; effect
   * chỉ chạy phần bất đồng bộ. Không TỰ GỬI gì.
   */
  const [resumeTick, setResumeTick] = useState(0);
  if (awaitingAuth && me?.phoneVerified && meQuery.dataUpdatedAt > signInRequestedAt) {
    setAwaitingAuth(false);
    setError(null);
    setResumeTick((n) => n + 1);
  }
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

  const closeFlow = useCallback(() => {
    clearBookingDraft();
    goBackOr(router, ROUTES.explore.listingDetail(listing.id));
  }, [listing.id, router]);

  /** Bốn nhánh KẾT THÚC dùng chung một màn kết quả — ba trong số đó không phải lỗi. */
  if (state.blocked || state.duplicate || state.step === REQUEST_STEP.DONE) {
    return (
      <RequestResultStep
        blocked={state.blocked}
        duplicate={state.duplicate}
        receipt={state.receipt}
        values={form.getValues()}
        listing={listing}
        quote={quoteWithPromo}
        onClose={closeFlow}
      />
    );
  }

  const stepIndex = state.step === REQUEST_STEP.REVIEW ? REVIEW_STEP_INDEX : TRIP_STEP_INDEX;

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
        {showDock ? (
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
          <Button
            label={flow.availability.isPending ? t('actions.checking') : t('actions.continue')}
            icon="arrow-forward"
            size="lg"
            loading={flow.availability.isPending || checkingLicence}
            onPress={() => void continueFromTrip()}
          />
        ) : null}

        {state.step === REQUEST_STEP.LICENCE ? (
          <Button
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
              <Button
                label={t('actions.submit')}
                icon="send-outline"
                size="lg"
                loading={flow.submit.isPending}
                onPress={submitRequest}
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
        subtitle={t('stepsLabel')}
        onBack={state.step === REQUEST_STEP.TRIP ? closeFlow : () => backToTrip()}
      />
      <Screen edges={['left', 'right', 'bottom']} {...(footer ? { footer } : {})}>
        <YStack gap={layout.section}>
          {/* Hồ sơ xe đứng ĐẦU và không đổi theo bước — mốc "mình đang đặt xe nào". */}
          <VehicleSummaryCard
            listing={listing}
            serviceType={serviceType}
            packageMonths={packageMonths}
          />

          <StepIndicator current={stepIndex} />

          {state.step === REQUEST_STEP.TRIP ? (
            <RequestTripStep
              onServiceAvailabilityChange={setCanConfirmLocation}
              form={form}
              listing={listing}
              services={services}
              busyDays={busyDays}
              rentalMode={rentalMode}
              onRentalModeChange={setRentalMode}
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
                      verified: Boolean(me.phoneVerified),
                    }
                  : null
              }
            />
          ) : null}

          {/* Chung một instance "chi tiết" cho cả hai bước — cùng cách web ghép `priceDetail`. */}
          {state.step === REQUEST_STEP.TRIP || state.step === REQUEST_STEP.REVIEW ? (
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

/** Đường kính viên số của thanh bước — vừa đủ chứa một chữ số hoặc dấu tích ở cỡ nhãn. */
const STEP_DOT = 24;

/** Vị trí hai bước NHÌN THẤY; bước bằng lái không có ô riêng vì chỉ một phần khách đi qua nó. */
const TRIP_STEP_INDEX = 1;
const REVIEW_STEP_INDEX = 2;

/** Thanh tiến trình hai bước — bước đã qua hiện DẤU TÍCH thay cho số. */
function StepIndicator({ current }: { current: number }) {
  const t = useTranslations('BookingRequests.flow.steps');
  const labels = [t('trip'), t('review')];

  return (
    <XStack
      gap={space.sm}
      ai="center"
      px={space.md}
      py={space.sm}
      br={radius.lg}
      bw={1}
      bc={colors.borderSubtle}
      bg={colors.surface}
    >
      {labels.map((label, index) => {
        const step = index + 1;
        const active = step <= current;
        const done = step < current;

        return (
          <Fragment key={label}>
            {index > 0 ? (
              /* Vạch nối CHƯA qua dùng bậc viền đậm, cùng mức với `VehicleWizardBar` — nó nói
                 còn mấy bước nữa nên phải liếc là thấy, không phải một đường ngăn cách. */
              <YStack
                f={1}
                h={2}
                br={radius.pill}
                bg={active ? colors.primary : colors.borderInput}
              />
            ) : null}
            <XStack ai="center" gap={space.xs}>
              <YStack
                w={STEP_DOT}
                h={STEP_DOT}
                br={radius.pill}
                ai="center"
                jc="center"
                bw={1}
                bc={done ? colors.success : active ? colors.primary : colors.border}
                bg={done ? colors.successSurface : active ? colors.primary : colors.surfaceMuted}
              >
                {done ? (
                  <Ionicons name="checkmark" size={iconSize.xs} color={colors.success} />
                ) : (
                  <Text
                    col={active ? colors.onPrimary : colors.textMuted}
                    fos={fontSize.label}
                    fow={fontWeight.bold}
                  >
                    {step}
                  </Text>
                )}
              </YStack>
              <Text
                col={active ? colors.text : colors.textMuted}
                fos={fontSize.bodySm}
                fow={active ? fontWeight.semibold : fontWeight.regular}
                numberOfLines={1}
              >
                {label}
              </Text>
            </XStack>
          </Fragment>
        );
      })}
    </XStack>
  );
}
