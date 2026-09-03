import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';
import { useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { SERVICE_TYPE, type PublicListingDetail } from '@xeprime/types';
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
}: {
  vehicleId: string;
  initialServiceType?: string;
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
    />
  );
}

function RequestBookingBody({
  listing,
  initialServiceType,
}: {
  listing: PublicListingDetail;
  initialServiceType?: string;
}) {
  const t = useTranslations('BookingRequests.flow');
  const tCommon = useTranslations('Common.actions');
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const toast = useAppToast();

  const flow = useBookingRequestFlow(listing.id);
  const { state, setStep: setStepRaw, setOtpPhone, setDuplicate, setError } = flow;

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

  /*
   * Dựng lại schema khi ngôn ngữ đổi — `t` đổi định danh theo locale, nên `useMemo` bám vào nó
   * là đủ. Dựng mỗi lần render thì `yupResolver` nhận một object mới mỗi nhịp và RHF phải xác
   * thực lại toàn form sau từng phím gõ.
   */
  const schema = useMemo(
    () =>
      buildBookingRequestSchema({
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
        noteTooLong: t('validation.noteTooLong', { max: NOTE_MAX }),
      }),
    [t],
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
      pickupAddress: '',
      destination: '',
      deliveryRequested: false,
      deliveryAddress: '',
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
    fields.push('deliveryAddress', 'pickupAddress', 'destination', 'customerName', 'customerPhone');

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
    flow.submit.mutate(toRequestBody(form.getValues(), describeDevice()), {
      onError: (error) => {
        // Trùng yêu cầu là một NHÁNH riêng, không phải lỗi đỏ: khách đã gửi yêu cầu này rồi.
        if (flow.isDuplicate(error)) {
          setDuplicate(true);
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
  }, [errorMessage, flow, form, otp, setDuplicate, setError, setOtpPhone, setStep, t]);

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

  /** Ba nhánh KẾT THÚC dùng chung một màn kết quả — hai trong số đó không phải lỗi. */
  if (state.duplicate || state.step === REQUEST_STEP.DONE) {
    return (
      <RequestResultStep
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
            quote={quote.data ?? null}
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
            size="lg"
            loading={flow.availability.isPending || otp.sending}
            onPress={() => void continueFromTrip()}
          />
        ) : null}

        {state.step === REQUEST_STEP.REVIEW ? (
          <XStack gap={space.sm}>
            <YStack f={1}>
              <Button
                label={tCommon('back')}
                variant="secondary"
                size="lg"
                onPress={() => backToTrip()}
              />
            </YStack>
            <YStack f={1}>
              <Button
                label={t('actions.submit')}
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
              listing={listing}
              rentalMode={rentalMode}
              accountPhoneVerified={flow.accountPhoneVerified}
            />
          ) : null}

          {/* Bảng giá đầy đủ CHỈ ở bước Chuyến đi — bước Xác nhận đã có bảng giá riêng. */}
          {state.step === REQUEST_STEP.TRIP ? (
            <BookingPriceSummary
              listing={listing}
              serviceType={serviceType}
              routeType={routeType}
              quote={quote.data ?? null}
              quoteLoading={quote.isPending && quoteParams !== null}
              hasSelection={quoteParams !== null}
              isDelivery={deliveryRequested}
              variant="detail"
              expanded={priceExpanded}
              onExpandedChange={setPriceExpanded}
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
              <YStack f={1} h={2} br={radius.pill} bg={active ? colors.primary : colors.border} />
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
