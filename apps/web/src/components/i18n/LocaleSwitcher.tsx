'use client';

import { CheckOutlined, GlobalOutlined } from '@ant-design/icons';
import { Dropdown, type MenuProps } from 'antd';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { setLocale } from '@/i18n/actions';
import { SUPPORTED_LOCALES, type AppLocale } from '@/i18n/config';
import { cx } from '@/lib/cx';
import styles from './LocaleSwitcher.module.css';

export interface LocaleSwitcherProps {
  /**
   * `compact` bỏ mã ngôn ngữ, chỉ còn quả địa cầu — dùng ở header hẹp trên mobile, nơi mỗi
   * điểm ngang đều đã có chủ. Vùng chạm vẫn giữ đủ 44px (`--xp-touch-target-min`).
   */
  readonly compact?: boolean;
  readonly className?: string;
}

/**
 * Bộ đổi ngôn ngữ giao diện — MỘT component cho cả marketplace, cổng quản lý và trang đăng nhập.
 *
 * Cách đổi ngôn ngữ ở đây cố ý KHÔNG đụng tới URL (ADR 0012):
 *   1. Server Action ghi cookie `XP_LOCALE` (httpOnly, server tự kiểm tra giá trị).
 *   2. Chờ action xong rồi mới `router.refresh()` — RSC render lại với ngôn ngữ mới.
 *
 * Nhờ vậy đường dẫn, query, hash, trạng thái tìm kiếm và lịch sử trình duyệt giữ nguyên tuyệt
 * đối: người đang xem `/search?provinceCode=79&serviceType=self_drive` đổi sang tiếng Anh thì
 * vẫn đứng đúng chỗ đó với đúng bộ lọc đó. Một `window.location.href = ...` sẽ mất trạng thái
 * client (form đang gõ dở, panel đang mở) và thêm một entry lịch sử vô nghĩa.
 *
 * Không hiện cờ quốc gia: ngôn ngữ không phải quốc gia, và tiếng Anh không thuộc về một lá cờ.
 */
export function LocaleSwitcher({ compact = false, className }: LocaleSwitcherProps) {
  const t = useTranslations('Common.locale');
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const current = t(locale);

  function choose(next: AppLocale) {
    if (next === locale || pending) return;
    startTransition(async () => {
      const result = await setLocale(next);
      // Chỉ làm mới khi cookie ĐÃ ghi xong; refresh sớm sẽ render lại bằng ngôn ngữ cũ.
      if (result.ok) router.refresh();
    });
  }

  const items: MenuProps['items'] = SUPPORTED_LOCALES.map((value) => ({
    key: value,
    label: (
      <span className={styles.option}>
        <span className={styles.optionName}>{t(value)}</span>
        <span className={styles.optionCode}>{t(`${value}Short`)}</span>
        <CheckOutlined
          className={cx(styles.check, value === locale && styles.checkActive)}
          aria-hidden="true"
        />
      </span>
    ),
    onClick: () => choose(value),
  }));

  return (
    <Dropdown
      trigger={['click']}
      placement="bottomRight"
      menu={{ items, selectedKeys: [locale] }}
      disabled={pending}
    >
      <button
        type="button"
        className={cx(styles.trigger, compact && styles.triggerCompact, className)}
        aria-label={t('switchAriaLabel', { current })}
        aria-busy={pending}
        disabled={pending}
      >
        <GlobalOutlined aria-hidden="true" />
        {!compact && <span className={styles.code}>{t(`${locale}Short`)}</span>}
      </button>
    </Dropdown>
  );
}
