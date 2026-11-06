'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';

import { cx } from '@/lib/cx';

import styles from './ShopPolicies.module.css';

/** Ba đích của mục lục cột phải — id DOM của khối tương ứng. */
export const POLICY_NAV = {
  RULES: 'policy-rules',
  DELIVERY: 'policy-delivery',
  LONG_TERM: 'policy-long-term',
} as const;
type PolicyNavId = (typeof POLICY_NAV)[keyof typeof POLICY_NAV];

const NAV_ITEMS: readonly { id: PolicyNavId; key: 'rules' | 'delivery' | 'longTerm' }[] = [
  { id: POLICY_NAV.RULES, key: 'rules' },
  { id: POLICY_NAV.DELIVERY, key: 'delivery' },
  { id: POLICY_NAV.LONG_TERM, key: 'longTerm' },
];

/**
 * Khung trang Chính sách thuê (design `23874:63907`): cột nội dung bên trái, cột phải 320 dính gồm
 * mục lục ("Vehicle Edit Sidebar" — chấm + nền xám ở mục đang xem) và hai nút lưu do trang truyền vào.
 *
 * Mục lục là ANCHOR (mọi khối dựng cùng lúc), mục sáng theo vị trí cuộn — bấm sang khối khác không
 * tháo form đang sửa dở. Hẹp: cột phải lên đầu, nút lưu bám đáy màn hình như màn sửa xe.
 */
export function PoliciesLayout({ aside, children }: { aside?: ReactNode; children: ReactNode }) {
  const t = useTranslations('Shop.policies.workspace.nav');
  const active = useActiveSection();

  return (
    <div className={styles.workspace}>
      <div className={styles.layout}>
        <div className={styles.mainColumn}>{children}</div>
        <aside className={styles.aside}>
          <nav className={styles.nav} aria-label={t('label')}>
            <ul className={styles.navList}>
              {NAV_ITEMS.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className={cx(styles.navItem, active === item.id && styles.navItemActive)}
                    aria-current={active === item.id ? 'true' : undefined}
                    onClick={(event) => {
                      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)
                        return;
                      event.preventDefault();
                      document
                        .getElementById(item.id)
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                  >
                    <span className={styles.navDot} aria-hidden="true" />
                    {t(item.key)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          {aside}
        </aside>
      </div>
    </div>
  );
}

/** Khối đang đọc = khối cuối cùng có mép trên đã qua một phần ba màn hình. */
function useActiveSection(): PolicyNavId {
  const [active, setActive] = useState<PolicyNavId>(POLICY_NAV.RULES);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight / 3;
      let current: PolicyNavId = POLICY_NAV.RULES;
      for (const item of NAV_ITEMS) {
        const node = document.getElementById(item.id);
        if (node && node.getBoundingClientRect().top <= line) current = item.id;
      }
      // Cuộn tới đáy trang: khối cuối có thể không bao giờ chạm vạch — vẫn phải sáng.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        current = NAV_ITEMS[NAV_ITEMS.length - 1]!.id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
  return active;
}
