import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  PERMISSION,
  STATUS_COLOR,
  VEHICLE_ALERT_KIND,
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_PUBLIC_STATUS_META,
  type VehicleAlertKind,
  type VehicleOperationStatus,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Card } from '@/components/ui/Card';
import { InlineAction } from '@/components/ui/InlineAction';
import { DetailChevron } from '@/components/ui/DetailArrow';
import { CountBadge } from '@/components/ui/CountBadge';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SkeletonText } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import type { IconName } from '@/components/ui/Chip';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { ToggleRow } from '@/features/rental-policies/components/PolicySections';
import { useServiceToggle } from '@/features/vehicle-manage/hooks/use-service-toggle';
import { useDomainLabel } from '@/i18n/domain';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB, type VehicleEditTab } from '@/navigation/vehicle-edit-tab';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import type { VehicleDetail } from './api';
import { vehicleEditNavGroups } from './edit-nav';
import { useVehicle, useVehicleSummary } from './hooks/use-vehicle';
import { useVehicleCapabilities } from './hooks/use-vehicle-capabilities';

/** Ô đựng biểu tượng của một mục. Đủ to để hình 18px có khoảng thở quanh nó. */
const ICON_BOX = 32;

/** Chiều cao tối thiểu một dòng mục — trên mức 44dp chạm được, gọn hơn thẻ riêng lẻ. */
const ROW_HEIGHT = 56;

/** Ảnh xe ở thẻ tóm tắt đầu hub. */
const THUMB = 64;

/** Độ mờ của mục thuộc một dịch vụ đang tắt — web làm mờ cả nhóm (`dimmed`). */
const DIMMED_OPACITY = 0.55;

/**
 * Việc cần làm của TỪNG mục — cảnh báo nào thuộc về màn nào.
 *
 * Người dùng mở hub ra để biết vào đâu TRƯỚC, và server đã tính sẵn câu trả lời trong
 * `summary.alerts`. Ánh xạ khai tường minh chứ không đoán theo tiền tố tên: thêm một loại cảnh báo
 * mà quên khai ở đây thì nó không hiện lên hub — im lặng, nhưng không bao giờ hiện nhầm chỗ.
 *
 * Ba loại KHÔNG thuộc mục nào và cố ý vắng mặt: `public_action_required` và `missing_vehicle_info`
 * (chuyện gửi duyệt, sống ở hồ sơ 360) và `source_obligation_due` (nghĩa vụ tài chính, hiện ở
 * thẻ nguồn xe của hồ sơ chứ không phải ở form sửa).
 */
const TAB_ALERTS: Partial<Record<VehicleEditTab, readonly VehicleAlertKind[]>> = {
  [VEHICLE_EDIT_TAB.DOCUMENTS]: [
    VEHICLE_ALERT_KIND.DOCUMENT_EXPIRED,
    VEHICLE_ALERT_KIND.DOCUMENT_EXPIRING,
  ],
  [VEHICLE_EDIT_TAB.MAINTENANCE]: [
    VEHICLE_ALERT_KIND.MAINTENANCE_OVERDUE,
    VEHICLE_ALERT_KIND.MAINTENANCE_DUE_SOON,
    VEHICLE_ALERT_KIND.MAINTENANCE_IN_PROGRESS,
    VEHICLE_ALERT_KIND.MISSING_ODOMETER,
    VEHICLE_ALERT_KIND.MISSING_RETURN_ODOMETER,
  ],
};

/**
 * Hub SỬA XE (VEH-04) — bản native của MENU TRÁI `VehicleEditWorkspace` bên web: sáu nhóm, mười
 * mục, đúng thứ tự và nhãn của `editNavGroups` (xem `edit-nav.ts`).
 *
 * Web giữ menu và nội dung trong MỘT trang; ở 390px cột menu không tồn tại, nên menu thành màn
 * đầu và mỗi mục là một route riêng. Khác biệt là ĐIỀU HƯỚNG, không phải nghiệp vụ: guard "bỏ thay
 * đổi" gắn vào nút Lui của TỪNG màn con thay cho `requestTab` của web.
 *
 * Ba nhóm dịch vụ mang CÙNG công tắc với web (`useServiceToggle`), chỉ khi có `vehicles.update`.
 * Nhóm của dịch vụ đang tắt vẫn hiện nhưng mờ đi; mở mục của nó thì màn đích mời bật dịch vụ.
 * Giấy tờ / Nguồn xe / Bảo dưỡng gác theo `useVehicleCapabilities` — cùng bảng luật với Hồ sơ 360.
 */
export function VehicleEditHubScreen({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations('Vehicles.edit');
  const router = useRouter();
  const { has, isLoading: permissionsLoading } = usePermissions();
  const canView = has(PERMISSION.VEHICLE_VIEW);
  /* Đúng `VehicleEditPage` bên web: cả trang sửa xe đòi `vehicles.update` — thiếu thì thay toàn
     bộ bằng trạng thái thiếu quyền + lối "Xem chi tiết xe". */
  const canUpdate = has(PERMISSION.VEHICLE_UPDATE);
  const tPage = useTranslations('Vehicles.edit.page');
  const tPermission = useTranslations('ManageCommon.permission');

  const back = () => goBackOr(router, ROUTES.manage.vehicleDetail(vehicleId));
  const query = useVehicle(vehicleId, canView);
  /*
    Cảnh báo là thông tin PHỤ TRỢ: hỏng thì hub vẫn đi được, chỉ mất mấy con số. Không nối nó vào
    trạng thái tải của màn.
  */
  const summary = useVehicleSummary(vehicleId, canView);

  if (!permissionsLoading && (!canView || !canUpdate)) {
    return (
      <>
        <AppHeader title={tPage('title')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={tPage('forbiddenTitle')}
            description={`${tPage('forbiddenBody')}
${tPermission('requires')} ${PERMISSION.VEHICLE_UPDATE}`}
            actionLabel={tPage('viewDetail')}
            onAction={() => router.replace(ROUTES.manage.vehicleDetail(vehicleId))}
          />
        </Screen>
      </>
    );
  }

  const countFor = (tab: VehicleEditTab) => {
    const kinds = TAB_ALERTS[tab];
    if (!kinds) return 0;
    return (summary.data?.alerts ?? [])
      .filter((alert) => kinds.includes(alert.kind as VehicleAlertKind))
      .reduce((total, alert) => total + (alert.count ?? 1), 0);
  };

  return (
    <>
      {/* Tên + biển số đã nằm trên thẻ tóm tắt đầu màn — thanh đầu chỉ còn tiêu đề. */}
      <AppHeader title={t('title')} onBack={back} />
      <Screen
        edges={['left', 'right', 'bottom']}
        refreshing={query.isRefetching}
        onRefresh={() => {
          void query.refetch();
          // Con số việc cần làm là truy vấn RIÊNG — không kéo theo thì kéo xuống xong nó vẫn cũ.
          void summary.refetch();
        }}
      >
        {query.isPending ? (
          <SkeletonText lines={6} />
        ) : query.isError ? (
          <ScreenError
            error={query.error}
            title={t('title')}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <EditMenu vehicle={query.data} countFor={countFor} />
        )}
      </Screen>
    </>
  );
}

/** Tách để `useServiceToggle` chỉ chạy khi ĐÃ có xe — hook không nhận `undefined`. */
function EditMenu({
  vehicle,
  countFor,
}: {
  vehicle: VehicleDetail;
  countFor: (tab: VehicleEditTab) => number;
}) {
  const tNav = useTranslations('Vehicles.edit.nav');
  const tMenu = useTranslations('VehicleManage.menu');
  const tManage = useTranslations('VehicleManage');
  const toast = useAppToast();
  const domainLabel = useDomainLabel();
  const navigateOnce = useNavigateOnce();
  const { has } = usePermissions();
  const can = useVehicleCapabilities();
  /* Web `canToggle = canUpdate && !support` — app Partner không có phiên hỗ trợ. */
  const canToggle = has(PERMISSION.VEHICLE_UPDATE);
  const toggle = useServiceToggle(vehicle, canToggle);
  const services = vehicle.serviceTypes ?? [];

  const groups = vehicleEditNavGroups({
    enabled: (tab) => {
      if (tab === VEHICLE_EDIT_TAB.SOURCE) return can.source;
      if (tab === VEHICLE_EDIT_TAB.DOCUMENTS) return can.documents;
      if (tab === VEHICLE_EDIT_TAB.MAINTENANCE) return can.maintenance;
      return true;
    },
    services,
  })
    // Không có công tắc thì nhóm dịch vụ rỗng (dài hạn) không còn gì để bày — web cũng bỏ qua nó.
    .filter((group) => group.items.length > 0 || canToggle);

  const open = (tab: VehicleEditTab) => navigateOnce(ROUTES.manage.vehicleEditTab(vehicle.id, tab));

  return (
    <>
      <YStack gap={layout.section} accessibilityLabel={tNav('menuLabel')}>
        <VehicleSummaryRow vehicle={vehicle} />

        {groups.map((group) => {
          const service = group.serviceType;
          const showToggle = Boolean(service) && canToggle;
          const on = service ? services.includes(service) : true;
          // Công tắc bị KHOÁ vẫn hiện, kèm lý do khi chạm — web nói lý do qua tooltip.
          const blocked = service && showToggle ? toggle.blockedReason(service, !on) : null;

          return (
            <YStack key={group.key} gap={space.xs}>
              <SectionLabel>{tMenu(group.labelKey)}</SectionLabel>
              {/*
                MỘT thẻ cho cả nhóm — các mục là dòng gọn ngăn bằng đường kẻ; công tắc dịch vụ là
                dòng ĐẦU của chính nhóm nó (trước đây là khối xám tách rời, không rõ mục nào thuộc
                dịch vụ nào).
              */}
              <Card padded={false} lift="flat">
                {showToggle && service ? (
                  <YStack px={space.md} py={space.xs}>
                    <ToggleRow
                      label={tManage('nav.toggleLabel', {
                        service: domainLabel('serviceType', service),
                      })}
                      {...(blocked ? { hint: blocked } : {})}
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
                  </YStack>
                ) : null}

                {group.items.map((item, index) => (
                  <YStack key={item.tab}>
                    {index > 0 || showToggle ? <RowDivider /> : null}
                    <HubRow
                      label={tMenu(item.labelKey)}
                      icon={item.icon}
                      count={countFor(item.tab)}
                      dimmed={group.dimmed}
                      onPress={() => open(item.tab)}
                    />
                  </YStack>
                ))}

                {/* Dài hạn: nhóm chỉ có công tắc + lời nhắc giá tháng nằm ở đâu (web `extra`). */}
                {group.items.length === 0 ? (
                  <>
                    {showToggle ? <RowDivider /> : null}
                    <XStack px={space.md} py={space.sm}>
                      <InlineAction
                        label={tMenu('longTermNote')}
                        onPress={() => open(VEHICLE_EDIT_TAB.PRICING)}
                      />
                    </XStack>
                  </>
                ) : null}
              </Card>
            </YStack>
          );
        })}
      </YStack>
      {toggle.dialog}
    </>
  );
}

/** Tiêu đề nhóm — chữ nhỏ in hoa, cùng kiểu các màn danh sách khác của app. */
function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      px={space.xs}
      col={colors.textMuted}
      fos={fontSize.meta}
      fow={fontWeight.semibold}
      letterSpacing={0.8}
    >
      {children.toLocaleUpperCase()}
    </Text>
  );
}

/** Đường kẻ giữa hai dòng của một nhóm — thụt vào bằng ô biểu tượng, như danh sách hệ thống. */
function RowDivider() {
  return <YStack h={1} marginLeft={space.md + ICON_BOX + space.sm} bg={colors.borderSubtle} />;
}

/**
 * Tóm tắt chiếc xe đang sửa ở đầu hub: ảnh · tên · biển số/mã · hai trục trạng thái. Người dùng
 * biết mình đang sửa xe nào mà không phải đọc dòng chữ nhỏ trên thanh đầu.
 */
function VehicleSummaryRow({ vehicle }: { vehicle: VehicleDetail }) {
  const domainLabel = useDomainLabel();
  const operation = vehicle.operationStatus as VehicleOperationStatus;
  const publicStatus = vehicle.publicStatus as VehiclePublicStatus;

  return (
    <Card lift="flat">
      <XStack ai="center" gap={space.md}>
        <YStack w={THUMB} h={THUMB} br={radius.md} ov="hidden" bg={colors.surfaceMuted}>
          {vehicle.mainImageUrl ? (
            <RemoteImage
              uri={vehicle.mainImageUrl}
              fallback={null}
              contentFit="cover"
              accessibilityLabel={vehicle.name}
            />
          ) : (
            <YStack f={1} ai="center" jc="center">
              <Ionicons name="car-outline" size={iconSize.lg} color={colors.placeholder} />
            </YStack>
          )}
        </YStack>
        <YStack f={1} minWidth={0} gap={4}>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold} numberOfLines={1}>
            {vehicle.name}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
            {[vehicle.plateNumber, vehicle.code].filter(Boolean).join(LIST_SEPARATOR)}
          </Text>
          <XStack gap={space.xs} flexWrap="wrap">
            <StatusBadge
              size="sm"
              label={domainLabel(
                'vehicleOperationStatus',
                operation,
                VEHICLE_OPERATION_STATUS_META[operation]?.label ?? operation,
              )}
              color={VEHICLE_OPERATION_STATUS_META[operation]?.color ?? STATUS_COLOR.NEUTRAL}
            />
            <StatusBadge
              size="sm"
              label={domainLabel(
                'vehiclePublicStatus',
                publicStatus,
                VEHICLE_PUBLIC_STATUS_META[publicStatus]?.label ?? publicStatus,
              )}
              color={VEHICLE_PUBLIC_STATUS_META[publicStatus]?.color ?? STATUS_COLOR.NEUTRAL}
            />
          </XStack>
        </YStack>
      </XStack>
    </Card>
  );
}

/**
 * Một mục của hub: biểu tượng · nhãn · số việc cần làm · mũi tên — một DÒNG trong thẻ nhóm, cao
 * tối thiểu 56dp. `dimmed` = dịch vụ của mục đang tắt — vẫn mở được (màn đích mời bật dịch vụ),
 * như mục mờ của menu web.
 */
function HubRow({
  label,
  icon,
  count,
  dimmed,
  onPress,
}: {
  label: string;
  icon: IconName;
  /** 0 = không có việc; viên đếm chỉ hiện khi > 0, cùng luật với thẻ "Việc cần làm". */
  count: number;
  dimmed: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `${label}, ${count}` : label}
      onPress={onPress}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      <XStack
        ai="center"
        gap={space.sm}
        minHeight={ROW_HEIGHT}
        px={space.md}
        py={space.sm}
        opacity={dimmed ? DIMMED_OPACITY : 1}
      >
        <YStack
          w={ICON_BOX}
          h={ICON_BOX}
          br={radius.md}
          bg={colors.primaryLight}
          ai="center"
          jc="center"
        >
          <Ionicons name={icon} size={iconSize.sm} color={colors.primaryActive} />
        </YStack>

        <Text f={1} minWidth={0} col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
          {label}
        </Text>

        {count > 0 ? <CountBadge count={count} tone="danger" /> : null}
        <DetailChevron />
      </XStack>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { backgroundColor: colors.surfaceMuted },
});
