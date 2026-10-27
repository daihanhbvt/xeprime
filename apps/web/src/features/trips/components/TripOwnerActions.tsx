'use client';

import { PhoneOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { canShowHostChatOnTrip } from '@xeprime/domain';
import { ChatWithShopButton } from '@/features/chat/components/ChatWithShopButton';
import type { CustomerTripDetail } from '../types';
import styles from './TripOwnerActions.module.css';

/**
 * Lối liên hệ cạnh tên chủ xe trong thẻ "Thông tin chuyến đi" — nút tròn nhắn tin (Figma
 * `19879:73257`) + nút gọi khi có số. Dùng chung cho chuyến đã xác nhận và chuyến đã khép.
 *
 * Mở theo `canContact` (ADR 0028 điều 9 · ADR 0056): server quyết; không mở thì không vẽ gì.
 */
export function TripOwnerActions({ trip }: { trip: CustomerTripDetail }) {
  const t = useTranslations('Trips.confirmed');
  // Nhắn tin: kênh chat trong sàn (mọi chặng, theo tuyến). Gọi điện: SĐT chỉ mở theo `canContact`.
  const canChat = canShowHostChatOnTrip({
    shopKind: trip.shop.shopKind,
    hasBooking: Boolean(trip.code),
  });
  const canCall = trip.canContact && Boolean(trip.shop.phone);
  if (!canChat && !canCall) return null;
  return (
    <>
      {canChat ? (
        <ChatWithShopButton
          vehicleId={trip.vehicle.id}
          appearance="icon"
          className={styles.circleAction}
          label={t('chatOwner')}
        />
      ) : null}
      {canCall && trip.shop.phone ? (
        <a
          href={`tel:${trip.shop.phone}`}
          className={styles.circleAction}
          aria-label={t('callOwner', { phone: trip.shop.phone })}
          title={t('callOwner', { phone: trip.shop.phone })}
        >
          <PhoneOutlined aria-hidden />
        </a>
      ) : null}
    </>
  );
}
