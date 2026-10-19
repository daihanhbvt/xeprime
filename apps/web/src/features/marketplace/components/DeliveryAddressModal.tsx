'use client';

import { useEffect, useState } from 'react';
import {
  EnvironmentOutlined,
  InfoCircleOutlined,
  SearchOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { Alert, AutoComplete, Button, Input, Spin } from 'antd';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { StaticMapImage } from '@/components/data-display/StaticMapImage';
import { placeMapSrc, usePlaceDetail, usePlaceSearch } from '@/features/locations/hooks/use-places';
import { fetchDeliveryDistance } from '@/features/rental-policies/api';
import type { DeliveryDistance } from '@/features/rental-policies/types';
import {
  rememberDeliveryAddress,
  type RememberedDeliveryAddress,
} from '@/lib/delivery-address-memory';
import { useAppFormat } from '@/i18n/use-app-format';
import { isZeroMoney } from '@/lib/money';
import { LOCATION_SOURCE } from '@xeprime/types';
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
  fee: number;
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
  const fmt = useAppFormat();
  const [query, setQuery] = useState(initialAddress ?? '');
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [selectedAddress, setSelectedAddress] = useState(initialAddress ?? '');
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [suggestedProvinceCode, setSuggestedProvinceCode] = useState<string | null>(
    listing.provinceCode ?? null,
  );

  const [calculatingDistance, setCalculatingDistance] = useState(false);
  const [deliveryResult, setDeliveryResult] = useState<DeliveryDistance | null>(null);

  const placeDetailMutation = usePlaceDetail();

  // Tìm kiếm địa điểm qua Vietmap API
  const suggestions = usePlaceSearch(query, {
    biasPoint: listing.pickupPoint
      ? { lat: Number(listing.pickupPoint.latitude), lng: Number(listing.pickupPoint.longitude) }
      : null,
    enabled: open && query.trim().length >= 3,
  });

  // Khi mở modal, nạp lại địa chỉ ban đầu nếu có
  useEffect(() => {
    if (open) {
      if (initialAddress) {
        setQuery(initialAddress);
        setSelectedAddress(initialAddress);
      }
    }
  }, [open, initialAddress]);

  // Hàm tính toán khoảng cách và phí giao xe dự kiến
  const calculateDistance = async (
    addr: string,
    pin?: { lat: number; lng: number } | null,
  ) => {
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
      setSuggestedProvinceCode(listing.provinceCode ?? null);
      calculateDistance(typed, null);
      return;
    }

    const item = suggestions.data?.items.find((s) => s.placeId === value);
    if (!item) return;

    setSelectedPlaceId(value);
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
          !Number.isNaN(latNum) && !Number.isNaN(lngNum)
            ? { lat: latNum, lng: lngNum }
            : null;
        setSelectedCoords(coords);
        setSuggestedProvinceCode(
          detailRes.place.suggestedProvinceCode ?? listing.provinceCode ?? null,
        );

        calculateDistance(fullAddr, coords);
      }
    } catch {
      // Tra chi tiết lỗi thì dùng tạm text đã chọn
      setSelectedAddress(item.primaryText);
      calculateDistance(item.primaryText, null);
    }
  };

  // Xác nhận địa chỉ
  const handleConfirm = () => {
    if (!selectedAddress.trim()) return;

    let computedFee = 0;
    if (deliveryResult?.fee) {
      computedFee = Number(deliveryResult.fee) || 0;
    }

    const info: ConfirmedDeliveryInfo = {
      address: selectedAddress,
      placeId: selectedPlaceId,
      lat: selectedCoords?.lat ?? null,
      lng: selectedCoords?.lng ?? null,
      provinceCode: suggestedProvinceCode ?? listing.provinceCode ?? null,
      distanceKm: deliveryResult?.distanceKm ?? null,
      fee: computedFee,
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
        locationSource: info.placeId ? LOCATION_SOURCE.GOOGLE_PLACE : LOCATION_SOURCE.MANUAL,
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
          {s.secondaryText && (
            <div className={styles.suggestionSecondary}>{s.secondaryText}</div>
          )}
        </div>
      </div>
    ),
  }));

  if (query.trim().length >= 3) {
    suggestionOptions.push({
      value: USE_TYPED_VALUE,
      label: (
        <div className={styles.useTypedOption}>
          <EditOutlined />
          <span>Sử dụng đúng địa chỉ đã nhập: &quot;{query}&quot;</span>
        </div>
      ),
    });
  }

  const pickupPointAddr =
    listing.pickupPoint?.address || listing.shopProvince || 'Chi nhánh bàn giao xe';

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      title={title || 'Địa chỉ giao xe tận nơi'}
      size="md"
    >
      <div className={styles.dialogBody}>
        {/* Banner thông tin điểm giao xe của chủ xe & bán kính */}
        <div className={styles.contextAlert}>
          <InfoCircleOutlined className={styles.contextIcon} />
          <div>
            <div>
              <strong>Điểm giao xe của chủ:</strong> {pickupPointAddr}
            </div>
            {deliveryResult?.maxRadiusKm ? (
              <div>
                <strong>Bán kính giao tối đa:</strong> {deliveryResult.maxRadiusKm} km
              </div>
            ) : null}
          </div>
        </div>

        {/* Ô tìm kiếm địa chỉ */}
        <div className={styles.searchSection}>
          <label className={styles.searchLabel} htmlFor="delivery-address-input">
            Nhập địa chỉ nhận xe của bạn:
          </label>
          <AutoComplete
            id="delivery-address-input"
            className={styles.autoComplete}
            value={query}
            onChange={(val) => setQuery(val)}
            onSelect={handleSelectPlace}
            options={suggestionOptions}
            placeholder="Số nhà, tên đường, phường/xã, quận/huyện..."
          >
            <Input
              prefix={<SearchOutlined style={{ color: '#98a2b3' }} />}
              allowClear
              size="large"
            />
          </AutoComplete>
        </div>

        {/* Trạng thái đang tải toạ độ hoặc đang tính khoảng cách */}
        {(placeDetailMutation.isPending || calculatingDistance) && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <Spin tip="Đang định vị địa chỉ và tính toán quãng đường..." />
          </div>
        )}

        {/* Xem trước bản đồ tĩnh có ghim vị trí */}
        {selectedPlaceId && !placeDetailMutation.isPending && (
          <div className={styles.mapPreviewWrap}>
            <StaticMapImage
              src={placeMapSrc(selectedPlaceId)}
              alt="Bản đồ vị trí giao xe"
              className={styles.mapImage}
            />
          </div>
        )}

        {/* Kết quả tính khoảng cách và phí */}
        {deliveryResult && (
          <div className={styles.estimateCard}>
            {deliveryResult.status === 'auto' && (
              <>
                <div className={styles.estimateRow}>
                  <span className={styles.estimateLabel}>Phí giao xe dự kiến:</span>
                  <span
                    className={`${styles.estimateFee} ${
                      isZeroMoney(deliveryResult.fee ?? '0') ? styles.freeFee : ''
                    }`}
                  >
                    {isZeroMoney(deliveryResult.fee ?? '0')
                      ? 'Miễn phí'
                      : fmt.money(deliveryResult.fee ?? '0')}
                  </span>
                </div>
                {deliveryResult.distanceKm != null && (
                  <div className={styles.estimateMeta}>
                    Khoảng cách đường bộ dự kiến: ~{fmt.distanceKm(deliveryResult.distanceKm)}
                  </div>
                )}
                {deliveryResult.formattedAddress && (
                  <div className={styles.estimateMeta}>
                    Địa điểm xác nhận: {deliveryResult.formattedAddress}
                  </div>
                )}
              </>
            )}

            {deliveryResult.status === 'manual' && (
              <Alert
                type="warning"
                showIcon
                message="Cần thỏa thuận phí giao xe"
                description={
                  deliveryResult.manualReason === 'outside_auto_radius'
                    ? `Địa chỉ này nằm ngoài bán kính tự động báo giá (${deliveryResult.maxRadiusKm ?? 10} km). Chủ xe sẽ báo phí giao cụ thể sau khi nhận yêu cầu.`
                    : 'Phí giao xe sẽ được chủ xe xác nhận trực tiếp khi duyệt yêu cầu thuê.'
                }
              />
            )}

            {deliveryResult.status === 'address_not_found' && (
              <Alert
                type="info"
                showIcon
                message="Không tra được tuyến đường tự động"
                description="Hệ thống không tính được cự ly tự động cho địa chỉ này. Phí giao xe sẽ do chủ xe thông báo sau."
              />
            )}
          </div>
        )}

        {/* Nút hành động */}
        <div className={styles.footerActions}>
          <Button className={styles.cancelBtn} onClick={onClose} size="large">
            Hủy
          </Button>
          <Button
            type="primary"
            className={styles.confirmBtn}
            onClick={handleConfirm}
            disabled={!selectedAddress.trim()}
            size="large"
          >
            Xác nhận địa chỉ
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
