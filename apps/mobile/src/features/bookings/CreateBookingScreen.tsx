import { useMemo, useState } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import {
  API_ERROR_CODE,
  LONG_TERM_PACKAGE_MONTHS,
  longTermReturnAt,
  PERMISSION,
  PRICE_ROW,
  ROUTE_TYPE,
  ROUTE_TYPE_DESCRIPTION,
  ROUTE_TYPE_VALUES,
  SERVICE_TYPE,
  SERVICE_TYPE_VALUES,
  VN_PHONE_PATTERN,
  type LongTermPackageMonths,
  type RouteType,
  type ServiceType,
} from '@xeprime/types';
import { STALE_TIME } from '@xeprime/api-client';
import { dayjs, type Dayjs, type RentalMode } from '@xeprime/domain';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataRow } from '@/components/ui/DataRow';
import { InlineAction } from '@/components/ui/InlineAction';
import { MomentPickerSheet } from '@/components/ui/MomentPickerSheet';
import { MoneyField } from '@/components/ui/MoneyField';
import { PriceBreakdown } from '@/components/ui/PriceBreakdown';
import { SelectControl } from '@/components/ui/SelectControl';
import { SelectField } from '@/components/ui/SelectField';
import { StatusIcon, STATUS_TONE } from '@/components/ui/StatusIcon';
import { Skeleton } from '@/components/ui/Skeleton';
import { TextField } from '@/components/ui/TextField';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { RentalRangeSheet } from '@/features/marketplace/components/RentalRangeSheet';
import { getErrorCode } from '@/lib/api-client';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { queryKeys } from '@/queries/query-keys';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import { VehiclePickerSheet } from './components/VehiclePickerSheet';
import { useListing } from '@/features/marketplace/hooks/use-marketplace-data';
import { useCheckConflict, useCreateBooking } from './hooks/use-bookings';
import { bookingsApi } from './api';
import type { CreateBookingInput, VehicleListItem } from './api';

const NOTE_MAX = 2000;

/** Hai hình thức nhận xe — gương `PICKUP_METHOD` của web. */
const PICKUP_SELF = 'self';
const PICKUP_DELIVERY = 'delivery';

/** Ba bước, đúng bộ của web. `vehicle` là bước 0 và chỉ có khi vào màn chưa biết xe. */
const STEP = {
  VEHICLE: 'vehicle',
  TIME: 'time',
  CONTACT: 'contact',
  REVIEW: 'review',
  DONE: 'done',
} as const;
type Step = (typeof STEP)[keyof typeof STEP];

type StaffBookingValues = yup.InferType<ReturnType<typeof buildSchema>>;

function buildSchema(labels: { name: string; phone: string; address: string }) {
  return yup.object({
    customerName: yup.string().trim().required(labels.name).max(255),
    customerPhone: yup
      .string()
      .trim()
      .required(labels.phone)
      .matches(VN_PHONE_PATTERN, labels.phone),
    /** Đúng bộ giá trị của web (`PICKUP_METHOD`): khách tự tới, hay gian hàng mang xe đi. */
    pickupMethod: yup.string().oneOf([PICKUP_SELF, PICKUP_DELIVERY]).default(PICKUP_SELF),
    deliveryAddress: yup
      .string()
      .trim()
      .default('')
      .when('pickupMethod', {
        is: PICKUP_DELIVERY,
        then: (s) => s.required(labels.address).max(500),
      }),
    /*
     * Hành trình chuyến CÓ TÀI XẾ. Dịch vụ nằm ở state component nên vào schema qua yup CONTEXT
     * (`$serviceType`), cùng bộ luật với luồng của khách: with_driver bắt buộc địa chỉ đón, liên
     * tỉnh bắt buộc điểm đến.
     */
    routeType: yup.string().oneOf(ROUTE_TYPE_VALUES).default(ROUTE_TYPE.IN_CITY),
    pickupAddress: yup
      .string()
      .trim()
      .default('')
      .when('$serviceType', {
        is: SERVICE_TYPE.WITH_DRIVER,
        then: (s) => s.required(labels.address).max(500),
      }),
    destination: yup
      .string()
      .trim()
      .default('')
      .when(['routeType', '$serviceType'], {
        is: (routeType: string, serviceType: string) =>
          serviceType === SERVICE_TYPE.WITH_DRIVER && routeType !== ROUTE_TYPE.IN_CITY,
        then: (s) => s.required(labels.address).max(500),
      }),
    note: yup.string().trim().max(NOTE_MAX).default(''),
    /** CHỈ dùng khi server không báo giá được — xe chưa cấu hình giá. */
    manualBaseAmount: yup.number().min(0).nullable().default(null),
    manualDepositAmount: yup.number().min(0).nullable().default(null),
  });
}

/**
 * Đặt xe cho khách tại quầy — bản native của `StaffBookingFlow`.
 *
 * Cùng hình thái với luồng thuê của khách (chọn xe → thời gian → khách → xác nhận), khác đúng
 * hai điều:
 *
 * - **KHÔNG có OTP, không có điều khoản**: người thao tác là nhân viên đã đăng nhập, khách được
 *   nhập hộ;
 * - gửi xong là **ĐƠN THẬT** (`POST /bookings`, trạng thái `reserved`, giữ chỗ ngay trong cùng
 *   transaction — ADR 0006), không phải một yêu cầu chờ chính mình duyệt lại.
 *
 * **Tiền đến từ SERVER, không phải từ ô nhập.** Giá có bậc cuối tuần, ngày lễ, giá riêng theo
 * ngày và ưu đãi cam kết thời hạn, nên mọi con số gõ tay đều khác con số khách thấy ở chợ. Báo
 * giá lấy từ `/calendar/quote` — CÙNG `PricingService` với báo giá công khai. Xe chưa cấu hình
 * giá thì server trả 400; đó là trạng thái HỢP LỆ và bước xác nhận mới rơi về ô nhập tay, kèm
 * chặn không cho tạo đơn 0đ âm thầm.
 */
export function CreateBookingScreen() {
  const t = useTranslations('Bookings.staffBooking');
  const tCreate = useTranslations('Bookings.create');
  const router = useRouter();
  const permissions = usePermissions();

  const back = () => goBackOr(router, ROUTES.manage.bookings());

  if (!permissions.isLoading && !permissions.has(PERMISSION.BOOKING_CREATE)) {
    return (
      <>
        <AppHeader title={t('title')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage icon="lock-closed-outline" title={tCreate('permissionDenied')} />
        </Screen>
      </>
    );
  }

  return <StaffBookingFlow onBack={back} />;
}

function StaffBookingFlow({ onBack }: { onBack: () => void }) {
  const t = useTranslations('Bookings.staffBooking');
  const tCreate = useTranslations('Bookings.create');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const router = useRouter();

  const [step, setStep] = useState<Step>(STEP.VEHICLE);
  const [vehicle, setVehicle] = useState<VehicleListItem | null>(null);
  const [picking, setPicking] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  /** Tấm chọn MỘT MỐC — chỉ dùng cho đơn dài hạn, nơi không có ngày trả để chọn. */
  const [pickingPickup, setPickingPickup] = useState(false);
  const [rentalMode, setRentalMode] = useState<RentalMode>('daily');
  const [serviceType, setServiceType] = useState<ServiceType>(SERVICE_TYPE.SELF_DRIVE);
  const [packageMonths, setPackageMonths] = useState<LongTermPackageMonths | null>(null);
  const [range, setRange] = useState<{ pickupAt: Dayjs | null; returnAt: Dayjs | null }>({
    pickupAt: null,
    returnAt: null,
  });
  const [stepError, setStepError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; code: string } | null>(null);

  const schema = useMemo(
    () =>
      buildSchema({
        name: tCreate('customer.nameLabel'),
        phone: tCreate('customer.phoneLabel'),
        address: t('deliveryAddressLabel'),
      }),
    [t, tCreate],
  );

  const { control, trigger, getValues } = useForm<StaffBookingValues>({
    resolver: yupResolver(schema),
    context: { serviceType },
    defaultValues: {
      customerName: '',
      customerPhone: '',
      pickupMethod: PICKUP_SELF,
      deliveryAddress: '',
      routeType: ROUTE_TYPE.IN_CITY,
      pickupAddress: '',
      destination: '',
      note: '',
      manualBaseAmount: null,
      manualDepositAmount: null,
    },
  });

  const [routeType, pickupMethod] = useWatch({
    control,
    name: ['routeType', 'pickupMethod'],
  });

  const isWithDriver = serviceType === SERVICE_TYPE.WITH_DRIVER;
  const isLongTerm = serviceType === SERVICE_TYPE.LONG_TERM;
  /* Chuyến có tài xế: xe đến ĐÓN khách — "giao xe tận nơi" không có nghĩa. */
  const isDelivery = !isWithDriver && pickupMethod === PICKUP_DELIVERY;

  /** Ngày trả suy từ gói — chỉ để HIỂN THỊ; con số ghi vào đơn do server tính lại (ADR 0011). */
  const derivedReturnAt =
    isLongTerm && packageMonths != null && range.pickupAt
      ? dayjs(longTermReturnAt(range.pickupAt.toDate(), packageMonths))
      : null;

  const hasRange = isLongTerm
    ? Boolean(range.pickupAt && packageMonths != null)
    : Boolean(range.pickupAt && range.returnAt && range.returnAt.isAfter(range.pickupAt));

  /*
   * Báo giá NỘI BỘ — cùng hàm với báo giá công khai, nên nhân viên và khách thấy đúng một con số
   * cho cùng một gói. `retry: false` vì 400 (xe chưa có giá) là câu trả lời, không phải sự cố.
   */
  const quoteParams = useMemo(() => {
    if (!vehicle || !hasRange) return null;
    if (isLongTerm) {
      return { vehicleId: vehicle.id, serviceType, packageMonths: packageMonths as number };
    }
    return {
      vehicleId: vehicle.id,
      serviceType,
      pickupAt: range.pickupAt!.toISOString(),
      returnAt: range.returnAt!.toISOString(),
      ...(isWithDriver ? { routeType } : {}),
    };
  }, [vehicle, hasRange, isLongTerm, serviceType, packageMonths, range, isWithDriver, routeType]);

  const quoteQuery = useQuery({
    queryKey: queryKeys.bookings.quote(quoteParams ?? {}),
    queryFn: () => bookingsApi.quote(quoteParams!),
    enabled: quoteParams != null,
    staleTime: STALE_TIME.STANDARD,
    retry: false,
  });
  const quote = quoteQuery.data ?? null;
  const quoteUnavailable = hasRange && quoteQuery.isError;

  /*
   * Câu "tiết kiệm được bao nhiêu nhờ ưu đãi thời hạn" — chỉ có với báo giá GÓI dài hạn, và chỉ
   * khi gói đó thật sự có ưu đãi. Con số do server tính, client không nhân trừ lại (ADR 0011).
   */
  const savingsNote = quote?.longTerm?.durationDiscountPercent
    ? t('quoteSavings', {
        amount: fmt.money(quote.longTerm.durationDiscountAmount),
        package: fmt.packageLabel(quote.longTerm.packageMonths) ?? '',
      })
    : null;

  /*
   * Hồ sơ công khai của xe — chỉ để biết xe PHỤC VỤ những dịch vụ nào. Xe nội bộ không có hồ sơ
   * công khai; 404 ở đây là trạng thái hợp lệ, không phải lỗi, nên `retry: false`.
   */
  const listingQuery = useListing(vehicle?.id ?? '');
  const vehicleServices: string[] = vehicle ? (listingQuery.data?.serviceTypes ?? []) : [];

  /*
   * Xe không phục vụ dịch vụ đang chọn (hồ sơ vừa về) → rơi về dịch vụ đầu tiên của xe.
   *
   * Điều chỉnh NGAY TRONG RENDER — mẫu "derived state" chính tắc, không `setState` trong effect.
   * Thiếu bước này thì nhân viên chọn được "Có tài xế" cho một chiếc xe chỉ cho tự lái, và cái
   * sai đó chỉ lộ ra lúc bấm Tạo đơn.
   */
  if (vehicleServices.length > 0 && !vehicleServices.includes(serviceType)) {
    setServiceType(vehicleServices[0] as ServiceType);
  }

  const checkConflict = useCheckConflict();
  const create = useCreateBooking();

  function continueFromTime() {
    setStepError(null);
    if (!vehicle || !range.pickupAt) return;
    if (isLongTerm && packageMonths == null) {
      setStepError(t('packageRequired'));
      return;
    }

    /*
     * Kiểm trùng lịch trên KHOẢNG SẼ CHIẾM — với đơn dài hạn đó là [nhận, nhận + gói tháng lịch).
     * Đây là PREVIEW cho UX; chốt chặn thật là exclusion constraint lúc ghi (ADR 0006).
     */
    const endAt = (derivedReturnAt ?? range.returnAt)?.toISOString();
    if (!endAt) return;

    checkConflict.mutate(
      { vehicleId: vehicle.id, startAt: range.pickupAt.toISOString(), endAt },
      {
        onSuccess: (result) => {
          if (result.hasConflict) setStepError(t('conflict'));
          else setStep(STEP.CONTACT);
        },
        onError: (error) => setStepError(errorMessage(error)),
      },
    );
  }

  async function continueFromContact() {
    setStepError(null);
    const fields = isWithDriver
      ? (['customerName', 'customerPhone', 'pickupAddress', 'destination'] as const)
      : (['customerName', 'customerPhone', 'deliveryAddress'] as const);
    if (await trigger([...fields])) setStep(STEP.REVIEW);
  }

  async function submit() {
    setStepError(null);
    if (!vehicle || !range.pickupAt) return;

    // Không có báo giá server thì tiền thuê nhập tay là BẮT BUỘC — không tạo đơn 0đ âm thầm.
    if (quoteUnavailable) {
      if (!(await trigger(['manualBaseAmount']))) return;
      if (getValues('manualBaseAmount') == null) {
        setStepError(t('manualBaseRequired'));
        return;
      }
    }

    const v = getValues();
    const discountRow = rowAmount(quote, PRICE_ROW.DISCOUNT);
    const deliveryLine = isDelivery ? `${t('deliveryLabel')}: ${v.deliveryAddress}` : '';
    const note = [deliveryLine, v.note].filter(Boolean).join('\n');

    create.mutate(
      {
        vehicleId: vehicle.id,
        customerName: v.customerName,
        customerPhone: v.customerPhone,
        serviceType,
        ...(isWithDriver
          ? {
              routeType: v.routeType,
              pickupAddress: v.pickupAddress,
              ...(v.routeType !== ROUTE_TYPE.IN_CITY ? { destination: v.destination } : {}),
            }
          : {}),
        pickupAt: range.pickupAt.toISOString(),
        // Dài hạn: KHÔNG gửi ngày trả — server suy từ gói bằng tháng lịch (ADR 0011).
        ...(isLongTerm
          ? { longTermPackageMonths: packageMonths ?? undefined }
          : { returnAt: range.returnAt!.toISOString() }),
        // Tiền từ báo giá server; giảm giá là dòng ÂM trong bảng giá → tách về dương.
        baseAmount: quote
          ? (rowAmount(quote, PRICE_ROW.BASE) ?? quote.totalAmount)
          : String(v.manualBaseAmount ?? 0),
        discountAmount: discountRow ? discountRow.replace('-', '') : '0',
        // Giao tận nơi phí 0 lúc tạo — chủ xe chốt phí đã thoả thuận sau.
        deliveryFee: '0',
        depositAmount: quote ? quote.depositAmount : String(v.manualDepositAmount ?? 0),
        ...(note ? { note } : {}),
      } as CreateBookingInput,
      {
        onSuccess: (booking) => {
          setCreated({ id: booking.id, code: booking.code });
          setStep(STEP.DONE);
        },
        onError: (error) => {
          if (getErrorCode(error) === API_ERROR_CODE.BOOKING_SCHEDULE_CONFLICT) {
            setStepError(t('conflictOnCreate'));
            return;
          }
          toast.showError(errorMessage(error));
        },
      },
    );
  }

  // Bước 0: chọn xe
  if (step === STEP.VEHICLE) {
    return (
      <>
        <AppHeader title={t('pickVehicle')} onBack={onBack} />
        <Screen edges={['left', 'right', 'bottom']}>
          <Button
            label={tCreate('vehicle.searchLabel')}
            icon="car-outline"
            onPress={() => setPicking(true)}
          />
        </Screen>

        <VehiclePickerSheet
          open={picking}
          onClose={() => setPicking(false)}
          selectedId={vehicle?.id ?? null}
          onSelect={(picked) => {
            setVehicle(picked);
            setPicking(false);
            setStep(STEP.TIME);
          }}
        />
      </>
    );
  }

  // Bước cuối: kết quả
  if (step === STEP.DONE && created) {
    const returnAt = derivedReturnAt ?? range.returnAt;

    return (
      <>
        {/*
          Thanh trên giữ tên LUỒNG ("Đặt xe cho khách"), không đổi thành "Đã tạo đơn thuê" —
          đúng như web. Câu báo thành công là nội dung của màn; để nó ở cả hai chỗ thì người đọc
          gặp cùng một dòng hai lần mà không thêm được gì.
        */}
        <AppHeader title={t('title')} onBack={onBack} />
        <Screen edges={['left', 'right', 'bottom']}>
          <YStack ai="center" gap={layout.section} pt={layout.section}>
            {/*
              CÙNG hình với màn "đã gửi yêu cầu" của khách (`RequestResultStep`): một khối nền
              xanh nhạt ôm trọn huy hiệu, tiêu đề, mã đơn và câu giải thích.

              Dùng lại `StatusIcon` thay vì tự vẽ một vòng tròn: nó là đĩa ĐẶC + glyph trắng +
              quầng nhạt — đúng hình `.doneBadge` của web, và đã có sẵn. Tự vẽ lại là bản thứ
              hai của cùng một huy hiệu, và hai bản đó trôi khỏi nhau ở lần sửa đầu tiên.
            */}
            <YStack
              alignSelf="stretch"
              ai="center"
              gap={space.md}
              p={space.lg}
              br={radius.lg}
              bg={colors.successSurface}
            >
              <StatusIcon icon="checkmark" tone={STATUS_TONE.SUCCESS} />

              <YStack ai="center" gap={space.xs}>
                <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.bold} ta="center">
                  {t('doneTitle')}
                </Text>
                {/*
                  Mã đơn và câu giải thích CÙNG cỡ, cùng màu: chúng là hai dòng phụ trợ ngang
                  hàng nhau. Cho một trong hai to hơn là nó tranh chỗ với tiêu đề.
                */}
                <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center">
                  {t('doneCodeLabel')} {created.code}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center">
                  {t('doneHeld')}
                </Text>
              </YStack>
            </YStack>

            {/*
              Tóm tắt đúng bộ web liệt kê: xe · khách · thời gian · dịch vụ · tổng tiền. Đây là
              lần cuối những con số này nằm cạnh nhau trước khi tản vào màn chi tiết đơn.
            */}
            <YStack alignSelf="stretch">
              <Card>
                <YStack gap={space.sm}>
                  <DataRow label={t('doneVehicle')} value={vehicle?.name ?? '—'} />
                  {/*
                    Tên và số ghép MỘT dòng bằng dấu "·" như web, không tách số xuống dòng phụ:
                    ở đây chúng là một danh tính, không phải hai dữ kiện.
                  */}
                  <DataRow
                    label={t('doneCustomer')}
                    value={[getValues('customerName'), getValues('customerPhone')]
                      .filter(Boolean)
                      .join(' · ')}
                  />
                  {/*
                    Mốc GỌN (`10:00 · 03/09`) chứ không phải mốc đầy đủ: khoảng thuê có hai đầu,
                    và hai mốc đầy đủ trên màn dọc thì tự xuống ba dòng.
                  */}
                  <DataRow
                    label={t('doneSchedule')}
                    value={fmt.shortDateTimeRange(
                      range.pickupAt?.toISOString(),
                      returnAt?.toISOString(),
                    )}
                  />
                  <DataRow
                    label={t('doneService')}
                    value={domainLabel('serviceType', serviceType)}
                    {...(isWithDriver && getValues('pickupAddress')
                      ? { valueHint: getValues('pickupAddress') }
                      : {})}
                  />
                  {quote ? (
                    <DataRow
                      label={t('doneTotal')}
                      value={fmt.money(quote.totalAmount)}
                      tone="price"
                      strong
                    />
                  ) : null}
                </YStack>
              </Card>
            </YStack>

            <YStack alignSelf="stretch" gap={space.sm}>
              <Button
                label={t('viewBooking')}
                size="lg"
                onPress={() => router.replace(ROUTES.manage.bookingDetail(created.id))}
              />
              {/*
                Nút phụ để `ghost` — cùng cách màn kết quả của khách dựng lối phụ: đây là lối
                RỜI màn, không phải một lựa chọn ngang hàng với "mở đơn vừa tạo".
              */}
              <Button label={t('close')} variant="ghost" onPress={onBack} />
            </YStack>
          </YStack>
        </Screen>
      </>
    );
  }

  const serviceOptions = (vehicleServices.length > 0 ? vehicleServices : SERVICE_TYPE_VALUES).map(
    (value) => ({ value, label: domainLabel('serviceType', value) }),
  );

  return (
    <>
      <AppHeader title={t('title')} subtitle={vehicle?.name} onBack={onBack} />
      <Screen edges={['left', 'right', 'bottom']}>
        <YStack gap={layout.section}>
          <StepBar step={step} />

          {step === STEP.TIME ? (
            <YStack gap={layout.section}>
              <Card>
                <YStack gap={space.xs}>
                  <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                    {vehicle?.name}
                  </Text>
                  <Button
                    label={t('changeVehicle')}
                    variant="secondary"
                    size="sm"
                    block={false}
                    onPress={() => setStep(STEP.VEHICLE)}
                  />
                </YStack>
              </Card>

              {/*
                Dịch vụ do NHÂN VIÊN chọn, nhưng chỉ trong những gì XE phục vụ. Một dịch vụ thì
                không hỏi — như web, hàng chọn tự ẩn.
              */}
              {serviceOptions.length > 1 ? (
                <SelectControl
                  label={t('serviceLabel')}
                  value={serviceType}
                  options={serviceOptions}
                  onChange={(next) => setServiceType(next as ServiceType)}
                  required
                />
              ) : null}

              {/*
                Lộ trình đứng ở bước THỜI GIAN, không phải bước Khách: nó là một chiều của GIÁ
                (liên tỉnh khác nội thành), nên phải chốt trước khi xem báo giá.
              */}
              {isWithDriver ? (
                <SelectField
                  control={control}
                  name="routeType"
                  label={t('routeLabel')}
                  options={ROUTE_TYPE_VALUES.map((value) => ({
                    value,
                    label: domainLabel('routeType', value),
                    hint: ROUTE_TYPE_DESCRIPTION[value],
                  }))}
                  hint={ROUTE_TYPE_DESCRIPTION[routeType as RouteType]}
                  required
                />
              ) : null}

              {/*
                Đơn DÀI HẠN không có ô ngày trả: độ dài cố định theo gói, server suy ngày trả
                bằng tháng lịch (ADR 0011). Nhân viên chỉ chốt giờ nhận.
              */}
              {isLongTerm ? (
                <SelectControl
                  label={t('packageLabel')}
                  value={packageMonths == null ? null : String(packageMonths)}
                  options={LONG_TERM_PACKAGE_MONTHS.map((months) => ({
                    value: String(months),
                    label: fmt.packageLabel(months) ?? String(months),
                  }))}
                  onChange={(next) => {
                    setPackageMonths(Number(next) as LongTermPackageMonths);
                    setStepError(null);
                  }}
                  {...(packageMonths == null ? { hint: t('packageHint') } : {})}
                  required
                />
              ) : null}

              {/*
                Đơn DÀI HẠN chỉ hỏi GIỜ NHẬN — độ dài do gói quyết, ngày trả server suy bằng
                tháng lịch (ADR 0011). Mở lịch chọn KHOẢNG ở đây là mời nhân viên chốt một ngày
                trả mà hệ thống sẽ bỏ đi, và con số họ vừa chọn không khớp gói khách mua.

                Các dịch vụ còn lại thì ngược lại: khoảng thuê là thứ họ phải chốt.
              */}
              {isLongTerm ? (
                <YStack gap={space.xs}>
                  <Text col={colors.textMuted} fos={fontSize.bodySm} fow={fontWeight.medium}>
                    {t('pickupAtLabel')}
                  </Text>
                  <Card
                    onPress={() => setPickingPickup(true)}
                    accessibilityLabel={t('pickupAtField')}
                  >
                    <YStack gap={2}>
                      <Text col={colors.textMuted} fos={fontSize.label}>
                        {t('pickupAtField')}
                      </Text>
                      <Text
                        col={range.pickupAt ? colors.text : colors.placeholder}
                        fos={fontSize.body}
                        fow={fontWeight.medium}
                      >
                        {range.pickupAt ? fmt.rentalPoint(range.pickupAt) : t('pickupAtEmpty')}
                      </Text>
                    </YStack>
                  </Card>
                  <Text col={colors.textMuted} fos={fontSize.label}>
                    {derivedReturnAt
                      ? t('derivedReturn', { value: fmt.rentalPoint(derivedReturnAt) })
                      : t('derivedReturnEmpty')}
                  </Text>
                </YStack>
              ) : (
                <YStack gap={space.xs}>
                  <Text col={colors.textMuted} fos={fontSize.bodySm} fow={fontWeight.medium}>
                    {t('scheduleLabel')}
                  </Text>
                  <Card
                    onPress={() => setScheduling(true)}
                    accessibilityLabel={tCreate('schedule.pick')}
                  >
                    <Text
                      col={range.pickupAt && range.returnAt ? colors.text : colors.placeholder}
                      fos={fontSize.body}
                      fow={fontWeight.medium}
                    >
                      {range.pickupAt && range.returnAt
                        ? `${fmt.rentalPoint(range.pickupAt)} – ${fmt.rentalPoint(range.returnAt)}`
                        : tCreate('schedule.empty')}
                    </Text>
                  </Card>
                </YStack>
              )}

              {/*
                Báo giá hiện NGAY ở bước này, không đợi tới bước Xác nhận — đúng như web.
                Nhân viên đang ngồi trước mặt khách, và câu hỏi đầu tiên luôn là "bao nhiêu";
                bắt đi qua hai bước nhập liệu nữa mới thấy giá là bắt họ đoán.
              */}
              {hasRange ? (
                quoteQuery.isPending ? (
                  <Skeleton height={160} />
                ) : quote ? (
                  <PriceBreakdown
                    rows={quote.rows}
                    totalAmount={quote.totalAmount}
                    {...(quote.estimateNote ? { totalLabel: t('quoteEstimate') } : {})}
                    depositAmount={quote.depositAmount}
                    title={t('quoteTitle')}
                    {...(savingsNote || quote.estimateNote
                      ? {
                          footer: (
                            <YStack gap={2}>
                              {savingsNote ? (
                                <Text
                                  col={colors.discount}
                                  fos={fontSize.bodySm}
                                  fow={fontWeight.semibold}
                                >
                                  {savingsNote}
                                </Text>
                              ) : null}
                              {quote.estimateNote ? (
                                <Text col={colors.textMuted} fos={fontSize.label}>
                                  {quote.estimateNote}
                                </Text>
                              ) : null}
                            </YStack>
                          ),
                        }
                      : {})}
                  />
                ) : (
                  <InfoNote>{t('quoteUnavailableAtTime')}</InfoNote>
                )
              ) : null}

              {stepError ? <ErrorNote>{stepError}</ErrorNote> : null}

              <Button
                label={checkConflict.isPending ? t('checking') : t('continue')}
                size="lg"
                disabled={!hasRange || checkConflict.isPending}
                onPress={continueFromTime}
              />
              <Button label={t('cancel')} variant="ghost" onPress={onBack} />
            </YStack>
          ) : null}

          {step === STEP.CONTACT ? (
            <YStack gap={layout.section}>
              {/*
                Nhắc lại khoảng thời gian vừa chốt kèm lối quay lại: bước này không hiện lịch,
                nên không có dòng này thì nhân viên phải lui ra mới kiểm được mình chọn đúng chưa.
              */}
              <XStack ai="center" jc="space-between" gap={space.sm}>
                <Text f={1} col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={1}>
                  {range.pickupAt ? fmt.rentalPoint(range.pickupAt) : '—'} →{' '}
                  {(derivedReturnAt ?? range.returnAt)
                    ? fmt.rentalPoint((derivedReturnAt ?? range.returnAt) as Dayjs)
                    : '—'}
                </Text>
                <InlineAction label={t('changeTime')} onPress={() => setStep(STEP.TIME)} />
              </XStack>

              <TextField
                control={control}
                name="customerName"
                label={tCreate('customer.nameLabel')}
                placeholder={tCreate('customer.namePlaceholder')}
                required
              />
              <TextField
                control={control}
                name="customerPhone"
                label={tCreate('customer.phoneLabel')}
                placeholder={tCreate('customer.phonePlaceholder')}
                keyboardType="phone-pad"
                required
              />

              {isWithDriver ? (
                <>
                  <TextField
                    control={control}
                    name="pickupAddress"
                    label={t('pickupAddressLabel')}
                    placeholder={t('deliveryAddressPlaceholder')}
                    required
                  />
                  {routeType !== ROUTE_TYPE.IN_CITY ? (
                    <TextField
                      control={control}
                      name="destination"
                      label={t('destinationLabel')}
                      required
                    />
                  ) : null}
                  {/* Lộ trình đã chốt ở bước Thời gian vì nó vào giá — đây chỉ nhắc lại. */}
                  <Text col={colors.textMuted} fos={fontSize.label}>
                    {t('routeNote', { route: domainLabel('routeType', routeType as RouteType) })}
                  </Text>
                </>
              ) : (
                <>
                  {/*
                    Hình thức nhận xe là MỘT lựa chọn hai giá trị — dùng menu, không phải một
                    công tắc: "Nhận tại điểm hẹn" và "Giao xe tận nơi" là hai việc khác nhau,
                    và mỗi cái cần một câu giải thích mà công tắc không có chỗ để chở.
                  */}
                  <SelectField
                    control={control}
                    name="pickupMethod"
                    label={t('pickupMethodLabel')}
                    options={[
                      { value: PICKUP_SELF, label: t('pickupSelf'), hint: t('pickupSelfHint') },
                      {
                        value: PICKUP_DELIVERY,
                        label: t('pickupDelivery'),
                        hint: t('pickupDeliveryHint'),
                      },
                    ]}
                    required
                  />
                  {isDelivery ? (
                    <TextField
                      control={control}
                      name="deliveryAddress"
                      label={t('deliveryAddressLabel')}
                      placeholder={t('deliveryAddressPlaceholder')}
                      required
                    />
                  ) : null}
                </>
              )}

              <TextField
                control={control}
                name="note"
                label={tCreate('customer.noteLabel')}
                placeholder={tCreate('customer.notePlaceholder')}
                multiline
                rows={3}
                maxLength={NOTE_MAX}
              />

              {stepError ? <ErrorNote>{stepError}</ErrorNote> : null}

              <Button label={t('continue')} size="lg" onPress={() => void continueFromContact()} />
              <Button label={t('back')} variant="ghost" onPress={() => setStep(STEP.TIME)} />
            </YStack>
          ) : null}

          {step === STEP.REVIEW ? (
            <YStack gap={layout.section}>
              {quoteQuery.isPending && quoteParams ? (
                <Skeleton height={180} />
              ) : quote ? (
                <PriceBreakdown
                  rows={quote.rows}
                  totalAmount={quote.totalAmount}
                  depositAmount={quote.depositAmount}
                  title={tCreate('price.title')}
                />
              ) : (
                /*
                  Xe chưa cấu hình giá — server 400. Đây là trạng thái hợp lệ, KHÔNG phải lỗi:
                  rơi về nhập tay, và tiền thuê thành bắt buộc để không đẻ ra đơn 0đ.
                */
                <YStack gap={space.md}>
                  <ErrorNote>{t('quoteUnavailable')}</ErrorNote>
                  <MoneyField
                    control={control}
                    name="manualBaseAmount"
                    label={tCreate('price.baseAmount')}
                    required
                  />
                  <MoneyField
                    control={control}
                    name="manualDepositAmount"
                    label={tCreate('price.depositAmount')}
                    hint={tCreate('price.depositHint')}
                  />
                </YStack>
              )}

              {isDelivery ? (
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {t('deliveryFeeNote')}
                </Text>
              ) : null}

              {stepError ? <ErrorNote>{stepError}</ErrorNote> : null}

              <Button
                label={t('submit')}
                size="lg"
                loading={create.isPending}
                onPress={() => void submit()}
              />
              <Button label={t('back')} variant="ghost" onPress={() => setStep(STEP.CONTACT)} />
            </YStack>
          ) : null}
        </YStack>
      </Screen>

      {/*
        Không chặn hai đầu: đơn đặt trước cho tuần sau là chuyện thường, và web cũng không chặn.
        Khác hẳn tấm chọn của biên bản bàn giao, vốn ghi việc ĐÃ xảy ra.
      */}
      {pickingPickup ? (
        <MomentPickerSheet
          open
          onClose={() => setPickingPickup(false)}
          value={range.pickupAt ?? dayjs()}
          onChange={(next) => setRange({ pickupAt: next, returnAt: null })}
          title={t('pickupAtField')}
        />
      ) : null}

      <RentalRangeSheet
        open={scheduling}
        value={range}
        mode={rentalMode}
        onChange={setRange}
        onModeChange={setRentalMode}
        onApply={() => setScheduling(false)}
        onCancel={() => setScheduling(false)}
      />

      <VehiclePickerSheet
        open={picking}
        onClose={() => setPicking(false)}
        selectedId={vehicle?.id ?? null}
        onSelect={(picked) => {
          setVehicle(picked);
          setPicking(false);
        }}
      />
    </>
  );
}

/** Số tiền của MỘT dòng trong bảng giá server. Không có dòng đó thì `null`, không phải `0`. */
function rowAmount(
  quote: { rows: readonly { key: string; amount: string }[] } | null,
  key: string,
): string | null {
  return quote?.rows.find((row) => row.key === key)?.amount ?? null;
}

function StepBar({ step }: { step: Step }) {
  const t = useTranslations('Bookings.staffBooking.steps');
  const order: readonly Step[] = [STEP.TIME, STEP.CONTACT, STEP.REVIEW];
  const current = order.indexOf(step);

  return (
    <XStack gap={space.xs}>
      {order.map((key, index) => (
        <YStack
          key={key}
          f={1}
          gap={2}
          py={space.xs}
          borderTopWidth={2}
          borderColor={index <= current ? colors.primary : colors.borderSubtle}
        >
          <Text
            col={index <= current ? colors.primaryActive : colors.textMuted}
            fos={fontSize.label}
            fow={index === current ? fontWeight.semibold : fontWeight.regular}
          >
            {t(key === STEP.TIME ? 'time' : key === STEP.CONTACT ? 'contact' : 'review')}
          </Text>
        </YStack>
      ))}
    </XStack>
  );
}

/** Thông báo trung tính — dùng cho tình huống HỢP LỆ mà người dùng cần biết trước. */
function InfoNote({ children }: { children: string }) {
  return (
    <YStack bg={colors.infoSurface} p={space.md} br={radius.md}>
      <Text col={colors.text} fos={fontSize.bodySm}>
        {children}
      </Text>
    </YStack>
  );
}

function ErrorNote({ children }: { children: string }) {
  return (
    <YStack bg={colors.dangerSurface} p={space.md} br={radius.md}>
      <Text col={colors.danger} fos={fontSize.bodySm} accessibilityRole="alert">
        {children}
      </Text>
    </YStack>
  );
}
