import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';
import { useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { SERVICE_TYPE, type PublicListingDetail } from '@xeprime/types';
import { readDeliveryAddress, rememberDeliveryAddress } from '@/lib/delivery-address-memory';
import type { RentalMode } from '@xeprime/domain';
import {
  buildBookingRequestSchema,
  NAME_MAX,
  NOTE_MAX,
  type BookingRequestFormValues,
} from './booking-schema';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { ListingDetailSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { describeDevice } from '@/features/auth/api';
import { usePhoneVerify } from '@/features/phone-verification/hooks/use-phone-verify';
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
import { RequestOtpStep } from './components/RequestOtpStep';
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
 * Wizard gửi yêu cầu thuê (BKG-01) — `trip` → (`otp`) → `review` → `done`.
 *
 * Một MÀN riêng chứ không phải bottom sheet như các hộp thoại khác: bốn bước, một bàn phím và
 * một lịch tháng không sống được trong 90% chiều cao màn.
 *
 * **Bước OTP là CÓ ĐIỀU KIỆN.** SĐT của tài khoản đang đăng nhập trùng và đã verify thì nhảy
 * thẳng sang `review` — server cũng bỏ qua OTP ở đúng điều kiện đó, và hỏi lại là hỏi cùng một
 * câu hai lần. OTP KHÔNG đi trong body: xác thực SĐT (purpose `booking`) xảy ra TRƯỚC, server
 * tự tra.
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
  const { state, setStep: setStepRaw, setOtpPhone, setDuplicate, setBlocked, setError } = flow;

  /** Người đã đăng nhập bấm "Đổi" ở bước Xác nhận → hiện lại ô nhập liên hệ ở bước Chuyến đi. */
  const [editingContact, setEditingContact] = useState(false);
  /**
   * Hệ thống đã biết đủ liên hệ chưa — cùng công thức với `contactKnown` của web.
   *
   * `false` ⇒ bước Chuyến đi dựng ô tên + SĐT; `true` ⇒ không hỏi lại thứ đã có, chỉ hiện một
   * dòng "Người thuê" ở bước Xác nhận kèm nút Đổi.
   */
  const contactKnown = flow.accountPhoneVerified && !editingContact;

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
          nameRequired: t('validation.nameRequired'),
          nameTooLong: t('validation.nameTooLong', { max: NAME_MAX }),
          phoneRequired: t('validation.phoneRequired'),
          phoneInvalid: t('validation.phoneInvalid'),
          emailInvalid: t('validation.emailInvalid'),
          serviceRequired: t('validation.serviceRequired'),
          pickupAtRequired: t('validation.pickupAtRequired'),
          returnAtRequired: t('validation.returnAtRequired'),
          packageRequired: t('validation.packageRequired'),
          pickupPreferenceRequired: t('validation.pickupPreferenceRequired'),
          requestedPickupDateRequired: t('validation.requestedPickupDateRequired'),
          routeRequired: t('validation.routeRequired'),
          pickupAddressRequired: t('validation.pickupAddressRequired'),
          destinationRequired: t('validation.destinationRequired'),
          deliveryAddressRequired: t('validation.deliveryAddressRequired'),
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
    defaultValues: {
      customerName: '',
      customerPhone: flow.accountPhone ?? '',
      customerEmail: '',
      serviceType: defaultService as BookingRequestFormValues['serviceType'],
      pickupAt: '',
      returnAt: '',
      longTermPackageMonths: null,
      pickupPreference: null,
      requestedPickupDate: '',
      routeType: null,
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

  /*
   * Điền sẵn liên hệ trong EFFECT chứ không ở `defaultValues`: `GET /me` là một truy vấn, nên lúc
   * form dựng lần đầu `me` thường còn rỗng và `defaultValues` chốt luôn ô trống. Chỉ điền khi ô
   * đang RỖNG để không đè thứ khách vừa gõ.
   */
  const { accountName, accountPhone } = flow;
  useEffect(() => {
    if (!form.getValues('customerName') && accountName) {
      form.setValue('customerName', accountName);
    }
    if (!form.getValues('customerPhone') && accountPhone) {
      form.setValue('customerPhone', accountPhone);
    }
  }, [accountName, accountPhone, form]);

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

  const [rentalMode, setRentalMode] = useState<RentalMode>('daily');
  /*
   * `useWatch` chứ không phải `form.watch()`: bản kia trả về một HÀM mà React Compiler không
   * memo hoá an toàn được, nên nó bỏ tối ưu cho cả component. Cùng dữ liệu, không mất gì.
   */
  const serviceType = useWatch({ control: form.control, name: 'serviceType' });
  const isLongTerm = serviceType === SERVICE_TYPE.LONG_TERM;

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

  const otp = usePhoneVerify(flow.otpPurpose);

  /** Rời bước Chuyến đi: SĐT đã xác thực thì sang thẳng Xác nhận, chưa thì dựng bước OTP. */
  const afterTripStep = useCallback(async () => {
    const phone = form.getValues('customerPhone').trim();

    if (flow.phoneMatchesAccount(phone)) {
      setStep(REQUEST_STEP.REVIEW);
      return;
    }
    try {
      await otp.sendAsync(phone);
      setOtpPhone(phone);
      setStep(REQUEST_STEP.OTP);
    } catch (error) {
      // Lỗi GỬI mã cũng đi bằng toast: ô số điện thoại đang ở cuối form, dòng đỏ dưới nó nằm
      // đúng vùng bàn phím che.
      toast.showError(errorMessage(error));
    }
  }, [errorMessage, flow, form, otp, setOtpPhone, setStep, toast]);

  /** Một nút "Tiếp tục": kiểm dữ liệu → kiểm khung giờ còn trống → quyết định đi qua OTP hay không. */
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
      'customerName',
      'customerPhone',
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

  const submitRequest = useCallback(() => {
    setError(null);
    flow.submit.mutate(toRequestBody(form.getValues(), describeDevice(), promo.appliedCode), {
      /*
       * Nhớ địa chỉ giao xe CHỈ khi đã gửi thành công — đúng chỗ web gọi
       * `rememberDeliveryAddress`.
       *
       * Ghi lúc đang gõ dở sẽ đóng dấu một địa chỉ chưa hoàn chỉnh lên mọi lần đặt sau; ghi khi
       * gửi hỏng thì nhớ đúng cái địa chỉ vừa bị từ chối.
       */
      onSuccess: () => {
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
         * Backend nói SĐT chưa xác thực trong khi app tưởng được bỏ qua OTP ⇒ phiên vừa hết hạn
         * hoặc SĐT tài khoản vừa đổi. Đây là điểm khôi phục: lùi về bước xác thực, GIỮ NGUYÊN
         * mọi thứ đã nhập, gửi mã cho chính số đó.
         */
        if (flow.isPhoneUnverified(error)) {
          const phone = form.getValues('customerPhone').trim();
          setOtpPhone(phone);
          setStep(REQUEST_STEP.OTP);
          setError(t('otp.sessionExpired'));
          otp.send(phone);
          return;
        }
        setError(errorMessage(error));
      },
    });
  }, [
    errorMessage,
    flow,
    form,
    otp,
    promo,
    quote,
    setBlocked,
    setDuplicate,
    setError,
    setOtpPhone,
    setStep,
    t,
  ]);

  /** Lui về bước Chuyến đi. `editContact` = mở lại ô liên hệ (nút 'Đổi' ở bước Xác nhận). */
  const backToTrip = useCallback(
    (editContact = false) => {
      if (editContact) setEditingContact(true);
      setStep(REQUEST_STEP.TRIP);
      setError(null);
      otp.reset();
    },
    [otp, setError, setStep],
  );

  const closeFlow = useCallback(
    () => goBackOr(router, ROUTES.explore.listingDetail(listing.id)),
    [listing.id, router],
  );

  /** Bốn nhánh KẾT THÚC dùng chung một màn kết quả — ba trong số đó không phải lỗi. */
  if (state.blocked || state.duplicate || state.step === REQUEST_STEP.DONE) {
    return (
      <RequestResultStep
        blocked={state.blocked}
        duplicate={state.duplicate}
        receipt={state.receipt}
        values={form.getValues()}
        listing={listing}
        onClose={closeFlow}
      />
    );
  }

  const stepIndex = state.step === REQUEST_STEP.REVIEW ? REVIEW_STEP_INDEX : TRIP_STEP_INDEX;

  /*
   * Khối DÍNH ĐÁY (tiền + lỗi + nút) — bản native của `.dock` bên web: khách đổi lựa chọn ở nửa
   * trên và thấy con số đổi theo ngay dưới mắt, thay vì khuất ở cuối một form dài.
   *
   * Bước OTP không có khối này nhưng vẫn phải chừa chỗ cho dòng lỗi: `submitRequest` lùi về đúng
   * bước này khi phiên hết hạn, và câu đó là thứ duy nhất nói cho khách biết vì sao.
   */
  const showDock = state.step !== REQUEST_STEP.OTP;
  const footer =
    showDock || state.error ? (
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
            loading={flow.availability.isPending || otp.sending}
            onPress={() => void continueFromTrip()}
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
              contactKnown={contactKnown}
            />
          ) : null}

          {state.step === REQUEST_STEP.OTP ? (
            <RequestOtpStep
              phone={state.otpPhone}
              otp={otp}
              onVerified={() => setStep(REQUEST_STEP.REVIEW)}
              onEditPhone={() => backToTrip()}
            />
          ) : null}

          {state.step === REQUEST_STEP.REVIEW ? (
            <RequestReviewStep
              values={form.getValues()}
              form={form}
              listing={listing}
              rentalMode={rentalMode}
              accountPhoneVerified={flow.accountPhoneVerified}
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

/** Vị trí hai bước NHÌN THẤY; bước OTP không có ô riêng vì chỉ một nửa số khách đi qua nó. */
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
