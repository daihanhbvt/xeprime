import { Ionicons } from '@expo/vector-icons';
import { Children, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
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
  INSURANCE_PRODUCT_KIND,
  LOCATION_SOURCE,
  SERVICE_TYPE,
  type InsuranceProductKind,
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
import { DashedDivider } from '@/components/ui/DashedDivider';
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
import {
  readDeliveryAddress,
  rememberDeliveryAddress,
  type RememberedDeliveryAddress,
} from '@/lib/delivery-address-memory';
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
import { InsuranceOptionList } from '@/features/insurance/components/InsuranceOptionList';
import { useInsuranceOffer } from '@/features/insurance/hooks';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { rememberRentalRange } from '@/lib/rental-range-memory';
import { elevation } from '@/theme/elevation';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, market, radius, space } from '@/theme/tokens';
import {
  CurrentLocationButton,
  deliveryAddressFromCurrentPlace,
  locateCurrentPlace,
  type CurrentPlace,
} from '@/features/locations/components/CurrentLocationButton';
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

/** Ô còn thiếu mà "Chọn thuê" mở trên thẻ — lịch khoảng thuê, địa chỉ giao/đón, ngày nhận dài hạn. */
export type TripInputKind = 'range' | 'delivery' | 'driver' | 'date';
export interface TripInputRequest {
  kind: TripInputKind;
  /** Đổi mỗi lần bấm — bấm lại cùng một ô vẫn mở lại được. */
  nonce: number;
}

/**
 * Địa chỉ từ VỊ TRÍ HIỆN TẠI của máy — dự phòng khi chưa nhớ địa chỉ giao xe nào. Không xin quyền
 * (trang chủ đã xin); quyền chưa cấp, máy không có toạ độ, bản đồ chưa cấu hình hay tra ngược lỗi
 * ⇒ `null`, thẻ hiện nút "Chọn địa chỉ" như cũ. Không nhớ lại kết quả này: nó là GỢI Ý của máy,
 * chỉ thành địa chỉ nhớ khi khách bấm xác nhận.
 */
async function currentLocationAddress(): Promise<RememberedDeliveryAddress | null> {
  // Cùng luật nút "Lấy vị trí hiện tại" (web #231): không hỏi quyền ở đây, sai số > 300 m thì bỏ.
  const place = await locateCurrentPlace({ ask: false });
  return typeof place === 'string' ? null : deliveryAddressFromCurrentPlace(place);
}

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
  openRequest = null,
}: {
  listing: PublicListingDetail;
  trip: ListingTripDraft;
  /** Vá một phần chuyến — nơi giữ state tự gộp vào bản MỚI NHẤT (effect gọi được an toàn). */
  onChange: (patch: Partial<ListingTripDraft>) => void;
  /** Giá NIÊM YẾT của dịch vụ đang chọn — đứng ngay dưới tab dịch vụ như bản vẽ. */
  priceSlot?: ReactNode;
  /**
   * Lệnh MỞ một ô còn thiếu — "Chọn thuê" khi thẻ chưa đủ chuyến (người dùng chốt 28/10/2026): mở
   * ngay lịch / hộp địa chỉ trên trang xe thay vì sang bước Chuyến đi. `nonce` đổi = một lệnh mới.
   */
  openRequest?: TripInputRequest | null;
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

  function openRangeSheet() {
    setDraft({
      pickupAt: trip.pickupAt ? toAppTz(trip.pickupAt) : null,
      returnAt: trip.returnAt ? toAppTz(trip.returnAt) : null,
    });
    setSheetOpen(true);
  }

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
  /** Lời nhắc của nút vị trí hiện tại trong hộp địa chỉ ("chưa đủ chính xác") — web `locationNotice`. */
  const [locationNotice, setLocationNotice] = useState<string | null>(null);

  /**
   * "Lấy vị trí hiện tại" trong hộp địa chỉ — như web `DeliveryAddressModal.handleLocated` (#231):
   * đo đủ chính xác thì điền địa chỉ tra ngược + TOẠ ĐỘ đo được (nguồn `map_pin`); sai số lớn thì
   * KHÔNG điền mà nói rõ sai số và mời gõ địa chỉ.
   */
  function fillFromCurrentPlace(place: CurrentPlace) {
    if (!place.precise) {
      setLocationNotice(
        tModal('imprecise', { distance: fmt.distanceKm((place.accuracy ?? 0) / 1000) }),
      );
      return;
    }
    const quiet = { shouldDirty: true } as const;
    const province = place.provinceCode ?? vehicleProvinceCode ?? '';
    if (addressSheet === 'driver') {
      addressForm.setValue('pickupProvinceCode', province, quiet);
      addressForm.setValue('pickupWardCode', '', quiet);
      addressForm.setValue('pickupAddressLine', place.formattedAddress, quiet);
      addressForm.setValue('pickupPlaceId', null, quiet);
      addressForm.setValue('pickupLatitude', place.latitude, quiet);
      addressForm.setValue('pickupLongitude', place.longitude, quiet);
      addressForm.setValue('pickupLocationSource', LOCATION_SOURCE.MAP_PIN, quiet);
    } else {
      addressForm.setValue('deliveryProvinceCode', province, quiet);
      addressForm.setValue('deliveryWardCode', '', quiet);
      addressForm.setValue('deliveryAddressLine', place.formattedAddress, quiet);
      addressForm.setValue('deliveryPlaceId', null, quiet);
      addressForm.setValue('deliveryLatitude', place.latitude, quiet);
      addressForm.setValue('deliveryLongitude', place.longitude, quiet);
      addressForm.setValue('deliveryLocationSource', LOCATION_SOURCE.MAP_PIN, quiet);
    }
  }
  const currentLocationButton = (
    <CurrentLocationButton
      label={tModal('useCurrent')}
      onLocateStart={() => setLocationNotice(null)}
      onLocated={fillFromCurrentPlace}
      notice={locationNotice}
    />
  );

  // Lệnh mở ô còn thiếu từ thanh "Chọn thuê" (`openRequest`) — chạy một lần mỗi `nonce`.
  const requestNonce = openRequest?.nonce;
  useEffect(() => {
    if (!openRequest) return;
    if (openRequest.kind === 'range') openRangeSheet();
    else if (openRequest.kind === 'date') setDateSheetOpen(true);
    else setAddressSheet(openRequest.kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestNonce]);
  const [promoPickerOpen, setPromoPickerOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    /*
     * Như web: điền sẵn địa chỉ giao/đón khách đã dùng lần trước. Chưa nhớ địa chỉ nào thì dùng VỊ
     * TRÍ HIỆN TẠI của máy (người dùng chốt 28/10/2026) — chỉ khi quyền vị trí ĐÃ được cấp ở trang
     * chủ; không xin lại quyền ở đây. Khách vẫn sửa được qua "Thay đổi".
     */
    void (async () => {
      const stored = await readDeliveryAddress();
      const remembered = stored?.addressLine ? stored : await currentLocationAddress();
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
    })();
    return () => {
      alive = false;
    };
    // Chạy một lần khi mở trang xe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function confirmAddress() {
    const values = addressForm.getValues();
    /*
     * Nhớ địa chỉ NGAY lúc xác nhận — như `DeliveryAddressModal` web: lần mở xe sau ô giao xe / đón
     * khách đã điền sẵn. Trước đây app chỉ nhớ sau khi GỬI yêu cầu thành công, nên khách chưa gửi
     * lần nào thì lần sau vẫn trống (người dùng phát hiện 28/10/2026).
     */
    const kind = addressSheet === 'driver' ? 'pickup' : 'delivery';
    const picked = readAddress(values, kind);
    const provinceCode =
      kind === 'pickup' ? values.pickupProvinceCode : values.deliveryProvinceCode;
    if (picked && provinceCode) {
      rememberDeliveryAddress({
        provinceCode,
        wardCode: (kind === 'pickup' ? values.pickupWardCode : values.deliveryWardCode) ?? '',
        addressLine: picked.addressLine,
        latitude: picked.latitude,
        longitude: picked.longitude,
        placeId: picked.placeId,
        // Nguồn đã ghi trên form (chọn gợi ý / vị trí hiện tại = `map_pin`) thắng; thiếu thì suy như web.
        locationSource:
          (kind === 'pickup' ? values.pickupLocationSource : values.deliveryLocationSource) ??
          (picked.placeId ? LOCATION_SOURCE.GOOGLE_PLACE : LOCATION_SOURCE.MANUAL),
      });
    }
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

  /*
   * Bảo hiểm ĐANG được chào cho báo giá này (ADR 0064) — gỡ lựa chọn khi sản phẩm không còn chào,
   * như web `useInsuranceOffer`. Không chào ⇒ ẩn hẳn khối (INSURANCE_PARTNER = none ở production).
   */
  const setInsuranceSelected = useCallback(
    (kind: InsuranceProductKind, checked: boolean) =>
      onChange(
        kind === INSURANCE_PRODUCT_KIND.VEHICLE_TRIP
          ? { vehicleProtectionSelected: checked }
          : { personalAccidentSelected: checked },
      ),
    [onChange],
  );
  const deselectInsurance = useCallback(
    (kind: InsuranceProductKind) => setInsuranceSelected(kind, false),
    [setInsuranceSelected],
  );
  const insuranceOffer = useInsuranceOffer(
    quote.data,
    listing.vehicleType,
    {
      vehicleProtectionSelected: trip.vehicleProtectionSelected,
      personalAccidentSelected: trip.personalAccidentSelected,
    },
    deselectInsurance,
  );

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

  const visibleTabs = SERVICE_TABS.filter((tab) => services.includes(tab.value));

  return (
    /*
     * Bản ≤640px của web (Figma `19771:72245` + `19771:72247`): HAI thẻ TRÀN MÉP màn (lề âm bằng
     * lề trang), không viền, bóng `elevation-xs` — thẻ đặt xe (bo hai góc trên 16) rồi thẻ "Thành
     * tiền" (vuông góc).
     */
    <YStack mx={-layout.screenX} gap={space.md}>
      <YStack
        bg={colors.surface}
        borderTopLeftRadius={radius.card}
        borderTopRightRadius={radius.card}
        ov="hidden"
        style={elevation.xs}
      >
      {visibleTabs.length > 1 ? (
        // `.tabHeader` ≤640px: khay `bg-muted`, cao 50; tab bo trên 12 (tab đầu 16), chữ 14.
        <XStack h={50} bg={colors.surfaceMuted}>
          {visibleTabs.map((tab, index) => {
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
                  px={12}
                  borderTopLeftRadius={index === 0 ? radius.card : 12}
                  borderTopRightRadius={12}
                  bg={active ? colors.surface : 'transparent'}
                  borderBottomWidth={2}
                  borderBottomColor={active ? market.accent : 'transparent'}
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
            {/*
              Khay lộ trình như web ≤640px (`.routeOptions` trong khay `bg`, mỗi nút nửa hàng — "Liên
              tỉnh (1 chiều)" xuống hàng riêng trọn bề ngang); nút chọn nền thẻ + viền vàng.
            */}
            <XStack flexWrap="wrap" br={radius.control} bg={colors.background}>
              {ROUTE_OPTIONS.map((route, index) => (
                <YStack key={route.value} w={index < 2 ? '50%' : '100%'}>
                  <TrayOption
                    label={domainLabel('routeType', route.value)}
                    active={trip.routeType === route.value}
                    onPress={() => set({ routeType: route.value })}
                  />
                </YStack>
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
                {/* Hai cột như web ≤640px (`.packageOptions` 2 cột). */}
                <TwoColumns>
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
                </TwoColumns>
              </YStack>
            ) : null}
            <YStack gap={space.xs}>
              <Label text={t('longTerm.wishLabel')} size={fontSize.body} />
              <TwoColumns>
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
              </TwoColumns>
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
            <TimeFrame
              ariaLabel={tFlow('time.fieldLabel')}
              pickup={trip.pickupAt ? fmt.rentalPoint(dayjs(trip.pickupAt)) : null}
              dropoff={trip.returnAt ? fmt.rentalPoint(dayjs(trip.returnAt)) : null}
              duration={
                trip.pickupAt && trip.returnAt
                  ? fmt.rentalDuration(dayjs(trip.pickupAt), dayjs(trip.returnAt))
                  : null
              }
              onPress={openRangeSheet}
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
            <BarTitle text={t('driver.pickupTitle')} />
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
                <Label text={t('driver.surchargesTitle')} size={fontSize.bodySm} />
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
            <BarTitle text={t('pickup.title')} />
            {/* `.deliveryToggle` ≤640px: khay `bg` cao 72, bo 12; ô chọn nền thẻ + viền vàng. */}
            <XStack minHeight={72} br={radius.control} bg={colors.background}>
              <DeliveryToggle
                label={t('pickup.self')}
                sub={t('pickup.selfHint')}
                active={!trip.deliveryRequested}
                onPress={() => set({ deliveryRequested: false })}
              />
              {listing.deliveryEnabled ? (
                <DeliveryToggle
                  label={t('pickup.delivery')}
                  sub={t('pickup.deliveryHint')}
                  subTone="danger"
                  active={trip.deliveryRequested}
                  onPress={() => {
                    set({ deliveryRequested: true });
                    if (!trip.delivery) setAddressSheet('delivery');
                  }}
                />
              ) : null}
            </XStack>
            {!trip.deliveryRequested ? (
              // `.addressBox`: ghim + địa chỉ 14 `text-secondary`, khe 8.
              <XStack ai="flex-start" gap={space.sm}>
                <Ionicons name="location-outline" size={20} color={colors.primary} />
                <Text f={1} col={colors.textMuted} fos={fontSize.body}>
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
            {/* `.addressNote`: 14 mảnh, nghiêng, `text-tertiary`. */}
            <Text col={colors.placeholder} fos={fontSize.body} fow="300" fontStyle="italic">
              {t('pickup.note')}
            </Text>
          </YStack>
        )}

        {insuranceOffer.items.length > 0 ? (
          /*
            Khối Bảo hiểm — web `.insurance`: vạch trên `1px dashed border`, đệm trên md, gap sm.
            Vạch đứt dựng bằng `DashedDivider` (dashed một cạnh trên RN ra nét liền).
          */
          <YStack gap={space.md}>
            <DashedDivider color={colors.border} />
            <YStack gap={space.sm}>
            <Label text={t('insurance.title')} />
            <InsuranceOptionList
              items={insuranceOffer.items}
              selected={{
                [INSURANCE_PRODUCT_KIND.VEHICLE_TRIP]: trip.vehicleProtectionSelected,
                [INSURANCE_PRODUCT_KIND.PERSONAL_ACCIDENT]: trip.personalAccidentSelected,
              }}
              onChange={setInsuranceSelected}
            />
            <Text col={colors.placeholder} fos={fontSize.bodySm} fontStyle="italic">
              {t('insurance.note')}
            </Text>
            </YStack>
          </YStack>
        ) : null}

        {/*
          "Thành tiền" — như thẻ đặt xe web (#212/#213): báo giá SERVER (`usePublicQuote` +
          `useQuoteWithPromo`), dòng tiền thuê + phụ phí phía khách (bảo hiểm MIC theo ngày), nhóm
          "Giảm giá/Khuyến mãi" với ô chọn mã, tiền giữ chỗ, cọc, rồi TỔNG. Không phép tính nào ở client.
        */}
      </YStack>
      </YStack>

      {/* `.breakdownCard` ≤640px: thẻ thứ hai, đệm 16, các nhóm cách 16. */}
      <YStack bg={colors.surface} p={space.md} style={elevation.xs}>
        <YStack gap={space.md}>
          <BarTitle text={t('costs.title')} size={fontSize.h3} />
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
                  <DashedDivider color={colors.border} />
                  <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                    {t('costs.discountGroup')}
                  </Text>
                  {promo.appliedCode && promo.applied?.applicable ? (
                    // `.promoAppliedRow` web: khối nền `success-subtle` viền xanh nhạt, bo 12, đệm 12 — mã đang áp NỔI lên.
                    <XStack
                      ai="center"
                      jc="space-between"
                      gap={space.sm}
                      p={12}
                      br={radius.control}
                      bw={1}
                      bc={colors.successBorder}
                      bg={colors.successSurface}
                    >
                      <XStack ai="center" gap={space.sm} f={1}>
                        <XStack bg={colors.successSurface} bw={1} bc={colors.successBorder} br={radius.sm} px={space.sm} py={2}>
                          <Text col={colors.success} fos={fontSize.body} fow={fontWeight.semibold}>
                            {promo.appliedCode}
                          </Text>
                        </XStack>
                        {/* Khoản GIẢM của chuyến tô `success` — như `.discountValue` web, Figma xanh. */}
                        <Text col={colors.success} fos={fontSize.body} fow={fontWeight.medium}>
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
                    /*
                      `.promoCodeButton`: nền `success-subtle`, viền `success`, bo 12, đệm 12; quà
                      20 + chữ 14 cùng màu `success`, mũi tên phải.
                    */
                    <Pressable onPress={() => setPromoPickerOpen(true)} accessibilityRole="button">
                      <XStack
                        ai="center"
                        jc="space-between"
                        gap={space.sm}
                        p={12}
                        br={radius.control}
                        bw={1}
                        bc={colors.success}
                        bg={colors.successSurface}
                      >
                        <XStack ai="center" gap={space.sm} f={1}>
                          <Ionicons name="gift-outline" size={20} color={colors.success} />
                          <Text f={1} col={colors.success} fos={fontSize.body}>
                            {t('costs.promoApply')}
                          </Text>
                        </XStack>
                        <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.success} />
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

              {/* `.totalRow`: vạch trên, đệm trên 16; nhãn 14 Semibold, số 20 Semibold vàng. */}
              <XStack
                ai="center"
                jc="space-between"
                gap={space.sm}
                pt={space.md}
                borderTopWidth={1}
                borderTopColor={colors.border}
              >
                <Text f={1} col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                  {cost.total?.label}
                </Text>
                <Text col={colors.primary} fos={fontSize.lead} fow={fontWeight.semibold}>
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
        onClose={() => {
          setAddressSheet(null);
          setLocationNotice(null);
        }}
        title={addressSheet === 'driver' ? t('driver.pickupModalTitle') : tModal('title')}
        footer={<Button label={tModal('confirm')} onPress={confirmAddress} />}
      >
        {addressSheet === 'driver' ? (
          <YStack gap={space.sm}>
          {currentLocationButton}
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
          </YStack>
        ) : addressSheet === 'delivery' ? (
          <YStack gap={space.sm}>
            {currentLocationButton}
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
    </YStack>
  );
}

/**
 * Tiêu đề khối của thẻ đặt xe — mặc định đúng `.sectionTitle`/`.routeLabel` web (body-lg ·
 * semibold). Hai nhãn nhỏ hơn bên web giữ cỡ của chúng: `.inputLabel` (body) và `.rulesTitle`
 * (12px trong hộp quy tắc phụ phí).
 */
function Label({
  text,
  size = fontSize.bodyLg,
}: {
  text: string;
  size?: number;
}) {
  const colors = useColors();
  return (
    <Text col={colors.text} fos={size} fow={fontWeight.semibold} accessibilityRole="header">
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
    // `flex: 1` + ruột `f={1}`: trong lưới 2 cột hai ô cùng hàng CAO BẰNG NHAU dù nhãn dài ngắn khác nhau.
    <Pressable
      style={{ flex: 1 }}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
    >
      <YStack
        f={1}
        px={space.md}
        py={space.sm}
        minHeight={44}
        ai="center"
        jc="center"
        br={radius.md}
        bw={1}
        bc={active ? colors.primary : colors.border}
        bg={active ? colors.primarySubtle : colors.surface}
        gap={2}
      >
        <Text
          col={active ? colors.primary : colors.text}
          fos={fontSize.body}
          ta="center"
          fow={active ? fontWeight.semibold : fontWeight.medium}
        >
          {label}
        </Text>
        {badge ? (
          <XStack bg={colors.successSurface} bw={1} bc={colors.successBorder} br={radius.sm} px={4}>
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

/** Xếp các `Choice` thành lưới HAI CỘT bằng nhau (web ≤640px `.packageOptions`, `.longTermPrefBtn`). */
function TwoColumns({ children }: { children: ReactNode }) {
  return (
    <XStack flexWrap="wrap" mx={-space.xs}>
      {Children.toArray(children).map((child, index) => (
        <YStack key={index} w="50%" p={space.xs}>
          {child}
        </YStack>
      ))}
    </XStack>
  );
}

/**
 * Một nút trong KHAY lựa chọn (lộ trình có tài xế) — `.routeBtn` web: nằm trên khay `bg`, chọn rồi
 * thì nền thẻ + viền vàng; chữ 14 căn giữa.
 */
function TrayOption({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: active }}>
      <YStack
        minHeight={44}
        ai="center"
        jc="center"
        px={12}
        br={radius.control}
        bw={1}
        bc={active ? colors.primary : 'transparent'}
        bg={active ? colors.surface : 'transparent'}
        style={active ? elevation.xs : undefined}
      >
        <Text
          col={colors.text}
          fos={fontSize.body}
          fow={active ? fontWeight.semibold : fontWeight.medium}
          ta="center"
        >
          {label}
        </Text>
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
    // `.deliveryAddressCard` web: đệm 10 × 12, bo 8, khe 6.
    <YStack
      gap={6}
      px={12}
      py={10}
      br={8}
      bw={1}
      bc={colors.border}
      bg={colors.surfaceMuted}
    >
      <XStack ai="center" jc="space-between" gap={space.sm}>
        <Text col={colors.textMuted} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {title}
        </Text>
        <Pressable onPress={onChange} accessibilityRole="button" hitSlop={space.sm}>
          <Text
            col={colors.primaryHover}
            fos={fontSize.bodySm}
            fow={fontWeight.semibold}
            textDecorationLine="underline"
          >
            {changeLabel}
          </Text>
        </Pressable>
      </XStack>
      <XStack ai="flex-start" gap={space.sm}>
        <Ionicons name="location-outline" size={20} color={colors.primary} />
        <Text f={1} col={colors.textMuted} fos={fontSize.body}>
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
        px={12}
        py={space.sm}
        br={8}
        bw={1}
        borderStyle="dashed"
        bc={colors.primary}
        bg={colors.primarySubtle}
      >
        <Ionicons name="location-outline" size={iconSize.sm} color={colors.primaryHover} />
        <Text col={colors.primaryHover} fos={13} fow={fontWeight.semibold}>
          {label}
        </Text>
      </XStack>
    </Pressable>
  );
}

/**
 * Một dòng tiền của thẻ "Thành tiền" — `.priceLine` web (Figma `19771:72247`): nhãn 16 bên trái
 * (+ dòng phụ 14 `text-tertiary`), số 16 Medium bên phải. Khoản GIẢM tô `success` (`.discountValue`).
 */
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
    <XStack ai="flex-start" jc="space-between" gap={space.md}>
      <YStack f={1} gap={2}>
        <Text col={colors.text} fos={fontSize.body}>
          {label}
        </Text>
        {sub ? (
          <Text col={colors.placeholder} fos={fontSize.body}>
            {sub}
          </Text>
        ) : null}
      </YStack>
      <Text
        col={tone === 'discount' ? colors.success : colors.text}
        fos={fontSize.body}
        fow={fontWeight.medium}
      >
        {value}
      </Text>
    </XStack>
  );
}

/**
 * Tiêu đề khối trong thẻ đặt xe — `.sectionTitle` / `.breakdownTitle` web ≤640px: vạch TRÁI 4px
 * `primary-accent`, đệm ngang 12. Khác vạch 3×18 của tiêu đề trang (`MarketSectionTitle`) — web vẽ
 * hai kiểu khác nhau cho hai tầng, giữ đúng như thế.
 */
function BarTitle({ text, size = fontSize.bodyLg }: { text: string; size?: number }) {
  const colors = useColors();
  return (
    <XStack px={12} borderLeftWidth={4} borderLeftColor={market.accent}>
      <Text col={colors.text} fos={size} fow={fontWeight.semibold} accessibilityRole="header">
        {text}
      </Text>
    </XStack>
  );
}

/**
 * Một lựa chọn trong khay "Vị trí nhận xe" — `.toggleBtn` web: chiếm nửa khay, đệm 12, bo 12, căn
 * giữa; chọn rồi thì nền thẻ + viền `primary`. Dòng phụ 12 nghiêng: tự nhận tô `success` (tiết
 * kiệm), giao xe tô `error` (phụ phí) — `.toggleSub` / `.toggleSubDanger`.
 */
function DeliveryToggle({
  label,
  sub,
  subTone = 'success',
  active,
  onPress,
}: {
  label: string;
  sub: string;
  subTone?: 'success' | 'danger';
  active: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      style={{ flex: 1 }}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
    >
      <YStack
        f={1}
        ai="center"
        jc="center"
        gap={2}
        p={12}
        br={radius.control}
        bw={1}
        bc={active ? colors.primary : 'transparent'}
        bg={active ? colors.surface : 'transparent'}
        style={active ? elevation.xs : undefined}
      >
        <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold} ta="center">
          {label}
        </Text>
        <Text
          col={subTone === 'danger' ? colors.danger : colors.success}
          fos={fontSize.bodySm}
          fontStyle="italic"
          ta="center"
        >
          {sub}
        </Text>
      </YStack>
    </Pressable>
  );
}

/**
 * Khung "Nhận xe — Trả xe" của thẻ đặt xe — `.timeFrame` web (Figma `19771:72245`): viền `border`,
 * bo 12, đệm 12 × 16, hai cột cách bằng một gạch nối. Chạm để mở lịch chọn khoảng thuê; số ngày/giờ
 * thuê hiện nhỏ dưới khung khi đã chọn đủ hai đầu.
 */
function TimeFrame({
  ariaLabel,
  pickup,
  dropoff,
  duration,
  onPress,
}: {
  ariaLabel: string;
  pickup: string | null;
  dropoff: string | null;
  duration: string | null;
  onPress: () => void;
}) {
  const colors = useColors();
  const tRange = useTranslations('Common.components.rentalRange');
  const col = (label: string, value: string | null) => (
    <YStack f={1} gap={space.xs}>
      <Text col={colors.textMuted} fos={fontSize.body}>
        {label}
      </Text>
      <Text
        col={value ? colors.text : colors.placeholder}
        fos={fontSize.body}
        fow={fontWeight.medium}
        numberOfLines={1}
      >
        {value ?? tRange('notSelected')}
      </Text>
    </YStack>
  );
  return (
    <YStack gap={space.xs}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={tRange('ariaValue', {
          label: ariaLabel,
          start: pickup ?? tRange('notSelected'),
          end: dropoff ?? tRange('notSelected'),
        })}
      >
        <XStack
          ai="center"
          px={space.md}
          py={12}
          br={radius.control}
          bw={1}
          bc={colors.border}
          bg={colors.surface}
        >
          {col(tRange('pickup'), pickup)}
          <Text col={colors.placeholder} fow={fontWeight.bold} px={12}>
            -
          </Text>
          {col(tRange('return'), dropoff)}
        </XStack>
        {/* Viên thời lượng VÀNG đè lên mép trên-phải khung — như `bookingRangeField` web. */}
        {duration ? (
          <XStack
            pos="absolute"
            top={-10}
            right={12}
            px={space.sm}
            py={2}
            br={radius.pill}
            bg={colors.primary}
          >
            <Text col={colors.onPrimary} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {duration}
            </Text>
          </XStack>
        ) : null}
      </Pressable>
    </YStack>
  );
}

/** `.costNote`: 12 `text-tertiary`. */
function CostNote({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <Text col={colors.placeholder} fos={fontSize.bodySm}>
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
