'use client';

import { useState, type ReactNode } from 'react';
import {
  EnvironmentOutlined,
  InfoCircleOutlined,
  SearchOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { Alert, AutoComplete, Button, Input, Spin } from 'antd';
import { useTranslations } from 'next-intl';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { StaticMapImage } from '@/components/data-display/StaticMapImage';
import { CurrentLocationButton } from '@/features/locations/components/CurrentLocationButton';
import type { CurrentPlace } from '@/features/locations/hooks/use-current-place';
import { placeMapSrc, usePlaceDetail, usePlaceSearch } from '@/features/locations/hooks/use-places';
import { fetchDeliveryDistance } from '@/features/rental-policies/api';
import type { DeliveryDistance } from '@/features/rental-policies/types';
import {
  rememberDeliveryAddress,
  type RememberedDeliveryAddress,
} from '@/lib/delivery-address-memory';
import { useAppFormat } from '@/i18n/use-app-format';
import { isZeroMoney } from '@/lib/money';
import {
  DELIVERY_DISTANCE_STATUS,
  DELIVERY_MANUAL_REASON,
  LOCATION_SOURCE,
  type LocationSource,
} from '@xeprime/types';
import { cx } from '@/lib/cx';
import type { PublicListingDetail } from '../types';
import styles from './DeliveryAddressModal.module.css';

const USE_TYPED_VALUE = '__xp:use-typed-delivery-address__';

export interface ConfirmedDeliveryInfo {
  address: string;
  placeId: string | null;
  lat: number | null;
  lng: number | null;
  provinceCode: string | null;
  distanceKm: number | null;
  /**
   * Phí giao DỰ KIẾN do server báo (chuỗi tiền — ADR 0007); `null` khi chưa có con số tự động
   * (ngoài bán kính, không tra được đường) — chủ xe báo phí khi duyệt. KHÔNG bao giờ quy về 0:
   * "chưa biết" mà hiện "Miễn phí" là một lời hứa sai.
   */
  fee: string | null;
}

interface DeliveryAddressModalProps {
  title?: string;
  open: boolean;
  onClose: () => void;
  listing: PublicListingDetail;
  initialAddress?: string | null;
  onConfirm: (info: ConfirmedDeliveryInfo) => void;
}

export function DeliveryAddressModal({
  title,
  open,
  onClose,
  listing,
  initialAddress,
  onConfirm,
}: DeliveryAddressModalProps) {
  const t = useTranslations('Listings.detail.deliveryModal');
  const tCommon = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const [query, setQuery] = useState(initialAddress ?? '');
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [selectedAddress, setSelectedAddress] = useState(initialAddress ?? '');
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number } | null>(null);
  /** Nguồn của địa chỉ đang chọn — nhớ cùng địa chỉ để lần thuê sau biết nó đã được xác nhận chưa. */
  const [selectedSource, setSelectedSource] = useState<LocationSource>(LOCATION_SOURCE.MANUAL);
  const [suggestedProvinceCode, setSuggestedProvinceCode] = useState<string | null>(
    listing.provinceCode ?? null,
  );
  const [locationNotice, setLocationNotice] = useState<string | null>(null);

  const [calculatingDistance, setCalculatingDistance] = useState(false);
  const [deliveryResult, setDeliveryResult] = useState<DeliveryDistance | null>(null);

  const placeDetailMutation = usePlaceDetail();

  // Tìm kiếm địa điểm qua Vietmap API
  const suggestions = usePlaceSearch(query, {
    biasPoint: listing.pickupPoint
      ? { lat: Number(listing.pickupPoint.latitude), lng: Number(listing.pickupPoint.longitude) }
      : null,
    enabled: open && query.trim().length >= 3,
    // Ô đang hiện đúng địa chỉ vừa chốt (chọn gợi ý / vị trí hiện tại) ⇒ không tra lại nó.
    except: selectedAddress,
  });

  // Khi modal vừa MỞ, nạp lại địa chỉ ban đầu nếu có — chỉnh state ngay lúc render khi `open` đổi
  // (https://react.dev/learn/you-might-not-need-an-effect), không setState trong effect.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    setLocationNotice(null);
    if (open && initialAddress) {
      setQuery(initialAddress);
      setSelectedAddress(initialAddress);
    }
  }

  // Hàm tính toán khoảng cách và phí giao xe dự kiến
  const calculateDistance = async (addr: string, pin?: { lat: number; lng: number } | null) => {
    if (!addr.trim()) return;
    setCalculatingDistance(true);
    try {
      const res = await fetchDeliveryDistance(listing.id, addr, pin);
      setDeliveryResult(res);
    } catch {
      setDeliveryResult(null);
    } finally {
      setCalculatingDistance(false);
    }
  };

  // Người dùng chọn 1 địa điểm từ danh sách gợi ý
  const handleSelectPlace = async (value: string) => {
    if (value === USE_TYPED_VALUE) {
      // Dùng địa chỉ tự nhập
      const typed = query.trim();
      setSelectedPlaceId(null);
      setSelectedAddress(typed);
      setSelectedCoords(null);
      setSelectedSource(LOCATION_SOURCE.MANUAL);
      setSuggestedProvinceCode(listing.provinceCode ?? null);
      calculateDistance(typed, null);
      return;
    }

    const item = suggestions.data?.items.find((s) => s.placeId === value);
    if (!item) return;

    setSelectedPlaceId(value);
    setSelectedSource(LOCATION_SOURCE.GOOGLE_PLACE);
    setQuery(item.primaryText + (item.secondaryText ? `, ${item.secondaryText}` : ''));

    try {
      const detailRes = await placeDetailMutation.mutateAsync(value);
      if (detailRes.place) {
        const fullAddr = detailRes.place.formattedAddress || item.primaryText;
        setSelectedAddress(fullAddr);
        setQuery(fullAddr);

        const latNum = Number(detailRes.place.latitude);
        const lngNum = Number(detailRes.place.longitude);
        const coords =
          !Number.isNaN(latNum) && !Number.isNaN(lngNum) ? { lat: latNum, lng: lngNum } : null;
        setSelectedCoords(coords);
        setSuggestedProvinceCode(
          detailRes.place.suggestedProvinceCode ?? listing.provinceCode ?? null,
        );

        calculateDistance(fullAddr, coords);
      }
    } catch {
      // Tra chi tiết lỗi thì dùng tạm text đã chọn
      setSelectedAddress(item.primaryText);
      setSelectedSource(LOCATION_SOURCE.MANUAL);
      calculateDistance(item.primaryText, null);
    }
  };

  /*
   * "Lấy vị trí hiện tại": điền địa chỉ tra ngược + TOẠ ĐỘ đo được, rồi tính phí giao như một gợi ý
   * vừa chọn. Phép đo sai số lớn (máy tính định vị qua IP) thì KHÔNG điền — địa chỉ tra ra là của
   * một chỗ khác, và phí giao sẽ tính tới chỗ sai đó. Lúc đó nói rõ sai số và mời gõ địa chỉ.
   */
  const handleLocated = (place: CurrentPlace) => {
    if (!place.precise) {
      setLocationNotice(t('imprecise', { distance: fmt.distanceKm(place.accuracy / 1000) }));
      return;
    }
    const coords = { lat: place.latitude, lng: place.longitude };
    setSelectedPlaceId(null);
    setSelectedAddress(place.formattedAddress);
    setQuery(place.formattedAddress);
    setSelectedCoords(coords);
    setSelectedSource(LOCATION_SOURCE.MAP_PIN);
    setSuggestedProvinceCode(place.provinceCode ?? listing.provinceCode ?? null);
    calculateDistance(place.formattedAddress, coords);
  };

  // Xác nhận địa chỉ
  const handleConfirm = () => {
    if (!selectedAddress.trim()) return;

    const info: ConfirmedDeliveryInfo = {
      address: selectedAddress,
      placeId: selectedPlaceId,
      lat: selectedCoords?.lat ?? null,
      lng: selectedCoords?.lng ?? null,
      provinceCode: suggestedProvinceCode ?? listing.provinceCode ?? null,
      distanceKm: deliveryResult?.distanceKm ?? null,
      fee:
        deliveryResult?.status === DELIVERY_DISTANCE_STATUS.AUTO
          ? (deliveryResult.fee ?? null)
          : null,
    };

    // Lưu vào bộ nhớ local để prefill cho các lần đặt sau
    if (info.provinceCode) {
      const mem: RememberedDeliveryAddress = {
        provinceCode: info.provinceCode,
        wardCode: '',
        addressLine: info.address,
        latitude: info.lat,
        longitude: info.lng,
        placeId: info.placeId,
        locationSource: selectedSource,
      };
      rememberDeliveryAddress(mem);
    }

    onConfirm(info);
    onClose();
  };

  // Chuẩn bị danh sách gợi ý cho AutoComplete
  const suggestionOptions = (suggestions.data?.items ?? []).map((s) => ({
    value: s.placeId,
    label: (
      <div className={styles.suggestionItem}>
        <EnvironmentOutlined className={styles.suggestionIcon} />
        <div className={styles.suggestionText}>
          <div className={styles.suggestionPrimary}>{s.primaryText}</div>
          {s.secondaryText && <div className={styles.suggestionSecondary}>{s.secondaryText}</div>}
        </div>
      </div>
    ),
  }));

  if (query.trim().length >= 3) {
    suggestionOptions.push({
      value: USE_TYPED_VALUE,
      label: (
        <div className={styles.useTypedOption}>
          <EditOutlined aria-hidden="true" />
          <span>{t('useTyped', { query })}</span>
        </div>
      ),
    });
  }

  const strong = (chunks: ReactNode) => <strong>{chunks}</strong>;

  const pickupPointAddr =
    listing.pickupPoint?.address || listing.shopProvince || t('pickupPointFallback');

  return (
    <ResponsiveDialog open={open} onClose={onClose} title={title || t('title')} size="md">
      <div className={styles.dialogBody}>
        {/* Banner thông tin điểm giao xe của chủ xe & bán kính */}
        <div className={styles.contextAlert}>
          <InfoCircleOutlined className={styles.contextIcon} aria-hidden="true" />
          <div>
            <div>{t.rich('ownerPoint', { strong, address: pickupPointAddr })}</div>
            {deliveryResult?.maxRadiusKm ? (
              <div>
                {t.rich('maxRadius', {
                  strong,
                  distance: fmt.distanceKm(deliveryResult.maxRadiusKm),
                })}
              </div>
            ) : null}
          </div>
        </div>

        {/* Ô tìm kiếm địa chỉ */}
        <div className={styles.searchSection}>
          <label className={styles.searchLabel} htmlFor="delivery-address-input">
            {t('searchLabel')}
          </label>
          <AutoComplete
            id="delivery-address-input"
            className={styles.autoComplete}
            value={query}
            onChange={(val) => setQuery(val)}
            onSelect={handleSelectPlace}
            options={suggestionOptions}
            placeholder={t('searchPlaceholder')}
          >
            <Input
              prefix={<SearchOutlined className={styles.searchIcon} aria-hidden="true" />}
              allowClear
              size="large"
            />
          </AutoComplete>
          <CurrentLocationButton
            label={t('useCurrent')}
            onLocateStart={() => setLocationNotice(null)}
            onLocated={handleLocated}
            notice={locationNotice}
          />
        </div>

        {/* Trạng thái đang tải toạ độ hoặc đang tính khoảng cách */}
        {(placeDetailMutation.isPending || calculatingDistance) && (
          <div className={styles.locating}>
            <Spin tip={t('locating')} />
          </div>
        )}

        {/* Xem trước bản đồ tĩnh có ghim vị trí */}
        {selectedPlaceId && !placeDetailMutation.isPending && (
          <div className={styles.mapPreviewWrap}>
            <StaticMapImage
              src={placeMapSrc(selectedPlaceId)}
              alt={t('mapAlt')}
              className={styles.mapImage}
            />
          </div>
        )}

        {/* Kết quả tính khoảng cách và phí */}
        {deliveryResult && (
          <div className={styles.estimateCard}>
            {deliveryResult.status === DELIVERY_DISTANCE_STATUS.AUTO && (
              <>
                <div className={styles.estimateRow}>
                  <span className={styles.estimateLabel}>{t('feeLabel')}</span>
                  <span
                    className={cx(
                      styles.estimateFee,
                      isZeroMoney(deliveryResult.fee ?? '0') && styles.freeFee,
                    )}
                  >
                    {isZeroMoney(deliveryResult.fee ?? '0')
                      ? t('free')
                      : fmt.money(deliveryResult.fee ?? '0')}
                  </span>
                </div>
                {deliveryResult.distanceKm != null && (
                  <div className={styles.estimateMeta}>
                    {t('distance', { distance: fmt.distanceKm(deliveryResult.distanceKm) })}
                  </div>
                )}
                {deliveryResult.formattedAddress && (
                  <div className={styles.estimateMeta}>
                    {t('confirmedPlace', { address: deliveryResult.formattedAddress })}
                  </div>
                )}
              </>
            )}

            {deliveryResult.status === DELIVERY_DISTANCE_STATUS.MANUAL && (
              <Alert
                type="warning"
                showIcon
                title={t('manualTitle')}
                description={
                  deliveryResult.manualReason === DELIVERY_MANUAL_REASON.OUTSIDE_AUTO_RADIUS
                    ? deliveryResult.maxRadiusKm
                      ? t('manualOutsideRadius', {
                          distance: fmt.distanceKm(deliveryResult.maxRadiusKm),
                        })
                      : t('manualOutsideRadiusUnknown')
                    : t('manualDefault')
                }
              />
            )}

            {deliveryResult.status === DELIVERY_DISTANCE_STATUS.ADDRESS_NOT_FOUND && (
              <Alert
                type="info"
                showIcon
                title={t('notFoundTitle')}
                description={t('notFoundBody')}
              />
            )}
          </div>
        )}

        {/* Nút hành động */}
        <div className={styles.footerActions}>
          <Button className={styles.cancelBtn} onClick={onClose} size="large">
            {tCommon('cancel')}
          </Button>
          <Button
            type="primary"
            className={styles.confirmBtn}
            onClick={handleConfirm}
            disabled={!selectedAddress.trim()}
            size="large"
          >
            {t('confirm')}
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
