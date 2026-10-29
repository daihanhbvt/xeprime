import { Ionicons } from '@expo/vector-icons';
import type { IconName } from '@/components/ui/Chip';
import { DashedDivider } from '@/components/ui/DashedDivider';
import { useMemo, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  CATALOG_TYPE,
  FUEL_TYPE_LABEL,
  LISTING_MIN_RATING_VALUES,
  MOTORBIKE_CATEGORY_VALUES,
  SEAT_BUCKET_LABEL,
  SEAT_BUCKET_VALUES,
  SERVICE_TYPE,
  VEHICLE_TYPE,
  VEHICLE_TYPE_VALUES,
  vehicleFuelTypesFor,
  vehicleServiceTypesFor,
  type MarketplaceFilters,
  type ServiceType,
  type VehicleType,
} from '@xeprime/types';
import { resolveServiceType, serviceTypesFor } from '@xeprime/domain';
import { catalogItemAppliesTo } from '@/api/catalog';
import { Button } from '@/components/ui/Button';
import { CheckMark } from '@/components/ui/CheckMark';
import { IconButton } from '@/components/ui/IconButton';
import { RangeSlider } from '@/components/ui/RangeSlider';
import { BrandMark } from '@/features/catalog/components/BrandMark';
import { useCatalog } from '@/features/catalog/use-catalog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { elevation } from '@/theme/elevation';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import {
  isPriceBandSelected,
  priceBandsFor,
  priceSliderFor,
  quickTransmissionsFor,
  usePriceBandLabel,
} from '../filter-constants';
import { SERVICE_ICON, SERVICE_LABEL_KEY, VEHICLE_ICON } from '../search-items';

/** Số mục hiện trước "Xem thêm" — Figma vẽ 3 hàng × 2 cột (web `COLLAPSED_COUNT`). */
const COLLAPSED_COUNT = 6;
/** Vòng tròn của ô chọn một (cỡ `Radio` AntD). */
const RADIO = 16;

/** Bản nháp của tấm — cùng hình `ModalDraft` web; chỉ "Áp dụng" mới ghi vào ngữ cảnh tìm kiếm. */
interface FilterDraft {
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
  | 'brand'
  | 'bodyType'
  | 'motorbikeCategory'
  | 'seats'
  | 'fuelType'
  | 'features'
  | 'transmission';

type FlagField = 'delivery' | 'noCollateral' | 'vatInvoice' | 'discount' | 'instantBook';

function initDraft(filters: MarketplaceFilters): FilterDraft {
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
    ...(filters.priceMin === undefined ? {} : { priceMin: filters.priceMin }),
    ...(filters.priceMax === undefined ? {} : { priceMax: filters.priceMax }),
    ...(filters.delivery ? { delivery: true } : {}),
    ...(filters.noCollateral ? { noCollateral: true } : {}),
    ...(filters.vatInvoice ? { vatInvoice: true } : {}),
    ...(filters.discount ? { discount: true } : {}),
    ...(filters.instantBook ? { instantBook: true } : {}),
    ...(filters.minRating === undefined ? {} : { minRating: filters.minRating }),
  };
}

/**
 * Tấm "Bộ lọc" của trang kết quả — bản native của web `FilterModal` (#216/#222, Figma `19719:47126`
 * ô tô · `19719:49416` xe máy), ở bố cục bề ngang điện thoại của web (toàn màn, một cột, tuỳ chọn
 * hai cột).
 *
 * Lựa chọn là NHÁP cục bộ — chỉ "Áp dụng" mới ghi vào ngữ cảnh tìm kiếm. Thứ tự khối như web: dịch
 * vụ · loại xe → hãng · kiểu xe · giá · nhận xe · ưu đãi · đặt ngay → hộp số · số chỗ · nhiên liệu ·
 * tiện ích · đánh giá · điều kiện thuê; dải "Đang chọn" và hai nút ở đáy.
 *
 * Sắp xếp KHÔNG ở đây (nằm ở thanh kết quả, như web).
 */
export function FilterSheet({
  open,
  filters,
  onApply,
  onClose,
  locationLabel,
  rentalLabel,
  onPickLocation,
  onPickRentalTime,
  preserveDraft = false,
}: {
  open: boolean;
  /** Ngữ cảnh ĐANG áp dụng — nguồn để nạp lại bản nháp mỗi lần mở. */
  filters: MarketplaceFilters;
  onApply: (patch: Partial<MarketplaceFilters>) => void;
  onClose: () => void;
  /** Giá trị đang hiện ở ô "Địa chỉ tìm xe" (tên tỉnh/thành, không phải mã). */
  locationLabel: string;
  /** Giá trị ô "Thời gian nhận/trả" — ô LUÔN hiện như web, kể cả dịch vụ dài hạn. */
  rentalLabel: string;
  /**
   * Mở bộ chọn ĐỊA ĐIỂM / THỜI GIAN có sẵn của màn kết quả. Hai bộ chọn đó là `Modal` riêng, và
   * mở một `Modal` RN BÊN TRONG `Modal` này là thứ iOS không trình bày được ổn định — nên nơi gọi
   * ĐÓNG tạm tấm này, mở bộ chọn, rồi mở lại tấm với `preserveDraft` (bản nháp còn nguyên).
   * Lựa chọn ghi THẲNG vào ngữ cảnh tìm kiếm như web (`LocationPicker` / `RentalDateTimeRangeField`
   * trong `FilterModal` không đi qua nút "Áp dụng").
   */
  onPickLocation: () => void;
  onPickRentalTime: () => void;
  /** Lần mở này là QUAY LẠI sau bộ chọn — giữ bản nháp, không nạp lại từ ngữ cảnh. */
  preserveDraft?: boolean;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const t = useTranslations('Marketplace.filterPanel');
  const tService = useTranslations('HomeSearch.service');
  const tCommon = useTranslations('Common');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();
  const priceBandLabel = usePriceBandLabel();
  const { catalog } = useCatalog();

  const [draft, setDraft] = useState<FilterDraft>(() => initDraft(filters));
  const [showAllBrands, setShowAllBrands] = useState(false);
  const [showAllBodyTypes, setShowAllBodyTypes] = useState(false);
  const [showAllFeatures, setShowAllFeatures] = useState(false);

  // Nạp lại nháp đúng lúc tấm MỞ — điều chỉnh state ngay trong render (cùng mẫu web), không effect.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && !preserveDraft) {
      setDraft(initDraft(filters));
      setShowAllBrands(false);
      setShowAllBodyTypes(false);
      setShowAllFeatures(false);
    }
  }

  const isMotorbike = draft.vehicleType === VEHICLE_TYPE.MOTORBIKE;
  // Mục ĐANG CHỌN luôn còn hiện để khách bỏ chọn được, kể cả khi vừa đổi sang loại xe khác.
  const brandItems = catalog[CATALOG_TYPE.VEHICLE_BRAND].filter(
    (b) => draft.brand.includes(b.key) || catalogItemAppliesTo(b, draft.vehicleType),
  );
  const bodyTypeItems = catalog[CATALOG_TYPE.BODY_TYPE];
  const featureItems = catalog[CATALOG_TYPE.VEHICLE_FEATURE].filter(
    (f) => draft.features.includes(f.key) || catalogItemAppliesTo(f, draft.vehicleType),
  );
  // Hai chiều đọc CÙNG một bảng với thẻ tìm kiếm: xe máy không có "có tài xế".
  const services = useMemo(
    () =>
      serviceTypesFor(draft.vehicleType).map((value) => ({
        value,
        label: tService(SERVICE_LABEL_KEY[value] as never),
        // Figma `19771:70427`: tab dịch vụ có icon XẾP TRÊN nhãn (cùng bộ icon thẻ tìm kiếm trang chủ).
        icon: SERVICE_ICON[value],
      })),
    [draft.vehicleType, tService],
  );
  const vehicles = useMemo(
    () =>
      VEHICLE_TYPE_VALUES.filter((value) =>
        vehicleServiceTypesFor(value).includes(draft.serviceType),
      ).map((value) => ({
        value,
        label: domainLabel('vehicleType', value),
        // `.segmentIcon` web: dải LOẠI XE giữ icon ở ≤768px (chỉ dải dịch vụ `.segmentFill` bỏ icon).
        icon: VEHICLE_ICON[value as VehicleType],
      })),
    [domainLabel, draft.serviceType],
  );
  const priceBands = priceBandsFor(draft.vehicleType);
  const priceSlider = priceSliderFor(draft.vehicleType);
  const [sliding, setSliding] = useState(false);
  const transmissions = quickTransmissionsFor(draft.vehicleType);
  const fuelTypes = vehicleFuelTypesFor(draft.vehicleType);
  const transmissionLabel = (code: string) => domainLabel('transmissionType', code);
  const ratingLabel = (rating: number) => t('modal.ratingFrom', { rating });

  const displayedBrands = showAllBrands ? brandItems : brandItems.slice(0, COLLAPSED_COUNT);
  const displayedBodyTypes = showAllBodyTypes
    ? bodyTypeItems
    : bodyTypeItems.slice(0, COLLAPSED_COUNT);
  const displayedFeatures = showAllFeatures
    ? featureItems
    : featureItems.slice(0, COLLAPSED_COUNT);

  const toggleItem = (field: ListField, value: string) => {
    setDraft((prev) => {
      const list = prev[field];
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { ...prev, [field]: next };
    });
  };
  const setFlag = (field: FlagField, checked: boolean) =>
    setDraft((prev) => ({ ...prev, [field]: checked || undefined }));
  const setPrice = (priceMin: number | undefined, priceMax: number | undefined) =>
    setDraft((prev) => ({ ...prev, priceMin, priceMax }));

  const handleApply = () => {
    // Nhiên liệu / hộp số không thuộc loại xe vừa chọn bị bỏ, không thành bộ lọc vô hình.
    const fuelType = draft.fuelType.filter((code) =>
      (fuelTypes as readonly string[]).includes(code),
    );
    const transmission = draft.transmission.filter((code) =>
      (transmissions as readonly string[]).includes(code),
    );
    onApply({
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

  const handleClear = () =>
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

  // Dải "Đang chọn" — MỌI tiêu chí đang bật trong nháp; chỉ chiều thuộc loại xe đang chọn.
  const brandByKey = new Map(catalog[CATALOG_TYPE.VEHICLE_BRAND].map((b) => [b.key, b.label]));
  const bodyTypeByKey = new Map(bodyTypeItems.map((b) => [b.key, b.label]));
  const featureByKey = new Map(
    catalog[CATALOG_TYPE.VEHICLE_FEATURE].map((f) => [f.key, f.label]),
  );
  const chips: { key: string; label: string; onRemove: () => void }[] = [
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
    ...(draft.priceMin != null || draft.priceMax != null
      ? [
          {
            key: 'price',
            label: priceBandLabel({ min: draft.priceMin, max: draft.priceMax }),
            onRemove: () => setPrice(undefined, undefined),
          },
        ]
      : []),
    ...draft.transmission
      .filter((code) => (transmissions as readonly string[]).includes(code))
      .map((code) => ({
        key: `transmission:${code}`,
        label: transmissionLabel(code),
        onRemove: () => toggleItem('transmission', code),
      })),
    ...draft.fuelType
      .filter((code): code is (typeof fuelTypes)[number] =>
        (fuelTypes as readonly string[]).includes(code),
      )
      .map((code) => ({
        key: `fuelType:${code}`,
        label: domainLabel('fuelType', code, FUEL_TYPE_LABEL[code]),
        onRemove: () => toggleItem('fuelType', code),
      })),
    ...draft.features.map((key) => ({
      key: `features:${key}`,
      label: featureByKey.get(key) ?? key,
      onRemove: () => toggleItem('features', key),
    })),
    ...(['delivery', 'discount', 'instantBook', 'noCollateral', 'vatInvoice'] as const)
      .filter((field) => draft[field])
      .map((field) => ({
        key: field,
        label: t(`modal.chips.${field}`),
        onRemove: () => setFlag(field, false),
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
  ];

  const sliderValue: [number, number] = [
    Math.min(draft.priceMin ?? 0, priceSlider.max),
    Math.min(draft.priceMax ?? priceSlider.max, priceSlider.max),
  ];

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <YStack f={1} bg={colors.surface} pt={insets.top}>
        {/* Đầu tấm */}
        <XStack ai="flex-start" gap={space.sm} px={space.md} pt={space.md} pb={space.sm + space.xs}>
          <YStack f={1} gap={2}>
            <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.semibold} accessibilityRole="header">
              {t('title')}
            </Text>
            <Text col={colors.placeholder} fos={fontSize.body}>
              {t('subtitle')}
            </Text>
          </YStack>
          {/* Dấu đóng to như Figma `19771:70427` (≈ 28px, nét mảnh) — mặc định 20 trông lọt thỏm cạnh tiêu đề h3. */}
          <IconButton icon="close-outline" size={28} label={tCommon('actions.close')} onPress={onClose} />
        </XStack>

        <ScrollView
          // Khoá cuộn khi đang kéo thanh giá — không thì kéo núm là kéo luôn cả tấm.
          scrollEnabled={!sliding}
          contentContainerStyle={{ paddingHorizontal: space.md, paddingBottom: space.lg, gap: space.md }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Phần đầu: dịch vụ · loại xe */}
          <Segmented
            label={t('modal.service')}
            items={services}
            value={draft.serviceType}
            fill
            onChange={(value) => setDraft((p) => ({ ...p, serviceType: value }))}
          />
          <YStack gap={space.sm}>
            <GroupTitle>{t('vehicleType')}</GroupTitle>
            <Segmented
              label={t('vehicleType')}
              items={vehicles}
              value={draft.vehicleType}
              onChange={(value) =>
                setDraft((p) => ({
                  ...p,
                  vehicleType: value,
                  // Xe máy không có "có tài xế" — rơi về tự lái, cùng luật với thẻ tìm kiếm.
                  serviceType: resolveServiceType(value, p.serviceType),
                }))
              }
            />
          </YStack>
          {/* `.dashedDivider` web: `1px dashed border-strong` (= `borderInput` app). */}
          <DashedDivider />

          {/* Bề ngang điện thoại: hai ô xếp DỌC (web @768px `.fieldsRow { 1fr }`). */}
          <ContextField
            icon="location-outline"
            label={t('searchAddress')}
            value={locationLabel}
            onPress={onPickLocation}
          />
          <ContextField
            icon="calendar-outline"
            label={t('rentalTime')}
            value={rentalLabel}
            onPress={onPickRentalTime}
          />

          {/* Thứ tự nhóm theo Figma 19771:70427 (nội dung nhóm theo web FilterModal). */}
          <FilterGroup title={t('brand')} hint={t('multiple')}>
            {brandItems.length > 0 ? (
              <OptionGrid>
                {displayedBrands.map((b) => (
                  <OptionRow
                    key={b.key}
                    kind="checkbox"
                    checked={draft.brand.includes(b.key)}
                    onPress={() => toggleItem('brand', b.key)}
                    label={b.label}
                    leading={<BrandMark label={b.label} iconUrl={b.iconUrl} />}
                  />
                ))}
              </OptionGrid>
            ) : (
              <Note>{t('modal.noBrands')}</Note>
            )}
            {brandItems.length > COLLAPSED_COUNT ? (
              <SeeMore expanded={showAllBrands} onToggle={setShowAllBrands} />
            ) : null}
          </FilterGroup>

          <FilterGroup title={t('modal.bodyType')} hint={t('multiple')}>
            <OptionGrid>
              {!isMotorbike
                ? displayedBodyTypes.map((bt) => (
                    <OptionRow
                      key={bt.key}
                      kind="checkbox"
                      checked={draft.bodyType.includes(bt.key)}
                      onPress={() => toggleItem('bodyType', bt.key)}
                      label={bt.label}
                      pill={bt.description}
                    />
                  ))
                : MOTORBIKE_CATEGORY_VALUES.map((mc) => (
                    <OptionRow
                      key={mc}
                      kind="checkbox"
                      checked={draft.motorbikeCategory.includes(mc)}
                      onPress={() => toggleItem('motorbikeCategory', mc)}
                      label={domainLabel('motorbikeCategory', mc)}
                    />
                  ))}
            </OptionGrid>
            {!isMotorbike && bodyTypeItems.length > COLLAPSED_COUNT ? (
              <SeeMore expanded={showAllBodyTypes} onToggle={setShowAllBodyTypes} />
            ) : null}
          </FilterGroup>

          <Divider />

          <FilterGroup title={t('transmission')} hint={t('single')}>
            <OptionGrid>
              <OptionRow
                kind="radio"
                checked={draft.transmission.length === 0}
                onPress={() => setDraft((p) => ({ ...p, transmission: [] }))}
                label={t('modal.all')}
              />
              {transmissions.map((code) => (
                <OptionRow
                  key={code}
                  kind="radio"
                  checked={draft.transmission.includes(code)}
                  onPress={() => setDraft((p) => ({ ...p, transmission: [code] }))}
                  label={transmissionLabel(code)}
                />
              ))}
            </OptionGrid>
          </FilterGroup>

          {/* Số chỗ chỉ có nghĩa với ô tô. */}
          {!isMotorbike ? (
            <FilterGroup title={t('modal.seats')} hint={t('multiple')}>
              <OptionGrid>
                {SEAT_BUCKET_VALUES.map((sb) => (
                  <OptionRow
                    key={sb}
                    kind="checkbox"
                    checked={draft.seats.includes(sb)}
                    onPress={() => toggleItem('seats', sb)}
                    label={domainLabel('seatBucket', sb, SEAT_BUCKET_LABEL[sb])}
                  />
                ))}
              </OptionGrid>
            </FilterGroup>
          ) : null}

          <FilterGroup title={t('modal.fuelType')} hint={t('multiple')}>
            <OptionGrid>
              {fuelTypes.map((code) => (
                <OptionRow
                  key={code}
                  kind="checkbox"
                  checked={draft.fuelType.includes(code)}
                  onPress={() => toggleItem('fuelType', code)}
                  label={domainLabel('fuelType', code, FUEL_TYPE_LABEL[code])}
                />
              ))}
            </OptionGrid>
          </FilterGroup>

          <Divider />

          <YStack gap={space.md}>
            <FilterGroup title={t('modal.priceRange')} hint={t('single')}>
              <OptionGrid>
                <OptionRow
                  kind="radio"
                  checked={draft.priceMin == null && draft.priceMax == null}
                  onPress={() => setPrice(undefined, undefined)}
                  label={t('modal.all')}
                />
                {priceBands.map((band) => (
                  <OptionRow
                    key={`${band.min ?? ''}-${band.max ?? ''}`}
                    kind="radio"
                    checked={isPriceBandSelected(band, draft.priceMin, draft.priceMax)}
                    onPress={() => setPrice(band.min, band.max)}
                    label={priceBandLabel(band)}
                  />
                ))}
              </OptionGrid>
            </FilterGroup>

            {/*
              Không có ô nhập Tối thiểu/Tối đa (người dùng chốt 27/10/2026): khoảng giá chọn bằng các
              mức có sẵn ở trên hoặc kéo thanh trượt bên dưới.
            */}
            <RangeSlider
              min={0}
              max={priceSlider.max}
              step={priceSlider.step}
              value={sliderValue}
              label={t('modal.priceRange')}
              onDraggingChange={setSliding}
              onChange={([lo, hi]) =>
                setPrice(lo > 0 ? lo : undefined, hi >= priceSlider.max ? undefined : hi)
              }
            />
            <XStack jc="space-between" gap={space.sm}>
              <Text col={colors.placeholder} fos={fontSize.bodySm}>
                {fmt.pricePerDay('0')}
              </Text>
              <Text col={colors.placeholder} fos={fontSize.bodySm}>
                {/* Figma: hai đầu thanh trượt ghi "0 đ/ngày" · "2.000.000 đ/ngày", không dấu "+". */}
                {fmt.pricePerDay(String(priceSlider.max))}
              </Text>
            </XStack>
            <Note>{t('modal.priceNote')}</Note>
          </YStack>

          <Divider />

          <FilterGroup title={t('modal.pickupMethod')} hint={t('single')}>
            <OptionGrid>
              <OptionRow
                kind="radio"
                checked={!draft.delivery}
                onPress={() => setFlag('delivery', false)}
                label={t('modal.all')}
              />
              <OptionRow
                kind="radio"
                checked={Boolean(draft.delivery)}
                onPress={() => setFlag('delivery', true)}
                label={t('modal.deliveryOption')}
              />
            </OptionGrid>
          </FilterGroup>

          <FilterGroup title={t('modal.offers')} hint={t('multiple')}>
            <Note>{t('modal.offersHint')}</Note>
            <OptionGrid>
              <OptionRow
                kind="checkbox"
                checked={Boolean(draft.discount)}
                onPress={() => setFlag('discount', !draft.discount)}
                label={t('modal.hasOffer')}
              />
            </OptionGrid>
          </FilterGroup>

          <Divider />

          <FilterGroup title={t('amenities')} hint={t('multiple')}>
            <OptionGrid>
              {displayedFeatures.map((f) => (
                <OptionRow
                  key={f.key}
                  kind="checkbox"
                  checked={draft.features.includes(f.key)}
                  onPress={() => toggleItem('features', f.key)}
                  label={f.label}
                />
              ))}
            </OptionGrid>
            {featureItems.length > COLLAPSED_COUNT ? (
              <SeeMore expanded={showAllFeatures} onToggle={setShowAllFeatures} />
            ) : null}
          </FilterGroup>

          <FilterGroup title={t('rating')} hint={t('single')}>
            <OptionGrid>
              <OptionRow
                kind="radio"
                checked={draft.minRating == null}
                onPress={() => setDraft((p) => ({ ...p, minRating: undefined }))}
                label={t('modal.all')}
              />
              {LISTING_MIN_RATING_VALUES.map((rating) => (
                <OptionRow
                  key={rating}
                  kind="radio"
                  checked={draft.minRating === rating}
                  onPress={() => setDraft((p) => ({ ...p, minRating: rating }))}
                  label={ratingLabel(rating)}
                />
              ))}
            </OptionGrid>
          </FilterGroup>

          <Divider />

          <FilterGroup title={t('modal.rentalTerms')} hint={t('multiple')}>
            <OptionGrid single>
              <OptionRow
                kind="checkbox"
                checked={Boolean(draft.noCollateral)}
                onPress={() => setFlag('noCollateral', !draft.noCollateral)}
                label={t('amenityDesc.noCollateral')}
              />
              <OptionRow
                kind="checkbox"
                checked={Boolean(draft.vatInvoice)}
                onPress={() => setFlag('vatInvoice', !draft.vatInvoice)}
                label={t('vatInvoice')}
              />
            </OptionGrid>
            {draft.vatInvoice ? <Note>{t('amenityDesc.vatInvoice')}</Note> : null}
          </FilterGroup>

          <Divider />

          <YStack gap={space.sm + space.xs}>
            <Pressable
              onPress={() => setFlag('instantBook', !draft.instantBook)}
              accessibilityRole="switch"
              accessibilityState={{ checked: Boolean(draft.instantBook) }}
              accessibilityLabel={t('modal.instantBook')}
            >
              <XStack ai="center" jc="space-between" gap={space.md}>
                <YStack f={1} gap={2}>
                  <GroupTitle>{t('modal.instantBook')}</GroupTitle>
                  <Note>{t('modal.instantBookHint')}</Note>
                </YStack>
                <SmallSwitch value={Boolean(draft.instantBook)} />
              </XStack>
            </Pressable>
            <XStack ai="flex-start" gap={space.sm} p={space.sm + space.xs} br={radius.sm} bg={colors.warningSurface}>
              <Ionicons name="information-circle-outline" size={16} color={colors.warning} />
              <Text f={1} col={colors.textMuted} fos={fontSize.bodySm}>
                {t('modal.policyNote')}
              </Text>
            </XStack>
          </YStack>

        </ScrollView>

        {/* Dải "Đang chọn" — cố định trên chân tấm */}
        {chips.length > 0 ? (
          <XStack ai="center" gap={space.sm} paddingLeft={space.md} pt={space.sm} pb={space.sm + space.xs}>
            <Text col={colors.placeholder} fos={fontSize.bodySm} flexShrink={0}>
              {t('selected')}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: space.sm, alignItems: 'center', paddingRight: space.md }}
            >
              {chips.map((chip) => (
                <Pressable
                  key={chip.key}
                  onPress={chip.onRemove}
                  accessibilityRole="button"
                  accessibilityLabel={t('modal.removeChip', { label: chip.label })}
                >
                  <XStack
                    ai="center"
                    gap={space.xs}
                    px={10}
                    py={2}
                    bw={1}
                    bc={colors.primary}
                    br={radius.pill}
                    bg={colors.primaryLight}
                  >
                    <Text col={colors.primaryHover} fos={fontSize.body} fow={fontWeight.medium}>
                      {chip.label}
                    </Text>
                    <Ionicons name="close" size={10} color={colors.primaryHover} />
                  </XStack>
                </Pressable>
              ))}
              <Pressable
                onPress={handleClear}
                accessibilityRole="button"
                accessibilityLabel={tCommon('actions.clearSelection')}
                hitSlop={space.sm}
              >
                <Ionicons name="reload-outline" size={16} color={colors.primary} />
              </Pressable>
            </ScrollView>
          </XStack>
        ) : null}

        <XStack
          gap={space.sm + space.xs}
          px={space.md}
          pt={space.sm + space.xs}
          pb={space.sm + space.xs + insets.bottom}
          borderTopWidth={1}
          bc={colors.border}
          bg={colors.surface}
        >
          {/* Bề ngang điện thoại: hai nút chia đều (web @768px `flex: 1`). */}
          <YStack f={1}>
            <Button label={t('clear')} icon="refresh-outline" variant="secondary" onPress={handleClear} />
          </YStack>
          <YStack f={1}>
            {/* Figma: "Áp dụng" là nút dải vàng (gradient), "Xóa bộ lọc" viền trắng. */}
            <Button label={t('apply')} icon="checkmark-outline" variant="gradient" onPress={handleApply} />
          </YStack>
        </XStack>
      </YStack>
    </Modal>
  );
}

/**
 * Một ô ngữ cảnh của phần đầu tấm (web `.field`: nhãn có icon phía trên, ô bấm phía dưới). Bấm mở
 * bộ chọn có sẵn của màn kết quả — xem `onPickLocation` ở `FilterSheet`.
 */
/** `.field` / `.fieldLabel` web: khoảng cách 6px. */
const FIELD_GAP = 6;

function ContextField({
  icon,
  label,
  value,
  onPress,
}: {
  icon: 'location-outline' | 'calendar-outline';
  label: string;
  value: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    /* Vùng ô ngữ cảnh — web `.field`: cột, gap 6. */
    <YStack gap={FIELD_GAP}>
      {/* `.fieldLabel` web: icon 16 màu `primary` + chữ body medium `text-secondary`, gap 6. */}
      <XStack ai="center" gap={FIELD_GAP}>
        <Ionicons name={icon} size={16} color={colors.primary} />
        <Text col={colors.textMuted} fos={fontSize.body} fow={fontWeight.medium}>
          {label}
        </Text>
      </XStack>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`}>
        {/*
          Ô theo Figma `19771:70427`: cao 40, đệm ngang 14, viền `color-border` 1px (cùng viền ô nhập
          toàn app), bo control 12, nền `bg-container`, chữ body 14 thường `text`; không mũi tên,
          không bóng — trông như một ô nhập, chạm để mở bộ chọn.
        */}
        <XStack
          minHeight={40}
          ai="center"
          gap={space.sm}
          px={14}
          py={2}
          bw={1}
          bc={colors.border}
          br={radius.control}
          bg={colors.surface}
        >
          <Text f={1} col={colors.text} fos={fontSize.body} numberOfLines={1}>
            {value}
          </Text>
        </XStack>
      </Pressable>
    </YStack>
  );
}

function GroupTitle({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.semibold}>
      {children}
    </Text>
  );
}

function Note({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <Text col={colors.placeholder} fos={fontSize.bodySm}>
      {children}
    </Text>
  );
}

function Divider() {
  const colors = useColors();
  return <YStack h={0} borderTopWidth={1} bc={colors.border} />;
}

function FilterGroup({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <YStack gap={space.sm}>
      <XStack ai="center" jc="space-between" gap={space.sm + space.xs}>
        <GroupTitle>{title}</GroupTitle>
        <Text col={colors.placeholder} fos={fontSize.bodySm} flexShrink={0}>
          {hint}
        </Text>
      </XStack>
      {children}
    </YStack>
  );
}

/** Lưới tuỳ chọn hai cột (web `.options`), hoặc một cột (`.optionsSingle`). */
function OptionGrid({ single = false, children }: { single?: boolean; children: ReactNode }) {
  return (
    <XStack flexWrap="wrap" columnGap={space.sm + space.xs} rowGap={2}>
      {Array.isArray(children)
        ? children.flat().map((child, index) =>
            child ? (
              <YStack key={index} w={single ? '100%' : '47%'}>
                {child}
              </YStack>
            ) : null,
          )
        : (
          <YStack w={single ? '100%' : '47%'}>{children}</YStack>
        )}
    </XStack>
  );
}

/** Một dòng chọn: dấu (vuông = chọn nhiều, tròn = chọn một) + nhãn (web `.option`). */
function OptionRow({
  kind,
  checked,
  onPress,
  label,
  leading,
  pill,
}: {
  kind: 'checkbox' | 'radio';
  checked: boolean;
  onPress: () => void;
  label: string;
  leading?: ReactNode;
  /** Dòng phụ dạng viên cạnh nhãn (kiểu xe: "7 chỗ · gầm cao" — web `.optionPill`). */
  pill?: string | null;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={kind}
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      hitSlop={{ top: 7, bottom: 7 }}
    >
      <XStack ai="center" gap={space.sm} minHeight={30}>
        {kind === 'checkbox' ? (
          <CheckMark checked={checked} />
        ) : (
          <YStack
            w={RADIO}
            h={RADIO}
            br={radius.pill}
            bw={checked ? 5 : 1}
            bc={checked ? colors.primary : colors.borderInput}
            bg={colors.surface}
          />
        )}
        {leading}
        <Text f={1} col={colors.textMuted} fos={fontSize.body} numberOfLines={1}>
          {label}
        </Text>
        {pill ? (
          <YStack px={6} py={2} br={radius.pill} bg={colors.background} flexShrink={0}>
            <Text col={colors.placeholder} fos={fontSize.bodySm} numberOfLines={1}>
              {pill}
            </Text>
          </YStack>
        ) : null}
      </XStack>
    </Pressable>
  );
}

function SeeMore({ expanded, onToggle }: { expanded: boolean; onToggle: (next: boolean) => void }) {
  const colors = useColors();
  const t = useTranslations('Marketplace.filterPanel');
  return (
    <Pressable
      onPress={() => onToggle(!expanded)}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      hitSlop={space.sm}
      style={{ alignSelf: 'flex-start' }}
    >
      <Text
        col={colors.primary}
        fos={fontSize.body}
        fow={fontWeight.medium}
        textDecorationLine="underline"
      >
        {expanded ? t('seeLess') : t('seeMore')}
      </Text>
    </Pressable>
  );
}

/** Dải chọn một (web `.segmented` / `.segment`); `fill` = các ô chia đều bề ngang. */
function Segmented<T extends string>({
  label,
  items,
  value,
  fill = false,
  onChange,
}: {
  label: string;
  items: readonly { value: T; label: string; icon?: IconName }[];
  value: T;
  fill?: boolean;
  onChange: (value: T) => void;
}) {
  const colors = useColors();
  return (
    /*
      Vùng dải chọn — web `.segmented`: gap 2, viền `border` 1px, bo `radius-control`, nền `bg`,
      bóng `elevation-xs`. `fill` = dải dịch vụ chia đều, icon XẾP TRÊN nhãn theo Figma `19771:70427`.
    */
    <XStack
      gap={2}
      bw={1}
      bc={colors.border}
      br={radius.control}
      bg={colors.background}
      alignSelf={fill ? 'stretch' : 'flex-start'}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={elevation.xs}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <Pressable
            key={item.value}
            onPress={() => onChange(item.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            style={fill ? { flex: 1 } : undefined}
          >
            {/*
              Ô chọn — web `.segment` ≤768px: cao tối thiểu 44, đệm sm × sm, chữ body medium
              `text-secondary`; đang chọn `.segmentActive`: viền `border-strong` 1px, nền
              `bg-container`, chữ `primary-hover`, bóng `elevation-xs`. Icon 20 cách chữ sm.
            */}
            <XStack
              // Dải dịch vụ (`fill`) theo Figma: icon TRÊN nhãn, cao 64; dải loại xe giữ icon cạnh nhãn.
              fd={fill ? 'column' : 'row'}
              ai="center"
              jc="center"
              gap={fill ? space.xs : space.sm}
              minHeight={fill ? 64 : 44}
              px={space.sm}
              py={space.sm}
              bw={1}
              bc={active ? colors.borderInput : 'transparent'}
              br={radius.control}
              bg={active ? colors.surface : 'transparent'}
              style={active ? elevation.xs : undefined}
            >
              {item.icon ? (
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={active ? colors.primaryHover : colors.textMuted}
                />
              ) : null}
              <Text
                col={active ? colors.primaryHover : colors.textMuted}
                fos={fontSize.body}
                fow={fontWeight.medium}
                ta="center"
              >
                {item.label}
              </Text>
            </XStack>
          </Pressable>
        );
      })}
    </XStack>
  );
}

/** Công tắc nhỏ (AntD `Switch size="small"`) — chỉ để hiển thị; cả hàng là vùng bấm. */
function SmallSwitch({ value }: { value: boolean }) {
  const colors = useColors();
  return (
    <YStack w={28} h={16} br={radius.pill} bg={value ? colors.primary : colors.borderInput} jc="center" px={2}>
      <YStack w={12} h={12} br={radius.pill} bg={colors.surface} marginLeft={value ? 12 : 0} />
    </YStack>
  );
}
