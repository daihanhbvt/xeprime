'use client';

import { useId, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  CalendarOutlined,
  CloseOutlined,
  EnvironmentOutlined,
  GiftOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { Checkbox, DatePicker, Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import {
  RENTAL_MODE,
  addCalendarMonthsVn,
  COLLATERAL_MODE,
  isRouteType,
  PICKUP_PREFERENCE,
  PRICE_ROW,
  ROUTE_TYPE,
  ROUTE_TYPE_VALUES,
  SERVICE_TYPE,
  type RouteType,
} from '@xeprime/types';
import { appWallClockToIso, nowInAppTz, toAppTz, type Dayjs } from '@/lib/datetime';
import { applyDiscountPercent, isZeroMoney } from '@/lib/money';
import { cx } from '@/lib/cx';
import { rememberRentalRange, rememberedOrDefaultRentalRange } from '@/lib/rental-range-memory';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { RequestBookingButton } from '@/features/booking-requests/components/RequestBookingButton';
import { useCustomerCostView } from '@/features/booking-requests/hooks/use-customer-cost-view';
import {
  publicQuoteParams,
  usePublicQuote,
  useQuoteWithPromo,
} from '@/features/booking-requests/hooks/use-public-quote';
import { PICKUP_METHOD } from '@/features/booking-requests/schema';
import { ShopChatButton } from '@/features/chat/components/ShopChatButton';
import { DiscountTag } from '@/components/data-display/DiscountTag';
import {
  RentalDateTimeRangeField,
  type RentalMode,
  type RentalRange,
} from '@/components/form/RentalDateTimeRangeField';
import { usePromoCode } from '@/features/promo-codes/use-promo-code';
import { PromoPicker, PromoStatusNote } from '@/features/promo-codes/components/PromoCodeField';
import type { PromoTripParams } from '@/features/promo-codes/types';
import { readDeliveryAddress } from '@/lib/delivery-address-memory';
import { DeliveryAddressModal, type ConfirmedDeliveryInfo } from './DeliveryAddressModal';
import { useDriverSurchargeLine } from '../hooks/use-driver-surcharge-line';
import type { PublicListingDetail } from '../types';
import styles from './ListingBookingCard.module.css';

interface ListingBookingCardProps {
  listing: PublicListingDetail;
  activeService: string;
  onServiceChange?: (service: string) => void;
  pickupAt?: string;
  returnAt?: string;
  routeType?: string;
  searchProvinceCode?: string;
}

export function ListingBookingCard({
  listing,
  activeService,
  onServiceChange,
  pickupAt,
  returnAt,
  routeType,
  searchProvinceCode,
}: ListingBookingCardProps) {
  const t = useTranslations('Listings.detail.booking');
  const tCard = useTranslations('Listings.card');
  const tFlow = useTranslations('BookingRequests.flow');
  const tPrice = useTranslations('Common.components.price');
  const costsTitleId = useId();
  const fmt = useAppFormat();
  const dl = useDomainLabel();
  const surchargeLine = useDriverSurchargeLine();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const services = listing.serviceTypes ?? [SERVICE_TYPE.SELF_DRIVE];
  /*
   * `discountPercent` là khuyến mãi trực tiếp của dịch vụ TỰ LÁI — không áp, không hiển thị cho xe có
   * tài xế hay thuê dài hạn (ADR 0011; cùng luật với `VehicleSummaryPanel`).
   */
  const discount = activeService === SERVICE_TYPE.SELF_DRIVE ? (listing.discountPercent ?? 0) : 0;

  // 1. Quản lý trạng thái giao xe & modal địa chỉ
  const [deliveryMode, setDeliveryMode] = useState<'pickup' | 'delivery'>('pickup');
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [deliveryInfo, setDeliveryInfo] = useState<ConfirmedDeliveryInfo | null>(() => {
    const remembered = readDeliveryAddress();
    if (remembered?.addressLine) {
      return {
        address: remembered.addressLine,
        placeId: remembered.placeId,
        lat: remembered.latitude,
        lng: remembered.longitude,
        provinceCode: remembered.provinceCode,
        distanceKm: null,
        fee: null,
      };
    }
    return null;
  });

  // 2. Quản lý ngày giờ nhận/trả xe (Mặc định lấy từ URL hoặc bộ nhớ/ngày mai)
  const [range, setRange] = useState<RentalRange>(() => {
    const fallback = rememberedOrDefaultRentalRange();
    return {
      pickupAt: pickupAt ? toAppTz(pickupAt) : fallback.pickupAt,
      returnAt: returnAt ? toAppTz(returnAt) : fallback.returnAt,
    };
  });
  const [rentalMode, setRentalMode] = useState<RentalMode>(RENTAL_MODE.DAILY);

  // 3. Quản lý lộ trình cho dịch vụ "Có tài xế"
  const [currentRouteType, setCurrentRouteType] = useState<RouteType>(() => {
    const fromUrl = searchParams.get('routeType');
    if (isRouteType(fromUrl)) return fromUrl;
    if (isRouteType(routeType)) return routeType;
    return ROUTE_TYPE.IN_CITY;
  });

  /*
   * 4. Gói thuê dài hạn — CHỈ những gói server trả về. Danh sách rỗng nghĩa là xe chưa có giá tháng
   * (server cố ý không bịa gói — `PricingService`): không chọn gói nào, không hỏi báo giá, thẻ nói
   * "liên hệ báo giá" thay vì mời chọn 1/3/6/12 tháng không có thật.
   */
  const longTermPackages = listing.longTermPackages ?? [];
  const [selectedMonths, setSelectedMonths] = useState<number | null>(
    () => longTermPackages[0]?.packageMonths ?? null,
  );

  // 3b. Quản lý điểm đón & điểm đến cho "Có tài xế"
  const [driverPickupInfo, setDriverPickupInfo] = useState<ConfirmedDeliveryInfo | null>(() => {
    const remembered = readDeliveryAddress();
    if (remembered?.addressLine) {
      return {
        address: remembered.addressLine,
        placeId: remembered.placeId,
        lat: remembered.latitude,
        lng: remembered.longitude,
        provinceCode: remembered.provinceCode,
        distanceKm: null,
        fee: null,
      };
    }
    return null;
  });
  const [driverAddressModalOpen, setDriverAddressModalOpen] = useState(false);
  const [destination, setDestination] = useState('');

  // 4b. Quản lý nguyện vọng nhận xe cho Thuê dài hạn
  const [pickupPreference, setPickupPreference] = useState<'asap' | 'specific_date'>('asap');
  const [requestedPickupDate, setRequestedPickupDate] = useState<Dayjs | null>(null);

  /*
   * Ngày trả DỰ KIẾN = ngày nhận + N THÁNG LỊCH theo giờ VN — cùng hàm server dùng (ADR 0011), không
   * phải `dayjs.add('month')` của trình duyệt. Chỉ để khách hình dung; ngày thật do gian hàng chốt.
   */
  const expectedReturnDateStr = useMemo(() => {
    if (selectedMonths == null) return null;
    const start =
      pickupPreference === 'specific_date' && requestedPickupDate
        ? requestedPickupDate
        : nowInAppTz();
    return fmt.date(addCalendarMonthsVn(start.toDate(), selectedMonths).toISOString());
  }, [fmt, pickupPreference, requestedPickupDate, selectedMonths]);

  // Chuyển tab dịch vụ mượt mà (router.replace không reload toàn trang)
  const handleTabClick = (s: string) => {
    if (s === activeService) return;
    if (onServiceChange) {
      onServiceChange(s);
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set('serviceType', s);
    if (s !== SERVICE_TYPE.WITH_DRIVER) params.delete('routeType');
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Đổi lộ trình có tài xế
  const handleRouteTypeChange = (r: RouteType) => {
    setCurrentRouteType(r);
    const params = new URLSearchParams(searchParams.toString());
    params.set('routeType', r);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Cập nhật khoảng ngày thuê
  const handleRangeChange = (next: RentalRange) => {
    setRange(next);
    if (next.pickupAt && next.returnAt) {
      rememberRentalRange({ ...next, mode: rentalMode });
      const params = new URLSearchParams(searchParams.toString());
      params.set('pickupAt', appWallClockToIso(next.pickupAt));
      params.set('returnAt', appWallClockToIso(next.returnAt));
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  };

  /*
   * Giá NIÊM YẾT của dịch vụ đang chọn — dòng giá lớn đầu thẻ, cùng con số với thẻ xe ở trang kết quả.
   * Đây là đơn giá công bố, KHÔNG phải số phải trả: mọi khoản tiền của chuyến ở thẻ "Thành tiền" bên
   * dưới đến từ báo giá của server.
   */
  const longTermPackage = longTermPackages.find((p) => p.packageMonths === selectedMonths) ?? null;
  /** `null` = dịch vụ này chưa có giá công bố — dòng giá nói "liên hệ báo giá", không hiện 0đ. */
  const basePrice: string | null =
    activeService === SERVICE_TYPE.LONG_TERM
      ? (longTermPackage?.baseMonthlyPrice ?? null)
      : activeService === SERVICE_TYPE.WITH_DRIVER
        ? (listing.withDriverDailyPrice ?? null)
        : (listing.weekdayPrice ?? null);
  const unitLabel =
    activeService === SERVICE_TYPE.LONG_TERM ? tCard('perMonthUnit') : tCard('perDayUnit');
  const finalDailyPrice =
    basePrice != null && discount > 0 ? applyDiscountPercent(basePrice, discount) : basePrice;
  const noLongTermPackage =
    activeService === SERVICE_TYPE.LONG_TERM && longTermPackages.length === 0;

  const isDelivery = activeService !== SERVICE_TYPE.WITH_DRIVER && deliveryMode === 'delivery';
  /** Phí giao DỰ KIẾN của địa chỉ đã chọn — chủ xe chốt lúc duyệt, KHÔNG nằm trong tổng (ADR 0018). */
  const deliveryFee = isDelivery && listing.deliveryEnabled ? (deliveryInfo?.fee ?? null) : null;

  // 5. Quản lý mã khuyến mãi
  const pickupIso = range.pickupAt ? appWallClockToIso(range.pickupAt) : (pickupAt ?? undefined);
  const returnIso = range.returnAt ? appWallClockToIso(range.returnAt) : (returnAt ?? undefined);

  // 6. Tuỳ chọn bảo hiểm MIC (vật chất xe / tai nạn người trên xe)
  const [vehicleProtectionSelected, setVehicleProtectionSelected] = useState(false);
  const [personalAccidentSelected, setPersonalAccidentSelected] = useState(false);

  const tripParams: PromoTripParams = useMemo(
    () => ({
      vehicleId: listing.id,
      serviceType: activeService,
      pickupAt: pickupIso,
      returnAt: returnIso,
      routeType: activeService === SERVICE_TYPE.WITH_DRIVER ? currentRouteType : undefined,
      packageMonths:
        activeService === SERVICE_TYPE.LONG_TERM ? (selectedMonths ?? undefined) : undefined,
      vehicleProtectionSelected,
      personalAccidentSelected,
    }),
    [
      listing.id,
      activeService,
      pickupIso,
      returnIso,
      currentRouteType,
      selectedMonths,
      vehicleProtectionSelected,
      personalAccidentSelected,
    ],
  );

  const promo = usePromoCode(tripParams);
  const [promoPickerOpen, setPromoPickerOpen] = useState(false);

  /*
   * BÁO GIÁ SERVER — cùng câu hỏi, cùng cache với hộp gửi yêu cầu (`publicQuoteParams`), nên con số
   * khách thấy ở đây là đúng con số họ thấy khi bấm "Chọn thuê". Mã khuyến mãi thay CẢ bảng phí
   * (`useQuoteWithPromo`, ADR 0046). Trình duyệt không cộng trừ một đồng nào.
   */
  const quoteParams = publicQuoteParams({
    serviceType: activeService,
    pickupAt: range.pickupAt,
    returnAt: range.returnAt,
    routeType: currentRouteType,
    packageMonths: selectedMonths,
    vehicleProtectionSelected,
    personalAccidentSelected,
  });
  const quoteQ = usePublicQuote(listing.id, quoteParams);
  const quote = useQuoteWithPromo(quoteQ.data, promo.applied?.fees);
  const cost = useCustomerCostView({
    listing,
    breakdown: quote?.breakdown ?? null,
    isDelivery,
  });
  /*
   * Mã khuyến mãi chỉ tài trợ vào khoản khách chuyển ONLINE (ADR 0046 điều 2) — báo giá không có
   * tiền giữ chỗ (tạm tính, dài hạn chưa chốt lịch, tuyến không thu) thì không có chỗ để áp mã.
   * Điều kiện đọc từ SERVER, như hộp gửi yêu cầu.
   */
  const promoAvailable = quoteQ.data?.breakdown.fees?.holdAmount != null;

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        {/* Thanh tab dịch vụ */}
        {services.length > 1 ? (
          <div className={styles.tabHeader} role="tablist" aria-label={t('tabsLabel')}>
            {services.includes(SERVICE_TYPE.SELF_DRIVE) && (
              <button
                type="button"
                className={`${styles.serviceTab} ${activeService === SERVICE_TYPE.SELF_DRIVE ? styles.serviceTabActive : ''}`}
                onClick={() => handleTabClick(SERVICE_TYPE.SELF_DRIVE)}
              >
                {t('tabs.selfDrive')}
              </button>
            )}
            {services.includes(SERVICE_TYPE.WITH_DRIVER) && (
              <button
                type="button"
                className={`${styles.serviceTab} ${activeService === SERVICE_TYPE.WITH_DRIVER ? styles.serviceTabActive : ''}`}
                onClick={() => handleTabClick(SERVICE_TYPE.WITH_DRIVER)}
              >
                {t('tabs.withDriver')}
              </button>
            )}
            {services.includes(SERVICE_TYPE.LONG_TERM) && (
              <button
                type="button"
                className={`${styles.serviceTab} ${activeService === SERVICE_TYPE.LONG_TERM ? styles.serviceTabActive : ''}`}
                onClick={() => handleTabClick(SERVICE_TYPE.LONG_TERM)}
              >
                {t('tabs.longTerm')}
              </button>
            )}
          </div>
        ) : null}

        <div className={styles.body}>
          {/* Dòng giá */}
          <div className={styles.priceRow}>
            {basePrice != null && finalDailyPrice != null ? (
              <>
                <div className={styles.priceGroup}>
                  {discount > 0 && <span className={styles.oldPrice}>{fmt.money(basePrice)}</span>}
                  <span className={styles.mainPrice}>{fmt.money(finalDailyPrice)}</span>
                  <span className={styles.unit}>{unitLabel}</span>
                </div>
                {discount > 0 && <DiscountTag percent={discount} />}
              </>
            ) : (
              <span className={styles.onRequest}>{tFlow('price.onRequest')}</span>
            )}
          </div>

          {/* Chọn lộ trình khi đang ở tab Có tài xế (3 lộ trình: Nội thành, Liên tỉnh, Liên tỉnh 1 chiều) */}
          {activeService === SERVICE_TYPE.WITH_DRIVER && (
            <div className={styles.routeGroup}>
              <span className={styles.routeLabel}>{t('route.label')}</span>
              <div className={styles.routeOptions}>
                {ROUTE_TYPE_VALUES.map((route) => (
                  <button
                    key={route}
                    type="button"
                    className={`${styles.routeBtn} ${currentRouteType === route ? styles.routeBtnActive : ''}`}
                    onClick={() => handleRouteTypeChange(route)}
                  >
                    {dl('routeType', route)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chọn gói dài hạn khi ở tab Thuê dài hạn (kèm tag giảm giá) */}
          {activeService === SERVICE_TYPE.LONG_TERM && longTermPackages.length > 0 && (
            <div className={styles.packageGroup}>
              <span className={styles.routeLabel}>{t('package.label')}</span>
              <div className={styles.packageOptions}>
                {longTermPackages.map((pkg) => {
                  const m = pkg.packageMonths;
                  return (
                    <button
                      key={m}
                      type="button"
                      className={`${styles.packageBtn} ${selectedMonths === m ? styles.packageBtnActive : ''}`}
                      onClick={() => setSelectedMonths(m)}
                    >
                      <span>{fmt.packageLabel(m)}</span>
                      {pkg.durationDiscountPercent ? (
                        <span className={styles.packageDiscountBadge}>
                          -{pkg.durationDiscountPercent}%
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Khung chọn ngày giờ nhận / trả xe */}
          {activeService === SERVICE_TYPE.LONG_TERM ? (
            <div className={styles.longTermTimeSection}>
              <span className={styles.inputLabel}>{t('longTerm.wishLabel')}</span>
              <div className={styles.longTermPrefOptions}>
                <button
                  type="button"
                  className={`${styles.longTermPrefBtn} ${pickupPreference === 'asap' ? styles.longTermPrefBtnActive : ''}`}
                  onClick={() => setPickupPreference('asap')}
                >
                  {t('longTerm.asap')}
                </button>
                <button
                  type="button"
                  className={`${styles.longTermPrefBtn} ${pickupPreference === 'specific_date' ? styles.longTermPrefBtnActive : ''}`}
                  onClick={() => setPickupPreference('specific_date')}
                >
                  {dl('pickupPreference', PICKUP_PREFERENCE.SPECIFIC_DATE)}
                </button>
              </div>

              {pickupPreference === 'specific_date' && (
                <div className={styles.specificDatePickerWrap}>
                  <span className={styles.inputSubLabel}>{t('longTerm.dateLabel')}</span>
                  <DatePicker
                    value={requestedPickupDate}
                    onChange={(d) => setRequestedPickupDate(d)}
                    disabledDate={(current) => current && current < nowInAppTz().startOf('day')}
                    format="DD/MM/YYYY"
                    placeholder={t('longTerm.datePlaceholder')}
                    className={styles.datePickerInput}
                  />
                </div>
              )}

              {expectedReturnDateStr && selectedMonths != null ? (
                <div className={styles.expectedReturnBox}>
                  <CalendarOutlined className={styles.calendarIcon} aria-hidden="true" />
                  <div>
                    <span className={styles.expectedReturnLabel}>
                      {t('longTerm.expectedReturn')}
                    </span>
                    <span className={styles.expectedReturnValue}>
                      {t('longTerm.expectedReturnValue', {
                        date: expectedReturnDateStr,
                        duration: fmt.packageLabel(selectedMonths) ?? '',
                      })}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className={styles.timeSection}>
              <RentalDateTimeRangeField
                value={range}
                onChange={handleRangeChange}
                mode={rentalMode}
                onModeChange={setRentalMode}
                variant="stacked"
                className={styles.bookingRangeField}
              />
            </div>
          )}

          {/* Vị trí nhận xe / Địa chỉ đón khách */}
          {activeService === SERVICE_TYPE.WITH_DRIVER ? (
            <div className={styles.locationSection}>
              <h4 className={styles.sectionTitle}>{t('driver.pickupTitle')}</h4>
              {driverPickupInfo?.address ? (
                <div className={styles.deliveryAddressCard}>
                  <div className={styles.deliveryHeaderRow}>
                    <span className={styles.deliveryAddressTitle}>{t('driver.pickupAt')}</span>
                    <button
                      type="button"
                      className={styles.changeAddressBtn}
                      onClick={() => setDriverAddressModalOpen(true)}
                    >
                      {t('change')}
                    </button>
                  </div>
                  <div className={styles.addressBox}>
                    <EnvironmentOutlined className={styles.addressIcon} />
                    <span>{driverPickupInfo.address}</span>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className={styles.chooseAddressBtn}
                  onClick={() => setDriverAddressModalOpen(true)}
                >
                  <EnvironmentOutlined aria-hidden="true" />
                  <span>{t('driver.choosePickup')}</span>
                </button>
              )}

              {/* Nếu là lộ trình Liên tỉnh hoặc Liên tỉnh 1 chiều: hiển thị ô Điểm đến */}
              {currentRouteType !== ROUTE_TYPE.IN_CITY && (
                <div className={styles.destinationSection}>
                  <span className={styles.inputLabel}>{t('driver.destinationLabel')}</span>
                  <input
                    type="text"
                    className={styles.textInput}
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder={t('driver.destinationPlaceholder')}
                    aria-label={t('driver.destinationLabel')}
                  />
                </div>
              )}

              {/* Quy định phụ phí tài xế nếu có */}
              {listing.driverSurchargeRules && listing.driverSurchargeRules.length > 0 && (
                <div className={styles.driverRulesBox}>
                  <span className={styles.rulesTitle}>{t('driver.surchargesTitle')}</span>
                  <ul className={styles.rulesList}>
                    {listing.driverSurchargeRules.map((rule) => (
                      <li key={rule.kind}>{surchargeLine(rule)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.locationSection}>
              <h4 className={styles.sectionTitle}>{t('pickup.title')}</h4>
              <div className={styles.deliveryToggle}>
                <button
                  type="button"
                  className={`${styles.toggleBtn} ${deliveryMode === 'pickup' ? styles.toggleBtnActive : ''}`}
                  onClick={() => setDeliveryMode('pickup')}
                >
                  <span className={styles.toggleLabel}>{t('pickup.self')}</span>
                  <span className={styles.toggleSub}>{t('pickup.selfHint')}</span>
                </button>
                {listing.deliveryEnabled ? (
                  <button
                    type="button"
                    className={`${styles.toggleBtn} ${deliveryMode === 'delivery' ? styles.toggleBtnActive : ''}`}
                    onClick={() => {
                      setDeliveryMode('delivery');
                      if (!deliveryInfo?.address) {
                        setAddressModalOpen(true);
                      }
                    }}
                  >
                    <span className={styles.toggleLabel}>{t('pickup.delivery')}</span>
                    <span className={styles.toggleSubDanger}>{t('pickup.deliveryHint')}</span>
                  </button>
                ) : null}
              </div>

              {deliveryMode === 'pickup' ? (
                <div className={styles.addressBox}>
                  <EnvironmentOutlined className={styles.addressIcon} />
                  <span>
                    {listing.pickupPoint?.address ||
                      listing.shopProvince ||
                      t('pickup.addressFallback')}
                  </span>
                </div>
              ) : deliveryInfo?.address ? (
                <div className={styles.deliveryAddressCard}>
                  <div className={styles.deliveryHeaderRow}>
                    <span className={styles.deliveryAddressTitle}>
                      {t('pickup.deliveryAddress')}
                    </span>
                    <button
                      type="button"
                      className={styles.changeAddressBtn}
                      onClick={() => setAddressModalOpen(true)}
                    >
                      {t('change')}
                    </button>
                  </div>
                  <div className={styles.addressBox}>
                    <EnvironmentOutlined className={styles.addressIcon} />
                    <span>{deliveryInfo.address}</span>
                  </div>
                  {deliveryInfo.distanceKm != null && (
                    <div className={styles.deliveryDistanceInfo}>
                      {deliveryFee == null
                        ? t('pickup.distanceFeeLater', {
                            distance: fmt.distanceKm(deliveryInfo.distanceKm),
                          })
                        : t.rich('pickup.distance', {
                            distance: fmt.distanceKm(deliveryInfo.distanceKm),
                            fee: isZeroMoney(deliveryFee)
                              ? t('pickup.free')
                              : fmt.money(deliveryFee),
                            b: (chunks) => <b>{chunks}</b>,
                          })}
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  className={styles.chooseAddressBtn}
                  onClick={() => setAddressModalOpen(true)}
                >
                  <EnvironmentOutlined aria-hidden="true" />
                  <span>{t('pickup.chooseDelivery')}</span>
                </button>
              )}

              <p className={styles.addressNote}>{t('pickup.note')}</p>
            </div>
          )}

          {/* Tuỳ chọn bảo hiểm MIC */}
          <div className={styles.insuranceSection}>
            <h4 className={styles.sectionTitle}>{t('insurance.title')}</h4>
            <div className={styles.insuranceOptions}>
              <label className={styles.insuranceItem}>
                <Checkbox
                  checked={vehicleProtectionSelected}
                  onChange={(e) => setVehicleProtectionSelected(e.target.checked)}
                />
                <div className={styles.insuranceItemContent}>
                  <div className={styles.insuranceItemRow}>
                    <span className={styles.insuranceItemName}>{t('insurance.vehicleProtection')}</span>
                    <span className={styles.insuranceItemRate}>
                      {listing.vehicleType === 'motorbike'
                        ? t('insurance.vehicleProtectionHintMoto')
                        : t('insurance.vehicleProtectionHintCar')}
                    </span>
                  </div>
                </div>
              </label>

              <label className={styles.insuranceItem}>
                <Checkbox
                  checked={personalAccidentSelected}
                  onChange={(e) => setPersonalAccidentSelected(e.target.checked)}
                />
                <div className={styles.insuranceItemContent}>
                  <div className={styles.insuranceItemRow}>
                    <span className={styles.insuranceItemName}>{t('insurance.personalAccident')}</span>
                    <span className={styles.insuranceItemRate}>
                      {listing.vehicleType === 'motorbike'
                        ? t('insurance.personalAccidentHintMoto')
                        : t('insurance.personalAccidentHintCar')}
                    </span>
                  </div>
                </div>
              </label>
            </div>
            <p className={styles.insuranceNote}>{t('insurance.note')}</p>
          </div>
        </div>
      </div>

      {/* Thẻ thành tiền */}
      <section className={styles.breakdownCard} aria-labelledby={costsTitleId}>
        <h4 id={costsTitleId} className={styles.breakdownTitle}>
          {t('costs.title')}
        </h4>

        {quoteParams == null ? (
          <p className={styles.costNote}>
            {noLongTermPackage
              ? tFlow('price.onRequest')
              : activeService === SERVICE_TYPE.LONG_TERM
                ? tFlow('price.choosePackage')
                : tFlow('price.chooseTime')}
          </p>
        ) : quoteQ.isPending ? (
          <div aria-busy="true">
            <Skeleton active title={false} paragraph={{ rows: 5 }} />
          </div>
        ) : quote ? (
          <>
            {/* Tiền thuê + khuyến mãi trực tiếp — dòng và nhãn của SERVER. */}
            {cost.rentRows.map((row) => (
              <div key={row.key} className={styles.priceLine}>
                <div className={styles.priceLabel}>
                  <span>{row.label}</span>
                  {row.sublabel ? (
                    <span className={styles.priceSubLabel}>{row.sublabel}</span>
                  ) : null}
                </div>
                <span
                  className={cx(
                    styles.priceValue,
                    row.key === PRICE_ROW.DISCOUNT && styles.discountValue,
                  )}
                >
                  {cost.signedMoney(row.amount)}
                </span>
              </div>
            ))}

            {/* Phí dịch vụ, bảo hiểm… phía KHÁCH; dòng chủ xe chịu (thuế) không bao giờ ở đây. */}
            {cost.feeLines.map((line) => (
              <div key={line.key} className={styles.priceLine}>
                <div className={styles.priceLabel}>
                  <span>{dl('feeLine', line.key)}</span>
                  <span className={styles.priceSubLabel}>
                    {[
                      line.percent != null
                        ? `${line.percent}%`
                        : line.unitAmount && line.quantity
                          ? `${line.quantity} ngày × ${fmt.money(line.unitAmount)}`
                          : null,
                      line.partnerName,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                <span className={styles.priceValue}>{fmt.money(line.amount)}</span>
              </div>
            ))}

            {promoAvailable ? (
              <>
                <div className={styles.dashedDivider} />
                <div className={styles.promoGroupTitle}>{t('costs.discountGroup')}</div>
                {/* Số giảm của mã là của SERVER (xem trước mã) — không tự trừ. */}
                {promo.appliedCode && promo.applied?.applicable ? (
                  <div className={styles.promoAppliedRow}>
                    <div className={styles.promoAppliedLeft}>
                      <span className={styles.promoTag}>{promo.appliedCode}</span>
                      <span className={styles.promoDiscountText}>
                        {/* Cùng bảng phí đang dựng ra tổng — một nguồn cho số giảm và tổng. */}−
                        {fmt.money(cost.promoDiscount)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={styles.promoRemoveBtn}
                      onClick={() => promo.remove()}
                      title={t('costs.promoRemove')}
                      aria-label={t('costs.promoRemove')}
                    >
                      <CloseOutlined aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={styles.promoCodeButton}
                    onClick={() => setPromoPickerOpen(true)}
                  >
                    <div className={styles.promoCodeLeft}>
                      <GiftOutlined className={styles.promoGiftIcon} aria-hidden="true" />
                      <span>{t('costs.promoApply')}</span>
                    </div>
                    <RightOutlined className={styles.promoArrowIcon} aria-hidden="true" />
                  </button>
                )}
              </>
            ) : null}

            <PromoStatusNote
              checking={promo.checking}
              reason={promoAvailable ? promo.reason : null}
              hasApplied={Boolean(promo.applied?.applicable)}
              droppedCode={promo.droppedCode}
            />

            <div className={styles.solidDivider} />

            {/* Tiền giữ chỗ (D + S + IV + IP − P) và phần còn lại trả tay chủ xe — ADR 0032 · 0044. */}
            {cost.holdAmount ? (
              <div className={styles.priceLineTop}>
                <div className={styles.priceLabel}>
                  <span>{tPrice('holdAmount')}</span>
                  <span className={styles.priceSubLabel}>{tPrice('holdHint')}</span>
                </div>
                <span className={styles.priceValue}>{fmt.money(cost.holdAmount)}</span>
              </div>
            ) : null}
            {cost.holdAmount && cost.payAtPickup ? (
              <div className={styles.priceLine}>
                <div className={styles.priceLabel}>
                  <span>{tPrice('payAtHandover')}</span>
                </div>
                <span className={styles.priceValue}>{fmt.money(cost.payAtPickup)}</span>
              </div>
            ) : null}

            {/* Cọc thế chấp khi nhận xe — đặt lại rồi lấy về, không nằm trong tổng. */}
            {cost.deposit ? (
              <div className={styles.priceLineTop}>
                <div className={styles.priceLabel}>
                  <span>{tPrice('deposit')}</span>
                  <span className={styles.priceSubLabel}>{cost.deposit.note}</span>
                </div>
                <span className={styles.priceValue}>
                  {cost.deposit.mode === COLLATERAL_MODE.CASH && cost.deposit.amount
                    ? fmt.money(cost.deposit.amount)
                    : dl('collateralMode', cost.deposit.mode)}
                </span>
              </div>
            ) : null}

            <div className={styles.totalRow}>
              <span className={styles.totalLabel}>{cost.total?.label}</span>
              <span className={styles.totalAmount}>
                {fmt.money(cost.total?.amount ?? quote.breakdown.totalAmount)}
              </span>
            </div>
            <p className={styles.costNote}>{cost.costNote}</p>
          </>
        ) : (
          /* Báo giá không về: không bịa số — chủ xe vẫn xác nhận giá khi duyệt, khách vẫn đặt được. */
          <p className={styles.costNote}>{tFlow('price.loadError')}</p>
        )}

        {/* Nút hành động chính */}
        <div className={styles.ctaBtnWrapper}>
          <RequestBookingButton
            vehicleId={listing.id}
            vehicleName={listing.name}
            vehicleImageUrl={listing.mainImageUrl}
            listing={listing}
            pickupAt={pickupIso}
            returnAt={returnIso}
            serviceType={activeService}
            routeType={activeService === SERVICE_TYPE.WITH_DRIVER ? currentRouteType : undefined}
            deliveryProvinceCode={
              activeService === SERVICE_TYPE.WITH_DRIVER
                ? (driverPickupInfo?.provinceCode ??
                  searchProvinceCode ??
                  listing.provinceCode ??
                  undefined)
                : (deliveryInfo?.provinceCode ??
                  searchProvinceCode ??
                  listing.provinceCode ??
                  undefined)
            }
            prefill={{
              pickupMethod:
                activeService === SERVICE_TYPE.WITH_DRIVER
                  ? PICKUP_METHOD.SELF
                  : deliveryMode === 'delivery'
                    ? PICKUP_METHOD.DELIVERY
                    : PICKUP_METHOD.SELF,
              delivery:
                activeService === SERVICE_TYPE.WITH_DRIVER
                  ? driverPickupInfo?.address
                    ? {
                        addressLine: driverPickupInfo.address,
                        provinceCode: driverPickupInfo.provinceCode,
                        placeId: driverPickupInfo.placeId,
                        latitude: driverPickupInfo.lat,
                        longitude: driverPickupInfo.lng,
                      }
                    : null
                  : deliveryMode === 'delivery' && deliveryInfo?.address
                    ? {
                        addressLine: deliveryInfo.address,
                        provinceCode: deliveryInfo.provinceCode,
                        placeId: deliveryInfo.placeId,
                        latitude: deliveryInfo.lat,
                        longitude: deliveryInfo.lng,
                      }
                    : null,
              packageMonths: activeService === SERVICE_TYPE.LONG_TERM ? selectedMonths : null,
              promoCode: promo.appliedCode,
              vehicleProtectionSelected,
              personalAccidentSelected,
              autoContinue:
                activeService === SERVICE_TYPE.LONG_TERM
                  ? selectedMonths != null &&
                    (pickupPreference === 'asap' || requestedPickupDate != null) &&
                    (deliveryMode !== 'delivery' || Boolean(deliveryInfo?.address))
                  : activeService === SERVICE_TYPE.WITH_DRIVER
                    ? Boolean(
                        range.pickupAt &&
                        range.returnAt &&
                        driverPickupInfo?.address &&
                        (currentRouteType === ROUTE_TYPE.IN_CITY || destination.trim()),
                      )
                    : Boolean(range.pickupAt && range.returnAt) &&
                      (deliveryMode !== 'delivery' || Boolean(deliveryInfo?.address)),
            }}
            size="large"
            block
          />
        </div>

        <div className={styles.chatBtnWrapper}>
          <ShopChatButton
            shopSlug={listing.shopSlug}
            vehicleId={listing.id}
            publicChatOpen={listing.shopChatOpen}
            size="large"
          />
        </div>
      </section>

      {/* Modal chọn hoặc nhập mã khuyến mãi */}
      <PromoPicker
        open={promoPickerOpen}
        trip={tripParams}
        appliedCode={promo.appliedCode}
        onClose={() => setPromoPickerOpen(false)}
        onApply={(code) => {
          setPromoPickerOpen(false);
          promo.apply(code);
        }}
      />

      {/* Modal chọn địa chỉ giao xe tận nơi kèm bản đồ */}
      {addressModalOpen && (
        <DeliveryAddressModal
          open={addressModalOpen}
          onClose={() => setAddressModalOpen(false)}
          listing={listing}
          initialAddress={deliveryInfo?.address}
          onConfirm={(info) => {
            setDeliveryInfo(info);
            setDeliveryMode('delivery');
          }}
        />
      )}

      {/* Modal chọn địa chỉ đón khách kèm bản đồ (cho Có tài xế) */}
      {driverAddressModalOpen && (
        <DeliveryAddressModal
          title={t('driver.pickupModalTitle')}
          open={driverAddressModalOpen}
          onClose={() => setDriverAddressModalOpen(false)}
          listing={listing}
          initialAddress={driverPickupInfo?.address}
          onConfirm={(info) => {
            setDriverPickupInfo(info);
            setDriverAddressModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
