import { useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';
import { Screen } from '@/components/layout/Screen';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { RequireSession } from '@/features/auth/RequireSession';
import { ROUTES } from '@/navigation/routes';

/**
 * Tab "Chuyến" — trạng thái rỗng.
 *
 * Danh sách chuyến của khách (BKG-15) là task riêng; ở đây dùng đúng chuỗi rỗng của web và
 * dẫn về Khám phá, y như nút "Tìm xe" trong màn rỗng bên web.
 */
export default function TripsRoute() {
  const t = useTranslations('Trips.list');
  const router = useRouter();

  return (
    <RequireSession>
      <Screen scroll={false}>
        <ScreenMessage
          icon="calendar-outline"
          title={t('emptyTitle')}
          description={t('emptyAllBody')}
          actionLabel={t('findVehicle')}
          onAction={() => router.replace(ROUTES.explore.home())}
        />
      </Screen>
    </RequireSession>
  );
}
