'use client';

import { Avatar, Badge, Dropdown } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { useLocaleChoice } from '@/components/i18n/locale-menu';
import { LineIcon, type LineIconName } from '@/components/icons/LineIcon';
import { ROUTES } from '@/constants/routes';
import { resolveOwnerCtaHref } from '@/features/auth/post-auth-destination';
import { SUPPORTED_LOCALES } from '@/i18n/config';
import type { CurrentUser } from '@/hooks/use-current-user';
import { cx } from '@/lib/cx';
import { initialOf } from '@/lib/initials';
import { useTheme, type ThemeMode } from '@/lib/theme';
import styles from './MarketAccountMenu.module.css';

/** Hai lựa chọn giao diện của nút gạt trong menu — thứ tự và icon theo Figma. */
const THEME_OPTIONS: readonly {
  mode: ThemeMode;
  icon: LineIconName;
  labelKey: 'themeLight' | 'themeDark';
}[] = [
  { mode: 'light', icon: 'sun', labelKey: 'themeLight' },
  { mode: 'dark', icon: 'moon', labelKey: 'themeDark' },
];

/**
 * Menu tài khoản của site khách — avatar trên thanh + bảng thả xuống, dựng lại 26/10/2026 theo
 * Figma "Homepage - Dropdown" (`20063:57521`).
 *
 * ## Bố cục
 *
 *   ┌ thẻ danh tính (avatar · tên · email/SĐT · ›) — bấm vào là hồ sơ ┐
 *   │ Chuyến của tôi · Xe yêu thích · Tin nhắn · Giao diện [☀|☾]     │  ← mặt trắng
 *   │ Trở thành chủ xe →                                               │
 *   └──────────────────────────────────────────────────────────────────┘
 *     Ngôn ngữ [VI|EN] · Đăng xuất                                      ← chân menu, nền xám
 *
 * Dòng "Tài khoản của tôi" của bản trước đã GỘP vào thẻ danh tính: hai lối cùng tới `/account`
 * đặt sát nhau là một lối thừa.
 *
 * ## Vì sao là bảng tự dựng chứ không phải `menu.items` của AntD
 *
 * Hai dòng "Giao diện" và "Ngôn ngữ" mang một nút gạt NGAY TRONG dòng. Trong `Menu` của AntD mỗi
 * dòng là một mục bấm được và bấm là đóng menu — người dùng đổi sáng/tối sẽ thấy menu sập ngay
 * dưới tay. Ở đây dòng điều hướng là `<Link>` thật (mở tab mới, sao chép địa chỉ vẫn được) và
 * đóng menu khi bấm; nút gạt là `<button aria-pressed>` và giữ menu mở để thấy kết quả.
 */
export function MarketAccountMenu({
  user,
  chat,
  onLogout,
}: {
  user: CurrentUser;
  /** Đích hộp thư + số chưa đọc, lấy từ `useChatBadge` — cùng con số với biểu tượng trên thanh. */
  chat: { href: string; count: number };
  onLogout: () => void;
}) {
  const t = useTranslations('Navigation.public');
  const tAccount = useTranslations('Navigation.account');
  const tLocale = useTranslations('Common.locale');
  const { theme, setTheme } = useTheme();
  const localeChoice = useLocaleChoice();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  /** Một dòng điều hướng: icon + nhãn, huy hiệu và mũi tên (nếu có) ở bên phải. */
  const row = (
    href: string,
    icon: LineIconName,
    label: string,
    trailing?: ReactNode,
  ): ReactNode => (
    <Link href={href} className={styles.row} onClick={close}>
      <LineIcon name={icon} className={styles.rowIcon} />
      <span className={styles.rowLabel}>{label}</span>
      {trailing}
    </Link>
  );

  // Email phân biệt hai tài khoản trùng tên (khách ↔ đối tác, ADR 0053); thiếu email thì SĐT.
  const contact = user.email ?? user.phone ?? t('accountSubtitle');

  const panel = (
    <div className={styles.menu} role="dialog" aria-label={tAccount('menuLabel')}>
      <div className={styles.surface}>
        <div className={styles.section}>
          <div className={styles.item}>
            <Link href={ROUTES.ACCOUNT.ROOT} className={styles.identity} onClick={close}>
              <Avatar size={40} src={user.avatarUrl ?? undefined} className={styles.avatar}>
                {initialOf(user.displayName)}
              </Avatar>
              <span className={styles.identityText}>
                <span className={styles.identityName}>{user.displayName}</span>
                <span className={styles.identityContact}>{contact}</span>
              </span>
              <LineIcon name="chevron-right" className={styles.rowIcon} />
            </Link>
          </div>

          <div className={styles.item}>{row(ROUTES.TRIPS, 'calendar', t('trips'))}</div>
          <div className={styles.item}>
            {row(ROUTES.ACCOUNT.FAVORITES, 'heart', t('favorites'))}
          </div>
          <div className={styles.item}>
            {row(
              chat.href,
              'message',
              t('chat'),
              chat.count ? <Badge count={chat.count} overflowCount={99} size="small" /> : null,
            )}
          </div>
          <div className={styles.item}>
            <div className={styles.row}>
              <LineIcon name="palette" className={styles.rowIcon} />
              <span className={styles.rowLabel}>{t('appearance')}</span>
              <span className={styles.toggle} role="group" aria-label={t('toggleTheme')}>
                {THEME_OPTIONS.map((option) => (
                  <button
                    key={option.mode}
                    type="button"
                    className={cx(
                      styles.toggleButton,
                      theme === option.mode && styles.toggleActive,
                    )}
                    aria-pressed={theme === option.mode}
                    aria-label={t(option.labelKey)}
                    title={t(option.labelKey)}
                    onClick={() => setTheme(option.mode)}
                  >
                    <LineIcon name={option.icon} className={styles.toggleIcon} />
                  </button>
                ))}
              </span>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          {/*
            Lối sang SITE PARTNER (ADR 0051 điều 3) — đăng ký cho thuê xe là một tài khoản riêng ở
            đó (ADR 0053). Link khác site: URL tuyệt đối ở chế độ `host`.
          */}
          <div className={styles.item}>
            {row(
              resolveOwnerCtaHref(),
              'work',
              t('becomeOwner'),
              <LineIcon name="arrow-right" className={styles.rowIcon} />,
            )}
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        <div className={styles.item}>
          <div className={styles.row}>
            <LineIcon name="globe" className={styles.rowIcon} />
            <span className={styles.rowLabel}>{tLocale('switchLabel')}</span>
            <span className={styles.toggle} role="group" aria-label={tLocale('switchLabel')}>
              {SUPPORTED_LOCALES.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={cx(
                    styles.toggleButton,
                    styles.toggleText,
                    value === localeChoice.locale && styles.toggleActive,
                  )}
                  aria-pressed={value === localeChoice.locale}
                  aria-label={tLocale(value)}
                  disabled={localeChoice.pending}
                  onClick={() => localeChoice.choose(value)}
                >
                  {tLocale(`${value}Short`)}
                </button>
              ))}
            </span>
          </div>
        </div>
        <button
          type="button"
          className={styles.logout}
          onClick={() => {
            close();
            onLogout();
          }}
        >
          <LineIcon name="logout" className={styles.rowIcon} />
          {t('logout')}
        </button>
      </div>
    </div>
  );

  return (
    <Dropdown
      trigger={['click']}
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
      popupRender={() => panel}
    >
      <span
        className={cx(styles.trigger, open && styles.triggerOpen)}
        role="button"
        tabIndex={0}
        aria-label={t('account')}
        aria-expanded={open}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen((current) => !current);
          }
        }}
      >
        <Avatar className={styles.triggerAvatar} size={32} src={user.avatarUrl ?? undefined}>
          {initialOf(user.displayName)}
        </Avatar>
        <LineIcon name="caret-up" className={styles.caret} />
      </span>
    </Dropdown>
  );
}
