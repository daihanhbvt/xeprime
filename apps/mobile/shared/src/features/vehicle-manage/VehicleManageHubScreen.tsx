import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  API_ERROR_CODE,
  PERMISSION,
  MARKETPLACE_VISIBILITY_REASON_META,
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_OPERATION_STATUS_VALUES,
  VEHICLE_PUBLIC_STATUS_META,
  type MarketplaceVisibilityReason,
  type VehicleOperationStatus,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { getErrorCode } from '@xeprime/api-client';
import { metaColor, metaLabel } from '@/lib/status-meta';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { Card } from '@/components/ui/Card';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Callout } from '@/components/ui/Callout';
import type { IconName } from '@/components/ui/Chip';
import { InlineAction } from '@/components/ui/InlineAction';
import { MenuOption, MenuOptionList } from '@/components/ui/MenuOption';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { ToggleRow } from '@/features/rental-policies/components/PolicySections';
import {
  useUpdateVehicle,
  useVehicle,
  useVehicleSummary,
} from '@/features/vehicles/hooks/use-vehicle';
import type { VehicleDetail } from '@/features/vehicles/api';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import {
  VEHICLE_MANAGE_NAV,
  VEHICLE_MANAGE_SECTION,
  type VehicleManageNavItem,
} from '@/navigation/vehicle-manage-section';
import { colors, fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
import { useServiceToggle } from './hooks/use-service-toggle';

const COVER_WIDTH = 88;
const COVER_HEIGHT = 64;

/**
 * MỤC LỤC của không gian "Quản lý xe" — bản native của menu trái `VehicleManageSidebar`.
 *
 * Web có một cột năm nhóm luôn hiện bên trái mọi trang con; ở 390px cột đó không tồn tại, nên nó
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
  const tMenu = useTranslations('VehicleManage.menu');
  const toast = useAppToast();
  const navigateOnce = useNavigateOnce();
  const toggle = useServiceToggle(vehicle, canEdit);
  const domainLabel = useDomainLabel();
  const enabledServices = vehicle.serviceTypes ?? [];

  return (
    <>
      {header}
      <Screen edges={['left', 'right', 'bottom']}>
        <YStack gap={space.lg}>
          <VehicleSummaryCard vehicle={vehicle} statusEditable={canEdit} />

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
                    <YStack gap={space.xs}>
                      <ToggleRow
                        label={tMenu(group.labelKey)}
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
                      {/*
                        Nhóm chỉ có công tắc (thuê dài hạn): nói giá tháng nằm đâu và dẫn tới đó —
                        đúng `extra` của sidebar web.
                      */}
                      {group.items.length === 0 ? (
                        <InlineAction
                          label={tMenu('longTermNote')}
                          onPress={() =>
                            navigateOnce(
                              ROUTES.account.vehicleManageSection(
                                vehicle.id,
                                VEHICLE_MANAGE_SECTION.PRICING,
                              ),
                            )
                          }
                        />
                      ) : null}
                    </YStack>
                  </Card>
                ) : (
                  <Text
                    col={colors.placeholder}
                    fos={fontSize.meta}
                    fow={fontWeight.semibold}
                    letterSpacing={0.8}
                  >
                    {tMenu(group.labelKey).toLocaleUpperCase()}
                  </Text>
                )}

                {group.items.length > 0 ? (
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
                ) : null}
              </YStack>
            );
          })}
        </YStack>
      </Screen>
      {toggle.dialog}
    </>
  );
}

/**
 * Ảnh · tên · trạng thái · điểm đánh giá + số chuyến THẬT · Hồ sơ xe · Trang xe — bản native của
 * `VehicleManageHeader` (+ `VehicleEditHeader`) bên web.
 *
 * `statusEditable`: chủ xe đổi trạng thái vận hành NGAY trên chip — cùng mutation, cùng câu báo
 * với web (`update({ operationStatus })`, `Vehicles.edit.aside.statusSaved`).
 */
function VehicleSummaryCard({
  vehicle,
  statusEditable,
}: {
  vehicle: VehicleDetail;
  statusEditable: boolean;
}) {
  const t = useTranslations('VehicleManage.header');
  const tAside = useTranslations('Vehicles.edit.aside');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const navigateOnce = useNavigateOnce();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const summary = useVehicleSummary(vehicle.id);
  const update = useUpdateVehicle(vehicle.id);
  const [statusOpen, setStatusOpen] = useState(false);
  const stats = summary.data?.stats;
  /*
   * "Xem trang xe" theo KẾT QUẢ hiển thị thật, không theo trạng thái kiểm duyệt (ADR 0048 điều 7):
   * một chiếc xe đã duyệt nhưng chủ xe đang tạm ẩn thì `/listings/:id` trả 404.
   */
  const isPublic = vehicle.isMarketplaceVisible;
  const statusLabel = domainLabel('vehicleOperationStatus', vehicle.operationStatus);

  async function changeStatus(next: VehicleOperationStatus) {
    setStatusOpen(false);
    if (next === vehicle.operationStatus) return;
    try {
      await update.mutateAsync({ operationStatus: next });
      toast.showSuccess(tAside('statusSaved'));
    } catch (err) {
      toast.showError(errorMessage(err));
    }
  }

  const statusBadge = (
    <StatusBadge
      label={statusLabel}
      color={metaColor(VEHICLE_OPERATION_STATUS_META, vehicle.operationStatus)}
      size="sm"
    />
  );

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

        <XStack gap={space.xs} flexWrap="wrap" ai="center">
          {statusEditable ? (
            <Pressable
              onPress={() => setStatusOpen(true)}
              disabled={update.isPending}
              accessibilityRole="button"
              accessibilityLabel={tAside('changeStatus', { status: statusLabel })}
              style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
            >
              <XStack ai="center" gap={2} minHeight={sizing.touchTarget}>
                {statusBadge}
                <Ionicons
                  name={update.isPending ? 'hourglass-outline' : 'chevron-down'}
                  size={iconSize.sm}
                  color={colors.textMuted}
                />
              </XStack>
            </Pressable>
          ) : (
            statusBadge
          )}
          <StatusBadge
            label={domainLabel('vehiclePublicStatus', vehicle.publicStatus)}
            color={metaColor(VEHICLE_PUBLIC_STATUS_META, vehicle.publicStatus)}
            size="sm"
          />
          {/* Kết quả hiển thị THẬT — server suy, client không ghép lại từ ba status (ADR 0048). */}
          <StatusBadge
            label={domainLabel(
              'marketplaceVisibility',
              vehicle.marketplaceVisibilityReason,
              metaLabel(
                MARKETPLACE_VISIBILITY_REASON_META,
                vehicle.marketplaceVisibilityReason as MarketplaceVisibilityReason,
              ),
            )}
            color={metaColor(
              MARKETPLACE_VISIBILITY_REASON_META,
              vehicle.marketplaceVisibilityReason as MarketplaceVisibilityReason,
            )}
            size="sm"
          />
        </XStack>

        <HeaderLink
          icon="document-text-outline"
          label={t('viewProfile')}
          onPress={() => navigateOnce(ROUTES.account.vehicleDetail(vehicle.id))}
        />
        {/* "Xem trang xe" chỉ đi được khi xe ĐÃ công khai — web khoá nút kèm lý do, đây nói lý do. */}
        {isPublic ? (
          <HeaderLink
            icon="open-outline"
            label={t('viewListing')}
            onPress={() => navigateOnce(ROUTES.explore.listingDetail(vehicle.id))}
          />
        ) : (
          <Text col={colors.placeholder} fos={fontSize.label}>
            {t('viewListingDisabled')}
          </Text>
        )}
      </YStack>

      <BottomSheet open={statusOpen} onClose={() => setStatusOpen(false)} title={tAside('status')}>
        <MenuOptionList>
          {VEHICLE_OPERATION_STATUS_VALUES.map((status) => (
            <MenuOption
              key={status}
              label={domainLabel('vehicleOperationStatus', status)}
              selected={status === vehicle.operationStatus}
              onPress={() => void changeStatus(status)}
            />
          ))}
        </MenuOptionList>
      </BottomSheet>
    </Card>
  );
}

function HeaderLink({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
    >
      <XStack ai="center" gap={space.xs} minHeight={sizing.touchTarget}>
        <Ionicons name={icon} size={iconSize.sm} color={colors.primaryActive} />
        <Text col={colors.primaryActive} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {label}
        </Text>
      </XStack>
    </Pressable>
  );
}

function SectionRow({
  vehicleId,
  item,
  enabled,
  divided,
}: {
  vehicleId: string;
  item: VehicleManageNavItem;
  enabled: boolean;
  divided: boolean;
}) {
  const tMenu = useTranslations('VehicleManage.menu');
  const navigateOnce = useNavigateOnce();
  const label = tMenu(item.labelKey);

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
            chỉ mờ đi, như sidebar web.
          */
          opacity={enabled ? 1 : 0.5}
        >
          <Ionicons name={item.icon} size={iconSize.md} color={colors.textMuted} />
          <Text f={1} minWidth={0} col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
            {label}
          </Text>
          <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.placeholder} />
        </XStack>
      </Pressable>
    </>
  );
}
