'use client';

import { Button } from 'antd';
import { useState } from 'react';
import type { PublicListingDetail } from '@/features/marketplace/types';
import { RequestBookingModal } from './RequestBookingModal';

/** Nhãn CTA vào luồng thuê. Cố ý KHÁC tên nghiệp vụ — xem docblock bên dưới. */
const CTA_LABEL = 'Chọn thuê';

/**
 * CTA vào luồng thuê + modal — client island nhúng vào trang chi tiết xe (Server Component).
 *
 * **Ranh giới thuật ngữ (Wave 11.1).** Nút này nói `Chọn thuê`, không phải `Yêu cầu thuê`: ở
 * bước này khách mới chọn chiếc xe muốn thuê, chưa gửi gì cả. Đặt tên hành động theo kết quả
 * cuối làm khách tưởng bấm là đã gửi yêu cầu. Còn `Yêu cầu thuê` vẫn là TÊN NGHIỆP VỤ của thực
 * thể — tiêu đề modal `Yêu cầu thuê xe` và nút chốt `Gửi yêu cầu thuê` giữ nguyên, vì đó mới là
 * lúc khách thật sự gửi đi.
 *
 * Chỉ trang CHI TIẾT xe mới có CTA này. Thẻ xe ở marketplace không mở luồng thuê: quyết định
 * thuê cần giá theo ngày, chính sách cọc và điều kiện giao nhận — những thứ chỉ có ở trang chi
 * tiết.
 *
 * `listing` truyền xuống khi nơi gọi ĐÃ có hồ sơ xe đầy đủ, để modal khỏi tải lại.
 */
export function RequestBookingButton({
  vehicleId,
  vehicleName,
  vehicleImageUrl,
  listing,
  pickupAt,
  returnAt,
  block,
  size,
  className,
}: {
  vehicleId: string;
  vehicleName: string;
  vehicleImageUrl?: string | null;
  listing?: PublicListingDetail | null;
  pickupAt?: string | null;
  returnAt?: string | null;
  block?: boolean;
  size?: 'small' | 'middle' | 'large';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="primary"
        block={block}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
      >
        {CTA_LABEL}
      </Button>
      <RequestBookingModal
        vehicleId={vehicleId}
        vehicleName={vehicleName}
        vehicleImageUrl={vehicleImageUrl}
        listing={listing}
        pickupAt={pickupAt}
        returnAt={returnAt}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
