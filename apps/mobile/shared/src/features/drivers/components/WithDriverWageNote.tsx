import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { InlineAction } from '@/components/ui/InlineAction';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, space } from '@/theme/tokens';
import { useDriverWageSettings } from '../hooks/use-drivers';

/**
 * Một dòng dưới giá có tài xế của xe (ADR 0075) — bản native của web `WithDriverWageNote`: giá đó
 * là tiền KHÁCH trả, còn tiền công trả tài xế là MỨC CHUNG của bên thuê cho mọi xe — cấu hình một
 * chỗ ở màn Tài xế. Không đọc được (đang tải, thiếu quyền) thì không hiện gì.
 */
export function WithDriverWageNote() {
  const colors = useColors();
  const t = useTranslations('Drivers.wage.note');
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();
  const settings = useDriverWageSettings();
  if (!settings.data) return null;
  const daily = settings.data.dailyWage;

  return (
    <YStack gap={space.xs}>
      <Text col={colors.textMuted} fos={fontSize.label}>
        {daily ? t('set', { amount: fmt.money(daily) }) : t('unset')}
      </Text>
      <InlineAction label={t('link')} onPress={() => navigateOnce(ROUTES.manage.drivers())} />
    </YStack>
  );
}
