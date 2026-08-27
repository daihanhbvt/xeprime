'use client';

import { CarOutlined, ShopOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar } from 'antd';
import type { ReactNode } from 'react';

import { initialOf } from '@/lib/initials';

import styles from './EntityIdentity.module.css';

/**
 * Ba loại thực thể ĐANG được hiển thị dạng "ảnh + tên + phụ đề" trong repo (đo ở Batch 1C-A):
 * người (thành viên, nhân sự, khách hàng), xe, và gian hàng. Không thêm loại nào chưa có nơi dùng.
 */
export type EntityKind = 'person' | 'vehicle' | 'shop';

export type EntitySize = 'sm' | 'md' | 'lg';

interface EntityIdentityProps {
  /** Nhãn chính — tên xe, tên người, tên gian hàng. */
  name: ReactNode;
  /** Nhãn phụ — mã xe · biển số, email, mã gian hàng · tỉnh… */
  subtitle?: ReactNode;
  kind?: EntityKind;
  imageUrl?: string | null;
  size?: EntitySize;
  /**
   * Chuỗi dùng để sinh chữ cái đầu. Chỉ cần truyền khi `name` không phải string thuần
   * (ví dụ đã bọc `<Highlight>`), vì lúc đó không rút được chữ cái từ nó.
   */
  initialSource?: string;
}

/** Tròn cho người, vuông cho vật/tổ chức — theo đúng cách 7 nơi hiện tại đang dựng. */
const SHAPE: Record<EntityKind, 'circle' | 'square'> = {
  person: 'circle',
  vehicle: 'square',
  shop: 'square',
};

const FALLBACK_ICON: Record<EntityKind, ReactNode> = {
  person: <UserOutlined />,
  vehicle: <CarOutlined />,
  shop: <ShopOutlined />,
};

/**
 * Ba bậc ánh xạ từ 6 cỡ rời rạc đang dùng (24/32/34/40/44/72) về thang của Figma
 * `XePrime/Avatar` `125:1643`. `md` = 44 vì đó là cỡ của ô định danh trong bảng — bề mặt đông
 * consumer nhất.
 */
const AVATAR_SIZE: Record<EntitySize, number> = {
  sm: 32,
  md: 44,
  lg: 72,
};

/**
 * Khối định danh dùng chung: ảnh (hoặc chữ cái đầu, hoặc icon) + tên + phụ đề.
 *
 * Component KHÔNG biết gì về API, quyền hay trạng thái nghiệp vụ — chỉ nhận dữ liệu đã sẵn sàng
 * hiển thị. Status vẫn do `StatusTag` lo, ở cột riêng.
 *
 * A11y: avatar chữ-cái/icon được `aria-hidden` vì tên đã nằm ngay cạnh dưới dạng text — đọc lại
 * chữ "H" trước "Honda SH 150i" chỉ gây nhiễu. Avatar có ảnh thật thì nhận `alt` rỗng vì cùng lý
 * do: nó minh hoạ cho tên bên cạnh, không mang thông tin mới.
 */
export function EntityIdentity({
  name,
  subtitle,
  kind = 'person',
  imageUrl,
  size = 'md',
  initialSource,
}: EntityIdentityProps) {
  const source = initialSource ?? (typeof name === 'string' ? name : undefined);

  return (
    <div className={styles.root}>
      <Avatar
        className={styles.avatar}
        shape={SHAPE[kind]}
        size={AVATAR_SIZE[size]}
        src={imageUrl || undefined}
        alt={imageUrl ? '' : undefined}
        icon={imageUrl || source ? undefined : FALLBACK_ICON[kind]}
        aria-hidden={imageUrl ? undefined : true}
      >
        {!imageUrl && source ? initialOf(source) : null}
      </Avatar>
      <div className={styles.text}>
        <div className={styles.name}>{name}</div>
        {subtitle ? <div className={styles.subtitle}>{subtitle}</div> : null}
      </div>
    </div>
  );
}
