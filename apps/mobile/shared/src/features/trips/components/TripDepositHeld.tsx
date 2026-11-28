import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { isZeroMoney } from '@xeprime/domain';
import { DEPOSIT_STATUS, type DepositStatus } from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';
import type { CustomerTripFinance } from '../api';

/**
 * Cọc khách ĐÃ giao cho chủ xe - native port của web `TripDepositHeld`: số cọc tiền chủ xe ghi
 * nhận (ròng, đã trừ phần trả lại trước quyết toán) + từng món tài sản thế chấp đang giữ / đã trả.
 *
 * `withCash = false` khi thẻ chứa nó đã có dòng "Đã nhận cọc" riêng (thẻ tiền chuyến đang chạy).
 */
export function TripDepositHeld({
  finance,
  withCash = true,
}: {
  finance: CustomerTripFinance;
  withCash?: boolean;
}) {
  const t = useTranslations('Trips.depositHeld');
  const fmt = useAppFormat();
  const dl = useDomainLabel();
  const colors = useColors();
  const assets = finance.collaterals ?? [];
  const status = finance.depositStatus as DepositStatus;
  const showCash = withCash && status !== DEPOSIT_STATUS.NONE;
  if (!showCash && assets.length === 0) return null;

  return (
    <YStack gap={space.sm} accessibilityLabel={t('aria')}>
      {showCash ? (
        <XStack ai="flex-start" jc="space-between" gap={space.md}>
          <Text col={colors.textMuted} fos={fontSize.bodySm} flexShrink={0}>
            {t('cash')}
          </Text>
          <XStack f={1} flexWrap="wrap" jc="flex-end" ai="center" gap={space.xs}>
            <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
              {isZeroMoney(finance.depositReceived)
                ? t('cashNone')
                : fmt.money(finance.depositReceived)}
            </Text>
          </XStack>
        </XStack>
      ) : null}
      {assets.length > 0 ? (
        <XStack ai="flex-start" jc="space-between" gap={space.md}>
          <Text col={colors.textMuted} fos={fontSize.bodySm} flexShrink={0}>
            {t('assets')}
          </Text>
          <YStack f={1} ai="flex-end" gap={2}>
            {assets.map((asset, index) => (
              <Text
                key={`${asset.collateralType}-${index}`}
                col={colors.text}
                fos={fontSize.bodySm}
                ta="right"
              >
                {t(asset.returnedAt ? 'assetReturned' : 'assetHeld', {
                  type: dl('bookingCollateralType', asset.collateralType),
                })}
              </Text>
            ))}
          </YStack>
        </XStack>
      ) : null}
    </YStack>
  );
}
