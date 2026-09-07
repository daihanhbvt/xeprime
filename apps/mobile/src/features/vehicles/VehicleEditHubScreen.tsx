import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  PERMISSION,
  VEHICLE_ALERT_KIND,
  type Permission,
  type VehicleAlertKind,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { BlockTitle } from '@/components/ui/BlockTitle';
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
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import type { IconName } from '@/components/ui/Chip';
import { useVehicle, useVehicleSummary } from './hooks/use-vehicle';

/** Ô đựng biểu tượng của một mục. Đủ to để hình 18px có khoảng thở quanh nó. */
const ICON_BOX = 36;

/**
 * Việc cần làm của TỪNG mục — cảnh báo nào thuộc về màn nào.
 *
 * Đây là lý do hub này đáng tồn tại thay vì một danh sách sáu cái tên: người dùng mở nó ra để
 * biết vào đâu TRƯỚC, và server đã tính sẵn câu trả lời trong `summary.alerts`. Ánh xạ khai
 * tường minh chứ không đoán theo tiền tố tên: thêm một loại cảnh báo mà quên khai ở đây thì nó
 * không hiện lên hub — im lặng, nhưng không bao giờ hiện nhầm chỗ.
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

interface HubItem {
  tab: VehicleEditTab;
  label: string;
  hint: string;
  icon: IconName;
  permission: Permission;
}

interface HubGroup {
  key: string;
  label: string;
  items: HubItem[];
}

/**
 * Hub SỬA XE (VEH-04) — sáu mục, mỗi mục một màn riêng.
 *
 * Web dựng sáu tab trong một trang; ở 390px sáu tab chữ không vừa một hàng, nên native tách
 * thành sáu route. Đây là khác biệt ĐIỀU HƯỚNG, không phải nghiệp vụ: cùng sáu mục, cùng thứ
 * tự, cùng nhãn (`Vehicles.edit.tabs.*`), cùng payload từng mục — web vốn đã tách payload
 * (`informationValuesToInput` ≠ `mediaValuesToInput`), còn Giá/Nguồn/Giấy tờ/Bảo dưỡng là bốn
 * feature riêng có form riêng.
 *
 * Lợi thế đi kèm: guard "bỏ thay đổi" gắn vào nút Lui của TỪNG màn con, không phải một hộp
 * thoại đổi tab tự dựng.
 *
 * Vì web không có màn này nên không có gì để bám: mỗi dòng mang biểu tượng, một câu nói bên
 * trong có gì, và số việc cần làm của đúng mục đó. Bản đầu là sáu thẻ giống hệt nhau chỉ có
 * nhãn và mũi tên — một mục lục không nói thêm được gì so với chính cái tên nó liệt kê.
 */
export function VehicleEditHubScreen({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations('Vehicles.edit');
  const router = useRouter();
  const navigateOnce = useNavigateOnce();
  const { has, isLoading: permissionsLoading } = usePermissions();
  const canUpdate = has(PERMISSION.VEHICLE_UPDATE);

  const back = () => goBackOr(router, ROUTES.manage.vehicleDetail(vehicleId));
  const query = useVehicle(vehicleId, has(PERMISSION.VEHICLE_VIEW));
  /*
    Cảnh báo là thông tin PHỤ TRỢ: hỏng thì hub vẫn đi được, chỉ mất mấy con số. Không nối nó vào
    trạng thái tải của màn.
  */
  const summary = useVehicleSummary(vehicleId, has(PERMISSION.VEHICLE_VIEW));

  const countFor = (tab: VehicleEditTab) => {
    const kinds = TAB_ALERTS[tab];
    if (!kinds) return 0;
    return (summary.data?.alerts ?? [])
      .filter((alert) => kinds.includes(alert.kind as VehicleAlertKind))
      .reduce((total, alert) => total + (alert.count ?? 1), 0);
  };

  /**
   * Sáu mục — quyền của TỪNG mục khớp guard backend của endpoint nó mở ra.
   *
   * `Giá & chính sách` trỏ thẳng route VEH-05 (`/pricing`), không có màn con `edit/pricing`:
   * web cũng vậy — một màn, hai lối vào.
   *
   * Chia hai NHÓM vì đó là hai loại việc khác nhau: ba mục trên là thứ khách nhìn thấy trên chợ,
   * ba mục dưới là hồ sơ nội bộ — và quyền của chúng cũng khác hẳn nhau.
   */
  const allGroups: HubGroup[] = [
    {
      key: 'content',
      label: t('groups.content'),
      items: [
        {
          tab: VEHICLE_EDIT_TAB.INFORMATION,
          label: t('tabs.information'),
          hint: t('hints.information'),
          icon: 'car-outline',
          permission: PERMISSION.VEHICLE_UPDATE,
        },
        {
          tab: VEHICLE_EDIT_TAB.MEDIA,
          label: t('tabs.media'),
          hint: t('hints.media'),
          icon: 'images-outline',
          permission: PERMISSION.VEHICLE_UPDATE,
        },
        {
          tab: VEHICLE_EDIT_TAB.PRICING,
          label: t('tabs.pricing'),
          hint: t('hints.pricing'),
          icon: 'pricetag-outline',
          permission: PERMISSION.VEHICLE_VIEW,
        },
      ],
    },
    {
      key: 'records',
      label: t('groups.records'),
      items: [
        {
          tab: VEHICLE_EDIT_TAB.SOURCE,
          label: t('tabs.source'),
          hint: t('hints.source'),
          icon: 'business-outline',
          permission: PERMISSION.FINANCE_VIEW,
        },
        {
          tab: VEHICLE_EDIT_TAB.DOCUMENTS,
          label: t('tabs.documents'),
          hint: t('hints.documents'),
          icon: 'document-text-outline',
          permission: PERMISSION.VEHICLE_DOCUMENT_VIEW,
        },
        {
          tab: VEHICLE_EDIT_TAB.MAINTENANCE,
          label: t('tabs.maintenance'),
          hint: t('hints.maintenance'),
          icon: 'construct-outline',
          permission: PERMISSION.VEHICLE_MAINTENANCE_VIEW,
        },
      ],
    },
  ];

  const groups = allGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => has(item.permission)) }))
    // Nhóm rỗng thì bỏ luôn cả tiêu đề — một tiêu đề không có mục nào đọc ra như đang tải hỏng.
    .filter((group) => group.items.length > 0);

  if (!permissionsLoading && !canUpdate && groups.length === 0) {
    return (
      <>
        <AppHeader title={t('title')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage icon="lock-closed-outline" title={t('title')} />
        </Screen>
      </>
    );
  }

  return (
    <>
      <AppHeader
        title={t('title')}
        {...(query.data
          ? {
              subtitle: [query.data.name, query.data.plateNumber]
                .filter(Boolean)
                .join(LIST_SEPARATOR),
            }
          : {})}
        onBack={back}
      />
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
          <ScreenError error={query.error} title={t('title')} onRetry={() => void query.refetch()} />
        ) : (
          <YStack gap={layout.section}>
            {groups.map((group) => (
              <YStack key={group.key} gap={layout.inline}>
                <BlockTitle>{group.label}</BlockTitle>
                {group.items.map((item) => (
                  <HubRow
                    key={item.tab}
                    label={item.label}
                    hint={item.hint}
                    icon={item.icon}
                    count={countFor(item.tab)}
                    onPress={() => navigateOnce(ROUTES.manage.vehicleEditTab(vehicleId, item.tab))}
                  />
                ))}
              </YStack>
            ))}
          </YStack>
        )}
      </Screen>
    </>
  );
}

/**
 * Một mục của hub: biểu tượng · nhãn + câu mô tả · số việc cần làm · mũi tên.
 *
 * Câu mô tả không phải chữ trang trí — sáu cái tên như "Nguồn xe & tài chính" hay "Bảo dưỡng &
 * KM" không nói được bên trong sửa được gì, và người dùng phải mở lần lượt từng màn ra để đoán.
 */
function HubRow({
  label,
  hint,
  icon,
  count,
  onPress,
}: {
  label: string;
  hint: string;
  icon: IconName;
  /** 0 = không có việc; viên đếm chỉ hiện khi > 0, cùng luật với thẻ "Việc cần làm". */
  count: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `${label}, ${count}` : label}
      onPress={onPress}
    >
      <Card>
        <XStack ai="center" gap={space.sm}>
          <YStack
            w={ICON_BOX}
            h={ICON_BOX}
            br={radius.md}
            bg={colors.primaryLight}
            ai="center"
            jc="center"
          >
            <Ionicons name={icon} size={iconSize.md} color={colors.primaryActive} />
          </YStack>

          <YStack f={1} gap={2}>
            <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
              {label}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {hint}
            </Text>
          </YStack>

          {count > 0 ? <CountBadge count={count} tone="danger" /> : null}
          <DetailChevron />
        </XStack>
      </Card>
    </Pressable>
  );
}
