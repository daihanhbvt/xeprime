'use client';

import { CarOutlined, CheckOutlined } from '@ant-design/icons';
import Image from 'next/image';
import { useId } from 'react';
import type { CatalogItem } from '../types';
import styles from './CatalogCardPicker.module.css';

interface CatalogCardPickerProps {
  items: readonly CatalogItem[];
  /** Key đang chọn. Một phần tử = chọn đơn, nhiều = chọn nhiều; component không tự phân biệt. */
  value: readonly string[];
  onChange: (next: string[]) => void;
  /** `single` bấm lại để bỏ chọn; `multi` bật/tắt từng thẻ. */
  mode?: 'single' | 'multi';
  /** Số bên phải nhãn — bộ lọc marketplace dùng để hiện "N xe". */
  countOf?: (key: string) => number | undefined;
  /** Hậu tố cho số đếm ("xe"). Không truyền thì không hiện số. */
  countSuffix?: string;
  disabled?: boolean;
  /** Nhãn nhóm cho screen reader — bắt buộc vì đây là nhóm nút thay cho radio/checkbox. */
  ariaLabel: string;
}

/**
 * Bộ chọn danh mục dạng thẻ có ảnh — dùng CHUNG cho ô "Kiểu dáng xe" khi tạo/sửa xe và cho
 * bộ lọc "Loại xe" ngoài chợ. Một component, hai chế độ, nên hai màn không thể lệch icon/nhãn.
 *
 * Ngữ nghĩa trợ năng khác nhau theo chế độ, có chủ đích:
 * - `multi` (bộ lọc): mỗi thẻ là một `checkbox` độc lập — giống hệt các chip lọc bên cạnh.
 * - `single` (form): thẻ phải BẤM LẠI ĐỂ BỎ CHỌN, mà radio gốc không bỏ chọn được; dùng nút
 *   `aria-pressed` để diễn đạt đúng trạng thái bật/tắt.
 */
export function CatalogCardPicker({
  items,
  value,
  onChange,
  mode = 'single',
  countOf,
  countSuffix,
  disabled = false,
  ariaLabel,
}: CatalogCardPickerProps) {
  const groupId = useId();

  function toggle(key: string) {
    if (disabled) return;
    if (mode === 'single') {
      onChange(value.includes(key) ? [] : [key]);
      return;
    }
    onChange(value.includes(key) ? value.filter((v) => v !== key) : [...value, key]);
  }

  return (
    <div className={styles.grid} role="group" aria-label={ariaLabel} id={groupId}>
      {items.map((item) => {
        const active = value.includes(item.key);
        const count = countOf?.(item.key);
        return (
          <button
            key={item.key}
            type="button"
            className={`${styles.card} ${active ? styles.active : ''}`}
            role={mode === 'multi' ? 'checkbox' : undefined}
            aria-checked={mode === 'multi' ? active : undefined}
            aria-pressed={mode === 'multi' ? undefined : active}
            disabled={disabled}
            onClick={() => toggle(item.key)}
          >
            <span className={styles.media}>
              {item.iconUrl ? (
                <Image
                  src={item.iconUrl}
                  alt=""
                  width={96}
                  height={48}
                  className={styles.icon}
                  unoptimized
                />
              ) : (
                // Chưa có ảnh cho mục này — glyph trung tính, KHÔNG mượn ảnh của mục khác.
                <CarOutlined className={styles.fallbackIcon} aria-hidden />
              )}
            </span>
            <span className={styles.label}>{item.label}</span>
            {item.description || count !== undefined ? (
              <span className={styles.meta}>
                {[
                  item.description,
                  count !== undefined && countSuffix ? `${count} ${countSuffix}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            ) : null}
            {active ? <CheckOutlined className={styles.check} aria-hidden /> : null}
          </button>
        );
      })}
    </div>
  );
}
