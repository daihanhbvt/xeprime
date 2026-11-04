'use client';

import { UserOutlined } from '@ant-design/icons';
import { Avatar } from 'antd';
import type { ReactNode } from 'react';
import styles from './CustomerIdentity.module.css';

/**
 * Khách trên thẻ đơn/yêu cầu site partner — Figma Partner-XePrime "Seller Information": ảnh tròn
 * 48, tên 16/500, SĐT 14/400 xám (02/11/2026).
 *
 * Không dùng `EntityIdentity` chung vì cỡ ảnh và cỡ chữ của nó là bậc của bảng dữ liệu (44px,
 * tên 14/600); thẻ đơn của design mới to hơn một bậc. Tên/SĐT là `ReactNode` để nơi gọi tự quyết
 * có bọc link (hồ sơ khách, `tel:`) hay không — quyền là việc của nơi gọi.
 */
export function CustomerIdentity({
  name,
  nameSource,
  phone,
  avatarUrl,
  badge,
}: {
  name: ReactNode;
  /** Viên xanh cạnh tên — "Khách quen" (≥ 1 chuyến hoàn thành ở gian hàng, 02/11/2026). */
  badge?: string;
  /** Chuỗi để lấy chữ cái đầu khi `name` đã bọc link. */
  nameSource: string;
  phone?: ReactNode;
  avatarUrl: string | null | undefined;
}) {
  const initial = nameSource.trim().split(/\s+/).pop()?.charAt(0).toUpperCase() ?? '';
  return (
    <div className={styles.root}>
      <Avatar
        className={styles.avatar}
        size={48}
        src={avatarUrl || undefined}
        alt={avatarUrl ? '' : undefined}
        icon={avatarUrl || initial ? undefined : <UserOutlined />}
        aria-hidden={avatarUrl ? undefined : true}
      >
        {!avatarUrl && initial ? initial : null}
      </Avatar>
      <div className={styles.text}>
        <div className={styles.nameRow}>
          <span className={styles.name}>{name}</span>
          {badge ? <span className={styles.badge}>{badge}</span> : null}
        </div>
        {phone ? <div className={styles.phone}>{phone}</div> : null}
      </div>
    </div>
  );
}
