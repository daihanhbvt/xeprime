import { AntIcon, type AntIconDefinition } from '@/components/icons/AntIcon';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  PERMISSION,
  VEHICLE_ALERT_KIND,
  VEHICLE_DOCUMENT_TYPE,
  missingVehicleImageTypes,
  type VehicleAlertKind,
} from '@xeprime/types';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Card } from '@/components/ui/Card';
import { DetailChevron } from '@/components/ui/DetailArrow';
import { CountBadge } from '@/components/ui/CountBadge';
import { SkeletonText } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB, type VehicleEditTab } from '@/navigation/vehicle-edit-tab';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { layout } from '@/theme/layout';
import { makeStyles, useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import type { VehicleDetail } from './api';
import { vehicleEditNavGroups } from './edit-nav';
import { useVehicle, useVehicleSummary } from './hooks/use-vehicle';
import { useVehicleCapabilities } from './hooks/use-vehicle-capabilities';
import { useVehicleDocuments } from '@/features/vehicle-documents/hooks/use-documents';
import { VehicleEditHeaderCard } from './components/VehicleEditHeaderCard';

/** Ô đựng biểu tượng của một mục. Đủ to để hình 18px có khoảng thở quanh nó. */
const ICON_BOX = 32;

/** Chiều cao tối thiểu một dòng mục — trên mức 44dp chạm được, gọn hơn thẻ riêng lẻ. */
const ROW_HEIGHT = 56;

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
        <Screen scrollReveal={false} motion={false} edges={['left', 'right', 'bottom']} scroll={false}>
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
      <Screen scrollReveal={false} motion={false}
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

/** Ba giấy tờ CỐT LÕI của số "2/3" trên menu — web `STANDARD_VEHICLE_DOCUMENT_TYPES`. */
const CORE_DOCUMENT_TYPES = [
  VEHICLE_DOCUMENT_TYPE.REGISTRATION,
  VEHICLE_DOCUMENT_TYPE.INSPECTION,
  VEHICLE_DOCUMENT_TYPE.INSURANCE,
] as const;

/** Nhãn số bên phải một mục menu (web `EditMenuBadge`): "1 thiếu" ở Hình ảnh, "2/3" ở Giấy tờ. */
interface HubBadge {
  text: string;
  label: string;
  warn: boolean;
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
  const tEditor = useTranslations('Vehicles.editor');
  const navigateOnce = useNavigateOnce();
  const { has } = usePermissions();
  const can = useVehicleCapabilities();
  /* Web `canToggle = canUpdate && !support` — app Partner không có phiên hỗ trợ. */
  const canToggle = has(PERMISSION.VEHICLE_UPDATE);

  /*
   * Số trên menu (ledger §3.6 E2): góc ảnh bắt buộc còn thiếu · giấy tờ cốt lõi đã có / 3 — cùng
   * phép tính với web `VehicleEditWorkspace`.
   */
  const missingImages = missingVehicleImageTypes(vehicle.vehicleType, vehicle.media ?? []).length;
  const documents = useVehicleDocuments(vehicle.id, can.documents);
  const docsPresent = CORE_DOCUMENT_TYPES.filter((type) =>
    (documents.data ?? []).some((doc) => doc.type === type && doc.hasFile),
  ).length;
  const badgeFor = (tab: VehicleEditTab): HubBadge | null => {
    if (tab === VEHICLE_EDIT_TAB.MEDIA && missingImages > 0) {
      return {
        text: tEditor('menu.missingBadge', { count: missingImages }),
        label: tEditor('menu.missingImages', { count: missingImages }),
        warn: true,
      };
    }
    if (tab === VEHICLE_EDIT_TAB.DOCUMENTS && documents.data) {
      return {
        text: `${docsPresent}/${CORE_DOCUMENT_TYPES.length}`,
        label: tEditor('menu.documentsCount', {
          count: docsPresent,
          total: CORE_DOCUMENT_TYPES.length,
        }),
        warn: docsPresent < CORE_DOCUMENT_TYPES.length,
      };
    }
    return null;
  };

  const groups = vehicleEditNavGroups({
    enabled: (tab) => {
      if (tab === VEHICLE_EDIT_TAB.SOURCE) return can.source;
      if (tab === VEHICLE_EDIT_TAB.DOCUMENTS) return can.documents;
      if (tab === VEHICLE_EDIT_TAB.MAINTENANCE) return can.maintenance;
      // Web `VehicleEditWorkspace`: "Lịch sử chuyến" chỉ ở tuyến hoa hồng - gian hàng đã có màn
      // Đơn thuê lọc theo xe. Hub này chỉ dựng cho cổng quản lý (tuyến gói).
      if (tab === VEHICLE_EDIT_TAB.TRIP_HISTORY) return false;
      return true;
    },
  });

  const open = (tab: VehicleEditTab) => navigateOnce(ROUTES.manage.vehicleEditTab(vehicle.id, tab));

  return (
    <>
      <YStack gap={layout.section} accessibilityLabel={tNav('menuLabel')}>
        {/*
          CÙNG thẻ đầu xe với web `VehicleEditWorkspace` (`VehicleEditHeader`): ảnh + dải góc, tên + mã,
          biển số · loại / dịch vụ, số KM, hai trục trạng thái, công tắc "Trên chợ".
        */}
        <VehicleEditHeaderCard
          vehicle={vehicle}
          statusEditable={canToggle}
          showSource={can.source}
          onEditImages={canToggle ? () => open(VEHICLE_EDIT_TAB.MEDIA) : undefined}
        />

        {groups.map((group) => (
          <YStack key={group.key} gap={space.xs}>
            <SectionLabel>{tEditor(`menu.groups.${group.key}`)}</SectionLabel>
            {/* MỘT thẻ cho cả nhóm - các mục là dòng gọn ngăn bằng đường kẻ (web `VehicleEditMenu`). */}
            <Card padded={false} lift="flat">
              {group.items.map((item, index) => (
                <YStack key={item.tab}>
                  {index > 0 ? <RowDivider /> : null}
                  <HubRow
                    label={tEditor(`menu.items.${item.labelKey}`)}
                    icon={item.icon}
                    count={countFor(item.tab)}
                    badge={badgeFor(item.tab)}
                    dimmed={false}
                    onPress={() => open(item.tab)}
                  />
                </YStack>
              ))}
            </Card>
          </YStack>
        ))}
      </YStack>
    </>
  );
}

/** Tiêu đề nhóm — chữ nhỏ in hoa, cùng kiểu các màn danh sách khác của app. */
function SectionLabel({ children }: { children: string }) {
  const colors = useColors();
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
  const colors = useColors();
  return <YStack h={1} marginLeft={space.md + ICON_BOX + space.sm} bg={colors.borderSubtle} />;
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
  badge,
  dimmed,
  onPress,
}: {
  label: string;
  icon: AntIconDefinition;
  /** 0 = không có việc; viên đếm chỉ hiện khi > 0, cùng luật với thẻ "Việc cần làm". */
  count: number;
  badge: HubBadge | null;
  dimmed: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[label, badge?.label, count > 0 ? String(count) : null]
        .filter(Boolean)
        .join(', ')}
      onPress={onPress}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      <XStack
        ai="center"
        gap={space.sm}
        minHeight={ROW_HEIGHT}
        px={layout.padX}
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
          <AntIcon icon={icon} size={iconSize.sm} color={colors.primaryActive} />
        </YStack>

        <Text f={1} minWidth={0} col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
          {label}
        </Text>

        {badge ? (
          <XStack
            px={space.xs}
            br={radius.pill}
            bw={1}
            bc={badge.warn ? colors.warning : colors.border}
            bg={badge.warn ? colors.warningSurface : colors.surfaceMuted}
          >
            <Text
              col={badge.warn ? colors.warning : colors.textMuted}
              fos={fontSize.label}
              fow={fontWeight.semibold}
            >
              {badge.text}
            </Text>
          </XStack>
        ) : null}
        {count > 0 ? <CountBadge count={count} tone="danger" /> : null}
        <DetailChevron />
      </XStack>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  pressed: { backgroundColor: colors.surfaceMuted },
}));
