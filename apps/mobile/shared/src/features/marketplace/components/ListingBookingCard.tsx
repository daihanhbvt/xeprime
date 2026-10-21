import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  addCalendarMonthsVn,
  COLLATERAL_MODE,
  PICKUP_PREFERENCE,
  PRICE_ROW,
  ROUTE_TYPE,
  DELIVERY_DISTANCE_STATUS,
  SERVICE_TYPE,
  type PublicListingDetail,
  type RouteType,
} from '@xeprime/types';
import {
  appWallClockToIso,
  dayjs,
  isZeroMoney,
  nowInAppTz,
  startOfAppDay,
  toAppTz,
  type Dayjs,
  type RentalMode,
} from '@xeprime/domain';
import { Card } from '@/components/ui/Card';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { DatePickerSheet } from '@/components/ui/DatePickerSheet';
import { TextField } from '@/components/ui/TextField';
import type { BookingRequestFormValues } from '@/features/booking-requests/booking-schema';
import { RenterAddressBlock } from '@/features/booking-requests/components/RenterAddressBlock';
import {
  DELIVERY_ADDRESS_NAMES,
  DELIVERY_PIN_NAMES,
  DeliveryEstimate,
  PICKUP_ADDRESS_NAMES,
  PICKUP_PIN_NAMES,
} from '@/features/booking-requests/components/RequestTripStep';
import { PromoPickerSheet, PromoStatusNote } from '@/features/promo-codes/PromoCodeField';
import { usePromoCode } from '@/features/promo-codes/use-promo-code';
import { readDeliveryAddress } from '@/lib/delivery-address-memory';
import { RangeFieldBox } from '@/components/ui/RangeFieldBox';
import { useCustomerCostView } from '@/features/booking-requests/hooks/use-customer-cost-view';
import { useFeeLineSublabel } from '@/components/ui/PriceBreakdown';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  useDeliveryDistance,
  usePublicQuote,
  useQuoteWithPromo,
  useVehicleBusyDays,
} from '@/features/booking-requests/hooks/use-booking-request-flow';
import { toQuoteParams } from '@/features/booking-requests/quote-params';
import { InsuranceOptions } from '@/features/booking-requests/components/InsuranceOptions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { rememberRentalRange } from '@/lib/rental-range-memory';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { RentalRangeSheet } from './RentalRangeSheet';
import { useDriverSurchargeLine } from '../hooks/use-driver-surcharge-line';

/*
 * Tab dịch vụ: THỨ TỰ và NHÃN cố định như web (`Listings.detail.booking.tabs`) — tự lái đọc là
 * "Thuê theo ngày", không dùng nhãn miền `serviceType`.
 */
const SERVICE_TABS = [
  { value: SERVICE_TYPE.SELF_DRIVE, key: 'selfDrive' },
  { value: SERVICE_TYPE.WITH_DRIVER, key: 'withDriver' },
  { value: SERVICE_TYPE.LONG_TERM, key: 'longTerm' },
] as const;

const ROUTE_OPTIONS = [ROUTE_TYPE.IN_CITY, ROUTE_TYPE.INTER_CITY, ROUTE_TYPE.INTER_CITY_ONE_WAY].map((value) => ({ value }));

/**
 * Chuyến khách đang cấu hình ngay trên trang xe — mang nguyên sang luồng gửi yêu cầu (bản native
 * của `RequestBookingPrefill` web #205). Giờ là chuỗi ISO, cùng định dạng form đặt xe lưu.
 */
export interface ListingTripDraft {
  serviceType: string;
  pickupAt: string | null;
  returnAt: string | null;
  rentalMode: RentalMode;
  routeType: RouteType;
  packageMonths: number | null;
  pickupPreference: string;
  /** Ngày cụ thể (YYYY-MM-DD) — như web, CHỈ hiển thị ở thẻ, không mang sang luồng. */
  requestedPickupDate: string;
  deliveryRequested: boolean;
  /** Địa chỉ giao xe khách đã xác nhận ở thẻ — `prefill.delivery` của web. */
  delivery: TripAddress | null;
  /** Địa chỉ đón khách (có tài xế) — web chỉ mang TỈNH của nó sang luồng. */
  driverPickup: TripAddress | null;
  /** Điểm đến — web giữ ở thẻ, không mang sang luồng. */
  destination: string;
  /** Mã khuyến mãi đang áp ở thẻ — chuỗi mã, không phải số giảm. */
  promoCode: string | null;
  /** Bảo hiểm MIC khách tích ở thẻ (#213) — đi vào báo giá, mã KM và luồng đặt xe. */
  vehicleProtectionSelected: boolean;
  personalAccidentSelected: boolean;
}

export interface TripAddress {
  addressLine: string;
  provinceCode: string | null;
  placeId: string | null;
  latitude: number | null;
  longitude: number | null;
}

type AddressSheet = 'delivery' | 'driver' | null;

/** Đọc một cụm địa chỉ đã xác nhận ra khỏi form địa chỉ cục bộ của thẻ. */
function readAddress(
  values: BookingRequestFormValues,
  kind: 'delivery' | 'pickup',
): TripAddress | null {
  const line = (
    kind === 'delivery' ? values.deliveryAddressLine : values.pickupAddressLine
  )?.trim();
  if (!line) return null;
  return kind === 'delivery'
    ? {
        addressLine: line,
        provinceCode: values.deliveryProvinceCode || null,
        placeId: values.deliveryPlaceId ?? null,
        latitude: values.deliveryLatitude ?? null,
        longitude: values.deliveryLongitude ?? null,
      }
    : {
        addressLine: line,
        provinceCode: values.pickupProvinceCode || null,
        placeId: values.pickupPlaceId ?? null,
        latitude: values.pickupLatitude ?? null,
        longitude: values.pickupLongitude ?? null,
      };
}

/**
 * Thẻ đặt xe của trang chi tiết — bản native của `ListingBookingCard` web (#205, Figma mobile
 * `19771:71482`): tab dịch vụ · lộ trình (có tài xế) · gói + nguyện vọng (dài hạn) · khoảng thuê ·
 * cách nhận xe · "Thành tiền".
 *
 * "Thành tiền" là BÁO GIÁ CỦA SERVER — cùng endpoint và tham số với luồng đặt xe, nên con số ở
 * đây là con số khách thấy khi gửi. Không có phép nhân nào ở client (giá cuối tuần/lễ, giữ chỗ
 * theo `fee_policies`, thuế, bảo hiểm là việc của server). Phí giao xe và mã khuyến mãi được tính
 * ở bước gửi yêu cầu, nơi khách nhập địa chỉ thật.
 */
export function ListingBookingCard({
  listing,
  trip,
  onChange,
  priceSlot,
}: {
  listing: PublicListingDetail;
  trip: ListingTripDraft;
  /** Vá một phần chuyến — nơi giữ state tự gộp vào bản MỚI NHẤT (effect gọi được an toàn). */
  onChange: (patch: Partial<ListingTripDraft>) => void;
  /** Giá NIÊM YẾT của dịch vụ đang chọn — đứng ngay dưới tab dịch vụ như bản vẽ. */
  priceSlot?: ReactNode;
}) {
  const t = useTranslations('Listings.detail.booking');
  const tFlow = useTranslations('BookingRequests.flow');
  const tModal = useTranslations('Listings.detail.deliveryModal');
  const fmt = useAppFormat();
  const colors = useColors();
  const domainLabel = useDomainLabel();
  const surchargeLine = useDriverSurchargeLine();
  // Như web: xe không khai dịch vụ nào coi như chỉ tự lái.
  const services: readonly string[] = listing.serviceTypes ?? [SERVICE_TYPE.SELF_DRIVE];
  const longTerm = trip.serviceType === SERVICE_TYPE.LONG_TERM;
  const withDriver = trip.serviceType === SERVICE_TYPE.WITH_DRIVER;
  const packages = listing.longTermPackages ?? [];

  const busyDays = useVehicleBusyDays(listing.id, !longTerm);
  const quoteParams = toQuoteParams({
    serviceType: trip.serviceType,
    longTermPackageMonths: trip.packageMonths,
    ...(trip.pickupAt ? { pickupAt: trip.pickupAt } : {}),
    ...(trip.returnAt ? { returnAt: trip.returnAt } : {}),
    routeType: withDriver ? trip.routeType : null,
    vehicleProtectionSelected: trip.vehicleProtectionSelected,
    personalAccidentSelected: trip.personalAccidentSelected,
  });
  const quote = usePublicQuote(listing.id, quoteParams);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<{ pickupAt: Dayjs | null; returnAt: Dayjs | null }>({
    pickupAt: trip.pickupAt ? toAppTz(trip.pickupAt) : null,
    returnAt: trip.returnAt ? toAppTz(trip.returnAt) : null,
  });

  /*
   * Ngày trả DỰ KIẾN = ngày nhận + N THÁNG LỊCH theo giờ VN — cùng hàm server dùng (ADR 0011), như
   * web: không phải `dayjs.add('month')` theo múi giờ máy. Chỉ để khách hình dung; ngày thật do
   * gian hàng chốt khi duyệt. Chưa chọn gói thì không có ngày để hứa.
   */
  const selectedMonths = trip.packageMonths;
  const expectedReturn = useMemo(() => {
    if (selectedMonths == null) return null;
    const start =
      trip.pickupPreference === PICKUP_PREFERENCE.SPECIFIC_DATE && trip.requestedPickupDate
        ? startOfAppDay(trip.requestedPickupDate)
        : nowInAppTz();
    return fmt.date(addCalendarMonthsVn(start.toDate(), selectedMonths).toISOString());
  }, [fmt, selectedMonths, trip.pickupPreference, trip.requestedPickupDate]);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);

  /*
   * Form địa chỉ CỤC BỘ của thẻ — để dùng lại đúng khối địa chỉ (gợi ý + ghim bản đồ) và ước
   * tính phí giao của luồng đặt xe thay vì dựng bản thứ hai. Như web, cả hai ô mở ra đã điền sẵn
   * địa chỉ giao xe lần trước.
   */
  const addressForm = useForm<BookingRequestFormValues>({
    defaultValues: {
      deliveryProvinceCode: '',
      deliveryWardCode: '',
      deliveryAddressLine: '',
      deliveryPlaceId: null,
      deliveryLatitude: null,
      deliveryLongitude: null,
      deliveryLocationSource: null,
      pickupProvinceCode: '',
      pickupWardCode: '',
      pickupAddressLine: '',
      pickupPlaceId: null,
      pickupLatitude: null,
      pickupLongitude: null,
      pickupLocationSource: null,
      destination: '',
    },
  });
  const [addressSheet, setAddressSheet] = useState<AddressSheet>(null);
  const [promoPickerOpen, setPromoPickerOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    void readDeliveryAddress().then((remembered) => {
      if (!alive || !remembered?.addressLine) return;
      const quiet = { shouldDirty: false } as const;
      addressForm.setValue('deliveryProvinceCode', remembered.provinceCode, quiet);
      addressForm.setValue('deliveryWardCode', remembered.wardCode, quiet);
      addressForm.setValue('deliveryAddressLine', remembered.addressLine, quiet);
      addressForm.setValue('deliveryPlaceId', remembered.placeId, quiet);
      addressForm.setValue('deliveryLatitude', remembered.latitude, quiet);
      addressForm.setValue('deliveryLongitude', remembered.longitude, quiet);
      addressForm.setValue('deliveryLocationSource', remembered.locationSource, quiet);
      addressForm.setValue('pickupProvinceCode', remembered.provinceCode, quiet);
      addressForm.setValue('pickupWardCode', remembered.wardCode, quiet);
      addressForm.setValue('pickupAddressLine', remembered.addressLine, quiet);
      addressForm.setValue('pickupPlaceId', remembered.placeId, quiet);
      addressForm.setValue('pickupLatitude', remembered.latitude, quiet);
      addressForm.setValue('pickupLongitude', remembered.longitude, quiet);
      addressForm.setValue('pickupLocationSource', remembered.locationSource, quiet);
      const values = addressForm.getValues();
      onChange({
        delivery: readAddress(values, 'delivery'),
        driverPickup: readAddress(values, 'pickup'),
      });
    });
    return () => {
      alive = false;
    };
    // Chạy một lần khi mở trang xe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function confirmAddress() {
    const values = addressForm.getValues();
    if (addressSheet === 'delivery') {
      onChange({ delivery: readAddress(values, 'delivery'), deliveryRequested: true });
    } else if (addressSheet === 'driver') {
      onChange({ driverPickup: readAddress(values, 'pickup') });
    }
    setAddressSheet(null);
  }

  const vehicleProvinceCode = listing.provinceCode ?? null;
  const vehicleProvinceName = listing.pickupPoint?.provinceName ?? listing.shopProvince ?? null;
  const vehiclePoint =
    listing.pickupPoint?.latitude != null && listing.pickupPoint.longitude != null
      ? { lat: listing.pickupPoint.latitude, lng: listing.pickupPoint.longitude }
      : null;

  /*
   * Mã khuyến mãi xét trên CHÍNH `quoteParams` của báo giá (cùng luật web + luồng đặt xe). Chuyến
   * không có khoản thu online thì ẩn ô áp mã (ADR 0046 điều 2).
   */
  const promoTrip = quoteParams ? { vehicleId: listing.id, ...quoteParams } : null;
  // Mã đang áp đi theo chuyến sang luồng gửi yêu cầu — báo lên NGAY lúc nó đổi, không qua effect.
  const promo = usePromoCode(promoTrip, { onCodeChange: (code) => onChange({ promoCode: code }) });
  const quoteWithPromo = useQuoteWithPromo(quote.data, promo.applied?.fees);
  const cost = useCustomerCostView({
    listing,
    breakdown: quoteWithPromo?.breakdown ?? null,
    isDelivery: !withDriver && trip.deliveryRequested,
  });
  /** Như web: chuyến không có khoản thu online (tạm tính / dài hạn chưa chốt) thì không có ô mã. */
  const promoAvailable = quote.data?.breakdown.fees?.holdAmount != null;
  const noLongTermPackage = longTerm && packages.length === 0;
  const tPrice = useTranslations('Common.components.price');
  const feeLineSublabel = useFeeLineSublabel();
  const surchargeRules = listing.driverSurchargeRules ?? [];
  const pickupAddress = listing.pickupPoint?.address || listing.shopProvince || null;

  const set = (patch: Partial<ListingTripDraft>) => onChange(patch);

  function applyRange() {
    if (!draft.pickupAt || !draft.returnAt) return;
    // Lựa chọn CHỦ ĐỘNG được nhớ cho lần sau — cùng `rememberRentalRange` của thẻ tìm kiếm.
    rememberRentalRange({ ...draft, mode: trip.rentalMode });
    set({
      pickupAt: appWallClockToIso(draft.pickupAt),
      returnAt: appWallClockToIso(draft.returnAt),
    });
    setSheetOpen(false);
  }

  return (
    <Card padded={false}>
      {services.length > 1 ? (
        <XStack h={50} bg={colors.background} borderBottomWidth={1} bc={colors.border}>
          {SERVICE_TABS.filter((tab) => services.includes(tab.value)).map((tab) => {
            const active = trip.serviceType === tab.value;
            return (
              <Pressable
                key={tab.value}
                style={{ flex: 1 }}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  if (!active) set({ serviceType: tab.value });
                }}
              >
                <YStack
                  f={1}
                  ai="center"
                  jc="center"
                  px={space.xs}
                  bg={active ? colors.surface : 'transparent'}
                  borderBottomWidth={2}
                  borderBottomColor={active ? colors.primaryHover : 'transparent'}
                >
                  <Text
                    col={active ? colors.primaryHover : colors.textMuted}
                    fos={fontSize.body}
                    fow={active ? fontWeight.semibold : fontWeight.medium}
                    numberOfLines={1}
                  >
                    {t(`tabs.${tab.key}`)}
                  </Text>
                </YStack>
              </Pressable>
            );
          })}
        </XStack>
      ) : null}
      <YStack gap={space.md} p={space.md}>
        {priceSlot}

        {withDriver ? (
          <YStack gap={space.xs}>
            <Label text={t('route.label')} />
            <XStack gap={space.xs} flexWrap="wrap" rowGap={space.xs}>
              {ROUTE_OPTIONS.map((route) => (
                <Choice
                  key={route.value}
                  label={domainLabel('routeType', route.value)}
                  active={trip.routeType === route.value}
                  onPress={() => set({ routeType: route.value })}
                />
              ))}
            </XStack>
          </YStack>
        ) : null}

        {longTerm ? (
          <>
            {/* Chỉ những gói chủ xe THẬT SỰ niêm yết — không dựng gói giả cho xe chưa khai. */}
            {packages.length > 0 ? (
              <YStack gap={space.xs}>
                <Label text={t('package.label')} />
                <XStack gap={space.xs} flexWrap="wrap" rowGap={space.xs}>
                  {packages.map((pkg) => (
                    <Choice
                      key={pkg.packageMonths}
                      label={fmt.packageLabel(pkg.packageMonths) ?? String(pkg.packageMonths)}
                      {...(pkg.durationDiscountPercent
                        ? { badge: `-${pkg.durationDiscountPercent}%` }
                        : {})}
                      active={trip.packageMonths === pkg.packageMonths}
                      onPress={() => set({ packageMonths: pkg.packageMonths })}
                    />
                  ))}
                </XStack>
              </YStack>
            ) : null}
            <YStack gap={space.xs}>
              <Label text={t('longTerm.wishLabel')} />
              <XStack gap={space.xs} flexWrap="wrap" rowGap={space.xs}>
                <Choice
                  label={t('longTerm.asap')}
                  active={trip.pickupPreference === PICKUP_PREFERENCE.WITHIN_7_DAYS}
                  onPress={() => set({ pickupPreference: PICKUP_PREFERENCE.WITHIN_7_DAYS })}
                />
                {/* Ngày cụ thể chọn ở bước gửi yêu cầu — cùng ô ngày của luồng đặt xe. */}
                <Choice
                  label={domainLabel('pickupPreference', PICKUP_PREFERENCE.SPECIFIC_DATE)}
                  active={trip.pickupPreference === PICKUP_PREFERENCE.SPECIFIC_DATE}
                  onPress={() => set({ pickupPreference: PICKUP_PREFERENCE.SPECIFIC_DATE })}
                />
              </XStack>
              {trip.pickupPreference === PICKUP_PREFERENCE.SPECIFIC_DATE ? (
                <YStack gap={space.xs}>
                  <Text col={colors.textMuted} fos={fontSize.label}>
                    {t('longTerm.dateLabel')}
                  </Text>
                  <Pressable onPress={() => setDateSheetOpen(true)} accessibilityRole="button">
                    <XStack
                      ai="center"
                      gap={space.sm}
                      px={space.md}
                      py={space.sm}
                      br={radius.md}
                      bw={1}
                      bc={colors.border}
                    >
                      <Text
                        f={1}
                        col={trip.requestedPickupDate ? colors.text : colors.placeholder}
                        fos={fontSize.bodySm}
                      >
                        {trip.requestedPickupDate
                          ? fmt.date(startOfAppDay(trip.requestedPickupDate).toISOString())
                          : t('longTerm.datePlaceholder')}
                      </Text>
                      <Ionicons
                        name="calendar-outline"
                        size={iconSize.sm}
                        color={colors.textMuted}
                      />
                    </XStack>
                  </Pressable>
                  <DatePickerSheet
                    open={dateSheetOpen}
                    onClose={() => setDateSheetOpen(false)}
                    value={trip.requestedPickupDate}
                    onChange={(next) => set({ requestedPickupDate: next })}
                    title={t('longTerm.dateLabel')}
                    minDate={nowInAppTz().startOf('day')}
                  />
                </YStack>
              ) : null}
              {expectedReturn && selectedMonths != null ? (
                <XStack
                  ai="center"
                  gap={space.sm}
                  px={space.md}
                  py={space.sm}
                  br={radius.md}
                  bw={1}
                  bc={colors.border}
                  bg={colors.surfaceMuted}
                >
                  <Ionicons name="calendar-outline" size={iconSize.sm} color={colors.primary} />
                  <YStack f={1}>
                    <Text col={colors.textMuted} fos={fontSize.label}>
                      {t('longTerm.expectedReturn')}
                    </Text>
                    <Text col={colors.text} fos={fontSize.label} fow={fontWeight.semibold}>
                      {t('longTerm.expectedReturnValue', {
                        date: expectedReturn,
                        duration: fmt.packageLabel(selectedMonths) ?? '',
                      })}
                    </Text>
                  </YStack>
                </XStack>
              ) : null}
            </YStack>
          </>
        ) : (
          <>
            <RangeFieldBox
              label={tFlow('time.fieldLabel')}
              startValue={trip.pickupAt ? fmt.rentalPoint(dayjs(trip.pickupAt)) : ''}
              endValue={trip.returnAt ? fmt.rentalPoint(dayjs(trip.returnAt)) : ''}
              {...(trip.pickupAt && trip.returnAt
                ? { durationText: fmt.rentalDuration(dayjs(trip.pickupAt), dayjs(trip.returnAt)) }
                : {})}
              hint={tFlow('time.changeHint')}
              onPress={() => {
                setDraft({
                  pickupAt: trip.pickupAt ? toAppTz(trip.pickupAt) : null,
                  returnAt: trip.returnAt ? toAppTz(trip.returnAt) : null,
                });
                setSheetOpen(true);
              }}
            />
            <RentalRangeSheet
              open={sheetOpen}
              value={draft}
              mode={trip.rentalMode}
              busyDays={busyDays}
              onChange={setDraft}
              onModeChange={(rentalMode) => set({ rentalMode })}
              onApply={applyRange}
              onCancel={() => setSheetOpen(false)}
            />
          </>
        )}

        {/*
          Có tài xế: phụ phí tài xế chủ xe khai (địa chỉ đón + điểm đến nhập ở bước gửi yêu cầu).
          Còn lại: vị trí nhận xe như web — tự nhận luôn có, giao tận nơi khi chủ xe bật.
        */}
        {withDriver ? (
          <YStack gap={space.sm}>
            <Label text={t('driver.pickupTitle')} />
            {trip.driverPickup ? (
              <AddressCard
                title={t('driver.pickupAt')}
                address={trip.driverPickup.addressLine}
                changeLabel={t('change')}
                onChange={() => setAddressSheet('driver')}
              />
            ) : (
              <ChooseAddress
                label={t('driver.choosePickup')}
                onPress={() => setAddressSheet('driver')}
              />
            )}
            {trip.routeType !== ROUTE_TYPE.IN_CITY ? (
              <TextField
                control={addressForm.control}
                name="destination"
                label={t('driver.destinationLabel')}
                placeholder={t('driver.destinationPlaceholder')}
                onChangeText={(value) => set({ destination: value })}
              />
            ) : null}
            {surchargeRules.length > 0 ? (
              <YStack gap={space.xs}>
                <Label text={t('driver.surchargesTitle')} />
                {surchargeRules.map((rule) => (
                  <Text key={rule.kind} col={colors.textMuted} fos={fontSize.bodySm}>
                    {`• ${surchargeLine(rule)}`}
                  </Text>
                ))}
              </YStack>
            ) : null}
          </YStack>
        ) : (
          <YStack gap={space.sm}>
            <Label text={t('pickup.title')} />
            <XStack gap={space.xs}>
              <YStack f={1}>
                <Choice
                  label={t('pickup.self')}
                  sub={t('pickup.selfHint')}
                  active={!trip.deliveryRequested}
                  onPress={() => set({ deliveryRequested: false })}
                />
              </YStack>
              {listing.deliveryEnabled ? (
                <YStack f={1}>
                  <Choice
                    label={t('pickup.delivery')}
                    sub={t('pickup.deliveryHint')}
                    active={trip.deliveryRequested}
                    onPress={() => {
                      set({ deliveryRequested: true });
                      if (!trip.delivery) setAddressSheet('delivery');
                    }}
                  />
                </YStack>
              ) : null}
            </XStack>
            {!trip.deliveryRequested ? (
              <XStack ai="flex-start" gap={space.sm}>
                <Ionicons name="location-outline" size={iconSize.sm} color={colors.textMuted} />
                <Text f={1} col={colors.textMuted} fos={fontSize.bodySm}>
                  {pickupAddress ?? t('pickup.addressFallback')}
                </Text>
              </XStack>
            ) : trip.delivery ? (
              <YStack gap={space.xs}>
                <AddressCard
                  title={t('pickup.deliveryAddress')}
                  address={trip.delivery.addressLine}
                  changeLabel={t('change')}
                  onChange={() => setAddressSheet('delivery')}
                />
                <CardDeliveryLine vehicleId={listing.id} delivery={trip.delivery} />
              </YStack>
            ) : (
              <ChooseAddress
                label={t('pickup.chooseDelivery')}
                onPress={() => setAddressSheet('delivery')}
              />
            )}
            <Text col={colors.placeholder} fos={fontSize.label} fontStyle="italic">
              {t('pickup.note')}
            </Text>
          </YStack>
        )}

        <InsuranceOptions
          namespace="Listings.detail.booking.insurance"
          vehicleType={listing.vehicleType}
          vehicleProtection={trip.vehicleProtectionSelected}
          personalAccident={trip.personalAccidentSelected}
          onChange={(patch) =>
            set({
              ...(patch.vehicleProtection !== undefined
                ? { vehicleProtectionSelected: patch.vehicleProtection }
                : {}),
              ...(patch.personalAccident !== undefined
                ? { personalAccidentSelected: patch.personalAccident }
                : {}),
            })
          }
          showNote
        />

        {/*
          "Thành tiền" — như thẻ đặt xe web (#212/#213): báo giá SERVER (`usePublicQuote` +
          `useQuoteWithPromo`), dòng tiền thuê + phụ phí phía khách (bảo hiểm MIC theo ngày), nhóm
          "Giảm giá/Khuyến mãi" với ô chọn mã, tiền giữ chỗ, cọc, rồi TỔNG. Không phép tính nào ở client.
        */}
        <YStack gap={space.sm} pt={space.sm} borderTopWidth={1} borderTopColor={colors.borderSubtle}>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold} accessibilityRole="header">
            {t('costs.title')}
          </Text>
          {quoteParams == null ? (
            <CostNote>
              {noLongTermPackage
                ? tFlow('price.onRequest')
                : longTerm
                  ? tFlow('price.choosePackage')
                  : tFlow('price.chooseTime')}
            </CostNote>
          ) : quote.isPending ? (
            <YStack gap={space.xs}>
              <Skeleton width="80%" height={14} />
              <Skeleton width="60%" height={14} />
              <Skeleton width="70%" height={14} />
              <Skeleton width="50%" height={14} />
            </YStack>
          ) : quoteWithPromo ? (
            <>
              {cost.rentRows.map((row) => (
                <CostLine
                  key={row.key}
                  label={row.label}
                  sub={row.sublabel ?? null}
                  value={cost.signedMoney(row.amount)}
                  {...(row.key === PRICE_ROW.DISCOUNT ? { tone: 'discount' as const } : {})}
                />
              ))}
              {cost.feeLines.map((line) => (
                <CostLine
                  key={line.key}
                  label={domainLabel('feeLine', line.key)}
                  sub={feeLineSublabel(line) || null}
                  value={fmt.money(line.amount)}
                />
              ))}

              {promoAvailable ? (
                <>
                  <YStack h={1} bg={colors.borderSubtle} />
                  <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                    {t('costs.discountGroup')}
                  </Text>
                  {promo.appliedCode && promo.applied?.applicable ? (
                    <XStack ai="center" jc="space-between" gap={space.sm}>
                      <XStack ai="center" gap={space.sm} f={1}>
                        <XStack bg={colors.successSurface} br={radius.sm} px={space.sm} py={2}>
                          <Text col={colors.success} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                            {promo.appliedCode}
                          </Text>
                        </XStack>
                        <Text col={colors.danger} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                          {`−${fmt.money(cost.promoDiscount)}`}
                        </Text>
                      </XStack>
                      <Pressable
                        onPress={() => promo.remove()}
                        accessibilityRole="button"
                        accessibilityLabel={t('costs.promoRemove')}
                        hitSlop={space.sm}
                      >
                        <Ionicons name="close" size={iconSize.sm} color={colors.textMuted} />
                      </Pressable>
                    </XStack>
                  ) : (
                    <Pressable onPress={() => setPromoPickerOpen(true)} accessibilityRole="button">
                      <XStack
                        ai="center"
                        jc="space-between"
                        gap={space.sm}
                        py={space.sm}
                        px={space.sm}
                        br={radius.md}
                        bw={1}
                        bc={colors.borderSubtle}
                      >
                        <XStack ai="center" gap={space.sm} f={1}>
                          <Ionicons name="gift-outline" size={iconSize.sm} color={colors.primaryActive} />
                          <Text f={1} col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
                            {t('costs.promoApply')}
                          </Text>
                        </XStack>
                        <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textMuted} />
                      </XStack>
                    </Pressable>
                  )}
                </>
              ) : null}
              <PromoStatusNote
                checking={promo.checking}
                reason={promoAvailable ? promo.reason : null}
                hasApplied={Boolean(promo.applied?.applicable)}
                droppedCode={promo.droppedCode}
              />

              <YStack h={1} bg={colors.border} />

              {cost.holdAmount ? (
                <CostLine
                  label={tPrice('holdAmount')}
                  sub={tPrice('holdHint')}
                  value={fmt.money(cost.holdAmount)}
                />
              ) : null}
              {cost.holdAmount && cost.payAtPickup ? (
                <CostLine label={tPrice('payAtHandover')} value={fmt.money(cost.payAtPickup)} />
              ) : null}
              {cost.deposit ? (
                <CostLine
                  label={tPrice('deposit')}
                  sub={cost.deposit.note}
                  value={
                    cost.deposit.mode === COLLATERAL_MODE.CASH && cost.deposit.amount
                      ? fmt.money(cost.deposit.amount)
                      : domainLabel('collateralMode', cost.deposit.mode)
                  }
                />
              ) : null}

              <XStack ai="center" jc="space-between" gap={space.sm} pt={space.xs}>
                <Text f={1} col={colors.text} fos={fontSize.body} fow={fontWeight.bold}>
                  {cost.total?.label}
                </Text>
                <Text col={colors.price} fos={fontSize.h3} fow={fontWeight.bold}>
                  {fmt.money(cost.total?.amount ?? quoteWithPromo.breakdown.totalAmount)}
                </Text>
              </XStack>
              <CostNote>{cost.costNote}</CostNote>
            </>
          ) : (
            /* Báo giá không về: không bịa số — chủ xe vẫn xác nhận giá khi duyệt. */
            <CostNote>{tFlow('price.loadError')}</CostNote>
          )}
        </YStack>
      </YStack>

      {promoPickerOpen ? (
        <PromoPickerSheet
          trip={promoTrip ?? { vehicleId: listing.id }}
          appliedCode={promo.appliedCode}
          onClose={() => setPromoPickerOpen(false)}
          onApply={(code) => {
            setPromoPickerOpen(false);
            promo.apply(code);
          }}
        />
      ) : null}

      <BottomSheet
        open={addressSheet !== null}
        onClose={() => setAddressSheet(null)}
        title={addressSheet === 'driver' ? t('driver.pickupModalTitle') : tModal('title')}
        footer={<Button label={tModal('confirm')} onPress={confirmAddress} />}
      >
        {addressSheet === 'driver' ? (
          <RenterAddressBlock
            control={addressForm.control}
            provinceCodeName={PICKUP_ADDRESS_NAMES.provinceCode}
            addressLineName={PICKUP_ADDRESS_NAMES.addressLine}
            pin={PICKUP_PIN_NAMES}
            label={t('driver.pickupAt')}
            vehicleProvinceCode={vehicleProvinceCode}
            vehicleProvinceName={vehicleProvinceName}
            vehiclePoint={vehiclePoint}
          />
        ) : addressSheet === 'delivery' ? (
          <YStack gap={space.sm}>
            <RenterAddressBlock
              control={addressForm.control}
              provinceCodeName={DELIVERY_ADDRESS_NAMES.provinceCode}
              addressLineName={DELIVERY_ADDRESS_NAMES.addressLine}
              pin={DELIVERY_PIN_NAMES}
              label={t('pickup.deliveryAddress')}
              vehicleProvinceCode={vehicleProvinceCode}
              vehicleProvinceName={vehicleProvinceName}
              vehiclePoint={vehiclePoint}
            />
            <DeliveryEstimate form={addressForm} vehicleId={listing.id} />
          </YStack>
        ) : null}
      </BottomSheet>
    </Card>
  );
}

function Label({ text }: { text: string }) {
  const colors = useColors();
  return (
    <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
      {text}
    </Text>
  );
}

function Choice({
  label,
  sub,
  badge,
  active,
  onPress,
}: {
  label: string;
  sub?: string;
  /** % ưu đãi cam kết thời hạn của gói (ADR 0011) — đúng số server trả. */
  badge?: string;
  active: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
    >
      <YStack
        px={space.md}
        py={space.sm}
        br={radius.md}
        bw={1}
        bc={active ? colors.primary : colors.border}
        bg={active ? colors.primarySubtle : colors.surface}
        gap={2}
      >
        <Text
          col={active ? colors.primary : colors.text}
          fos={fontSize.bodySm}
          fow={active ? fontWeight.semibold : fontWeight.medium}
        >
          {label}
        </Text>
        {badge ? (
          <XStack alignSelf="flex-start" bg={colors.successSurface} br={radius.sm} px={4}>
            <Text col={colors.success} fos={fontSize.label} fow={fontWeight.bold}>
              {badge}
            </Text>
          </XStack>
        ) : null}
        {sub ? (
          <Text col={colors.textMuted} fos={fontSize.label}>
            {sub}
          </Text>
        ) : null}
      </YStack>
    </Pressable>
  );
}

function AddressCard({
  title,
  address,
  changeLabel,
  onChange,
}: {
  title: string;
  address: string;
  changeLabel: string;
  onChange: () => void;
}) {
  const colors = useColors();
  return (
    <YStack
      gap={space.xs}
      px={space.md}
      py={space.sm}
      br={radius.md}
      bw={1}
      bc={colors.border}
      bg={colors.surfaceMuted}
    >
      <XStack ai="center" jc="space-between" gap={space.sm}>
        <Text col={colors.text} fos={fontSize.label} fow={fontWeight.semibold}>
          {title}
        </Text>
        <Pressable onPress={onChange} accessibilityRole="button" hitSlop={space.sm}>
          <Text col={colors.primaryHover} fos={fontSize.label} fow={fontWeight.semibold}>
            {changeLabel}
          </Text>
        </Pressable>
      </XStack>
      <XStack ai="flex-start" gap={space.sm}>
        <Ionicons name="location-outline" size={iconSize.sm} color={colors.textMuted} />
        <Text f={1} col={colors.textMuted} fos={fontSize.bodySm}>
          {address}
        </Text>
      </XStack>
    </YStack>
  );
}

function ChooseAddress({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <XStack
        ai="center"
        jc="center"
        gap={space.xs}
        px={space.md}
        py={space.sm}
        br={radius.md}
        bw={1}
        borderStyle="dashed"
        bc={colors.primary}
        bg={colors.primarySubtle}
      >
        <Ionicons name="location-outline" size={iconSize.sm} color={colors.primaryHover} />
        <Text col={colors.primaryHover} fos={fontSize.bodySm} fow={fontWeight.medium}>
          {label}
        </Text>
      </XStack>
    </Pressable>
  );
}

/** Một dòng tiền của thẻ "Thành tiền": nhãn (+ dòng phụ) bên trái, số bên phải. */
function CostLine({
  label,
  sub,
  value,
  tone,
}: {
  label: string;
  sub?: string | null;
  value: string;
  tone?: 'discount';
}) {
  const colors = useColors();
  return (
    <XStack ai="flex-start" jc="space-between" gap={space.sm}>
      <YStack f={1} gap={2}>
        <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
          {label}
        </Text>
        {sub ? (
          <Text col={colors.placeholder} fos={fontSize.label}>
            {sub}
          </Text>
        ) : null}
      </YStack>
      <Text
        col={tone === 'discount' ? colors.danger : colors.text}
        fos={fontSize.bodySm}
        fow={fontWeight.semibold}
      >
        {value}
      </Text>
    </XStack>
  );
}

function CostNote({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <Text col={colors.textMuted} fos={fontSize.label}>
      {children}
    </Text>
  );
}

/**
 * Dòng "Khoảng cách dự kiến · Phí giao" dưới địa chỉ giao xe đã xác nhận — đúng câu của thẻ đặt xe
 * web (#212 `pickup.distance` / `pickup.distanceFeeLater`). Phí là DỰ KIẾN của server (chủ xe chốt
 * lúc duyệt, ADR 0018); tra không tự động được ⇒ "chủ xe báo khi duyệt". Không có cự ly ⇒ không vẽ.
 */
function CardDeliveryLine({
  vehicleId,
  delivery,
}: {
  vehicleId: string;
  delivery: TripAddress;
}) {
  const t = useTranslations('Listings.detail.booking');
  const colors = useColors();
  const fmt = useAppFormat();
  const pin =
    delivery.latitude != null && delivery.longitude != null
      ? { lat: delivery.latitude, lng: delivery.longitude }
      : null;
  const query = useDeliveryDistance(vehicleId, delivery.addressLine, pin);
  const data = query.data;
  if (!data || data.distanceKm == null) return null;
  const fee = data.status === DELIVERY_DISTANCE_STATUS.AUTO ? (data.fee ?? null) : null;
  return (
    <Text col={colors.textMuted} fos={fontSize.label}>
      {fee == null
        ? t('pickup.distanceFeeLater', { distance: fmt.distanceKm(data.distanceKm) })
        : t.rich('pickup.distance', {
            distance: fmt.distanceKm(data.distanceKm),
            fee: isZeroMoney(fee) ? t('pickup.free') : fmt.money(fee),
            b: (chunks) => (
              <Text col={colors.text} fow={fontWeight.semibold}>
                {chunks}
              </Text>
            ),
          })}
    </Text>
  );
}
