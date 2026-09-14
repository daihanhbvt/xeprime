'use client';

import { CheckOutlined, GlobalOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { setLocale } from '@/i18n/actions';
import { SUPPORTED_LOCALES, type AppLocale } from '@/i18n/config';
import { cx } from '@/lib/cx';
import styles from './locale-menu.module.css';

type MenuItems = NonNullable<MenuProps['items']>;
type MenuItem = MenuItems[number];

type LocaleTranslator = ReturnType<typeof useTranslations<'Common.locale'>>;

export interface LocaleChoice {
  readonly locale: AppLocale;
  /** Server Action đang chạy — khoá lựa chọn để không bắn hai lần đổi chồng nhau. */
  readonly pending: boolean;
  readonly choose: (next: AppLocale) => void;
}

/**
 * Hành vi đổi ngôn ngữ, tách khỏi hình dáng của điều khiển.
 *
 * Có HAI bề mặt đổi ngôn ngữ: nút riêng ở trang đăng nhập/khách chưa đăng nhập
 * (`LocaleSwitcher`) và một nhóm mục trong menu tài khoản (`useLocaleMenuGroup`). Cả hai phải
 * đổi ngôn ngữ theo đúng MỘT cách (ADR 0012) — cookie trước, `router.refresh()` sau — nên logic
 * đó sống ở đây, không nhân đôi theo từng nơi vẽ.
 */
export function useLocaleChoice(): LocaleChoice {
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: AppLocale) {
    if (next === locale || pending) return;
    startTransition(async () => {
      const result = await setLocale(next);
      // Chỉ làm mới khi cookie ĐÃ ghi xong; refresh sớm sẽ render lại bằng ngôn ngữ cũ.
      if (result.ok) router.refresh();
    });
  }

  return { locale, pending, choose };
}

/**
 * Hai dòng ngôn ngữ dùng chung cho mọi menu — cùng thứ tự, cùng dấu tích, cùng mã ngắn.
 *
 * Không hiện cờ quốc gia: ngôn ngữ không phải quốc gia, và tiếng Anh không thuộc về một lá cờ.
 */
export function localeOptionItems(choice: LocaleChoice, t: LocaleTranslator): MenuItems {
  return SUPPORTED_LOCALES.map((value) => ({
    key: value,
    label: (
      <span className={styles.option}>
        <span className={styles.optionName}>{t(value)}</span>
        <span className={styles.optionCode}>{t(`${value}Short`)}</span>
        <CheckOutlined
          className={cx(styles.check, value === choice.locale && styles.checkActive)}
          aria-hidden="true"
        />
      </span>
    ),
    onClick: () => choice.choose(value),
  }));
}

/**
 * Nhóm "Ngôn ngữ" để chèn vào menu tài khoản.
 *
 * Nhóm PHẲNG chứ không phải submenu: chỉ có hai ngôn ngữ, và một menu con bật ra ở cạnh phải là
 * một bước rê chuột thừa trên desktop, một vùng chạm khó trúng trên tablet. Người dùng thấy cả
 * hai lựa chọn cùng lúc với dấu tích ở cái đang dùng.
 */
export function useLocaleMenuGroup(): MenuItem {
  const t = useTranslations('Common.locale');
  const choice = useLocaleChoice();

  return {
    key: 'locale',
    type: 'group',
    label: (
      <span className={styles.groupLabel}>
        <GlobalOutlined aria-hidden="true" />
        {t('switchLabel')}
      </span>
    ),
    children: localeOptionItems(choice, t),
  };
}
