'use client';

import {
  CheckOutlined,
  EnvironmentOutlined,
  GlobalOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { Alert, Input, Skeleton, type InputRef } from 'antd';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { normalizeProvinceAlias } from '@xeprime/types';
import { CurrentLocationButton } from '@/features/locations/components/CurrentLocationButton';
import {
  deliveryAddressFromCurrentPlace,
  type CurrentPlace,
} from '@/features/locations/hooks/use-current-place';
import { cx } from '@/lib/cx';
import { rememberDeliveryAddress } from '@/lib/delivery-address-memory';
import { useErrorMessage } from '@/i18n/use-error-message';
import { NATIONWIDE_VALUE, provinceLabelOf } from '../province-options';
import type { PublicDestination } from '../types';
import { useSearchExperience } from './search-context';
import { SearchPopover } from './SearchPopover';
import styles from './LocationPicker.module.css';

/** Số điểm đến hiện ở dải "phổ biến" — danh sách đã sắp theo số xe giảm dần ở backend. */
const POPULAR_COUNT = 6;

/**
 * Ô chọn địa điểm dùng chung cho hero và thanh thu gọn.
 *
 * Nguồn dữ liệu là `/public/destinations` (qua context) — CÙNG nguồn với "Địa điểm nổi bật" và
 * ô sửa ở `/search`. Không có danh sách tỉnh nào được gõ cứng ở frontend: tỉnh bị admin ẩn hoặc
 * không còn xe nào sẽ biến mất khỏi mọi bộ chọn cùng lúc.
 *
 * Trình bày theo `variant`: `field` là ô nhập trong thẻ hero (có nhãn hoa nhỏ ở ngoài),
 * `chip` là viên gọn trong thanh thu gọn. Cả hai mở CÙNG một panel, neo vào CHÍNH nút của mình.
 */
export function LocationPicker({
  variant = 'field',
  className,
  popupContainer,
}: {
  variant?: 'field' | 'chip';
  className?: string;
  /** Xem `SearchPopover` — ô nằm trong thanh `position: fixed` phải neo panel vào chính thanh đó. */
  popupContainer?: () => HTMLElement;
}) {
  const t = useTranslations('HomeSearch.location');
  const { draft, setProvinceCode, destinations, destinationsLoading, destinationsError } =
    useSearchExperience();

  const selectedLabel = useMemo(
    () =>
      // Cùng hàm tra tên với `/search` và "Địa điểm nổi bật" — ba bề mặt, một cách dịch mã → tên.
      provinceLabelOf(destinations, draft.provinceCode) ??
      (!draft.provinceCode
        ? t('nationwide')
        : // Lựa chọn cũ không còn khả dụng thì nói thẳng — âm thầm hiện "Toàn quốc" trong khi
          // vẫn đang lọc theo mã tỉnh đó là nói dối người dùng.
          destinationsLoading
          ? '…'
          : t('unavailable')),
    [draft.provinceCode, destinations, destinationsLoading, t],
  );

  return (
    <SearchPopover
      title={t('panelTitle')}
      popupContainer={popupContainer}
      triggerLabel={t('triggerLabel', { value: selectedLabel })}
      triggerClassName={cx(variant === 'chip' ? styles.chip : styles.field, className)}
      trigger={
        variant === 'field' ? (
          /*
           * Ô của thẻ tìm kiếm trang chủ v2 (ADR 0062): chữ trước, icon địa điểm ở CUỐI. Chưa chọn
           * tỉnh nào thì hiện chữ gợi ý — "Toàn quốc" vẫn là một lựa chọn trong bảng, chỉ là ô
           * mở đầu bằng một lời mời thay vì một giá trị không ai chọn.
           */
          <>
            {draft.provinceCode ? (
              <span className={styles.triggerValue}>{selectedLabel}</span>
            ) : (
              <span className={styles.triggerPlaceholder}>{t('placeholder')}</span>
            )}
            <span className={styles.triggerSuffix}>
              <Image src="/home/field-location.svg" alt="" width={15} height={19} unoptimized />
            </span>
          </>
        ) : (
          <>
            <EnvironmentOutlined className={styles.triggerIcon} aria-hidden="true" />
            <span className={styles.triggerValue}>{selectedLabel}</span>
          </>
        )
      }
    >
      {(close) => (
        <LocationPanel
          destinations={destinations}
          loading={destinationsLoading}
          error={destinationsError}
          selectedCode={draft.provinceCode}
          onSelect={(code) => {
            setProvinceCode(code);
            close();
          }}
        />
      )}
    </SearchPopover>
  );
}

function LocationPanel({
  destinations,
  loading,
  error,
  selectedCode,
  onSelect,
}: {
  destinations: PublicDestination[] | undefined;
  loading: boolean;
  error: unknown;
  selectedCode: string;
  onSelect: (provinceCode: string) => void;
}) {
  const t = useTranslations('HomeSearch.location');
  const errorMessage = useErrorMessage();
  const [query, setQuery] = useState('');
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const inputRef = useRef<InputRef>(null);

  /*
   * "Vị trí hiện tại": TỈNH đi vào bộ lọc như một cú bấm tỉnh (người dùng chủ động bấm, nên ghi
   * vào bộ nhớ tỉnh là đúng — ADR 0042 điều 6), còn ĐỊA CHỈ CỤ THỂ được nhớ làm địa chỉ giao xe để
   * điền sẵn khi khách chọn thuê xe. Địa chỉ chỉ được nhớ khi phép đo đủ chính xác — xem
   * `deliveryAddressFromCurrentPlace`.
   *
   * Tỉnh đo được nhưng không có trong danh mục điểm đến (chưa có xe) ⇒ KHÔNG đổi bộ lọc, giữ panel
   * mở và nói thẳng — chọn một tỉnh rỗng là dẫn khách tới một trang kết quả trống. Danh mục chưa về
   * (hiếm: lượt đo mất vài giây) thì vẫn chọn — mã đã qua bảng bí danh ở server nên luôn hợp lệ.
   */
  const handleLocated = (place: CurrentPlace) => {
    const address = deliveryAddressFromCurrentPlace(place);
    if (address) rememberDeliveryAddress(address);

    if (!place.provinceCode) {
      setLocationNotice(t('noProvinceNearby'));
      return;
    }
    if (destinations && !destinations.some((d) => d.provinceCode === place.provinceCode)) {
      setLocationNotice(t('noVehiclesNearby'));
      return;
    }
    onSelect(place.provinceCode);
  };

  /*
   * Panel mở ra là gõ được ngay. KHÔNG dùng `autoFocus`: nó focus kèm cuộn, và với popup vừa
   * dựng ra thì trình duyệt giật trang — `preventScroll` là điểm khác biệt duy nhất.
   */
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  /*
   * Tra không dấu qua `normalizeProvinceAlias` — cùng hàm mà backend dùng để quy tên tỉnh về
   * mã. Gõ "da nang" hay "Đà Nẵng" hay "TP Đà Nẵng" đều phải ra một kết quả; so chuỗi thô thì
   * người không gõ dấu không tìm được gì.
   */
  const normalizedQuery = normalizeProvinceAlias(query);
  const matches = useMemo(() => {
    const all = destinations ?? [];
    if (!normalizedQuery) return all;
    return all.filter((d) => normalizeProvinceAlias(d.provinceName).includes(normalizedQuery));
  }, [destinations, normalizedQuery]);

  const popular = normalizedQuery ? [] : matches.slice(0, POPULAR_COUNT);
  const nationwideLabel = t('nationwide');
  const showNationwide =
    !normalizedQuery || normalizeProvinceAlias(nationwideLabel).includes(normalizedQuery);

  return (
    <div className={styles.panel}>
      <Input
        ref={inputRef}
        allowClear
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('searchPlaceholder')}
        prefix={<SearchOutlined aria-hidden="true" />}
        aria-label={t('searchAriaLabel')}
      />

      <CurrentLocationButton
        label={t('useCurrent')}
        onLocateStart={() => setLocationNotice(null)}
        onLocated={handleLocated}
        notice={locationNotice}
      />

      {error ? (
        <Alert type="error" showIcon title={t('loadError')} description={errorMessage(error)} />
      ) : loading ? (
        <Skeleton active paragraph={{ rows: 4 }} title={false} />
      ) : (
        <>
          {popular.length > 0 ? (
            <div className={styles.group}>
              <p className={styles.groupTitle}>{t('popular')}</p>
              <div className={styles.popularRow}>
                {popular.map((d) => (
                  <button
                    key={d.provinceCode}
                    type="button"
                    className={cx(
                      styles.popularChip,
                      selectedCode === d.provinceCode && styles.popularChipActive,
                    )}
                    onClick={() => onSelect(d.provinceCode)}
                  >
                    {d.provinceName}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className={styles.group}>
            {popular.length > 0 ? <p className={styles.groupTitle}>{t('all')}</p> : null}
            <ul className={styles.list}>
              {showNationwide ? (
                <LocationRow
                  icon={<GlobalOutlined aria-hidden="true" />}
                  label={nationwideLabel}
                  hint={t('nationwideHint')}
                  selected={selectedCode === NATIONWIDE_VALUE}
                  onSelect={() => onSelect(NATIONWIDE_VALUE)}
                />
              ) : null}
              {matches.map((d) => (
                <LocationRow
                  key={d.provinceCode}
                  icon={<EnvironmentOutlined aria-hidden="true" />}
                  label={d.provinceName}
                  hint={t('vehicleCount', { count: d.vehicleCount })}
                  selected={selectedCode === d.provinceCode}
                  onSelect={() => onSelect(d.provinceCode)}
                />
              ))}
            </ul>

            {matches.length === 0 && !showNationwide ? (
              <p className={styles.empty}>{t('noMatch', { query: query.trim() })}</p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

function LocationRow({
  icon,
  label,
  hint,
  selected,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className={cx(styles.row, selected && styles.rowActive)}
        aria-current={selected ? 'true' : undefined}
        onClick={onSelect}
      >
        <span className={styles.rowIcon}>{icon}</span>
        <span className={styles.rowLabel}>{label}</span>
        <span className={styles.rowHint}>{hint}</span>
        {selected ? <CheckOutlined className={styles.rowCheck} aria-hidden="true" /> : null}
      </button>
    </li>
  );
}
