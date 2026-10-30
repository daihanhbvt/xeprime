import { useTranslations } from 'use-intl';
import { YStack } from 'tamagui';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { InsuranceCoverageList } from '@/features/insurance/components/InsuranceCoverageList';
import { useBookingInsuranceCoverage } from '@/features/insurance/hooks';
import { space } from '@/theme/tokens';

/**
 * Bảo hiểm của một đơn theo từng sản phẩm khách đã trả — phía gian hàng/chủ xe, CHỈ ĐỌC (ADR 0064).
 * Bản native của `BookingInsuranceCertificatesPanel` web.
 *
 * Gọi ngay khi đơn tồn tại, không chờ bàn giao: chủ xe cần biết TRƯỚC lúc giao xe rằng khách đã
 * mua bảo hiểm (chờ phát hành), và sau đó biết GCN đã cấp hay đang lỗi. Không mua ⇒ không vẽ gì.
 */
export function BookingInsurancePanel({ bookingId }: { bookingId: string }) {
  const t = useTranslations('Insurance');
  const tCommon = useTranslations('Common');
  const { data, isError, refetch, isFetching } = useBookingInsuranceCoverage(bookingId, true);

  if (isError && !data) {
    return (
      <Callout tone="warning" title={t('coverage.loadError')}>
        <YStack ai="flex-start" pt={space.xs}>
          <Button
            label={tCommon('actions.retry')}
            size="sm"
            variant="secondary"
            block={false}
            loading={isFetching}
            onPress={() => void refetch()}
          />
        </YStack>
      </Callout>
    );
  }
  if (!data || data.length === 0) return null;
  return (
    <Card>
      <InsuranceCoverageList coverage={data} />
    </Card>
  );
}
