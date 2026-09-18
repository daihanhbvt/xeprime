import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView } from 'react-native';
import { XStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  PERMISSION,
  VEHICLE_SERVICE_SETTING_SERVICES,
  type ServiceType,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Chip } from '@/components/ui/Chip';
import { SkeletonText } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useVehicle } from '@/features/vehicles/hooks/use-vehicle';
import { useDomainLabel } from '@/i18n/domain';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { colors, space } from '@/theme/tokens';
import { AutoAcceptBody } from './VehicleAutoAcceptScreen';

/**
 * TỐI ƯU NHẬN CHUYẾN cho xe của GIAN HÀNG — bản native của
 * `app/(manage)/manage/vehicles/[id]/optimization/page.tsx`.
 *
 * Vì sao màn này tồn tại bên cạnh `VehicleAutoAcceptScreen`: thiết lập tự động nhận chuyến chỉ có
 * lối vào ở khu TÀI KHOẢN (mục lục quản lý xe của chủ xe tuyến hoa hồng). Gian hàng quản xe ở
 * `/manage/vehicles`, và ở đó chỉ có sửa hồ sơ + giá — nghĩa là **không có đường nào bật "Đặt
 * ngay" cho xe gian hàng**, dù server vẫn đọc đúng cờ đó cho cả hai tuyến. Hậu quả: mọi chuyến
 * của gian hàng dừng ở "chờ chủ xe duyệt" kể cả khi họ muốn nhận tự động.
 *
 * Dùng lại `AutoAcceptBody` chứ không vẽ lại form: cùng một thiết lập, cùng một endpoint
 * (`/vehicles/{id}/service-settings`), nên hai bề mặt không thể trôi khỏi nhau.
 *
 * MỘT màn, nhiều TAB theo dịch vụ — khác khu tài khoản (mỗi dịch vụ một route). Xe gian hàng
 * thường phục vụ nhiều dịch vụ cùng lúc, và bắt người trực đi hai màn để bật cùng một công tắc
 * cho một chiếc xe là một bước thừa.
 */
export function VehicleOptimizationScreen({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations('Vehicles.optimization');
  const domainLabel = useDomainLabel();
  const router = useRouter();
  const { has, isLoading: permissionsLoading } = usePermissions();
  const canView = has(PERMISSION.VEHICLE_VIEW);

  const back = () => goBackOr(router, ROUTES.manage.vehicleDetail(vehicleId));
  const vehicle = useVehicle(vehicleId, canView);

  /**
   * Tab đang mở — `null` = "chưa chọn", nghĩa là lấy dịch vụ đầu tiên của xe.
   *
   * Không khởi tạo bằng `services[0]`: hồ sơ xe về sau lần render đầu, nên lúc đó danh sách còn
   * rỗng và tab sẽ chốt vào `undefined` rồi không bao giờ tự sửa.
   */
  const [tab, setTab] = useState<ServiceType | null>(null);

  if (!permissionsLoading && !canView) {
    return (
      <>
        <AppHeader title={t('title')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={t('forbidden.title')}
            description={t('forbidden.description')}
          />
        </Screen>
      </>
    );
  }

  if (vehicle.isPending) {
    return (
      <>
        <AppHeader title={t('title')} subtitle={t('subtitle')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']}>
          <SkeletonText lines={10} />
        </Screen>
      </>
    );
  }

  if (vehicle.isError || !vehicle.data) {
    return (
      <>
        <AppHeader title={t('title')} subtitle={t('subtitle')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenError
            error={vehicle.error}
            title={t('loadError.title')}
            onRetry={() => void vehicle.refetch()}
          />
        </Screen>
      </>
    );
  }

  const data = vehicle.data;
  const subtitle = [data.name, data.plateNumber].filter(Boolean).join(LIST_SEPARATOR);

  /*
   * Chỉ những dịch vụ mà CHIẾC XE NÀY phục vụ VÀ có thiết lập riêng. Thuê dài hạn cố ý không có
   * (`VEHICLE_SERVICE_SETTING_SERVICES`): gian hàng luôn chốt lịch tay (ADR 0011), nên một tab
   * "dài hạn" ở đây chỉ là một công tắc không bao giờ có tác dụng.
   */
  const services = VEHICLE_SERVICE_SETTING_SERVICES.filter((service) =>
    data.serviceTypes.includes(service),
  );

  if (services.length === 0) {
    return (
      <>
        <AppHeader title={t('title')} subtitle={subtitle} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="options-outline"
            title={t('noService.title')}
            description={t('noService.description')}
            actionLabel={t('noService.action')}
            onAction={() => router.push(ROUTES.manage.vehicleEdit(vehicleId))}
          />
        </Screen>
      </>
    );
  }

  const active = (tab && services.includes(tab) ? tab : services[0]) as ServiceType;

  return (
    <>
      <AppHeader title={t('title')} subtitle={subtitle} onBack={back} />
      {/*
        Xe chỉ phục vụ MỘT dịch vụ thì không bày dải tab: một tab đơn độc là một lựa chọn giả, và
        nó ăn mất một hàng màn hình mà không nói thêm điều gì.
      */}
      {services.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ backgroundColor: colors.surface, flexGrow: 0 }}
          contentContainerStyle={{
            paddingHorizontal: space.md,
            paddingVertical: space.sm,
            gap: space.xs,
          }}
        >
          <XStack gap={space.xs} accessibilityRole="tablist">
            {services.map((service) => (
              <Chip
                key={service}
                label={domainLabel('serviceType', service)}
                selected={service === active}
                onPress={() => setTab(service as ServiceType)}
              />
            ))}
          </XStack>
        </ScrollView>
      ) : null}

      <Screen edges={['left', 'right', 'bottom']}>
        {/*
          `key` theo dịch vụ: form bên trong giữ bản nháp của chính nó, nên đổi tab phải dựng lại
          từ đầu — không thì công tắc của "tự lái" còn nằm nguyên khi người dùng đã sang "có tài xế".
        */}
        <AutoAcceptBody
          key={active}
          vehicleId={vehicleId}
          serviceType={active}
          canEdit={has(PERMISSION.VEHICLE_UPDATE)}
        />
      </Screen>
    </>
  );
}
