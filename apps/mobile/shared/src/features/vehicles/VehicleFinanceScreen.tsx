import { useCallback } from 'react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';
import { Screen } from '@/components/layout/Screen';
import { SkeletonText } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { ManagePageHeader } from '@/features/shell/ManagePageHeader';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { queryKeys } from '@/queries/query-keys';
import { useVehicleCapabilities } from './hooks/use-vehicle-capabilities';
import { useVehicle } from './hooks/use-vehicle';
import { VehicleFinanceView } from './VehicleFinanceView';

/**
 * Màn "Tài chính xe" (người dùng chốt 27/11/2026: màn riêng mở từ chi tiết xe) - khung của
 * `VehicleFinanceView`, bản native của tab Tài chính trong hồ sơ xe web (#344/#345). Gác `can.money`
 * (quyền `finance.view` ∧ cờ gói `finance`) như tab web; server gác `@RequiresFeature`.
 */
export function VehicleFinanceScreen({
  vehicleId,
  showCapital,
}: {
  vehicleId: string;
  /** Thẻ "Nghĩa vụ nguồn xe" - tuyến gói (web `isManage`); chủ xe tuyến hoa hồng không có. */
  showCapital: boolean;
}) {
  const t = useTranslations('Finance.vehicle');
  const tEntity = useTranslations('Finance.entity');
  const tForbidden = useTranslations('Finance.overview.forbidden');
  const router = useRouter();
  const queryClient = useQueryClient();
  const can = useVehicleCapabilities();
  const vehicle = useVehicle(vehicleId, can.money);
  const back = () => goBackOr(router, ROUTES.manage.vehicleDetail(vehicleId));

  // Kéo để làm mới: mọi số tiền (nhánh `finance`) + hồ sơ xe / nguồn xe (nhánh `vehicles`).
  const fetching = useIsFetching({ queryKey: queryKeys.finance.all }) > 0;
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.finance.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.source(vehicleId) });
    void vehicle.refetch();
  }, [queryClient, vehicleId, vehicle]);

  const title = t('title');
  const header = (
    <ManagePageHeader
      title={title}
      onBack={back}
      {...(vehicle.data ? { subtitle: vehicle.data.name } : {})}
    />
  );

  if (!can.money) {
    return (
      <>
        {header}
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage icon="lock-closed-outline" title={tForbidden('title')} description={tForbidden('description')} />
        </Screen>
      </>
    );
  }

  return (
    <>
      {header}
      <Screen edges={['left', 'right', 'bottom']} refreshing={fetching} onRefresh={refresh}>
        {vehicle.isPending ? (
          <SkeletonText lines={10} />
        ) : vehicle.isError ? (
          <ScreenError error={vehicle.error} title={tEntity('error')} onRetry={() => void vehicle.refetch()} />
        ) : (
          <VehicleFinanceView vehicle={vehicle.data} showCapital={showCapital} />
        )}
      </Screen>
    </>
  );
}
