import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  API_ERROR_CODE,
  PERMISSION,
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_PUBLIC_STATUS_META,
  type VehicleOperationStatus,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { getErrorCode } from '@xeprime/api-client';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { Card } from '@/components/ui/Card';
import { Callout } from '@/components/ui/Callout';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { ToggleRow } from '@/features/rental-policies/components/PolicySections';
import { useVehicle, useVehicleSummary } from '@/features/vehicles/hooks/use-vehicle';
import type { VehicleDetail } from '@/features/vehicles/api';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_MANAGE_NAV } from '@/navigation/vehicle-manage-section';
import { colors, fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
import { useServiceToggle } from './hooks/use-service-toggle';

const COVER_WIDTH = 88;
const COVER_HEIGHT = 64;

/**
 * MỤC LỤC của không gian "Quản lý xe" — bản native của menu trái `VehicleManageSidebar`.
 *
 * Web có một cột 13 mục luôn hiện bên trái mọi trang con; ở 390px cột đó không tồn tại, nên nó
 * trở thành MÀN ĐẦU của không gian: cùng ba nhóm, cùng thứ tự, cùng nhãn, cùng hai công tắc dịch
 * vụ trên tiêu đề nhóm. Khác biệt là ĐIỀU HƯỚNG, không phải nghiệp vụ.
 *
 * Mục của một dịch vụ ĐANG TẮT vẫn hiện nhưng mờ đi và nói rõ lý do — giấu chúng thì người dùng
 * không còn cách nào biết rằng bật dịch vụ lên sẽ có thêm gì, đúng như sidebar bên web.
 */
export function VehicleManageHubScreen({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations('VehicleManage');
  const router = useRouter();
  const { has } = usePermissions();
  const canView = has(PERMISSION.VEHICLE_VIEW);
  const canEdit = has(PERMISSION.VEHICLE_UPDATE);
  const query = useVehicle(vehicleId, canView);

  const back = () => goBackOr(router, ROUTES.account.vehicles());
  const header = <AppHeader onBack={back} title={t('title')} />;

  if (!canView) {
    return (
      <>
        {header}
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={t('forbiddenTitle')}
            description={t('forbiddenBody')}
            actionLabel={t('backToList')}
            onAction={() => router.replace(ROUTES.account.vehicles())}
          />
        </Screen>
      </>
    );
  }

  if (query.isLoading) {
    return (
      <>
        {header}
        <Screen edges={['left', 'right', 'bottom']}>
          <MiniRowsSkeleton rows={8} />
        </Screen>
      </>
    );
  }

  if (query.isError || !query.data) {
    const notFound = getErrorCode(query.error) === API_ERROR_CODE.NOT_FOUND;
    return (
      <>
        {header}
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="alert-circle-outline"
            title={notFound ? t('notFoundTitle') : t('loadErrorTitle')}
            description={notFound ? t('notFoundBody') : t('loadErrorBody')}
            actionLabel={t('backToList')}
            onAction={() => router.replace(ROUTES.account.vehicles())}
          />
        </Screen>
      </>
    );
  }

  return <HubBody vehicle={query.data} canEdit={canEdit} header={header} />;
}

/** Tách để `useServiceToggle` chỉ chạy khi ĐÃ có xe — hook không nhận `undefined`. */
function HubBody({
  vehicle,
  canEdit,
  header,
}: {
  vehicle: VehicleDetail;
  canEdit: boolean;
  header: ReactNode;
}) {
  const t = useTranslations('VehicleManage');
  const toast = useAppToast();
  const toggle = useServiceToggle(vehicle, canEdit);
  const domainLabel = useDomainLabel();
  const enabledServices = vehicle.serviceTypes ?? [];

  return (
    <>
      {header}
      <Screen edges={['left', 'right', 'bottom']}>
        <YStack gap={space.lg}>
          <VehicleSummaryCard vehicle={vehicle} />

          {!canEdit ? <Callout tone="info">{t('readOnlyNotice')}</Callout> : null}

          {VEHICLE_MANAGE_NAV.map((group) => {
            const service = group.serviceType;
            const on = service === null || enabledServices.includes(service);
            /*
             * Công tắc bị KHOÁ vẫn hiện, kèm lý do khi người dùng chạm — ẩn nó đi thì "vì sao tôi
             * không tắt được dịch vụ này" không có chỗ nào trả lời.
             */
            const blocked = service ? toggle.blockedReason(service, !on) : null;

            return (
              <YStack key={group.key} gap={space.sm}>
                {service ? (
                  <Card tone="muted" lift="flat">
                    <ToggleRow
                      label={t(`nav.${group.labelKey}` as never)}
                      hint={
                        blocked ??
                        t('nav.toggleLabel', { service: domainLabel('serviceType', service) })
                      }
                      checked={on}
                      disabled={toggle.pending || blocked !== null}
                      onToggle={() => {
                        if (blocked) {
                          toast.showInfo(blocked);
                          return;
                        }
                        toggle.toggle(service, !on);
                      }}
                    />
                  </Card>
                ) : (
                  <Text
                    col={colors.placeholder}
                    fos={fontSize.meta}
                    fow={fontWeight.semibold}
                    letterSpacing={0.8}
                  >
                    {t(`nav.${group.labelKey}` as never).toLocaleUpperCase()}
                  </Text>
                )}

                <Card padded={false}>
                  <YStack>
                    {group.items.map((item, index) => (
                      <SectionRow
                        key={item.section}
                        vehicleId={vehicle.id}
                        item={item}
                        enabled={on}
                        divided={index > 0}
                      />
                    ))}
                  </YStack>
                </Card>
              </YStack>
            );
          })}
        </YStack>
      </Screen>
      {toggle.dialog}
    </>
  );
}

/** Ảnh · tên · hai nhãn trạng thái · điểm đánh giá + số chuyến THẬT — `VehicleManageHeader` của web. */
function VehicleSummaryCard({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations('VehicleManage.header');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const navigateOnce = useNavigateOnce();
  const summary = useVehicleSummary(vehicle.id);
  const stats = summary.data?.stats;
  const isPublic = vehicle.publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC;

  return (
    <Card>
      <YStack gap={space.sm}>
        <XStack gap={space.sm} ai="center">
          <YStack w={COVER_WIDTH} h={COVER_HEIGHT} br={radius.sm} ov="hidden">
            <RemoteImage
              uri={vehicle.mainImageUrl}
              radius={radius.sm}
              fallback={<YStack f={1} bg={colors.surfaceMuted} />}
            />
          </YStack>
          <YStack f={1} minWidth={0} gap={space.xs}>
            <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold} numberOfLines={2}>
              {vehicle.name}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
              {stats
                ? [
                    stats.ratingAvg ? fmt.rating(Number(stats.ratingAvg)) : t('noRating'),
                    t('trips', { count: stats.completedBookings }),
                  ].join(` ${LIST_SEPARATOR} `)
                : (vehicle.plateNumber ?? vehicle.code)}
            </Text>
          </YStack>
        </XStack>

        <XStack gap={space.xs} flexWrap="wrap">
          <StatusBadge
            label={domainLabel('vehicleOperationStatus', vehicle.operationStatus)}
            color={
              VEHICLE_OPERATION_STATUS_META[vehicle.operationStatus as VehicleOperationStatus].color
            }
            size="sm"
          />
          <StatusBadge
            label={domainLabel('vehiclePublicStatus', vehicle.publicStatus)}
            color={VEHICLE_PUBLIC_STATUS_META[vehicle.publicStatus as VehiclePublicStatus].color}
            size="sm"
          />
        </XStack>

        {/* "Xem trang xe" chỉ đi được khi xe ĐÃ công khai — web khoá nút kèm lý do, đây ẩn hẳn. */}
        {isPublic ? (
          <Pressable
            onPress={() => navigateOnce(ROUTES.explore.listingDetail(vehicle.id))}
            accessibilityRole="link"
            accessibilityLabel={t('viewListing')}
            style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
          >
            <XStack ai="center" gap={space.xs} minHeight={sizing.touchTarget}>
              <Ionicons name="open-outline" size={iconSize.sm} color={colors.primaryActive} />
              <Text col={colors.primaryActive} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                {t('viewListing')}
              </Text>
            </XStack>
          </Pressable>
        ) : (
          <Text col={colors.placeholder} fos={fontSize.label}>
            {t('viewListingDisabled')}
          </Text>
        )}
      </YStack>
    </Card>
  );
}

function SectionRow({
  vehicleId,
  item,
  enabled,
  divided,
}: {
  vehicleId: string;
  item: (typeof VEHICLE_MANAGE_NAV)[number]['items'][number];
  enabled: boolean;
  divided: boolean;
}) {
  const t = useTranslations('VehicleManage.nav');
  const navigateOnce = useNavigateOnce();
  const label = t(item.labelKey);

  return (
    <>
      {divided ? <YStack h={1} bg={colors.borderSubtle} /> : null}
      <Pressable
        onPress={() => navigateOnce(ROUTES.account.vehicleManageSection(vehicleId, item.section))}
        accessibilityRole="link"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !enabled }}
        style={({ pressed }) => (pressed ? { backgroundColor: colors.surfaceMuted } : null)}
      >
        <XStack
          ai="center"
          gap={space.sm}
          px={space.md}
          py={space.xs}
          minHeight={sizing.touchTarget}
          /*
            Dịch vụ tắt: mục vẫn BẤM ĐƯỢC (màn đích giải thích và mời bật lại — `VehicleManageShell`),
            chỉ mờ đi. Khoá hẳn thì cú chạm không ra gì và người dùng không biết vì sao.
          */
          opacity={enabled ? 1 : 0.5}
        >
          <Ionicons name={item.icon} size={iconSize.md} color={colors.textMuted} />
          <Text f={1} col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
            {label}
          </Text>
          <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.placeholder} />
        </XStack>
      </Pressable>
    </>
  );
}
