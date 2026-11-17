import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { RECEIPT_SOURCE } from '@xeprime/types';
import { Callout } from '@/components/ui/Callout';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, space } from '@/theme/tokens';
import { useReceipts } from '../hooks/use-finance';
import { ReceiptCard } from './ReceiptCard';

/** Web `BookingReceiptList`: xem trước tối đa 20 khoản. */
const PREVIEW_LIMIT = 20;

/**
 * Các khoản ở sổ Thu-Chi gắn với MỘT đơn - bản native của web `BookingReceiptList` (trong hộp
 * "Lịch sử thu tiền"). Bỏ phiếu sinh từ lần thu tiền (`source = payment`) vì danh sách thu tiền
 * ngay phía trên đã kể chúng; không còn khoản nào thì khối vắng hẳn.
 */
export function BookingReceiptList({ bookingId }: { bookingId: string }) {
  const colors = useColors();
  const t = useTranslations('Finance.receipts');
  const query = useReceipts({ bookingId, limit: PREVIEW_LIMIT });
  const items = (query.data?.items ?? []).filter((r) => r.source !== RECEIPT_SOURCE.PAYMENT);

  if (query.isPending) return <SkeletonText lines={2} />;
  if (query.isError) return <Callout tone="warning" title={t('booking.error')} />;
  if (items.length === 0) return null;

  return (
    <YStack gap={space.sm}>
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {t('booking.title')}
      </Text>
      {items.map((receipt) => (
        <ReceiptCard key={receipt.id} receipt={receipt} />
      ))}
    </YStack>
  );
}
