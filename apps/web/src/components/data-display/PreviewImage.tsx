'use client';

import { Image } from 'antd';

import { cx } from '@/lib/cx';

import styles from './PreviewImage.module.css';

/**
 * Ảnh NỘI DUNG: bấm vào là phóng to toàn màn hình (zoom / xoay / lật / đếm x-y — AntD Image
 * preview, đã ăn locale tiếng Việt của ConfigProvider).
 *
 * Dùng cho ảnh mà cú bấm KHÔNG mang nghĩa điều hướng: ảnh xe trong chi tiết đơn/chuyến,
 * gallery listing, ảnh chat, chứng từ bàn giao, xem trước trong form… Card xe hay ô
 * bấm-vào-là-đi-trang-chi-tiết KHÔNG dùng component này — ở đó cú bấm đã có nghĩa khác.
 *
 * `className` của `<img>` cũ đi vào semantic `classNames.root` — tức chỉ cái vỏ `.ant-image`,
 * KHÔNG phải `rootClassName` (AntD dán `rootClassName` lên cả root của trình xem toàn màn
 * hình). `<img>` bên trong nhận lại nguyên hình học của vỏ qua `PreviewImage.module.css`,
 * nên đổi `<img>` → `PreviewImage` vẫn là thay thế 1-1, không phải sửa CSS từng nơi.
 */
export function PreviewImage({
  src,
  alt = '',
  className,
  loading,
  draggable,
}: {
  src: string;
  alt?: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  /** `false` để chặn kéo-thả ảnh gốc của trình duyệt khi ảnh nằm trong vùng sắp xếp dnd-kit. */
  draggable?: boolean;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      loading={loading}
      draggable={draggable}
      classNames={{ root: cx(styles.root, className) }}
    />
  );
}

/**
 * Nhóm nhiều ảnh vào chung MỘT trình xem (mũi tên chuyển, đếm `x / y`) — gallery của listing,
 * thư viện ảnh xe, chùm ảnh duyệt. Chỉ là context provider, không sinh thêm DOM.
 */
export const PreviewImageGroup = Image.PreviewGroup;
