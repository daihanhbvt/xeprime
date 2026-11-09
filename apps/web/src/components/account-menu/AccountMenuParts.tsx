'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useLocaleChoice } from '@/components/i18n/locale-menu';
import { LineIcon, type LineIconName } from '@/components/icons/LineIcon';
import { SUPPORTED_LOCALES } from '@/i18n/config';
import { cx } from '@/lib/cx';
import { useTheme, type ThemeMode } from '@/lib/theme';
import styles from './AccountMenuParts.module.css';

/**
 * Các mảnh của menu TÀI KHOẢN dạng bảng - một khuôn cho site khách (`MarketAccountMenu`) và site
 * partner (`PartnerAccountMenu`). Mỗi site chỉ tự vẽ thẻ danh tính và chọn dòng nào có mặt; vỏ,
 * dòng, hai nút gạt và nút đăng xuất là của chung, để hai menu không lệch nhau từng px.
 *
 * ## Vì sao là bảng tự dựng chứ không phải `menu.items` của AntD
 *
 * Hai dòng "Giao diện" và "Ngôn ngữ" mang một nút gạt NGAY TRONG dòng. Trong `Menu` của AntD mỗi
 * dòng là một mục bấm được và bấm là đóng menu - người dùng đổi sáng/tối sẽ thấy menu sập ngay
 * dưới tay. Ở đây dòng điều hướng là `<Link>` thật (mở tab mới, sao chép địa chỉ vẫn được) và
 * đóng menu khi bấm; nút gạt là `<button aria-pressed>` và giữ menu mở để thấy kết quả.
 */

/** Vỏ: mặt trắng (thẻ danh tính + lối đi) đặt trên nền xám chứa chân menu. */
export function AccountMenuPanel({
  label,
  footer,
  children,
}: {
  /** Tên truy cập của bảng. */
  label: string;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.menu} role="dialog" aria-label={label}>
      <div className={styles.surface}>{children}</div>
      <div className={styles.footer}>{footer}</div>
    </div>
  );
}

/** Một nhóm dòng; `divider` kẻ vạch phía trên (nhóm đứng sau nhóm khác trên mặt trắng). */
export function AccountMenuSection({
  divider = false,
  children,
}: {
  divider?: boolean;
  children: ReactNode;
}) {
  return <div className={cx(styles.section, divider && styles.divider)}>{children}</div>;
}

/** Lề hai bên của một dòng - bọc cả những khối không phải dòng (thẻ danh tính). */
export function AccountMenuItem({ children }: { children: ReactNode }) {
  return <div className={styles.item}>{children}</div>;
}

/** Một dòng điều hướng: icon + nhãn, phần đuôi (huy hiệu, mũi tên) ở bên phải. */
export function AccountMenuLink({
  href,
  icon,
  label,
  trailing,
  onNavigate,
  accent = false,
}: {
  href: string;
  icon: LineIconName;
  label: string;
  trailing?: ReactNode;
  /** Đóng menu khi đi. */
  onNavigate: () => void;
  /** Dòng mời gọi (vd "Nâng cấp gian hàng"): icon, nhãn và mũi tên mang màu thương hiệu. */
  accent?: boolean;
}) {
  return (
    <AccountMenuItem>
      <Link href={href} className={cx(styles.row, accent && styles.rowAccent)} onClick={onNavigate}>
        <LineIcon name={icon} className={styles.rowIcon} />
        <span className={styles.rowLabel}>{label}</span>
        {trailing}
      </Link>
    </AccountMenuItem>
  );
}

/** Mũi tên → ở đuôi một dòng. */
export function AccountMenuArrow() {
  return <LineIcon name="arrow-right" className={styles.rowIcon} />;
}

/** Dòng mang nút gạt: icon + nhãn bên trái, nhóm nút bên phải. Cả dòng KHÔNG bấm được. */
function ToggleRow({
  icon,
  label,
  groupLabel,
  children,
}: {
  icon: LineIconName;
  label: string;
  groupLabel: string;
  children: ReactNode;
}) {
  return (
    <AccountMenuItem>
      <div className={styles.row}>
        <LineIcon name={icon} className={styles.rowIcon} />
        <span className={styles.rowLabel}>{label}</span>
        <span className={styles.toggle} role="group" aria-label={groupLabel}>
          {children}
        </span>
      </div>
    </AccountMenuItem>
  );
}

/** Hai lựa chọn giao diện của nút gạt - thứ tự và icon theo Figma. */
const THEME_OPTIONS: readonly { mode: ThemeMode; icon: LineIconName }[] = [
  { mode: 'light', icon: 'sun' },
  { mode: 'dark', icon: 'moon' },
];

/** "Giao diện ☀|☾" - đổi qua `useTheme` (cookie `XP_THEME` + `data-theme`). */
export function AccountMenuThemeRow() {
  const t = useTranslations('Common.theme');
  const { theme, setTheme } = useTheme();

  return (
    <ToggleRow icon="palette" label={t('label')} groupLabel={t('switchLabel')}>
      {THEME_OPTIONS.map((option) => (
        <button
          key={option.mode}
          type="button"
          className={cx(styles.toggleButton, theme === option.mode && styles.toggleActive)}
          aria-pressed={theme === option.mode}
          aria-label={t(option.mode)}
          title={t(option.mode)}
          onClick={() => setTheme(option.mode)}
        >
          <LineIcon name={option.icon} className={styles.toggleIcon} />
        </button>
      ))}
    </ToggleRow>
  );
}

/** "Ngôn ngữ VI|EN" - cùng hành vi đổi ngôn ngữ với mọi bề mặt khác (`useLocaleChoice`). */
export function AccountMenuLocaleRow() {
  const t = useTranslations('Common.locale');
  const choice = useLocaleChoice();

  return (
    <ToggleRow icon="globe" label={t('switchLabel')} groupLabel={t('switchLabel')}>
      {SUPPORTED_LOCALES.map((value) => (
        <button
          key={value}
          type="button"
          className={cx(
            styles.toggleButton,
            styles.toggleText,
            value === choice.locale && styles.toggleActive,
          )}
          aria-pressed={value === choice.locale}
          aria-label={t(value)}
          disabled={choice.pending}
          onClick={() => choice.choose(value)}
        >
          {t(`${value}Short`)}
        </button>
      ))}
    </ToggleRow>
  );
}

export function AccountMenuLogout({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className={styles.logout} onClick={onClick}>
      <LineIcon name="logout" className={styles.rowIcon} />
      {label}
    </button>
  );
}
