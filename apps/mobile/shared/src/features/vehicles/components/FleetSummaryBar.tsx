import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Skeleton } from '@/components/ui/Skeleton';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import { useFleetSummary } from '../hooks/use-vehicles';

/**
 * Dải chỉ số đầu danh sách xe — tổng · sẵn sàng · đang thuê.
 *
 * Con số nói về CẢ đội xe (backend đếm bằng `groupBy`), KHÔNG phụ thuộc trang hay bộ lọc hiện
 * tại. Ba ô, đúng ba ô web chọn: ô thứ ba là "Đang thuê" chứ không phải "Cảnh báo".
 *
 * Hỏng thì tự ẩn: dải chỉ số là phụ trợ, không được chặn danh sách phía dưới.
 */
export function FleetSummaryBar({ enabled }: { enabled: boolean }) {
  const t = useTranslations('Vehicles.list.summary');
  const { data, isLoading, isError } = useFleetSummary(enabled);

  if (!enabled || isError) return null;

  if (isLoading) {
    return (
      <XStack px={layout.screenX} pb={space.sm}>
        <Skeleton width="100%" height={40} />
      </XStack>
    );
  }

  if (!data) return null;

  return (
    <XStack
      mx={layout.screenX}
      mb={space.sm}
      px={space.sm}
      py={space.xs}
      br={radius.md}
      bg={colors.surfaceMuted}
      accessibilityLabel={t('ariaLabel')}
    >
      <Item label={t('total')} value={t('vehicleCount', { count: data.total })} />
      <Divider />
      <Item
        label={t('available')}
        value={t('vehicleCount', { count: data.available })}
        tone={colors.success}
      />
      <Divider />
      <Item
        label={t('renting')}
        value={t('vehicleCount', { count: data.renting })}
        tone={colors.info}
      />
    </XStack>
  );
}

function Item({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <YStack f={1} ai="center" gap={1}>
      <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
        {label}
      </Text>
      <Text
        col={tone ?? colors.text}
        fos={fontSize.bodySm}
        fow={fontWeight.semibold}
        numberOfLines={1}
      >
        {value}
      </Text>
    </YStack>
  );
}

function Divider() {
  return <YStack w={1} bg={colors.borderSubtle} my={2} />;
}
