'use client';

import { Button } from 'antd';
import { useState } from 'react';
import { RequestBookingModal } from './RequestBookingModal';

/**
 * Nút "Yêu cầu thuê" + modal — client island để nhúng vào cả trang public (Server Component)
 * lẫn thẻ xe. Modal chỉ tạo YÊU CẦU, shop sẽ duyệt và tạo đơn.
 */
export function RequestBookingButton({
  vehicleId,
  vehicleName,
  vehicleImageUrl,
  pricePerDay,
  pickupAt,
  returnAt,
  block,
  size,
  className,
}: {
  vehicleId: string;
  vehicleName: string;
  vehicleImageUrl?: string | null;
  pricePerDay?: string | null;
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
        pricePerDay={pricePerDay}
        pickupAt={pickupAt}
        returnAt={returnAt}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
