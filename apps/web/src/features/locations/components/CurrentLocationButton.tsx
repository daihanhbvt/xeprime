'use client';

import { AimOutlined, LoadingOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { isAppleMobileBrowser } from '@/lib/browser-location';
import { cx } from '@/lib/cx';
import {
  CURRENT_PLACE_ERROR,
  useCurrentPlace,
  type CurrentPlace,
  type CurrentPlaceErrorCode,
} from '../hooks/use-current-place';
import styles from './CurrentLocationButton.module.css';

const ERROR_KEY = {
  [CURRENT_PLACE_ERROR.UNSUPPORTED]: 'errors.unsupported',
  [CURRENT_PLACE_ERROR.INSECURE]: 'errors.insecure',
  [CURRENT_PLACE_ERROR.DENIED]: 'errors.denied',
  [CURRENT_PLACE_ERROR.UNAVAILABLE]: 'errors.unavailable',
  [CURRENT_PLACE_ERROR.TIMEOUT]: 'errors.timeout',
  [CURRENT_PLACE_ERROR.LOOKUP_UNAVAILABLE]: 'errors.lookupUnavailable',
  [CURRENT_PLACE_ERROR.NOT_FOUND]: 'errors.notFound',
} as const satisfies Record<CurrentPlaceErrorCode, `errors.${string}`>;

/**
 * Nút "vị trí hiện tại" — đo vị trí trình duyệt, tra ngược ra địa chỉ + tỉnh, rồi giao kết quả cho
 * nơi gọi quyết định dùng thế nào (bộ chọn tỉnh chỉ lấy tỉnh, ô giao xe lấy cả địa chỉ).
 *
 * Lỗi của lượt đo hiện ngay dưới nút. `notice` là lời báo của NƠI GỌI về một kết quả đo được nhưng
 * không dùng được ở đó (khu vực chưa có xe, sai số quá lớn) — đặt chung một chỗ để hai loại lời báo
 * không chồng lên nhau.
 */
export function CurrentLocationButton({
  label,
  onLocated,
  onLocateStart,
  notice,
  className,
}: {
  /** Nhãn riêng của bề mặt; mặc định "Lấy vị trí hiện tại". */
  label?: string;
  onLocated: (place: CurrentPlace) => void;
  /** Gọi ngay khi người dùng bấm — để nơi gọi xoá `notice` của lượt trước. */
  onLocateStart?: () => void;
  notice?: ReactNode;
  className?: string;
}) {
  const t = useTranslations('Address.currentLocation');
  const { locate, isLocating, errorCode } = useCurrentPlace();

  const errorText = errorCode
    ? errorCode === CURRENT_PLACE_ERROR.DENIED && isAppleMobileBrowser()
      ? t('errors.deniedIos')
      : t(ERROR_KEY[errorCode])
    : null;

  return (
    <div className={cx(styles.root, className)}>
      <button
        type="button"
        className={styles.action}
        disabled={isLocating}
        aria-busy={isLocating || undefined}
        onClick={() => {
          onLocateStart?.();
          // Gọi đồng bộ trong cú bấm — Safari gắn hộp hỏi quyền vị trí với thao tác này.
          locate(onLocated);
        }}
      >
        {isLocating ? (
          <LoadingOutlined className={styles.icon} aria-hidden="true" />
        ) : (
          <AimOutlined className={styles.icon} aria-hidden="true" />
        )}
        <span>{isLocating ? t('locating') : (label ?? t('action'))}</span>
      </button>
      {errorText ? (
        <p className={styles.error} role="alert">
          {errorText}
        </p>
      ) : notice ? (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
