import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import type { IncludedInsuranceServiceFee } from '@xeprime/domain';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize } from '@/theme/tokens';
import { InfoHint } from './InfoHint';

/**
 * ⓘ tách phí bảo hiểm vật chất xe và phí thu hộ bảo hiểm của XePrime - bản native của web
 * `InsuranceFeeHint`. Khách thấy GỘP hai số ở dòng `IV`; đây là nơi duy nhất tách ra.
 */
export function InsuranceFeeHint({
  fee,
  size,
}: {
  fee: IncludedInsuranceServiceFee;
  size?: number;
}) {
  const colors = useColors();
  const t = useTranslations('Common.components.price.insuranceFee');
  const fmt = useAppFormat();
  const line = (text: string) => (
    <Text col={colors.text} fos={fontSize.bodySm}>
      {text}
    </Text>
  );
  return (
    <InfoHint
      label={t('hintLabel')}
      {...(size === undefined ? {} : { size })}
      content={
        <YStack gap={4}>
          {line(t('premium', { amount: fmt.money(fee.premiumAmount) }))}
          {line(
            fee.serviceFeePercent != null
              ? t('serviceFeePercent', {
                  percent: fee.serviceFeePercent,
                  amount: fmt.money(fee.serviceFeeAmount),
                })
              : t('serviceFee', { amount: fmt.money(fee.serviceFeeAmount) }),
          )}
          {line(t('refund'))}
        </YStack>
      }
    />
  );
}
