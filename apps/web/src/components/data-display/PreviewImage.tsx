'use client';

import { Image } from 'antd';

/**
 * Ảnh NỘI DUNG: bấm vào là phóng to toàn màn hình (zoom / xoay / lật / đếm x-y — AntD Image
 * preview, đã ăn locale tiếng Việt của ConfigProvider).
 *
 * Dùng cho ảnh mà cú bấm KHÔNG mang nghĩa điều hướng: ảnh xe trong chi tiết đơn/chuyến,
 * gallery listing, ảnh chat, chứng từ bàn giao, xem trước trong form… Card xe hay ô
 * bấm-vào-là-đi-trang-chi-tiết KHÔNG dùng component này — ở đó cú bấm đã có nghĩa khác.
 *
 * `className` của `<img>` cũ được áp cho CẢ vỏ `.ant-image` lẫn `<img>` bên trong: mọi rule
 * kích thước/tỷ lệ/bo góc cũ giữ nguyên layout (giá trị tuyệt đối trùng nhau; `%` của img
 * tính trên vỏ mang cùng class). Nhờ vậy đổi `<img>` → `PreviewImage` là thay thế 1-1,
 * không phải sửa CSS từng nơi.
 */
export function PreviewImage({
  src,
  alt = '',
  className,
  loading,
}: {
  src: string;
  alt?: string;
  className?: string;
  loading?: 'lazy' | 'eager';
}) {
  return (
    <Image src={src} alt={alt} className={className} rootClassName={className} loading={loading} />
  );
}

/**
 * Nhóm nhiều ảnh vào chung MỘT trình xem (mũi tên chuyển, đếm `x / y`) — gallery của listing,
 * thư viện ảnh xe, chùm ảnh duyệt. Chỉ là context provider, không sinh thêm DOM.
 */
export const PreviewImageGroup = Image.PreviewGroup;
