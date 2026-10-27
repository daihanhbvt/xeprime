'use client';

import Image from 'next/image';
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { STOREFRONT_KIND } from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import styles from './DriverCenter.module.css';

/**
 * Mảnh dựng dùng chung của "Trung tâm Tài xế" (Figma `21768:51021`) — bộ chuyển, viên trạng thái,
 * ảnh đại diện bên thuê, hàng nhãn ↔ giá trị. Không mang chữ nào: chữ do nơi gọi dịch rồi truyền vào.
 */

export interface SegmentItem<T extends string> {
  value: T;
  label: string;
  /** Không truyền (chưa tải) thì không vẽ viên số — không hiện "0" giả trong lúc chờ. */
  count?: number;
}

/**
 * Một `tablist` thật (mũi tên trái/phải chuyển tab, chỉ tab đang mở nằm trong vòng Tab). `size`:
 * `view` = bộ chuyển khu 44px ở đầu thẻ; `tab` = tab con 36px kèm số.
 */
export function SegmentTabs<T extends string>({
  label,
  value,
  items,
  onChange,
  size,
  countLabel,
}: {
  label: string;
  value: T;
  items: readonly SegmentItem<T>[];
  onChange: (next: T) => void;
  size: 'view' | 'tab';
  /** Tên đọc lên của tab có số — viên số chỉ là hình. */
  countLabel?: (label: string, count: number) => string;
}) {
  const fmt = useAppFormat();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const nextIndex = (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    const next = items[nextIndex];
    if (!next) return;
    refs.current[nextIndex]?.focus();
    onChange(next.value);
  }

  return (
    <div className={size === 'view' ? styles.views : styles.tabs} role="tablist" aria-label={label}>
      {items.map((item, index) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            aria-label={
              item.count !== undefined && countLabel ? countLabel(item.label, item.count) : undefined
            }
            className={cx(
              size === 'view' ? styles.view : styles.tab,
              active && (size === 'view' ? styles.viewActive : styles.tabActive),
            )}
            onClick={() => {
              if (!active) onChange(item.value);
            }}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <span>{item.label}</span>
            {item.count === undefined || size === 'view' ? null : (
              <span className={styles.tabCount} aria-hidden="true">
                {fmt.count(item.count)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export { ToneBadge } from '@/components/data-display/ToneBadge';

/** Cạnh dấu tích theo cỡ ảnh — Figma "_Avatar company icon": 10 / 14 / 18 cho ảnh 24 / 40 / 56. */
const VERIFIED_MARK_PX = { sm: 10, lg: 14, xl: 18 } as const;

/**
 * Ảnh bên thuê — không có ảnh thì chữ cái đầu của tên, không ô trống. Gian hàng tuyến gói
 * (`kind = shop`) mang dấu tích xanh ở góc dưới phải, cùng icon với thẻ "Chuyến của tôi"; chủ xe
 * cá nhân thì không.
 */
export function EmployerAvatar({
  name,
  avatarUrl,
  kind,
  size = 'sm',
}: {
  name: string;
  avatarUrl: string | null | undefined;
  kind: string;
  size?: 'sm' | 'lg' | 'xl';
}) {
  const verified = kind === STOREFRONT_KIND.SHOP;
  const markPx = VERIFIED_MARK_PX[size];
  return (
    <span
      className={cx(
        styles.avatar,
        size === 'lg' && styles.avatarLg,
        size === 'xl' && styles.avatarXl,
      )}
      aria-hidden="true"
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- ảnh R2, host cấu hình theo môi trường
        <img src={avatarUrl} alt="" loading="lazy" />
      ) : (
        <span className={styles.avatarInitial}>{name.trim().charAt(0).toUpperCase()}</span>
      )}
      {verified ? (
        <span className={cx(styles.avatarMark, styles[`avatarMark_${size}`])}>
          <Image src="/home/card-verified.svg" alt="" width={markPx} height={markPx} unoptimized />
        </span>
      ) : null}
    </span>
  );
}

/** Một hàng nhãn ↔ giá trị (Figma "Date details"). Phải nằm trong `<dl className={styles.facts}>`. */
export function Fact({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
