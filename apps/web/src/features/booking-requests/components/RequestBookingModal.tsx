'use client';

import { Drawer, Modal } from 'antd';
import { useIsMobile } from '@/hooks/use-media-query';
import { RequestBookingFlow } from './RequestBookingFlow';

interface RequestBookingModalProps {
  vehicleId: string;
  vehicleName: string;
  vehicleImageUrl?: string | null;
  pricePerDay?: string | null;
  pickupAt?: string | null;
  returnAt?: string | null;
  open: boolean;
  onClose: () => void;
}

const TITLE = 'Yêu cầu thuê xe';

/**
 * Vỏ đựng luồng đặt xe theo thiết bị: bottom-sheet (mobile) / modal (desktop) — cùng một
 * `RequestBookingFlow` bên trong. Dùng padding + cuộn mặc định của AntD (không tự chế flex
 * fill/sticky footer — vốn vỡ layout trong Modal). Chỉ render flow khi mở để state mới mỗi lần.
 */
export function RequestBookingModal({
  vehicleId,
  vehicleName,
  vehicleImageUrl,
  pricePerDay,
  pickupAt,
  returnAt,
  open,
  onClose,
}: RequestBookingModalProps) {
  const isMobile = useIsMobile();

  const flow = open ? (
    <RequestBookingFlow
      vehicleId={vehicleId}
      vehicleName={vehicleName}
      vehicleImageUrl={vehicleImageUrl}
      pricePerDay={pricePerDay}
      pickupAt={pickupAt}
      returnAt={returnAt}
      onClose={onClose}
    />
  ) : null;

  if (isMobile) {
    return (
      <Drawer title={TITLE} placement="bottom" size="88dvh" open={open} onClose={onClose}>
        {flow}
      </Drawer>
    );
  }

  return (
    <Modal title={TITLE} open={open} onCancel={onClose} footer={null} width={460}>
      {flow}
    </Modal>
  );
}
