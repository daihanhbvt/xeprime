'use client';

import { GlobalOutlined } from '@ant-design/icons';
import { Dropdown } from 'antd';
import { useTranslations } from 'next-intl';
import { cx } from '@/lib/cx';
import { localeOptionItems, useLocaleChoice } from './locale-menu';
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
 * Bộ đổi ngôn ngữ ĐỘC LẬP — dùng ở những nơi KHÔNG có menu tài khoản: trang đăng nhập và header
 * khu khách khi chưa đăng nhập. Người đã đăng nhập đổi ngôn ngữ ngay trong menu tài khoản
 * (`useLocaleMenuGroup`), nên thanh trên cùng không phải mang thêm một nút riêng.
 *
 * Cách đổi ngôn ngữ nằm ở `useLocaleChoice` và cố ý KHÔNG đụng tới URL (ADR 0012): Server Action
 * ghi cookie `XP_LOCALE`, xong mới `router.refresh()`. Nhờ vậy đường dẫn, query, hash, trạng thái
 * tìm kiếm và lịch sử trình duyệt giữ nguyên tuyệt đối.
 */
export function LocaleSwitcher({ compact = false, className }: LocaleSwitcherProps) {
  const t = useTranslations('Common.locale');
  const choice = useLocaleChoice();

  const current = t(choice.locale);

  return (
    <Dropdown
      trigger={['click']}
      placement="bottomRight"
      menu={{ items: localeOptionItems(choice, t), selectedKeys: [choice.locale] }}
      disabled={choice.pending}
    >
      <button
        type="button"
        className={cx(styles.trigger, compact && styles.triggerCompact, className)}
        aria-label={t('switchAriaLabel', { current })}
        aria-busy={choice.pending}
        disabled={choice.pending}
      >
        <GlobalOutlined aria-hidden="true" />
        {!compact && <span className={styles.code}>{t(`${choice.locale}Short`)}</span>}
      </button>
    </Dropdown>
  );
}
