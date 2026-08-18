'use client';

import {
  CheckOutlined,
  EnvironmentOutlined,
  GlobalOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { Alert, Input, Skeleton, type InputRef } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { normalizeProvinceAlias } from '@xeprime/types';
import { cx } from '@/lib/cx';
import { getErrorMessage } from '@/services/api-client';
import {
  NATIONWIDE_OPTION,
  UNAVAILABLE_PROVINCE_LABEL,
  provinceLabelOf,
} from '../province-options';
import type { PublicDestination } from '../types';
import { useSearchExperience } from './search-context';
import { SearchPopover } from './SearchPopover';
import styles from './LocationPicker.module.css';

/** Số điểm đến hiện ở dải "phổ biến" — danh sách đã sắp theo số xe giảm dần ở backend. */
const POPULAR_COUNT = 6;

const PANEL_TITLE = 'Bạn muốn thuê xe ở đâu?';

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
  const { draft, setProvinceCode, destinations, destinationsLoading, destinationsError } =
    useSearchExperience();

  const selectedLabel = useMemo(
    () =>
      // Cùng hàm tra tên với `/search` và "Địa điểm nổi bật" — ba bề mặt, một cách dịch mã → tên.
      provinceLabelOf(destinations, draft.provinceCode) ??
      (!draft.provinceCode
        ? NATIONWIDE_OPTION.label
        : // Lựa chọn cũ không còn khả dụng thì nói thẳng — âm thầm hiện "Toàn quốc" trong khi
          // vẫn đang lọc theo mã tỉnh đó là nói dối người dùng.
          destinationsLoading
          ? '…'
          : UNAVAILABLE_PROVINCE_LABEL),
    [draft.provinceCode, destinations, destinationsLoading],
  );

  return (
    <SearchPopover
      title={PANEL_TITLE}
      popupContainer={popupContainer}
      triggerLabel={`Địa điểm nhận xe: ${selectedLabel}`}
      triggerClassName={cx(variant === 'chip' ? styles.chip : styles.field, className)}
      trigger={
        <>
          <EnvironmentOutlined className={styles.triggerIcon} aria-hidden="true" />
          <span className={styles.triggerValue}>{selectedLabel}</span>
        </>
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
  const [query, setQuery] = useState('');
  const inputRef = useRef<InputRef>(null);

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
  const showNationwide =
    !normalizedQuery || normalizeProvinceAlias(NATIONWIDE_OPTION.label).includes(normalizedQuery);

  return (
    <div className={styles.panel}>
      <Input
        ref={inputRef}
        allowClear
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Tìm tỉnh/thành phố"
        prefix={<SearchOutlined aria-hidden="true" />}
        aria-label="Tìm tỉnh hoặc thành phố"
      />

      {error ? (
        <Alert
          type="error"
          showIcon
          message="Không tải được danh sách địa điểm"
          description={getErrorMessage(error)}
        />
      ) : loading ? (
        <Skeleton active paragraph={{ rows: 4 }} title={false} />
      ) : (
        <>
          {popular.length > 0 ? (
            <div className={styles.group}>
              <p className={styles.groupTitle}>Địa điểm phổ biến</p>
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
            {popular.length > 0 ? <p className={styles.groupTitle}>Tất cả tỉnh/thành</p> : null}
            <ul className={styles.list}>
              {showNationwide ? (
                <LocationRow
                  icon={<GlobalOutlined aria-hidden="true" />}
                  label={NATIONWIDE_OPTION.label}
                  hint="Xem xe ở mọi tỉnh/thành"
                  selected={selectedCode === NATIONWIDE_OPTION.value}
                  onSelect={() => onSelect(NATIONWIDE_OPTION.value)}
                />
              ) : null}
              {matches.map((d) => (
                <LocationRow
                  key={d.provinceCode}
                  icon={<EnvironmentOutlined aria-hidden="true" />}
                  label={d.provinceName}
                  hint={`${d.vehicleCount} xe`}
                  selected={selectedCode === d.provinceCode}
                  onSelect={() => onSelect(d.provinceCode)}
                />
              ))}
            </ul>

            {matches.length === 0 && !showNationwide ? (
              <p className={styles.empty}>
                Không có tỉnh/thành nào khớp “{query.trim()}”. Thử tên khác hoặc chọn Toàn quốc.
              </p>
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
