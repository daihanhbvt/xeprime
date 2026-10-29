import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LOCATION_SOURCE } from '@xeprime/types';
import { placesApi } from '@/api/locations/api';
import {
  getLocationPermission,
  LOCATION_PERMISSION,
  readDeviceCoords,
  requestLocationPermission,
} from '@/lib/device-location';
import type { RememberedDeliveryAddress } from '@/lib/delivery-address-memory';
import { requestPermissionExclusively } from '@/lib/permission-queue';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';

/**
 * Sai số tối đa (mét) để một phép đo được dùng làm ĐỊA CHỈ — cùng ngưỡng web
 * (`PRECISE_ADDRESS_MAX_ACCURACY_M`). Đo kém hơn thì địa chỉ tra ra là của một chỗ khác và phí giao
 * sẽ tính tới chỗ sai đó.
 */
export const PRECISE_ADDRESS_MAX_ACCURACY_M = 300;

export const CURRENT_PLACE_ERROR = {
  DENIED: 'denied',
  UNAVAILABLE: 'unavailable',
  LOOKUP_UNAVAILABLE: 'lookup_unavailable',
  NOT_FOUND: 'not_found',
} as const;
export type CurrentPlaceErrorCode = (typeof CURRENT_PLACE_ERROR)[keyof typeof CURRENT_PLACE_ERROR];

export interface CurrentPlace {
  readonly latitude: number;
  readonly longitude: number;
  /** Sai số (mét); `null` khi máy không báo — coi như KHÔNG chính xác. */
  readonly accuracy: number | null;
  readonly formattedAddress: string;
  readonly provinceCode: string | null;
  readonly precise: boolean;
}

/**
 * Đo vị trí máy rồi tra ngược ra địa chỉ — bản native của web `useCurrentPlace`. `ask = false`:
 * KHÔNG hỏi quyền (dùng cho lượt điền sẵn tự động); quyền chưa cấp thì trả lỗi `denied`.
 */
export async function locateCurrentPlace(
  { ask }: { ask: boolean },
): Promise<CurrentPlace | CurrentPlaceErrorCode> {
  let permission = await getLocationPermission();
  if (permission !== LOCATION_PERMISSION.GRANTED && ask) {
    permission = await requestPermissionExclusively('location', requestLocationPermission);
  }
  if (permission !== LOCATION_PERMISSION.GRANTED) return CURRENT_PLACE_ERROR.DENIED;
  const coords = await readDeviceCoords();
  if (!coords) return CURRENT_PLACE_ERROR.UNAVAILABLE;
  try {
    const { place, available } = await placesApi.reverse({
      lat: coords.latitude,
      lng: coords.longitude,
    });
    if (!available) return CURRENT_PLACE_ERROR.LOOKUP_UNAVAILABLE;
    const formattedAddress = place?.formattedAddress?.trim();
    if (!formattedAddress) return CURRENT_PLACE_ERROR.NOT_FOUND;
    return {
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy,
      formattedAddress,
      provinceCode: place?.suggestedProvinceCode ?? null,
      precise: coords.accuracy != null && coords.accuracy <= PRECISE_ADDRESS_MAX_ACCURACY_M,
    };
  } catch {
    return CURRENT_PLACE_ERROR.LOOKUP_UNAVAILABLE;
  }
}

/**
 * Địa chỉ giao xe nhớ được từ một phép đo — chỉ khi ĐỦ chính xác và biết tỉnh (web
 * `deliveryAddressFromCurrentPlace`). Nguồn `map_pin`: toạ độ đo tại chỗ, không phải gợi ý tra cứu.
 */
export function deliveryAddressFromCurrentPlace(
  place: CurrentPlace,
): RememberedDeliveryAddress | null {
  if (!place.precise || !place.provinceCode) return null;
  return {
    provinceCode: place.provinceCode,
    wardCode: '',
    addressLine: place.formattedAddress,
    latitude: place.latitude,
    longitude: place.longitude,
    placeId: null,
    locationSource: LOCATION_SOURCE.MAP_PIN,
  };
}

/**
 * Nút "Lấy vị trí hiện tại" — bản native của web `CurrentLocationButton` (#231). Hỏi quyền khi
 * cần, đo, tra ngược, rồi giao `CurrentPlace` cho màn gọi tự quyết (điền hay báo "chưa đủ chính
 * xác"). Lỗi hiện thành một dòng dưới nút, không phải hộp thoại.
 */
export function CurrentLocationButton({
  label,
  onLocated,
  onLocateStart,
  notice,
}: {
  label?: string;
  onLocated: (place: CurrentPlace) => void;
  onLocateStart?: () => void;
  /** Lời nhắc của màn gọi (vd. "vị trí chưa đủ chính xác") — hiện ở chỗ dòng lỗi. */
  notice?: ReactNode;
}) {
  const colors = useColors();
  const t = useTranslations('Address.currentLocation');
  const tShell = useTranslations('MobileShell.currentLocation');
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<CurrentPlaceErrorCode | null>(null);

  const locate = async () => {
    if (locating) return;
    setError(null);
    onLocateStart?.();
    setLocating(true);
    const result = await locateCurrentPlace({ ask: true });
    setLocating(false);
    if (typeof result === 'string') setError(result);
    else onLocated(result);
  };

  const errorText =
    error === CURRENT_PLACE_ERROR.DENIED
      ? tShell('denied')
      : error === CURRENT_PLACE_ERROR.UNAVAILABLE
        ? t('errors.unavailable')
        : error === CURRENT_PLACE_ERROR.NOT_FOUND
          ? t('errors.notFound')
          : error === CURRENT_PLACE_ERROR.LOOKUP_UNAVAILABLE
            ? t('errors.lookupUnavailable')
            : null;

  return (
    <YStack gap={space.xs}>
      <Pressable
        onPress={() => void locate()}
        disabled={locating}
        accessibilityRole="button"
        accessibilityState={{ busy: locating }}
        hitSlop={space.xs}
      >
        <XStack
          alignSelf="flex-start"
          ai="center"
          gap={space.xs}
          px={12}
          py={space.sm}
          br={radius.control}
          bw={1}
          bc={colors.primary}
          bg={colors.primarySubtle}
        >
          {locating ? (
            <ActivityIndicator size="small" color={colors.primaryHover} />
          ) : (
            <Ionicons name="locate-outline" size={iconSize.sm} color={colors.primaryHover} />
          )}
          <Text col={colors.primaryHover} fos={fontSize.body} fow={fontWeight.semibold}>
            {locating ? t('locating') : (label ?? t('action'))}
          </Text>
        </XStack>
      </Pressable>
      {errorText ? (
        <Text col={colors.danger} fos={fontSize.bodySm}>
          {errorText}
        </Text>
      ) : notice ? (
        <Text col={colors.warning} fos={fontSize.bodySm}>
          {notice}
        </Text>
      ) : null}
    </YStack>
  );
}
