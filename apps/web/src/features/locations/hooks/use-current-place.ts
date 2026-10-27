'use client';

import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';
import { LOCATION_SOURCE } from '@xeprime/types';
import {
  BROWSER_LOCATION_ERROR,
  BrowserLocationError,
  readBrowserCoords,
  type BrowserCoords,
} from '@/lib/browser-location';
import type { RememberedDeliveryAddress } from '@/lib/delivery-address-memory';
import { apiRequest } from '@/services/api-client';
import type { PlaceDetail } from '../types';

/**
 * Sai số tối đa (mét) để một phép đo được dùng làm ĐỊA CHỈ giao xe, chứ không chỉ để biết tỉnh.
 *
 * Máy tính không có GPS định vị qua Wi-Fi (vài chục mét) hoặc qua IP (vài KM). Một địa chỉ tra ngược
 * từ một điểm sai 3km là địa chỉ của nhà người khác — điền nó vào ô giao xe là bắt chủ xe chở tới sai
 * chỗ, còn phí giao thì tính theo cái chỗ sai đó. Tỉnh thì vẫn đúng ở mức sai số này.
 */
export const PRECISE_ADDRESS_MAX_ACCURACY_M = 300;

export const CURRENT_PLACE_ERROR = {
  ...BROWSER_LOCATION_ERROR,
  /** Có toạ độ nhưng bản đồ không trả lời (chưa cấu hình, hết hạn mức, chạm trần lượt gọi). */
  LOOKUP_UNAVAILABLE: 'lookup_unavailable',
  /** Bản đồ trả lời nhưng không có địa chỉ cho điểm này (ngoài Việt Nam, giữa biển…). */
  NOT_FOUND: 'not_found',
} as const;

export type CurrentPlaceErrorCode = (typeof CURRENT_PLACE_ERROR)[keyof typeof CURRENT_PLACE_ERROR];

export class CurrentPlaceError extends Error {
  constructor(readonly code: CurrentPlaceErrorCode) {
    super(`current-place:${code}`);
    this.name = 'CurrentPlaceError';
  }
}

export interface CurrentPlace {
  readonly latitude: number;
  readonly longitude: number;
  /** Sai số (mét) trình duyệt báo. */
  readonly accuracy: number;
  readonly formattedAddress: string;
  /** Mã tỉnh quy qua bảng bí danh ở server; `null` = không quy được. */
  readonly provinceCode: string | null;
  /** Đủ chính xác để làm địa chỉ giao xe — xem {@link PRECISE_ADDRESS_MAX_ACCURACY_M}. */
  readonly precise: boolean;
}

interface ReverseResult {
  place: PlaceDetail | null;
  available: boolean;
}

/** Mã lỗi của một lượt định vị — mọi lỗi lạ (mạng, 429…) quy về "không tra được lúc này". */
export function currentPlaceErrorCode(error: unknown): CurrentPlaceErrorCode {
  if (error instanceof BrowserLocationError || error instanceof CurrentPlaceError) {
    return error.code;
  }
  return CURRENT_PLACE_ERROR.LOOKUP_UNAVAILABLE;
}

/**
 * Địa chỉ giao xe dựng từ một phép đo — để `rememberDeliveryAddress` điền lại ở lần thuê xe sau.
 * `null` khi phép đo không đủ để làm địa chỉ (sai số lớn, không quy được tỉnh).
 *
 * Nguồn toạ độ là `map_pin`: điểm này là chỗ người dùng ĐANG ĐỨNG và họ chủ động bấm để dùng nó —
 * đúng nghĩa "toạ độ do chính chủ xác nhận", không phải toạ độ máy tra từ một dòng chữ (`geocoded`).
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
    // Mã của lượt tra ngược không phải danh tính của một địa điểm đã chọn — toạ độ là đủ.
    placeId: null,
    locationSource: LOCATION_SOURCE.MAP_PIN,
  };
}

/**
 * "Vị trí hiện tại": đo vị trí trình duyệt → tra ngược qua `/places/reverse` (Vietmap, đi vòng qua
 * backend để khoá không lộ — ADR 0061) → địa chỉ chữ + mã tỉnh.
 *
 * `locate()` phải được gọi TRỰC TIẾP trong `onClick`: lượt đo bắt đầu đồng bộ ngay trong lời gọi đó
 * (Safari — xem `lib/browser-location.ts`), còn mutation chỉ chờ kết quả. Vì vậy biến của mutation
 * là một Promise toạ độ đã chạy sẵn, không phải một lệnh "hãy đo".
 */
export function useCurrentPlace() {
  const mutation = useMutation({
    mutationFn: async (measuring: Promise<BrowserCoords>): Promise<CurrentPlace> => {
      const coords = await measuring;
      const params = new URLSearchParams({
        lat: String(coords.latitude),
        lng: String(coords.longitude),
      });
      const res = await apiRequest<ReverseResult>(`/places/reverse?${params.toString()}`);
      if (!res.data.available) throw new CurrentPlaceError(CURRENT_PLACE_ERROR.LOOKUP_UNAVAILABLE);
      const place = res.data.place;
      if (!place?.formattedAddress) throw new CurrentPlaceError(CURRENT_PLACE_ERROR.NOT_FOUND);
      return {
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy,
        formattedAddress: place.formattedAddress,
        provinceCode: place.suggestedProvinceCode ?? null,
        precise: coords.accuracy <= PRECISE_ADDRESS_MAX_ACCURACY_M,
      };
    },
    // Hỏi lại tự động là hỏi lại GPS + một lượt bản đồ tính tiền; người dùng tự bấm lại nếu muốn.
    retry: false,
  });

  const { mutate } = mutation;
  const locate = useCallback(
    (onSuccess: (place: CurrentPlace) => void) => {
      const measuring = readBrowserCoords();
      // Gắn bộ bắt lỗi ngay: mutation chỉ `await` nó sau vài vòng microtask, và một Promise bị
      // từ chối trước lúc đó sẽ hiện "Uncaught (in promise)" trong console dù lỗi vẫn được xử lý.
      measuring.catch(() => undefined);
      mutate(measuring, { onSuccess });
    },
    [mutate],
  );

  return {
    locate,
    isLocating: mutation.isPending,
    errorCode: mutation.error ? currentPlaceErrorCode(mutation.error) : null,
    reset: mutation.reset,
  };
}
