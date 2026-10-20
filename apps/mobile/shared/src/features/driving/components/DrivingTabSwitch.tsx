import { XStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Chip } from '@/components/ui/Chip';
import { CountBadge } from '@/components/ui/CountBadge';
import { TRIPS_TAB, type TripsTab } from '@/navigation/routes-base';
import { layout } from '@/theme/layout';
import { space } from '@/theme/tokens';
import { useDriverPendingCounts } from '../hooks';

/**
 * Bộ chuyển "Chuyến tôi thuê / Chuyến tôi lái" trên đầu tab Chuyến (ADR 0063) — bản native của
 * `DrivingTabSwitch` bên web.
 *
 * Chỉ hiện với tài khoản đã từng có liên kết tài xế (kể cả lời mời — cờ `hasLinks` của server) —
 * phần lớn khách không bao giờ lái cho ai, và một tab luôn trống là nhiễu. Đang ở tab lái thì luôn hiện,
 * để còn đường quay lại.
 */
export function DrivingTabSwitch({
  value,
  onChange,
}: {
  value: TripsTab;
  onChange: (next: TripsTab) => void;
}) {
  const t = useTranslations('Driving.nav');
  const counts = useDriverPendingCounts();
  const pendingTrips = counts.data?.trips ?? 0;
  const driving = value === TRIPS_TAB.DRIVING;

  if (!driving && !counts.data?.hasLinks) return null;

  return (
    <XStack
      px={layout.screenX}
      pt={space.sm}
      gap={space.xs}
      ai="center"
      accessibilityRole="tablist"
      accessibilityLabel={t('label')}
    >
      <Chip
        label={t('renting')}
        selected={!driving}
        size="sm"
        variant="segmented"
        grow
        onPress={() => onChange(TRIPS_TAB.RENTING)}
      />
      <Chip
        label={t('driving')}
        selected={driving}
        size="sm"
        variant="segmented"
        grow
        onPress={() => onChange(TRIPS_TAB.DRIVING)}
        {...(pendingTrips > 0
          ? { leading: <CountBadge count={pendingTrips} tone="danger" size="sm" /> }
          : {})}
      />
    </XStack>
  );
}
