import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  API_ERROR_CODE,
  PERMISSION,
  VEHICLE_DOCUMENT_TYPE,
  missingVehicleImageTypes,
} from '@xeprime/types';
import { getErrorCode } from '@xeprime/api-client';
import { AntIcon, type AntIconDefinition } from '@/components/icons/AntIcon';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { DetailChevron } from '@/components/ui/DetailArrow';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useVehicleDocuments } from '@/features/vehicle-documents/hooks/use-documents';
import type { VehicleDetail } from '@/features/vehicles/api';
import { VehicleEditHeaderCard } from '@/features/vehicles/components/VehicleEditHeaderCard';
import { useVehicle } from '@/features/vehicles/hooks/use-vehicle';
import { useVehicleCapabilities } from '@/features/vehicles/hooks/use-vehicle-capabilities';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { makeStyles, useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import {
  OWNER_EDIT_MENU,
  ownerEditMenuGroups,
  ownerEditMenuHref,
  type OwnerEditMenuKey,
} from './owner-edit-nav';

/** Ô đựng biểu tượng của một mục. */
const ICON_BOX = 32;
/** Chiều cao tối thiểu một dòng mục — trên mức 44dp chạm được. */
const ROW_HEIGHT = 56;

/** Ba giấy tờ CỐT LÕI của số "2/3" trên menu — web `STANDARD_VEHICLE_DOCUMENT_TYPES`. */
const CORE_DOCUMENT_TYPES = [
  VEHICLE_DOCUMENT_TYPE.REGISTRATION,
  VEHICLE_DOCUMENT_TYPE.INSPECTION,
  VEHICLE_DOCUMENT_TYPE.INSURANCE,
] as const;

/** Nhãn số bên phải một mục (web `EditMenuBadge`): "1 thiếu" ở Hình ảnh, "2/3" ở Giấy tờ. */
interface MenuBadge {
  text: string;
  label: string;
  warn: boolean;
}

/**
 * Màn SỬA XE của chủ xe tuyến hoa hồng (Owner Lite) — bản native của `VehicleEditWorkspace` web khi
 * `isManage === false` (03/11/2026, sổ cái §3.6 E24: hai tuyến chung một màn sửa trên web).
 *
 * Web giữ menu trái + nội dung trong MỘT trang; ở 390px menu thành màn đầu và mỗi mục là một route
 * riêng dưới `/manage/vehicles/<id>/manage/`. Màn này là bản RIÊNG của Owner Lite — không đi qua hub
 * sửa xe của gian hàng (`VehicleEditHubScreen`) — nhưng menu trùng web 1-1:
 *
 * - Thẻ đầu xe = `VehicleEditSummary` của web: `showOwnerStats` (đánh giá + số chuyến), không nhãn
 *   nguồn xe (`showSource = isManage && can.source`), chạm ảnh mở mục Hình ảnh.
 * - Ba nhóm "Hồ sơ xe · Hình thức cho thuê · Vận hành nâng cao" với đúng điều kiện `menuEnabled`
 *   (xem `owner-edit-nav.ts`); nhóm rỗng không vẽ.
 * - Số trên menu: góc ảnh bắt buộc còn thiếu · giấy tờ cốt lõi đã có / 3.
 *
 * Quyền: web mở trang cho tuyến hoa hồng khi có `vehicles.update` HOẶC `vehicles.view` — thành viên
 * chỉ xem đọc hồ sơ ở dạng chỉ-xem (form tự khoá).
 */
export function OwnerVehicleEditHubScreen({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations('VehicleManage');
  const tPage = useTranslations('Vehicles.edit.page');
  const tActions = useTranslations('Common.actions');
  const router = useRouter();
  const { has, isLoading: permissionsLoading } = usePermissions();
  const canView = has(PERMISSION.VEHICLE_VIEW) || has(PERMISSION.VEHICLE_UPDATE);
  const canEdit = has(PERMISSION.VEHICLE_UPDATE);
  const query = useVehicle(vehicleId, canView);

  const back = () => goBackOr(router, ROUTES.account.vehicleDetail(vehicleId));
  const header = <AppHeader onBack={back} title={tPage('title')} />;

  if (!permissionsLoading && !canView) {
    return (
      <>
        {header}
        <Screen scrollReveal edges={['left', 'right', 'bottom']} scroll={false}>
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

  if (query.isPending) {
    return (
      <>
        {header}
        <Screen scrollReveal edges={['left', 'right', 'bottom']}>
          <MiniRowsSkeleton rows={8} />
        </Screen>
      </>
    );
  }

  if (query.isError) {
    const notFound = getErrorCode(query.error) === API_ERROR_CODE.NOT_FOUND;
    return (
      <>
        {header}
        <Screen scrollReveal edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="alert-circle-outline"
            title={notFound ? t('notFoundTitle') : t('loadErrorTitle')}
            description={notFound ? t('notFoundBody') : t('loadErrorBody')}
            // 404 không thử lại (web EmptyState R10) — về danh sách.
            actionLabel={notFound ? t('backToList') : tActions('retry')}
            onAction={
              notFound ? () => router.replace(ROUTES.account.vehicles()) : () => void query.refetch()
            }
          />
        </Screen>
      </>
    );
  }

  return (
    <>
      {header}
      <Screen
        scrollReveal
        edges={['left', 'right', 'bottom']}
        refreshing={query.isRefetching}
        onRefresh={() => void query.refetch()}
      >
        <EditMenu vehicle={query.data} canEdit={canEdit} />
      </Screen>
    </>
  );
}

/** Tách để hook giấy tờ chỉ chạy khi ĐÃ có xe. */
function EditMenu({ vehicle, canEdit }: { vehicle: VehicleDetail; canEdit: boolean }) {
  const t = useTranslations('VehicleManage');
  const tEditor = useTranslations('Vehicles.editor');
  const navigateOnce = useNavigateOnce();
  const can = useVehicleCapabilities();

  const missingImages = missingVehicleImageTypes(vehicle.vehicleType, vehicle.media ?? []).length;
  const documents = useVehicleDocuments(vehicle.id, can.documents);
  const docsPresent = CORE_DOCUMENT_TYPES.filter((type) =>
    (documents.data ?? []).some((doc) => doc.type === type && doc.hasFile),
  ).length;
  const badgeFor = (key: OwnerEditMenuKey): MenuBadge | null => {
    if (key === OWNER_EDIT_MENU.MEDIA && missingImages > 0) {
      return {
        text: tEditor('menu.missingBadge', { count: missingImages }),
        label: tEditor('menu.missingImages', { count: missingImages }),
        warn: true,
      };
    }
    if (key === OWNER_EDIT_MENU.DOCUMENTS && documents.data) {
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

  const groups = ownerEditMenuGroups(can);
  const open = (key: OwnerEditMenuKey) => navigateOnce(ownerEditMenuHref(vehicle.id, key));

  return (
    <YStack gap={layout.section} accessibilityLabel={tEditor('menu.label')}>
      <VehicleEditHeaderCard
        vehicle={vehicle}
        statusEditable={canEdit}
        showOwnerStats
        showSource={false}
        // Web `onOpenMedia`: mục Hình ảnh luôn có với chủ xe — kể cả người chỉ xem (thư viện chỉ-xem).
        onEditImages={() => open(OWNER_EDIT_MENU.MEDIA)}
      />

      {!canEdit ? <Callout tone="info">{t('readOnlyNotice')}</Callout> : null}

      {groups.map((group) => (
        <YStack key={group.key} gap={space.xs}>
          <GroupLabel>{tEditor(`menu.groups.${group.key}`)}</GroupLabel>
          <Card padded={false} lift="flat">
            {group.items.map((item, index) => (
              <YStack key={item.key}>
                {index > 0 ? <RowDivider /> : null}
                <MenuRow
                  label={tEditor(`menu.items.${item.key}`)}
                  icon={item.icon}
                  badge={badgeFor(item.key)}
                  onPress={() => open(item.key)}
                />
              </YStack>
            ))}
          </Card>
        </YStack>
      ))}
    </YStack>
  );
}

function GroupLabel({ children }: { children: string }) {
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

function RowDivider() {
  const colors = useColors();
  return <YStack h={1} marginLeft={space.md + ICON_BOX + space.sm} bg={colors.borderSubtle} />;
}

function MenuRow({
  label,
  icon,
  badge,
  onPress,
}: {
  label: string;
  icon: AntIconDefinition;
  badge: MenuBadge | null;
  onPress: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[label, badge?.label].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      <XStack ai="center" gap={space.sm} minHeight={ROW_HEIGHT} px={layout.padX} py={space.sm}>
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
        <DetailChevron />
      </XStack>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  pressed: { backgroundColor: colors.surfaceMuted },
}));
