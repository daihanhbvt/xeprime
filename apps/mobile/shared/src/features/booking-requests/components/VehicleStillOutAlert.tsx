import { Text } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Callout } from '@/components/ui/Callout';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useNow } from '@/hooks/use-now';
import { useAppFormat } from '@/i18n/use-app-format';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight } from '@/theme/tokens';
import type { BookingRequestItem } from '../api';

const MS_PER_MINUTE = 60_000;

/**
 * Cảnh báo trong tấm DUYỆT — bản native của web `VehicleStillOutAlert` (PR #278): chiếc xe của yêu
 * cầu còn ở ngoài với một chuyến đã quá giờ trả (`vehicleStillOut`, server tính lúc đọc chi tiết).
 * Lời nhắc cho người duyệt, không phải cổng chặn — "Đặt ngay" đã tự dừng với xe này.
 */
export function VehicleStillOutAlert({
  stillOut,
}: {
  stillOut: BookingRequestItem['vehicleStillOut'] | null | undefined;
}) {
  const colors = useColors();
  const t = useTranslations('BookingRequests.approve.stillOut');
  const fmt = useAppFormat();
  const now = useNow();
  const navigateOnce = useNavigateOnce();
  if (!stillOut) return null;

  const overdueMinutes = Math.max(
    1,
    Math.round((now - new Date(stillOut.returnAt).getTime()) / MS_PER_MINUTE),
  );
  return (
    <Callout
      tone="warning"
      title={t('title', { code: stillOut.bookingCode, duration: fmt.roughDuration(overdueMinutes) })}
    >
      {t('body')}{' '}
      <Text
        col={colors.primaryActive}
        fos={fontSize.bodySm}
        fow={fontWeight.semibold}
        accessibilityRole="link"
        onPress={() => navigateOnce(ROUTES.manage.bookingDetail(stillOut.bookingId))}
      >
        {t('open')}
      </Text>
    </Callout>
  );
}
