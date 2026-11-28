'use client';

import { ConfigProvider, Slider, type ThemeConfig } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  CATALOG_TYPE,
  FUEL_TYPE_LABEL,
  LISTING_MIN_RATING_VALUES,
  MOTORBIKE_CATEGORY,
  MOTORBIKE_CATEGORY_VALUES,
  SEAT_BUCKET_LABEL,
  SEAT_BUCKET_VALUES,
  SERVICE_TYPE,
  TRANSMISSION_TYPE_EXT_LABEL,
  VEHICLE_TYPE,
  type MotorbikeCategory,
  vehicleFuelTypesFor,
  type ServiceType,
  type TransmissionTypeExt,
  type VehicleType,
} from '@xeprime/types';
import { LineIcon } from '@/components/icons/LineIcon';
import { InfoTip } from '@/components/overlay/InfoTip';
import { catalogItemAppliesTo } from '@/features/catalog/types';
import { useCatalog } from '@/features/catalog/use-catalog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { useTheme, type ThemeMode } from '@/lib/theme';
import { XP_TOKENS } from '@/styles/theme';
import {
  isPriceBandSelected,
  priceBandsFor,
  priceSliderFor,
  quickTransmissionsFor,
} from '../constants';
import { priceIsMonthly } from '../filter-params';
import { useMarketplaceFilters } from '../hooks/use-marketplace-filters';
import { resolveServiceType } from '../search/search-draft';
import { useSearchExperience, type TripDraft } from '../search/search-context';
import { serviceItems } from '../search/search-items';
import { usePriceBandLabel } from '../search/use-price-band-label';
import type { MarketplaceFilters } from '../types';
import { BrandMark } from './BrandMark';
import { ChipStar, FilterChip } from './filter-modal/FilterChip';
import { TripSummary, TripTray } from './filter-modal/TripPanel';
import { PriceHistogram } from './filter-modal/PriceHistogram';
import styles from './FilterModal.module.css';

interface FilterModalProps {
  open: boolean;
  onClose: () => void;
}

interface ModalDraft {
  vehicleType: VehicleType;
  serviceType: ServiceType;
  brand: string[];
  bodyType: string[];
  motorbikeCategory: string[];
  seats: string[];
  fuelType: string[];
  features: string[];
  transmission: string[];
  priceMin?: number;
  priceMax?: number;
  delivery?: boolean;
  noCollateral?: boolean;
  vatInvoice?: boolean;
  discount?: boolean;
  instantBook?: boolean;
  minRating?: number;
}

type ListField =
  'brand' | 'bodyType' | 'motorbikeCategory' | 'seats' | 'fuelType' | 'features' | 'transmission';

type FlagField = 'delivery' | 'noCollateral' | 'vatInvoice' | 'discount' | 'instantBook';

/** Mục của rail "Danh mục lọc" (desktop) / dải tab (điện thoại) — thứ tự = thứ tự nhóm bên dưới. */
const NAV_KEYS = ['quickPrice', 'brandType', 'specs', 'delivery', 'terms'] as const;
type NavKey = (typeof NAV_KEYS)[number];

/** Số hãng / tiện ích hiện trước viên "+N … khác" — Figma vẽ 8 viên rồi tới viên đếm. */
const COLLAPSED_COUNT = 8;

/** Mức điểm cao nhất — viên lọc nhanh "Chủ xe 4.8+" là lối tắt của đúng mức này. */
const TOP_RATING = Math.max(...LISTING_MIN_RATING_VALUES);

/** Nhóm cuối — cuộn chạm đáy thì nó là nhóm đang xem dù quá thấp để chạm mép trên. */
const LAST_NAV_KEY: NavKey = 'terms';

/** Dòng mô tả dưới thẻ phân khúc xe máy — chỉ những phân khúc Figma có chữ (22588:71548). */
const MOTO_DESC_KEY: Partial<Record<MotorbikeCategory, 'scooter' | 'underbone' | 'sport'>> = {
  [MOTORBIKE_CATEGORY.SCOOTER]: 'scooter',
  [MOTORBIKE_CATEGORY.UNDERBONE]: 'underbone',
  [MOTORBIKE_CATEGORY.SPORT]: 'sport',
};

/** Khoảng đệm khi cuộn tới một nhóm — nhóm không dính sát mép trên vùng cuộn. */
const SCROLL_OFFSET = 20;

/*
 * Thanh trượt giá (22588:63490): rãnh 6px gray-100, đoạn chọn vàng, núm 20px nền trắng viền vàng
 * 2.5px — núm AntD = `handleSize` + 2 × `handleLineWidth`. Rãnh chỉ tô gray-100 ở giao diện sáng;
 * giao diện tối để thuật toán tối của AntD tự chọn (gray-100 trên nền tối là một vệt sáng chói).
 */
const PRICE_SLIDER_BASE = {
  railSize: 6,
  handleSize: 15,
  handleSizeHover: 15,
  handleLineWidth: 2.5,
  handleLineWidthHover: 2.5,
  handleColor: XP_TOKENS['color-primary'],
  handleActiveColor: XP_TOKENS['color-primary'],
  trackBg: XP_TOKENS['color-primary'],
  trackBgHover: XP_TOKENS['color-primary'],
};
const PRICE_SLIDER_THEME: Readonly<Record<ThemeMode, ThemeConfig>> = {
  light: {
    components: {
      Slider: {
        ...PRICE_SLIDER_BASE,
        railBg: XP_TOKENS['color-bg-muted'],
        railHoverBg: XP_TOKENS['color-bg-muted'],
      },
    },
  },
  dark: { components: { Slider: PRICE_SLIDER_BASE } },
};

function initDraft(filters: MarketplaceFilters): ModalDraft {
  return {
    vehicleType: (filters.vehicleType as VehicleType | undefined) ?? VEHICLE_TYPE.CAR,
    serviceType: (filters.serviceType as ServiceType | undefined) ?? SERVICE_TYPE.SELF_DRIVE,
    brand: filters.brand ?? [],
    bodyType: filters.bodyType ?? [],
    motorbikeCategory: filters.motorbikeCategory ?? [],
    seats: filters.seats ?? [],
    fuelType: filters.fuelType ?? [],
    features: filters.features ?? [],
    transmission: filters.transmission ?? [],
    priceMin: filters.priceMin,
    priceMax: filters.priceMax,
    delivery: filters.delivery,
    noCollateral: filters.noCollateral,
    vatInvoice: filters.vatInvoice,
    discount: filters.discount,
    instantBook: filters.instantBook,
    minRating: filters.minRating,
  };
}

/** So khớp tên hãng không phân biệt hoa thường và dấu — gõ "vin" ra "VinFast". */
/**
 * Đổi dịch vụ trong nháp. Qua lại giữa giá NGÀY và giá THÁNG (dài hạn) thì bỏ khoảng giá cũ - cùng
 * luật với `applyFilterPatch`: 800k/ngày đặt lên giá tháng chỉ cho ra danh sách rỗng.
 */
function withService(draft: ModalDraft, serviceType: ServiceType): ModalDraft {
  return priceIsMonthly(draft.serviceType) === priceIsMonthly(serviceType)
    ? { ...draft, serviceType }
    : { ...draft, serviceType, priceMin: undefined, priceMax: undefined };
}

function foldText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
}

/**
 * Hộp "Bộ lọc" của trang kết quả — Figma `21636:82907` (desktop: ô tô `22588:63913`, xe máy
 * `22588:72015`, khay đổi hành trình `22588:74302`) · điện thoại `22600:78527` / `22600:80517`.
 *
 * Bố cục: đầu hộp (tiêu đề + viên hành trình) đứng yên; desktop có rail "Danh mục lọc" bên trái
 * (bấm để cuộn tới nhóm, tự sáng theo vị trí cuộn), điện thoại thay bằng dải tab; chân hộp cố định.
 * Lựa chọn tiêu chí là NHÁP cục bộ — chỉ "Xem kết quả" mới ghi vào URL (ADR 0004). Hành trình (loại
 * xe, dịch vụ, địa điểm, thời gian) sửa trong khay riêng và áp bằng "Cập nhật hành trình".
 *
 * Design vẽ thêm vài tiêu chí chợ chưa có dữ liệu để lọc (biểu đồ phân bố giá, loại chủ xe, mức cọc
 * tối đa, giới hạn km, chính sách huỷ, bảo hiểm, ưu đãi dài hạn) — chúng KHÔNG được dựng thành ô bấm
 * mà không lọc gì (người dùng chốt 28/11/2026). Mọi bộ lọc đã có vẫn giữ nguyên nghĩa.
 */
export function FilterModal({ open, onClose }: FilterModalProps) {
  const t = useTranslations('Marketplace.filterPanel');
  const tService = useTranslations('HomeSearch.service');
  const tCommon = useTranslations('Common');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();
  const priceBandLabel = usePriceBandLabel();
  const { filters, setFilters } = useMarketplaceFilters();
  const { draft: searchDraft, applyTrip } = useSearchExperience();
  const { catalog } = useCatalog();
  const { theme: themeMode } = useTheme();

  const [draft, setDraft] = useState<ModalDraft>(() => initDraft(filters));
  const [showAllBrands, setShowAllBrands] = useState(false);
  const [showAllFeatures, setShowAllFeatures] = useState(false);
  const [brandQuery, setBrandQuery] = useState('');
  const [tripOpen, setTripOpen] = useState(false);
  const [trip, setTrip] = useState<TripDraft | null>(null);
  const [activeNav, setActiveNav] = useState<NavKey>('quickPrice');

  const scrollRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Partial<Record<NavKey, HTMLButtonElement | null>>>({});

  /*
   * Nạp lại nháp đúng lúc panel MỞ — điều chỉnh state ngay trong render, không phải effect.
   *
   * Không theo dõi `filters`: "Cập nhật hành trình" ghi thẳng vào URL, nên reset theo `filters`
   * sẽ xoá sạch các hãng/hộp số khách vừa chọn mà chưa bấm "Xem kết quả".
   */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(initDraft(filters));
      setShowAllBrands(false);
      setShowAllFeatures(false);
      setBrandQuery('');
      setTripOpen(false);
      setTrip(null);
      setActiveNav('quickPrice');
    }
  }

  // Esc thu khay hành trình trước, lần nữa mới đóng hộp — như mọi hộp thoại khác của chợ.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (tripOpen) setTripOpen(false);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, tripOpen]);

  // Tab đang sáng ở điện thoại luôn nằm trong tầm nhìn của dải tab cuộn ngang.
  useEffect(() => {
    tabRefs.current[activeNav]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeNav]);

  const isMotorbike = draft.vehicleType === VEHICLE_TYPE.MOTORBIKE;
  /*
   * Hãng và tiện ích theo loại xe đọc từ `catalog_items.vehicle_types`. Mục ĐANG CHỌN luôn còn
   * hiện để khách bỏ chọn được, kể cả khi vừa đổi sang loại xe mà nó không áp dụng.
   */
  const brandItems = catalog[CATALOG_TYPE.VEHICLE_BRAND].filter(
    (b) => draft.brand.includes(b.key) || catalogItemAppliesTo(b, draft.vehicleType),
  );
  const bodyTypeItems = catalog[CATALOG_TYPE.BODY_TYPE];
  const featureItems = catalog[CATALOG_TYPE.VEHICLE_FEATURE].filter(
    (f) => draft.features.includes(f.key) || catalogItemAppliesTo(f, draft.vehicleType),
  );
  /* Hai chiều đọc CÙNG một bảng (`vehicleServiceTypesFor`) với thẻ tìm kiếm: xe máy không có "có tài xế". */
  const services = useMemo(
    () => serviceItems(draft.vehicleType, true, tService),
    [draft.vehicleType, tService],
  );
  // Dài hạn lọc theo GIÁ THÁNG (server so `monthly_price`), các dịch vụ khác theo giá ngày.
  const monthlyPrice = priceIsMonthly(draft.serviceType);
  const priceBands = priceBandsFor(draft.vehicleType, draft.serviceType);
  const priceSlider = priceSliderFor(draft.vehicleType, draft.serviceType);
  const transmissions = quickTransmissionsFor(draft.vehicleType);
  const fuelTypes = vehicleFuelTypesFor(draft.vehicleType);
  const transmissionLabel = (code: string) =>
    domainLabel(
      'transmissionType',
      code,
      TRANSMISSION_TYPE_EXT_LABEL[code as TransmissionTypeExt] ?? code,
    );
  const ratingLabel = (rating: number) => t('modal.ratingFrom', { rating });

  if (!open) return null;

  const foldedBrandQuery = foldText(brandQuery);
  const matchedBrands = foldedBrandQuery
    ? brandItems.filter((b) => foldText(b.label).includes(foldedBrandQuery))
    : brandItems;
  const displayedBrands =
    showAllBrands || foldedBrandQuery ? matchedBrands : matchedBrands.slice(0, COLLAPSED_COUNT);
  const hiddenBrandCount = matchedBrands.length - displayedBrands.length;
  const displayedFeatures = showAllFeatures ? featureItems : featureItems.slice(0, COLLAPSED_COUNT);
  const hiddenFeatureCount = featureItems.length - displayedFeatures.length;

  const toggleItem = (field: ListField, value: string) => {
    setDraft((prev) => {
      const list = prev[field];
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { ...prev, [field]: next };
    });
  };
  const setFlag = (field: FlagField, checked: boolean) =>
    setDraft((prev) => ({ ...prev, [field]: checked || undefined }));
  const toggleFlag = (field: FlagField) => setFlag(field, !draft[field]);
  const setPrice = (priceMin: number | undefined, priceMax: number | undefined) =>
    setDraft((prev) => ({ ...prev, priceMin, priceMax }));
  const toggleRating = (rating: number) =>
    setDraft((prev) => ({ ...prev, minRating: prev.minRating === rating ? undefined : rating }));

  const handleApply = () => {
    // Nhiên liệu / hộp số không thuộc loại xe vừa chọn (diesel khi đã sang xe máy) bị bỏ, không
    // trở thành một bộ lọc vô hình làm rỗng kết quả.
    const fuelType = draft.fuelType.filter((code) =>
      (fuelTypes as readonly string[]).includes(code),
    );
    const transmission = draft.transmission.filter((code) =>
      (transmissions as readonly string[]).includes(code),
    );
    setFilters({
      vehicleType: draft.vehicleType,
      serviceType: draft.serviceType,
      brand: draft.brand.length > 0 ? draft.brand : undefined,
      bodyType: !isMotorbike && draft.bodyType.length > 0 ? draft.bodyType : undefined,
      motorbikeCategory:
        isMotorbike && draft.motorbikeCategory.length > 0 ? draft.motorbikeCategory : undefined,
      seats: !isMotorbike && draft.seats.length > 0 ? draft.seats : undefined,
      fuelType: fuelType.length > 0 ? fuelType : undefined,
      features: draft.features.length > 0 ? draft.features : undefined,
      transmission: transmission.length > 0 ? transmission : undefined,
      priceMin: draft.priceMin,
      priceMax: draft.priceMax,
      delivery: draft.delivery,
      noCollateral: draft.noCollateral,
      vatInvoice: draft.vatInvoice,
      discount: draft.discount,
      instantBook: draft.instantBook,
      minRating: draft.minRating,
    });
    onClose();
  };

  const handleClear = () => {
    setDraft({
      vehicleType: draft.vehicleType,
      serviceType: draft.serviceType,
      brand: [],
      bodyType: [],
      motorbikeCategory: [],
      seats: [],
      fuelType: [],
      features: [],
      transmission: [],
    });
  };

  // ─── Khay hành trình ─────────────────────────────────────────────────────────────────────
  const openTrip = () => {
    setTrip({
      vehicleType: draft.vehicleType,
      serviceType: draft.serviceType,
      provinceCode: searchDraft.provinceCode,
      rental: searchDraft.rental,
      longTerm: searchDraft.longTerm,
    });
    setTripOpen(true);
  };
  const commitTrip = () => {
    if (!trip) return;
    applyTrip(trip);
    // Tiêu chí bên dưới đổi theo loại xe ngay (Figma: "Đổi loại phương tiện sẽ tự động cập nhật
    // bộ tiêu chí lọc tương ứng") — cùng nháp mà "Xem kết quả" sẽ gửi đi.
    setDraft((prev) => ({
      ...withService(prev, resolveServiceType(trip.vehicleType, trip.serviceType)),
      vehicleType: trip.vehicleType,
    }));
    setTripOpen(false);
  };

  // ─── Rail / tab: cuộn tới nhóm và sáng theo vị trí cuộn ─────────────────────────────────
  /** Nhóm mang `data-nav` — `offsetTop` của nó tính theo vùng cuộn (`position: relative`). */
  const sectionOf = (key: NavKey) =>
    scrollRef.current?.querySelector<HTMLElement>(`[data-nav="${key}"]`) ?? null;
  const goToSection = (key: NavKey) => {
    const container = scrollRef.current;
    const section = sectionOf(key);
    setActiveNav(key);
    if (!container || !section) return;
    container.scrollTo({ top: Math.max(0, section.offsetTop - SCROLL_OFFSET), behavior: 'smooth' });
  };
  const handleScroll = () => {
    const container = scrollRef.current;
    if (!container) return;
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 2) {
      setActiveNav(LAST_NAV_KEY);
      return;
    }
    let current: NavKey = NAV_KEYS[0];
    for (const key of NAV_KEYS) {
      const section = sectionOf(key);
      if (section && section.offsetTop - SCROLL_OFFSET - 1 <= container.scrollTop) current = key;
    }
    setActiveNav(current);
  };

  const validTransmissions = draft.transmission.filter((code) =>
    (transmissions as readonly string[]).includes(code),
  );
  const validFuelTypes = draft.fuelType.filter((code) =>
    (fuelTypes as readonly string[]).includes(code),
  );
  const hasPrice = draft.priceMin != null || draft.priceMax != null;
  /** Số tiêu chí đang bật của từng nhóm — huy hiệu ở rail và "(N)" ở tab điện thoại. */
  const navCounts: Record<NavKey, number> = {
    quickPrice:
      Number(Boolean(draft.instantBook)) + Number(Boolean(draft.discount)) + Number(hasPrice),
    brandType:
      draft.brand.length + (isMotorbike ? draft.motorbikeCategory.length : draft.bodyType.length),
    specs:
      validTransmissions.length +
      validFuelTypes.length +
      (isMotorbike ? 0 : draft.seats.length) +
      draft.features.length,
    delivery: Number(Boolean(draft.delivery)) + Number(draft.minRating != null),
    terms: Number(Boolean(draft.noCollateral)) + Number(Boolean(draft.vatInvoice)),
  };
  const navLabel = (key: NavKey, short: boolean) =>
    short ? t(`modal.navShort.${key}`) : t(`modal.nav.${key}`);

  /*
   * Dải "Đang chọn" ở chân hộp — MỌI tiêu chí đang bật trong nháp, mỗi tag bấm để bỏ đúng tiêu chí
   * đó. Chỉ liệt kê chiều thuộc loại xe đang chọn — đúng những gì "Xem kết quả" sẽ gửi đi.
   */
  const brandByKey = new Map(catalog[CATALOG_TYPE.VEHICLE_BRAND].map((b) => [b.key, b.label]));
  const bodyTypeByKey = new Map(bodyTypeItems.map((b) => [b.key, b.label]));
  const featureByKey = new Map(catalog[CATALOG_TYPE.VEHICLE_FEATURE].map((f) => [f.key, f.label]));
  const tags: { key: string; label: string; onRemove: () => void }[] = [
    ...(['instantBook', 'delivery', 'discount'] as const)
      .filter((field) => draft[field])
      .map((field) => ({
        key: field,
        label: t(`modal.chips.${field}`),
        onRemove: () => setFlag(field, false),
      })),
    ...(hasPrice
      ? [
          {
            key: 'price',
            label: priceBandLabel({ min: draft.priceMin, max: draft.priceMax }),
            onRemove: () => setPrice(undefined, undefined),
          },
        ]
      : []),
    ...draft.brand.map((key) => ({
      key: `brand:${key}`,
      label: brandByKey.get(key) ?? key,
      onRemove: () => toggleItem('brand', key),
    })),
    ...(isMotorbike
      ? draft.motorbikeCategory.map((key) => ({
          key: `motorbikeCategory:${key}`,
          label: domainLabel('motorbikeCategory', key),
          onRemove: () => toggleItem('motorbikeCategory', key),
        }))
      : [
          ...draft.bodyType.map((key) => ({
            key: `bodyType:${key}`,
            label: bodyTypeByKey.get(key) ?? key,
            onRemove: () => toggleItem('bodyType', key),
          })),
          ...draft.seats.map((key) => ({
            key: `seats:${key}`,
            label: domainLabel(
              'seatBucket',
              key,
              SEAT_BUCKET_LABEL[key as keyof typeof SEAT_BUCKET_LABEL],
            ),
            onRemove: () => toggleItem('seats', key),
          })),
        ]),
    ...validTransmissions.map((code) => ({
      key: `transmission:${code}`,
      label: transmissionLabel(code),
      onRemove: () => toggleItem('transmission', code),
    })),
    ...validFuelTypes.map((code) => ({
      key: `fuelType:${code}`,
      label: domainLabel('fuelType', code, FUEL_TYPE_LABEL[code as keyof typeof FUEL_TYPE_LABEL]),
      onRemove: () => toggleItem('fuelType', code),
    })),
    ...draft.features.map((key) => ({
      key: `features:${key}`,
      label: featureByKey.get(key) ?? key,
      onRemove: () => toggleItem('features', key),
    })),
    ...(draft.minRating != null
      ? [
          {
            key: 'minRating',
            label: ratingLabel(draft.minRating),
            onRemove: () => setDraft((prev) => ({ ...prev, minRating: undefined })),
          },
        ]
      : []),
    ...(['noCollateral', 'vatInvoice'] as const)
      .filter((field) => draft[field])
      .map((field) => ({
        key: field,
        label: t(`modal.chips.${field}`),
        onRemove: () => setFlag(field, false),
      })),
  ];

  const sliderValue: [number, number] = [
    Math.min(draft.priceMin ?? 0, priceSlider.max),
    Math.min(draft.priceMax ?? priceSlider.max, priceSlider.max),
  ];

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── Đầu hộp: tiêu đề · viên hành trình (· khay) · tab điện thoại ─────────────── */}
        <div className={cx(styles.header, tripOpen && styles.headerTripOpen)}>
          <div className={styles.headTop}>
            <div className={styles.titleArea}>
              <h2 id="filter-modal-title" className={styles.title}>
                <span className={styles.onlyWide}>{t('modal.titleFull')}</span>
                <span className={styles.onlyNarrow}>{t('title')}</span>
              </h2>
              <p className={styles.subtitle}>
                <span className={styles.onlyWide}>{t('subtitle')}</span>
                <span className={styles.onlyNarrow}>{t('modal.subtitleShort')}</span>
              </p>
            </div>
            <TripSummary
              vehicleType={draft.vehicleType}
              serviceType={draft.serviceType}
              open={tripOpen}
              onToggle={() => (tripOpen ? setTripOpen(false) : openTrip())}
            />
          </div>

          {tripOpen && trip ? (
            <div className={styles.trayWrap}>
              <TripTray
                value={trip}
                onChange={setTrip}
                onCancel={() => setTripOpen(false)}
                onCommit={commitTrip}
              />
            </div>
          ) : null}

          {/* Điện thoại: rail thành dải tab cuộn ngang (Figma 22600:78250). */}
          <nav
            className={cx(styles.tabs, tripOpen && styles.dimmed)}
            aria-label={t('modal.navAria')}
            inert={tripOpen}
          >
            {NAV_KEYS.map((key) => (
              <button
                key={key}
                ref={(el) => {
                  tabRefs.current[key] = el;
                }}
                type="button"
                aria-current={activeNav === key ? 'true' : undefined}
                className={cx(styles.tab, activeNav === key && styles.tabActive)}
                onClick={() => goToSection(key)}
              >
                {navCounts[key] > 0
                  ? t('labelWithCount', { label: navLabel(key, true), count: navCounts[key] })
                  : navLabel(key, true)}
              </button>
            ))}
          </nav>

          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label={tCommon('actions.close')}
          >
            <LineIcon name="close" />
          </button>
        </div>

        <div className={cx(styles.main, tripOpen && styles.dimmed)} inert={tripOpen}>
          {/* ─── Rail "Danh mục lọc" (desktop) ───────────────────────────────────────────── */}
          <nav className={styles.rail} aria-label={t('modal.navAria')}>
            <p className={styles.railHeading}>{t('modal.railHeading')}</p>
            {NAV_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className={cx(styles.navItem, activeNav === key && styles.navItemActive)}
                aria-current={activeNav === key ? 'true' : undefined}
                onClick={() => goToSection(key)}
              >
                <span className={styles.navLabel}>{navLabel(key, false)}</span>
                {navCounts[key] > 0 ? (
                  <span className={styles.navBadge}>{navCounts[key]}</span>
                ) : null}
              </button>
            ))}

            <div
              className={styles.railService}
              role="radiogroup"
              aria-label={t('modal.rentalForm')}
            >
              <p className={styles.railServiceLabel}>{t('modal.rentalForm')}</p>
              {services.map((item) => {
                const active = draft.serviceType === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={cx(styles.railServiceItem, active && styles.railServiceItemActive)}
                    onClick={() => setDraft((p) => withService(p, item.value))}
                  >
                    <span>{item.label}</span>
                    {active ? <span className={styles.railDot} aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
          </nav>

          {/* ─── Các nhóm tiêu chí — vùng cuộn ──────────────────────────────────────────── */}
          <div className={styles.scroll} ref={scrollRef} onScroll={handleScroll}>
            {/* Lọc nhanh phổ biến — lối tắt của chính các tiêu chí bên dưới, cùng một state. */}
            <section className={styles.section} data-nav="quickPrice">
              <SectionHeader title={t('modal.sections.quick')} />
              <div className={styles.chips}>
                <FilterChip
                  active={Boolean(draft.instantBook)}
                  onClick={() => toggleFlag('instantBook')}
                >
                  {t('modal.quick.instantBook')}
                </FilterChip>
                <FilterChip active={Boolean(draft.delivery)} onClick={() => toggleFlag('delivery')}>
                  {t('modal.quick.delivery')}
                </FilterChip>
                <FilterChip
                  active={Boolean(draft.noCollateral)}
                  onClick={() => toggleFlag('noCollateral')}
                >
                  {t('modal.quick.noCollateral')}
                </FilterChip>
                <FilterChip active={Boolean(draft.discount)} onClick={() => toggleFlag('discount')}>
                  {t('modal.quick.discount')}
                </FilterChip>
                <FilterChip
                  active={draft.minRating === TOP_RATING}
                  onClick={() => toggleRating(TOP_RATING)}
                >
                  {t('modal.quick.ownerRating', { rating: TOP_RATING })} <ChipStar />
                </FilterChip>
              </div>
            </section>

            <hr className={styles.divider} />

            <section className={styles.section}>
              <SectionHeader
                title={
                  <>
                    <span className={styles.onlyWide}>
                      {t(monthlyPrice ? 'modal.sections.priceMonthly' : 'modal.sections.price')}
                    </span>
                    <span className={styles.onlyNarrow}>
                      {t(
                        monthlyPrice
                          ? 'modal.sections.priceShortMonthly'
                          : 'modal.sections.priceShort',
                      )}
                    </span>
                  </>
                }
              />
              <div className={styles.chips}>
                <FilterChip active={!hasPrice} onClick={() => setPrice(undefined, undefined)}>
                  {t('modal.all')}
                </FilterChip>
                {priceBands.map((band) => (
                  <FilterChip
                    key={`${band.min ?? ''}-${band.max ?? ''}`}
                    active={isPriceBandSelected(band, draft.priceMin, draft.priceMax)}
                    onClick={() => setPrice(band.min, band.max)}
                  >
                    {priceBandLabel(band)}
                  </FilterChip>
                ))}
              </div>
              <div className={styles.priceBox}>
                <PriceHistogram
                  min={sliderValue[0]}
                  max={sliderValue[1]}
                  scaleMax={priceSlider.max}
                />
                <ConfigProvider theme={PRICE_SLIDER_THEME[themeMode]}>
                  <Slider
                    range
                    className={styles.priceSlider}
                    min={0}
                    max={priceSlider.max}
                    step={priceSlider.step}
                    value={sliderValue}
                    ariaLabelForHandle={[t('modal.priceMin'), t('modal.priceMax')]}
                    tooltip={{ formatter: (v) => (v == null ? '' : fmt.money(String(v))) }}
                    onChange={([lo = 0, hi = priceSlider.max]) =>
                      setPrice(lo > 0 ? lo : undefined, hi >= priceSlider.max ? undefined : hi)
                    }
                  />
                </ConfigProvider>
                <div className={styles.priceBounds}>
                  <div className={styles.priceBound}>
                    <span className={styles.priceBoundLabel}>
                      <span className={styles.onlyWide}>{t('modal.priceMin')}</span>
                      <span className={styles.onlyNarrow}>{t('modal.priceFrom')}</span>
                    </span>
                    <PriceBoundValue value={sliderValue[0]} monthly={monthlyPrice} />
                  </div>
                  <div className={styles.priceBound}>
                    <span className={styles.priceBoundLabel}>
                      <span className={styles.onlyWide}>{t('modal.priceMax')}</span>
                      <span className={styles.onlyNarrow}>{t('modal.priceTo')}</span>
                    </span>
                    <PriceBoundValue
                      value={sliderValue[1]}
                      open={draft.priceMax == null}
                      monthly={monthlyPrice}
                    />
                  </div>
                </div>
              </div>
            </section>

            <hr className={styles.divider} />

            {/* Hãng xe & Kiểu dáng */}
            <section className={styles.section} data-nav="brandType">
              <SectionHeader
                title={
                  <>
                    <span className={styles.onlyWide}>{t('modal.sections.brandType')}</span>
                    <span className={styles.onlyNarrow}>{t('modal.sections.brandTypeShort')}</span>
                  </>
                }
                aside={
                  brandItems.length > COLLAPSED_COUNT ? (
                    <input
                      type="search"
                      className={styles.brandSearch}
                      value={brandQuery}
                      onChange={(e) => setBrandQuery(e.target.value)}
                      placeholder={t('modal.brandSearch')}
                      aria-label={t('modal.brandSearchAria')}
                    />
                  ) : null
                }
              />
              {brandItems.length === 0 ? (
                <p className={styles.note}>{t('modal.noBrands')}</p>
              ) : matchedBrands.length === 0 ? (
                <p className={styles.note}>{t('modal.noBrandMatch')}</p>
              ) : (
                <div className={styles.chips}>
                  {displayedBrands.map((b) => (
                    <FilterChip
                      key={b.key}
                      active={draft.brand.includes(b.key)}
                      onClick={() => toggleItem('brand', b.key)}
                      leading={<BrandMark label={b.label} iconUrl={b.iconUrl} />}
                    >
                      {b.label}
                    </FilterChip>
                  ))}
                  {hiddenBrandCount > 0 ? (
                    <FilterChip tone="more" onClick={() => setShowAllBrands(true)}>
                      {t('modal.moreBrands', { count: hiddenBrandCount })}
                    </FilterChip>
                  ) : showAllBrands && !foldedBrandQuery && brandItems.length > COLLAPSED_COUNT ? (
                    <FilterChip tone="more" onClick={() => setShowAllBrands(false)}>
                      {t('seeLess')}
                    </FilterChip>
                  ) : null}
                </div>
              )}

              <div className={styles.typeGrid}>
                {!isMotorbike
                  ? bodyTypeItems.map((bt) => (
                      <TypeCard
                        key={bt.key}
                        active={draft.bodyType.includes(bt.key)}
                        onClick={() => toggleItem('bodyType', bt.key)}
                        title={bt.label}
                        description={bt.description}
                      />
                    ))
                  : MOTORBIKE_CATEGORY_VALUES.map((mc) => {
                      const descKey = MOTO_DESC_KEY[mc];
                      return (
                        <TypeCard
                          key={mc}
                          active={draft.motorbikeCategory.includes(mc)}
                          onClick={() => toggleItem('motorbikeCategory', mc)}
                          title={domainLabel('motorbikeCategory', mc)}
                          description={descKey ? t(`modal.motoDesc.${descKey}`) : null}
                        />
                      );
                    })}
              </div>
            </section>

            {/* Thông số kỹ thuật & Tiện ích */}
            <section className={styles.section} data-nav="specs">
              <SectionHeader title={t('modal.sections.specs')} />
              <div className={styles.subRow}>
                <SubGroup label={isMotorbike ? t('modal.transmissionMoto') : t('transmission')}>
                  <FilterChip
                    active={validTransmissions.length === 0}
                    onClick={() => setDraft((p) => ({ ...p, transmission: [] }))}
                  >
                    {t('modal.all')}
                  </FilterChip>
                  {transmissions.map((code) => (
                    <FilterChip
                      key={code}
                      active={draft.transmission.includes(code)}
                      onClick={() => setDraft((p) => ({ ...p, transmission: [code] }))}
                    >
                      {transmissionLabel(code)}
                    </FilterChip>
                  ))}
                </SubGroup>
                <SubGroup label={t('modal.fuelType')}>
                  {fuelTypes.map((code) => (
                    <FilterChip
                      key={code}
                      active={draft.fuelType.includes(code)}
                      onClick={() => toggleItem('fuelType', code)}
                    >
                      {domainLabel('fuelType', code, FUEL_TYPE_LABEL[code])}
                    </FilterChip>
                  ))}
                </SubGroup>
              </div>

              {/* Số chỗ chỉ có nghĩa với ô tô. */}
              {!isMotorbike ? (
                <SubGroup label={t('modal.seats')}>
                  {SEAT_BUCKET_VALUES.map((sb) => (
                    <FilterChip
                      key={sb}
                      active={draft.seats.includes(sb)}
                      onClick={() => toggleItem('seats', sb)}
                    >
                      {domainLabel('seatBucket', sb, SEAT_BUCKET_LABEL[sb])}
                    </FilterChip>
                  ))}
                </SubGroup>
              ) : null}

              {featureItems.length > 0 ? (
                <SubGroup label={t('modal.amenities')}>
                  {displayedFeatures.map((f) => (
                    <FilterChip
                      key={f.key}
                      active={draft.features.includes(f.key)}
                      onClick={() => toggleItem('features', f.key)}
                    >
                      {f.label}
                    </FilterChip>
                  ))}
                  {hiddenFeatureCount > 0 ? (
                    <FilterChip tone="more" onClick={() => setShowAllFeatures(true)}>
                      {t('modal.moreFeatures', { count: hiddenFeatureCount })}
                    </FilterChip>
                  ) : showAllFeatures && featureItems.length > COLLAPSED_COUNT ? (
                    <FilterChip tone="more" onClick={() => setShowAllFeatures(false)}>
                      {t('seeLess')}
                    </FilterChip>
                  ) : null}
                </SubGroup>
              ) : null}
            </section>

            <hr className={styles.divider} />

            {/* Giao nhận, Đánh giá & Điều kiện thuê */}
            <section className={styles.section} data-nav="delivery">
              <SectionHeader
                title={t('modal.sections.delivery')}
                info={
                  <InfoTip label={t('modal.termsInfo')} placement="bottomLeft">
                    <p className={styles.infoText}>{t('modal.policyNote')}</p>
                    <p className={styles.infoText}>{t('amenityDesc.vatInvoice')}</p>
                  </InfoTip>
                }
              />
              <div className={styles.subRow}>
                <SubGroup label={t('modal.pickupMethod')}>
                  <FilterChip active={!draft.delivery} onClick={() => setFlag('delivery', false)}>
                    {t('modal.all')}
                  </FilterChip>
                  <FilterChip
                    active={Boolean(draft.delivery)}
                    onClick={() => setFlag('delivery', true)}
                  >
                    {t('modal.deliveryChip')}
                  </FilterChip>
                </SubGroup>
                <SubGroup label={t('rating')}>
                  {LISTING_MIN_RATING_VALUES.map((rating) => (
                    <FilterChip
                      key={rating}
                      active={draft.minRating === rating}
                      onClick={() => toggleRating(rating)}
                    >
                      {t('modal.ratingChip', { rating })} <ChipStar />
                    </FilterChip>
                  ))}
                </SubGroup>
              </div>

              <div data-nav="terms">
                <SubGroup label={t('modal.rentalTerms')}>
                  <FilterChip
                    size="sm"
                    active={Boolean(draft.noCollateral)}
                    onClick={() => toggleFlag('noCollateral')}
                  >
                    {t('modal.quick.noCollateral')}
                  </FilterChip>
                  <FilterChip
                    size="sm"
                    active={Boolean(draft.vatInvoice)}
                    onClick={() => toggleFlag('vatInvoice')}
                  >
                    {t('vatInvoice')}
                  </FilterChip>
                </SubGroup>
              </div>
            </section>
          </div>
        </div>

        {/* ─── Chân hộp: tiêu chí đang chọn + hai nút ─────────────────────────────────────── */}
        <div className={cx(styles.footer, tripOpen && styles.dimmed)} inert={tripOpen}>
          {tags.length > 0 ? (
            <div className={styles.tags} role="group" aria-label={t('modal.selectedAria')}>
              {tags.map((tag) => (
                <button
                  key={tag.key}
                  type="button"
                  className={styles.tag}
                  onClick={tag.onRemove}
                  aria-label={t('modal.removeChip', { label: tag.label })}
                >
                  <span>{tag.label}</span>
                  <LineIcon name="close" className={styles.tagIcon} />
                </button>
              ))}
              <button type="button" className={styles.clearAll} onClick={handleClear}>
                {t('modal.clearAll')}
              </button>
            </div>
          ) : (
            <span className={styles.tagsSpacer} />
          )}
          <div className={styles.actions}>
            <button type="button" className={styles.clearBtn} onClick={handleClear}>
              {t('modal.clearFilters')}
            </button>
            <button type="button" className={styles.applyBtn} onClick={handleApply}>
              <span>{t('modal.showResults')}</span>
              <LineIcon name="arrow-right" className={styles.applyIcon} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  aside,
  info,
}: {
  title: ReactNode;
  aside?: ReactNode;
  info?: ReactNode;
}) {
  return (
    <div className={styles.sectionHeader}>
      <h3 className={styles.sectionTitle}>
        {title}
        {info}
      </h3>
      {aside}
    </div>
  );
}

/** Nhóm con có nhãn (Hộp số, Nhiên liệu…) — điện thoại ẩn nhãn, kẻ vạch ngăn như Figma. */
function SubGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.subGroup} role="group" aria-label={label}>
      <span className={styles.subLabel} aria-hidden="true">
        {label}
      </span>
      <div className={styles.chips}>{children}</div>
    </div>
  );
}

/**
 * Số trong ô Tối thiểu/Tối đa — desktop kèm "/ngày" (22588:63497), điện thoại chỉ số tiền
 * (22600:80667) cho vừa ô 160px. `open` = đầu phải chạm mốc cuối, tức không giới hạn trên.
 */
function PriceBoundValue({
  value,
  open = false,
  monthly,
}: {
  value: number;
  open?: boolean;
  /** Dài hạn: "/tháng" thay cho "/ngày". */
  monthly: boolean;
}) {
  const fmt = useAppFormat();
  const suffix = open ? '+' : '';
  const perUnit = monthly ? fmt.pricePerMonth : fmt.pricePerDay;
  return (
    <span className={styles.priceBoundValue}>
      <span className={styles.onlyWide}>{`${perUnit(String(value))}${suffix}`}</span>
      <span className={styles.onlyNarrow}>{`${fmt.money(String(value))}${suffix}`}</span>
    </span>
  );
}

/** Thẻ kiểu dáng / phân khúc — Figma "Body Type Grid" (22588:63517). */
function TypeCard({
  active,
  onClick,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  description?: string | null;
}) {
  return (
    <button
      type="button"
      className={cx(styles.typeCard, active && styles.typeCardActive)}
      aria-pressed={active}
      onClick={onClick}
    >
      <span className={styles.typeTitle}>{title}</span>
      {description ? <span className={styles.typeDesc}>{description}</span> : null}
    </button>
  );
}
