'use client';

import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';

import { cx } from '@/lib/cx';
import { decorativeIcon } from '@/lib/decorative-icon';

import styles from './VehicleManageSidebar.module.css';

export interface VehicleSectionNavItem {
  /** Khoá định danh mục — `VehicleManageSection` ở khu tài khoản, `VehicleEditTab` ở cổng quản lý. */
  readonly key: string;
  readonly label: string;
  readonly icon: ComponentType<{ className?: string }>;
  /**
   * Đích khi mục là một ROUTE thật (khu tài khoản). Không có `href` ⇒ mục là một nút và nơi gọi
   * nhận `onSelect` — cổng quản lý giữ mục đang mở trong state rồi ghi `?tab=` vào URL, vì nó
   * còn phải chặn việc rời một form đang sửa dở.
   */
  readonly href?: string;
}

export interface VehicleSectionNavGroup {
  readonly key: string;
  readonly label: string;
  readonly items: readonly VehicleSectionNavItem[];
  /** Công tắc trên tiêu đề nhóm (bật/tắt dịch vụ). Không có ⇒ nhóm không có điều khiển. */
  readonly control?: ReactNode;
  /**
   * Khối điều khiển ĐẶT DƯỚI tiêu đề nhóm, trước danh sách mục — khi một công tắc trên tiêu đề
   * là không đủ (cổng quản lý có ba công tắc dịch vụ cho MỘT nhóm "Cho thuê").
   */
  readonly extra?: ReactNode;
  /** Nhóm đang TẮT thì mờ đi — mục vẫn bấm được, trang con tự nói lý do và mời bật lại. */
  readonly dimmed?: boolean;
}

/**
 * MENU TRÁI của một chiếc xe — hình thái dùng CHUNG cho cả hai khu (29/09/2026).
 *
 * ## Vì sao nó tồn tại
 *
 * Khu tài khoản bày 13 mục của một chiếc xe thành menu trái ba nhóm; cổng quản lý bày cùng
 * những việc đó thành 7 tab ngang, trong đó một tab còn gói năm khối vào một `Collapse`. Cùng
 * một nghiệp vụ, hai hình thái, và hình thái ở cổng quản lý khó dùng hơn hẳn — phải mở tab rồi
 * mở tiếp đúng khối, và không có đường dẫn nào trỏ thẳng vào khối đó.
 *
 * Component này là **phần TRÌNH BÀY** của menu đó, không biết gì về xe, quyền hay route: nó
 * nhận nhóm và mục đã dựng sẵn. Nhờ vậy hai khu dùng chung đúng phần nên dùng chung (bố cục,
 * trạng thái đang mở, cách mờ nhóm tắt, hành vi cuộn ngang ở mobile) mà vẫn giữ khác biệt thật
 * của mình: khu tài khoản điều hướng bằng `Link` tới route thật, cổng quản lý bằng nút vì nó
 * phải hỏi "bỏ thay đổi chưa lưu?" trước khi đổi mục.
 *
 * CSS dùng chung luôn `VehicleManageSidebar.module.css` — một bảng style, không có bản thứ hai
 * để trôi khỏi bản đầu.
 */
export function VehicleSectionNav({
  groups,
  activeKey,
  ariaLabel,
  onSelect,
}: {
  groups: readonly VehicleSectionNavGroup[];
  activeKey: string | null;
  ariaLabel: string;
  /** Bắt buộc với mục KHÔNG có `href`. */
  onSelect?: (key: string) => void;
}) {
  return (
    <nav className={styles.nav} aria-label={ariaLabel}>
      <div className={styles.groups}>
        {groups.map((group) => {
          // Nhóm rỗng chỉ hiện khi nó còn mang điều khiển (nhóm dịch vụ chỉ có công tắc).
          if (group.items.length === 0 && !group.control && !group.extra) return null;
          return (
            <section key={group.key} className={styles.group} aria-label={group.label}>
              <div className={styles.groupHead}>
                <h2 className={styles.groupTitle}>{group.label}</h2>
                {group.control}
              </div>
              {group.extra ? <div className={styles.groupExtra}>{group.extra}</div> : null}
              {group.items.length === 0 ? null : (
                <ul className={cx(styles.list, group.dimmed && styles.listOff)}>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = item.key === activeKey;
                    const className = cx(styles.item, isActive && styles.active);
                    /*
                     * Icon phải TRANG TRÍ thuần tuý — `@ant-design/icons` tự render `role="img"`
                     * kèm `aria-label` là TÊN icon ("picture", "car"), và tên đó lọt vào
                     * accessible name của nút: `getByRole('button', { name: 'Hình ảnh & tiện ích' })`
                     * không còn khớp vì tên thật là "picture Hình ảnh & tiện ích".
                     *
                     * Đây là lần thứ BA repo mắc đúng lỗi này (D15.10 ở `RowActions`, D16.1 ở
                     * `MobileNav`) — và là lý do `decorativeIcon` tồn tại ở `lib/`.
                     */
                    const body = (
                      <>
                        {decorativeIcon(<Icon className={styles.icon} />)}
                        <span className={styles.label}>{item.label}</span>
                      </>
                    );

                    return (
                      <li key={item.key}>
                        {item.href ? (
                          <Link
                            href={item.href}
                            className={className}
                            aria-current={isActive ? 'page' : undefined}
                            aria-disabled={group.dimmed || undefined}
                          >
                            {body}
                          </Link>
                        ) : (
                          /*
                           * `type="button"` là bắt buộc: menu này đứng cạnh một `<form>` thật ở
                           * cổng quản lý, và một nút không khai type mặc định là `submit` — bấm
                           * đổi mục sẽ gửi form đang sửa dở.
                           */
                          <button
                            type="button"
                            className={className}
                            aria-current={isActive ? 'page' : undefined}
                            onClick={() => onSelect?.(item.key)}
                          >
                            {body}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </nav>
  );
}
