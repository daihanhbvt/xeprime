import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { BOOKING_EXTENSION_STATUS } from '@xeprime/types';
import { isZeroMoney } from '@xeprime/domain';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { DataRow } from '@/components/ui/DataRow';
import { BankTransferDetails } from '@/features/payment-gateway/components/BankTransferDetails';
import { useAppFormat } from '@/i18n/use-app-format';
import { space } from '@/theme/tokens';
import { useTripExtensions } from '../hooks/use-trips';
import { CardLead, CardTitle } from './TripRequestCards';

/**
 * GIA HẠN CHUYẾN phía khách (ADR 0077) — bản native của `TripExtensionPanel` web. Chủ xe tạo phụ
 * lục, khách chuyển phần giữ chỗ qua QR, phần còn lại trả thẳng chủ xe. Chỉ hiện phụ lục ĐANG CHỜ
 * (kèm QR) và lần gia hạn gần nhất đã hiệu lực; chuyến chưa từng gia hạn thì khối im lặng.
 */
export function TripExtensionPanel({ tripId }: { tripId: string }) {
  const t = useTranslations('Trips.extension');
  const fmt = useAppFormat();
  const { data } = useTripExtensions(tripId, true);
  if (!data || data.length === 0) return null;

  const pending = data.find((e) => e.status === BOOKING_EXTENSION_STATUS.AWAITING_PAYMENT);
  const lastActive = [...data].reverse().find((e) => e.status === BOOKING_EXTENSION_STATUS.ACTIVE);
  if (!pending && !lastActive) return null;

  return (
    <Card>
      <YStack gap={space.md}>
        <CardTitle>{t('title')}</CardTitle>
        {pending ? (
          <>
            <CardLead>
              {t('pendingLead', { months: pending.months, date: fmt.shortDateTime(pending.toAt) })}
            </CardLead>
            <YStack gap={space.xs}>
              <DataRow label={t('rental')} value={fmt.money(pending.rentalAmount)} />
              <DataRow label={t('online')} value={fmt.money(pending.onlineAmount)} strong />
              {!isZeroMoney(pending.payAtPickupAmount) ? (
                <DataRow label={t('direct')} value={fmt.money(pending.payAtPickupAmount)} />
              ) : null}
            </YStack>
            <BankTransferDetails
              account={pending.paymentInfo}
              amount={pending.remainingAmount}
              code={pending.code}
            />
            {pending.expiresAt ? (
              <Callout
                tone="warning"
                title={t('deadline', { time: fmt.shortDateTime(pending.expiresAt) })}
              />
            ) : null}
          </>
        ) : lastActive ? (
          <Callout
            tone="success"
            title={t('activated', { months: lastActive.months, date: fmt.shortDateTime(lastActive.toAt) })}
          />
        ) : null}
      </YStack>
    </Card>
  );
}
