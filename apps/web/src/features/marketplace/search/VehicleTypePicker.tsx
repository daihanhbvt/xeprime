'use client';

import { CheckOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { LineIcon } from '@/components/icons/LineIcon';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { SearchPopover } from './SearchPopover';
import { SegmentedTabs } from './SegmentedTabs';
import { useSearchExperience } from './search-context';
import { vehicleItems } from './search-items';
import styles from './VehicleTypePicker.module.css';

interface VehicleTypePickerProps {
  className?: string;
  /**
   * `segmented` - hai nút Ô tô / Xe máy nằm sẵn trên thanh.
   * `select` - Figma trang kết quả (19707:80489 › "Vehicle Location" 20037:23976): MỘT mục
   * "icon chìa khoá vàng + loại xe đang chọn", bấm mở panel chọn. Cùng trạng thái, cùng setter.
   */
  variant?: 'segmented' | 'select';
  /** Chỉ cho `select` - xem `SearchPopover.popupContainer`. */
  popupContainer?: () => HTMLElement;
}

/**
 * Bộ chọn Loại xe (Ô tô / Xe máy) đặt cạnh Địa điểm trong thanh tìm kiếm của trang kết quả.
 *
 * Dựng trên CÙNG `vehicleItems` với thẻ tìm kiếm trang chủ, nên:
 *   - nhãn đi qua namespace `Domain` (hai ngôn ngữ) thay vì chữ viết thẳng;
 *   - đang ở "Xe có tài xế" thì "Xe máy" biến mất (xe máy không có dịch vụ đó) — cùng một bảng
 *     `vehicleServiceTypesFor` với hero, không thể dựng ra một tổ hợp không tồn tại.
 */
export function VehicleTypePicker({
  className,
  variant = 'segmented',
  popupContainer,
}: VehicleTypePickerProps) {
  const t = useTranslations('Marketplace.filterPanel');
  const domainLabel = useDomainLabel();
  const { draft, setVehicleType } = useSearchExperience();
  const items = useMemo(
    () => vehicleItems(domainLabel, draft.serviceType),
    [domainLabel, draft.serviceType],
  );

  if (variant === 'select') {
    const current = items.find((item) => item.value === draft.vehicleType) ?? items[0];
    return (
      <SearchPopover
        title={t('vehicleType')}
        panelSize="sm"
        popupContainer={popupContainer}
        triggerLabel={`${t('vehicleType')}: ${current?.label ?? ''}`}
        triggerClassName={cx(styles.trigger, className)}
        trigger={
          <>
            <LineIcon name="password" className={styles.triggerIcon} />
            <span className={styles.triggerValue}>{current?.label}</span>
          </>
        }
      >
        {(close) => (
          <ul className={styles.list}>
            {items.map((item) => {
              const selected = item.value === draft.vehicleType;
              return (
                <li key={item.value}>
                  <button
                    type="button"
                    className={cx(styles.row, selected && styles.rowActive)}
                    aria-current={selected ? 'true' : undefined}
                    onClick={() => {
                      setVehicleType(item.value);
                      close();
                    }}
                  >
                    <span className={styles.rowIcon}>{item.icon}</span>
                    <span className={styles.rowLabel}>{item.label}</span>
                    {selected ? <CheckOutlined className={styles.rowCheck} aria-hidden="true" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </SearchPopover>
    );
  }

  return (
    <SegmentedTabs
      value={draft.vehicleType}
      onChange={setVehicleType}
      items={items}
      ariaLabel={t('vehicleType')}
      semantics="radio"
      className={className}
    />
  );
}
