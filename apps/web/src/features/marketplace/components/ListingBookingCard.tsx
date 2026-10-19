'use client';

import { useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  CalendarOutlined,
  CheckCircleFilled,
  CloseOutlined,
  EnvironmentOutlined,
  GiftOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { DatePicker } from 'antd';
import {
  isRouteType,
  ROUTE_TYPE,
  SERVICE_TYPE,
  type RouteType,
} from '@xeprime/types';
import { appWallClockToIso, nowInAppTz, toAppTz, type Dayjs } from '@/lib/datetime';
import { applyDiscountPercent } from '@/lib/money';
import { rememberRentalRange, rememberedOrDefaultRentalRange } from '@/lib/rental-range-memory';
import { useAppFormat } from '@/i18n/use-app-format';
import { RequestBookingButton } from '@/features/booking-requests/components/RequestBookingButton';
import { PICKUP_METHOD } from '@/features/booking-requests/schema';
import { ShopChatButton } from '@/features/chat/components/ShopChatButton';
import { DiscountTag } from '@/components/data-display/DiscountTag';
import {
  RentalDateTimeRangeField,
  type RentalMode,
  type RentalRange,
} from '@/components/form/RentalDateTimeRangeField';
import { usePromoCode } from '@/features/promo-codes/use-promo-code';
import { PromoPicker } from '@/features/promo-codes/components/PromoCodeField';
import type { PromoTripParams } from '@/features/promo-codes/types';
import { readDeliveryAddress } from '@/lib/delivery-address-memory';
import {
  DeliveryAddressModal,
  type ConfirmedDeliveryInfo,
} from './DeliveryAddressModal';
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
  const fmt = useAppFormat();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const services = listing.serviceTypes ?? [SERVICE_TYPE.SELF_DRIVE];
  const discount = listing.discountPercent ?? 0;

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
        fee: 0,
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
  const [rentalMode, setRentalMode] = useState<RentalMode>('daily');

  // 3. Quản lý lộ trình cho dịch vụ "Có tài xế"
  const [currentRouteType, setCurrentRouteType] = useState<RouteType>(() => {
    const fromUrl = searchParams.get('routeType');
    if (isRouteType(fromUrl)) return fromUrl;
    if (isRouteType(routeType)) return routeType;
    return ROUTE_TYPE.IN_CITY;
  });

  // 4. Quản lý gói thuê dài hạn
  const longTermPackages = listing.longTermPackages ?? [];
  const [selectedMonths, setSelectedMonths] = useState<number>(() => {
    return longTermPackages[0]?.packageMonths ?? 1;
  });

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
        fee: 0,
      };
    }
    return null;
  });
  const [driverAddressModalOpen, setDriverAddressModalOpen] = useState(false);
  const [destination, setDestination] = useState('');

  // 4b. Quản lý nguyện vọng nhận xe cho Thuê dài hạn
  const [pickupPreference, setPickupPreference] = useState<'asap' | 'specific_date'>('asap');
  const [requestedPickupDate, setRequestedPickupDate] = useState<Dayjs | null>(null);

  const expectedReturnDateStr = useMemo(() => {
    const start =
      pickupPreference === 'specific_date' && requestedPickupDate
        ? requestedPickupDate
        : nowInAppTz();
    return start.add(selectedMonths, 'month').format('DD/MM/YYYY');
  }, [pickupPreference, requestedPickupDate, selectedMonths]);

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

  // Tính số ngày thuê thực tế (mặc định 2 ngày ước tính cho preview)
  let estDays = 2;
  if (activeService === SERVICE_TYPE.LONG_TERM) {
    estDays = selectedMonths;
  } else if (range.pickupAt && range.returnAt) {
    const diffHours = range.returnAt.diff(range.pickupAt, 'hour', true);
    const computed = Math.ceil(diffHours / 24);
    estDays = computed > 1 ? computed : 2;
  }

  // Giá cơ bản theo dịch vụ đang chọn
  let basePrice = Number(listing.weekdayPrice || 0);
  let unitLabel = '/ngày';

  if (activeService === SERVICE_TYPE.LONG_TERM) {
    const pkg = longTermPackages.find((p) => p.packageMonths === selectedMonths);
    basePrice = Number(pkg?.baseMonthlyPrice || listing.monthlyPrice || 0);
    unitLabel = '/tháng';
  } else if (activeService === SERVICE_TYPE.WITH_DRIVER) {
    basePrice = Number(listing.withDriverDailyPrice || listing.weekdayPrice || 0);
    unitLabel = '/ngày';
  }

  const finalDailyPrice =
    discount > 0 ? applyDiscountPercent(String(basePrice), discount) : String(basePrice);

  const rentTotal = Number(finalDailyPrice) * estDays;
  const deliveryFee =
    deliveryMode === 'delivery' && listing.deliveryEnabled
      ? (deliveryInfo?.fee ?? 150000)
      : 0;

  // 5. Quản lý mã khuyến mãi
  const pickupIso = range.pickupAt ? appWallClockToIso(range.pickupAt) : (pickupAt ?? undefined);
  const returnIso = range.returnAt ? appWallClockToIso(range.returnAt) : (returnAt ?? undefined);

  const tripParams: PromoTripParams = useMemo(
    () => ({
      vehicleId: listing.id,
      serviceType: activeService,
      pickupAt: pickupIso,
      returnAt: returnIso,
      routeType: activeService === SERVICE_TYPE.WITH_DRIVER ? currentRouteType : undefined,
      packageMonths: activeService === SERVICE_TYPE.LONG_TERM ? selectedMonths : undefined,
    }),
    [listing.id, activeService, pickupIso, returnIso, currentRouteType, selectedMonths],
  );

  const promo = usePromoCode(tripParams);
  const [promoPickerOpen, setPromoPickerOpen] = useState(false);

  const promoDiscountAmount =
    promo.applied && promo.applied.applicable
      ? Number(promo.applied.discountAmount ?? 0)
      : 0;

  const rentAfterPromo = Math.max(0, rentTotal - promoDiscountAmount);
  const totalPayableEst = rentAfterPromo + deliveryFee;
  const holdEst = Math.round(rentTotal * 0.3);

  // Cọc xe
  const depositEst = listing.noCollateral
    ? 0
    : listing.collateral?.depositAmount
      ? Number(listing.collateral.depositAmount)
      : 3000000;

  const availableMonths =
    longTermPackages.length > 0
      ? longTermPackages.map((p) => p.packageMonths)
      : [1, 3, 6, 12];

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        {/* Thanh tab dịch vụ */}
        {services.length > 1 ? (
          <div className={styles.tabHeader} role="tablist">
            {services.includes(SERVICE_TYPE.SELF_DRIVE) && (
              <button
                type="button"
                className={`${styles.serviceTab} ${activeService === SERVICE_TYPE.SELF_DRIVE ? styles.serviceTabActive : ''}`}
                onClick={() => handleTabClick(SERVICE_TYPE.SELF_DRIVE)}
              >
                Thuê theo ngày
              </button>
            )}
            {services.includes(SERVICE_TYPE.WITH_DRIVER) && (
              <button
                type="button"
                className={`${styles.serviceTab} ${activeService === SERVICE_TYPE.WITH_DRIVER ? styles.serviceTabActive : ''}`}
                onClick={() => handleTabClick(SERVICE_TYPE.WITH_DRIVER)}
              >
                Có tài xế
              </button>
            )}
            {services.includes(SERVICE_TYPE.LONG_TERM) && (
              <button
                type="button"
                className={`${styles.serviceTab} ${activeService === SERVICE_TYPE.LONG_TERM ? styles.serviceTabActive : ''}`}
                onClick={() => handleTabClick(SERVICE_TYPE.LONG_TERM)}
              >
                Thuê dài hạn
              </button>
            )}
          </div>
        ) : null}

        <div className={styles.body}>
          {/* Dòng giá */}
          <div className={styles.priceRow}>
            <div className={styles.priceGroup}>
              {discount > 0 && (
                <span className={styles.oldPrice}>{fmt.money(String(basePrice))}</span>
              )}
              <span className={styles.mainPrice}>{fmt.money(finalDailyPrice)}</span>
              <span className={styles.unit}>{unitLabel}</span>
            </div>
            {discount > 0 && <DiscountTag percent={discount} />}
          </div>

          {/* Chọn lộ trình khi đang ở tab Có tài xế (3 lộ trình: Nội thành, Liên tỉnh, Liên tỉnh 1 chiều) */}
          {activeService === SERVICE_TYPE.WITH_DRIVER && (
            <div className={styles.routeGroup}>
              <span className={styles.routeLabel}>Lộ trình di chuyển:</span>
              <div className={styles.routeOptions}>
                <button
                  type="button"
                  className={`${styles.routeBtn} ${currentRouteType === ROUTE_TYPE.IN_CITY ? styles.routeBtnActive : ''}`}
                  onClick={() => handleRouteTypeChange(ROUTE_TYPE.IN_CITY)}
                >
                  Nội thành
                </button>
                <button
                  type="button"
                  className={`${styles.routeBtn} ${currentRouteType === ROUTE_TYPE.INTER_CITY ? styles.routeBtnActive : ''}`}
                  onClick={() => handleRouteTypeChange(ROUTE_TYPE.INTER_CITY)}
                >
                  Liên tỉnh
                </button>
                <button
                  type="button"
                  className={`${styles.routeBtn} ${currentRouteType === ROUTE_TYPE.INTER_CITY_ONE_WAY ? styles.routeBtnActive : ''}`}
                  onClick={() => handleRouteTypeChange(ROUTE_TYPE.INTER_CITY_ONE_WAY)}
                >
                  Liên tỉnh (1 chiều)
                </button>
              </div>
            </div>
          )}

          {/* Chọn gói dài hạn khi ở tab Thuê dài hạn (kèm tag giảm giá) */}
          {activeService === SERVICE_TYPE.LONG_TERM && (
            <div className={styles.packageGroup}>
              <span className={styles.routeLabel}>Thời hạn thuê:</span>
              <div className={styles.packageOptions}>
                {availableMonths.map((m) => {
                  const pkg = longTermPackages.find((p) => p.packageMonths === m);
                  return (
                    <button
                      key={m}
                      type="button"
                      className={`${styles.packageBtn} ${selectedMonths === m ? styles.packageBtnActive : ''}`}
                      onClick={() => setSelectedMonths(m)}
                    >
                      <span>{m} tháng</span>
                      {pkg?.durationDiscountPercent ? (
                        <span className={styles.packageDiscountBadge}>-{pkg.durationDiscountPercent}%</span>
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
              <span className={styles.inputLabel}>Nguyện vọng ngày nhận xe:</span>
              <div className={styles.longTermPrefOptions}>
                <button
                  type="button"
                  className={`${styles.longTermPrefBtn} ${pickupPreference === 'asap' ? styles.longTermPrefBtnActive : ''}`}
                  onClick={() => setPickupPreference('asap')}
                >
                  Càng sớm càng tốt (trong 7 ngày tới)
                </button>
                <button
                  type="button"
                  className={`${styles.longTermPrefBtn} ${pickupPreference === 'specific_date' ? styles.longTermPrefBtnActive : ''}`}
                  onClick={() => setPickupPreference('specific_date')}
                >
                  Chọn ngày cụ thể
                </button>
              </div>

              {pickupPreference === 'specific_date' && (
                <div className={styles.specificDatePickerWrap}>
                  <span className={styles.inputSubLabel}>Ngày bạn muốn nhận xe:</span>
                  <DatePicker
                    value={requestedPickupDate}
                    onChange={(d) => setRequestedPickupDate(d)}
                    disabledDate={(current) => current && current < nowInAppTz().startOf('day')}
                    format="DD/MM/YYYY"
                    placeholder="Chọn ngày nhận xe"
                    className={styles.datePickerInput}
                  />
                </div>
              )}

              <div className={styles.expectedReturnBox}>
                <CalendarOutlined className={styles.calendarIcon} />
                <div>
                  <span className={styles.expectedReturnLabel}>Ngày trả xe dự kiến:</span>
                  <span className={styles.expectedReturnValue}>
                    {expectedReturnDateStr} ({selectedMonths} tháng)
                  </span>
                </div>
              </div>
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
              <h4 className={styles.sectionTitle}>Địa chỉ đón khách</h4>
              {driverPickupInfo?.address ? (
                <div className={styles.deliveryAddressCard}>
                  <div className={styles.deliveryHeaderRow}>
                    <span className={styles.deliveryAddressTitle}>Tài xế đón tại:</span>
                    <button
                      type="button"
                      className={styles.changeAddressBtn}
                      onClick={() => setDriverAddressModalOpen(true)}
                    >
                      Thay đổi
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
                  <EnvironmentOutlined />
                  <span>Chọn địa chỉ đón khách & xem bản đồ</span>
                </button>
              )}

              {/* Nếu là lộ trình Liên tỉnh hoặc Liên tỉnh 1 chiều: hiển thị ô Điểm đến */}
              {currentRouteType !== ROUTE_TYPE.IN_CITY && (
                <div className={styles.destinationSection}>
                  <span className={styles.inputLabel}>Điểm đến (Tỉnh/thành hoặc địa chỉ đến):</span>
                  <input
                    type="text"
                    className={styles.textInput}
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="Ví dụ: TP. Hội An, Quảng Nam"
                  />
                </div>
              )}

              {/* Quy định phụ phí tài xế nếu có */}
              {listing.driverSurchargeRules && listing.driverSurchargeRules.length > 0 && (
                <div className={styles.driverRulesBox}>
                  <span className={styles.rulesTitle}>Phụ phí tài xế (nếu phát sinh trong chuyến):</span>
                  <ul className={styles.rulesList}>
                    {listing.driverSurchargeRules.map((rule) => (
                      <li key={rule.kind}>
                        {rule.kind === 'overtime'
                          ? 'Ngoài giờ'
                          : rule.kind === 'overnight'
                            ? 'Lưu đêm'
                            : rule.kind === 'excess_distance'
                              ? 'Vượt quãng đường'
                              : rule.kind}
                        : {fmt.money(rule.amount)} /{' '}
                        {rule.unit === 'hour'
                          ? 'giờ'
                          : rule.unit === 'night'
                            ? 'đêm'
                            : rule.unit === 'km'
                              ? 'km'
                              : rule.unit}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.locationSection}>
              <h4 className={styles.sectionTitle}>Vị trí nhận xe</h4>
              <div className={styles.deliveryToggle}>
                <button
                  type="button"
                  className={`${styles.toggleBtn} ${deliveryMode === 'pickup' ? styles.toggleBtnActive : ''}`}
                  onClick={() => setDeliveryMode('pickup')}
                >
                  <span className={styles.toggleLabel}>Khách tự nhận xe</span>
                  <span className={styles.toggleSub}>Miễn phí</span>
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
                    <span className={styles.toggleLabel}>Giao xe tận nơi</span>
                    <span className={styles.toggleSubDanger}>Phụ phí tính theo km</span>
                  </button>
                ) : null}
              </div>

              {deliveryMode === 'pickup' ? (
                <div className={styles.addressBox}>
                  <EnvironmentOutlined className={styles.addressIcon} />
                  <span>
                    {listing.pickupPoint?.address || listing.shopProvince || 'Địa chỉ bàn giao của gian hàng'}
                  </span>
                </div>
              ) : deliveryInfo?.address ? (
                <div className={styles.deliveryAddressCard}>
                  <div className={styles.deliveryHeaderRow}>
                    <span className={styles.deliveryAddressTitle}>Địa chỉ giao xe tận nơi:</span>
                    <button
                      type="button"
                      className={styles.changeAddressBtn}
                      onClick={() => setAddressModalOpen(true)}
                    >
                      Thay đổi
                    </button>
                  </div>
                  <div className={styles.addressBox}>
                    <EnvironmentOutlined className={styles.addressIcon} />
                    <span>{deliveryInfo.address}</span>
                  </div>
                  {deliveryInfo.distanceKm != null && (
                    <div className={styles.deliveryDistanceInfo}>
                      Khoảng cách dự kiến: ~{fmt.distanceKm(deliveryInfo.distanceKm)} · Phí giao:{' '}
                      <b>{deliveryFee === 0 ? 'Miễn phí' : fmt.money(String(deliveryFee))}</b>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  className={styles.chooseAddressBtn}
                  onClick={() => setAddressModalOpen(true)}
                >
                  <EnvironmentOutlined />
                  <span>Chọn địa chỉ giao xe & xem bản đồ</span>
                </button>
              )}

              {/* Quyền lợi thuê dài hạn nếu ở tab Thuê dài hạn */}
              {activeService === SERVICE_TYPE.LONG_TERM && (
                <div className={styles.longTermBenefits}>
                  <div className={styles.benefitItem}>
                    <CheckCircleFilled className={styles.benefitIcon} />
                    <span>Bảo dưỡng định kỳ trọn gói miễn phí</span>
                  </div>
                  <div className={styles.benefitItem}>
                    <CheckCircleFilled className={styles.benefitIcon} />
                    <span>Xe thay thế tương đương khi bảo dưỡng hoặc sự cố</span>
                  </div>
                  <div className={styles.benefitItem}>
                    <CheckCircleFilled className={styles.benefitIcon} />
                    <span>Hỗ trợ kỹ thuật cứu hộ 24/7</span>
                  </div>
                </div>
              )}

              <p className={styles.addressNote}>
                * Địa điểm cụ thể và số điện thoại chủ xe sẽ hiển thị sau khi hoàn tất thanh toán giữ chỗ.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Thẻ thành tiền */}
      <div className={styles.breakdownCard}>
        <h4 className={styles.breakdownTitle}>Thành tiền</h4>

        <div className={styles.priceLine}>
          <div className={styles.priceLabel}>
            <span>Phí thuê xe</span>
            <span className={styles.priceSubLabel}>
              {estDays} {activeService === SERVICE_TYPE.LONG_TERM ? 'tháng' : 'ngày'} x {fmt.money(finalDailyPrice)}
            </span>
          </div>
          <span className={styles.priceValue}>{fmt.money(String(rentTotal))}</span>
        </div>

        <div className={styles.dashedDivider} />

        {deliveryFee > 0 && (
          <>
            <div className={styles.priceLine}>
              <div className={styles.priceLabel}>
                <span>Phí giao xe tạm tính</span>
              </div>
              <span className={styles.priceValue}>{fmt.money(String(deliveryFee))}</span>
            </div>
            <div className={styles.dashedDivider} />
          </>
        )}

        {/* Khuyến mãi nền tảng mặc định */}
        {discount > 0 && (
          <>
            <div className={styles.promoGroupTitle}>Giảm giá/Khuyến mãi</div>
            <div className={styles.priceLine}>
              <div className={styles.priceLabel}>
                <span>Khuyến mãi XePrime (-{discount}%)</span>
              </div>
              <span className={styles.discountValue}>
                -{fmt.money(String(Number(listing.weekdayPrice || 0) * estDays - rentTotal))}
              </span>
            </div>
          </>
        )}

        {/* Áp dụng mã khuyến mãi hoặc hiển thị mã đã áp */}
        {promo.appliedCode && promo.applied?.applicable ? (
          <div className={styles.promoAppliedRow}>
            <div className={styles.promoAppliedLeft}>
              <span className={styles.promoTag}>{promo.appliedCode}</span>
              <span className={styles.promoDiscountText}>
                -{fmt.money(String(promoDiscountAmount))}
              </span>
            </div>
            <button
              type="button"
              className={styles.promoRemoveBtn}
              onClick={() => promo.remove()}
              title="Gỡ mã khuyến mãi"
              aria-label="Gỡ mã khuyến mãi"
            >
              <CloseOutlined />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={styles.promoCodeButton}
            onClick={() => setPromoPickerOpen(true)}
          >
            <div className={styles.promoCodeLeft}>
              <GiftOutlined className={styles.promoGiftIcon} />
              <span>Áp dụng mã khuyến mãi / giới thiệu</span>
            </div>
            <RightOutlined className={styles.promoArrowIcon} />
          </button>
        )}

        <div className={styles.solidDivider} />

        {listing.vatInvoiceSupported && (
          <div className={styles.priceLine}>
            <div className={styles.priceLabel}>
              <span>Thuế VAT</span>
            </div>
            <span className={styles.priceValue}>{fmt.money(String(Math.round(rentTotal * 0.1)))}</span>
          </div>
        )}

        <div className={styles.priceLineTop}>
          <div className={styles.priceLabel}>
            <span>Tiền giữ chỗ</span>
            <span className={styles.priceSubLabel}>
              Tiền giữ chỗ không phải phụ phí và sẽ được trừ trực tiếp vào khoản thanh toán. Bạn phải thanh toán tiền giữ chỗ trước khi nhận xe.
            </span>
          </div>
          <span className={styles.priceValue}>{fmt.money(String(holdEst))}</span>
        </div>

        <div className={styles.priceLineTop}>
          <div className={styles.priceLabel}>
            <span>Cọc xe</span>
            <span className={styles.priceSubLabel}>
              {listing.noCollateral
                ? 'Xe này miễn thế chấp tài sản / cọc xe máy khi nhận xe.'
                : 'Thanh toán khi nhận xe và kiểm tra xe. Có nhận cọc xe máy. Lưu ý: Mức cọc có thể cao hơn đối với bằng lái mới được cấp dưới 1 năm. Liên hệ CSKH để biết thêm chi tiết!'}
            </span>
          </div>
          <span className={styles.priceValue}>
            {listing.noCollateral ? 'Miễn cọc' : fmt.money(String(depositEst))}
          </span>
        </div>

        <div className={styles.totalRow}>
          <span className={styles.totalLabel}>Tổng thanh toán dự kiến</span>
          <span className={styles.totalAmount}>{fmt.money(String(totalPayableEst))}</span>
        </div>

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
                ? (driverPickupInfo?.provinceCode ?? searchProvinceCode ?? listing.provinceCode ?? undefined)
                : (deliveryInfo?.provinceCode ?? searchProvinceCode ?? listing.provinceCode ?? undefined)
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
      </div>

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
          title="Chọn địa chỉ đón khách"
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
