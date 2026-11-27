'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';

import { SHOP_POLICIES_DEPOSIT_ANCHOR } from '@/constants/routes';
import { cx } from '@/lib/cx';

import styles from './ShopPolicies.module.css';

/** Bảy đích của mục lục cột phải (design `23874:75957`) — id DOM của thẻ tương ứng. */
export const POLICY_NAV = {
  PAYMENT: SHOP_POLICIES_DEPOSIT_ANCHOR,
  INSURANCE: 'policy-insurance',
  COLLATERAL: 'policy-collateral',
  LIMITS: 'policy-limits',
  DELIVERY: 'policy-delivery',
  LONG_TERM: 'policy-long-term',
  CONDITIONS: 'policy-conditions',
} as const;
export type PolicyNavId = (typeof POLICY_NAV)[keyof typeof POLICY_NAV];

const NAV_ITEMS: readonly {
  id: PolicyNavId;
  key: 'payment' | 'insurance' | 'collateral' | 'limits' | 'delivery' | 'longTerm' | 'conditions';
}[] = [
  { id: POLICY_NAV.PAYMENT, key: 'payment' },
  { id: POLICY_NAV.INSURANCE, key: 'insurance' },
  { id: POLICY_NAV.COLLATERAL, key: 'collateral' },
  { id: POLICY_NAV.LIMITS, key: 'limits' },
  { id: POLICY_NAV.DELIVERY, key: 'delivery' },
  { id: POLICY_NAV.LONG_TERM, key: 'longTerm' },
  { id: POLICY_NAV.CONDITIONS, key: 'conditions' },
];

/**
 * Khung trang Chính sách thuê (design `23874:63907`): cột nội dung bên trái, cột phải 320 dính gồm
 * mục lục ("Vehicle Edit Sidebar" — chấm + nền xám ở mục đang xem) và hai nút lưu do trang truyền vào.
 *
 * Mục lục là ANCHOR (mọi khối dựng cùng lúc), mục sáng theo vị trí cuộn — bấm sang khối khác không
 * tháo form đang sửa dở. Hẹp: cột phải lên đầu, nút lưu bám đáy màn hình như màn sửa xe.
 */
export function PoliciesLayout({
  aside,
  hidden = [],
  children,
}: {
  aside?: ReactNode;
  /** Thẻ không có mặt với loại xe này (bảo hiểm vật chất chỉ có ở ô tô) — không vẽ mục lục cho nó. */
  hidden?: readonly PolicyNavId[];
  children: ReactNode;
}) {
  const t = useTranslations('Shop.policies.workspace.nav');
  const items = NAV_ITEMS.filter((item) => !hidden.includes(item.id));
  const active = useActiveSection(items);

  return (
    <div className={styles.workspace}>
      <div className={styles.layout}>
        <div className={styles.mainColumn}>{children}</div>
        <aside className={styles.aside}>
          <nav className={styles.nav} aria-label={t('label')}>
            <ul className={styles.navList}>
              {items.map((item) => (
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
function useActiveSection(items: readonly { id: PolicyNavId }[]): PolicyNavId {
  const [active, setActive] = useState<PolicyNavId>(POLICY_NAV.PAYMENT);
  const ids = items.map((item) => item.id).join(',');
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight / 3;
      const list = ids.split(',') as PolicyNavId[];
      let current: PolicyNavId = list[0] ?? POLICY_NAV.PAYMENT;
      for (const id of list) {
        const node = document.getElementById(id);
        if (node && node.getBoundingClientRect().top <= line) current = id;
      }
      // Cuộn tới đáy trang: khối cuối có thể không bao giờ chạm vạch — vẫn phải sáng.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        current = list[list.length - 1] ?? current;
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
  }, [ids]);
  return active;
}
