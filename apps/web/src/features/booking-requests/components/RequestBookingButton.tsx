'use client';

import { Button } from 'antd';
import { useState } from 'react';
import type { PublicListingDetail } from '@/features/marketplace/types';
import { RequestBookingModal } from './RequestBookingModal';

/**
 * Nút "Yêu cầu thuê" + modal — client island để nhúng vào cả trang public (Server Component)
 * lẫn thẻ xe. Modal chỉ tạo YÊU CẦU, shop sẽ duyệt và tạo đơn.
 *
 * `listing` truyền xuống khi nơi gọi ĐÃ có hồ sơ xe đầy đủ (trang chi tiết). Thẻ xe chỉ có dữ
 * liệu tóm tắt nên bỏ trống, và modal tự tải phần còn thiếu.
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
        Yêu cầu thuê
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
