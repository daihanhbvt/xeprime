import { useRef, useState, type ReactNode } from 'react';
import { Ionicons } from '@/components/icons/Ionicons';
import { Image } from 'expo-image';
import { useQueryClient } from '@tanstack/react-query';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  API_ERROR_CODE,
  PERMISSION,
  BOOKING_STATUS_META,
  SERVICE_TYPE,
  VEHICLE_ALERT_KIND,
  VEHICLE_ALERT_SEVERITY,
  topVehicleAlertSeverity,
  TRANSMISSION_TYPE,
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_PUBLIC_STATUS_META,
  VEHICLE_SERVICE_SETTING_SERVICES,
  VEHICLE_SOURCE_TYPE,
  type ServiceType,
  type VehicleOperationStatus,
  type VehiclePublicStatus,
  type VehicleSourceType,
} from '@xeprime/types';
import { toAppTz } from '@xeprime/domain';
import { metaColor } from '@/lib/status-meta';
import { getErrorCode } from '@/lib/api-client';
import { ManagePageHeader } from '@/features/shell/ManagePageHeader';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckGlyph } from '@/components/icons/CheckGlyph';
import { LineIcon, type LineIconName } from '@/components/icons/LineIcon';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Pill, pillToneOfStatusColor, usePillSkin } from '@/components/ui/Pill';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { UnderlineTabs } from '@/components/ui/UnderlineTabs';
import { ActionSheetButtons } from '@/components/ui/ActionSheetButtons';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { GlassIconButton } from '@/components/ui/GlassIconButton';
import { CountBadge } from '@/components/ui/CountBadge';
import { Screen } from '@/components/layout/Screen';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PhotoViewer } from '@/components/ui/PhotoViewer';
import { MiniRowsSkeleton, Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { statusTone } from '@/components/ui/StatusBadge';
import type { IconName } from '@/components/ui/Chip';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useCatalogLabels } from '@/features/catalog/use-catalog';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useAppFormat, useDatePickerPattern } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { withBranchParam } from '@/features/branches/branch-link';
import { useBranchReturnParam } from '@/features/branches/hooks/use-branch-filter';
import { goBackOr } from '@/navigation/go-back-or';
import { queryKeys } from '@/queries/query-keys';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB } from '@/navigation/vehicle-edit-tab';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, market, radius, space, typeScale } from '@/theme/tokens';
import { VehicleFinanceEntry } from './VehicleFinanceView';
import { VehicleAlertList } from './components/VehicleAlertList';
import { publicStatusPresentation, todoLeadAlert, vehiclePublicationTask } from './publication';
import { Callout, type CalloutTone } from '@/components/ui/Callout';
import { MarketplaceVisibilityRow } from './components/MarketplaceVisibilityRow';
import { VehiclePublicationTaskItem } from './components/VehiclePublicationTaskItem';
import { VehicleMaintenanceWorkspace } from '@/features/vehicle-maintenance/VehicleMaintenanceScreen';
import { vehicleSchedulePath } from './calendar-link';
import { vehicleGalleryItems } from './display-media';
import {
  useImageSlotLabel,
  useVehicleSpecItems,
  type VehicleSpecKey,
} from './hooks/use-vehicle-spec-items';
import {
  OVERVIEW_VIEW,
  overviewViews,
  vehicleProfileHref,
  type OverviewView,
} from './module-links';
import { useVehicleCapabilities } from './hooks/use-vehicle-capabilities';
import { useVehicleAlertView } from './hooks/use-vehicle-alert-view';
import {
  vehicleEditPartHref,
  vehicleOptimizationHref,
  vehiclePricingHref,
} from './workspace-links';
import {
  useDeleteVehicle,
  useVehicle,
  useVehicleSource,
  useVehicleSummary,
} from './hooks/use-vehicle';
import type { Vehicle360Summary, VehicleBookingBrief, VehicleDetail } from './api';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useAutoAcceptToggle } from '@/features/vehicle-manage/hooks/use-auto-accept-toggle';
import { useVehicleServiceSettings } from '@/features/vehicle-manage/hooks/use-vehicle-settings';
import type { VehicleServiceSetting } from '@/features/vehicle-manage/api';

const HERO_HEIGHT = 200;
/** Số ô HIỆN trong thẻ thư viện (3 × 2) — web `GALLERY_VISIBLE`. */
const GALLERY_VISIBLE = 6;
const GALLERY_COLUMNS = 3;


/**
 * Hồ sơ 360 của một xe (VEH-03) + tiến trình lên chợ (VEH-12).
 *
 * Thứ tự khối lấy nguyên của web: ảnh + định danh + KM + hai trục trạng thái → việc cần làm ·
 * lịch thuê sắp tới · hiệu suất → giá & chính sách → giấy tờ (chỉ ĐẾM) → thông số → nguồn xe →
 * thư viện ảnh → gửi duyệt → hoạt động gần đây.
 *
 * Tab "Tài chính" chỉ còn dòng tóm tắt (`VehicleFinanceEntry`) dẫn vào màn Tài chính xe
 * (`VehicleFinanceScreen`) - bản native của tab Tài chính web (#344/#345), cùng bộ endpoint của
 * Tổng quan doanh thu thu hẹp theo `vehicleId` nên con số không thể lệch nhau.
 */
interface VehicleDetailScreenProps {
  vehicleId: string;
  /**
   * Danh sách xe để LUI VỀ, và là nơi hạ cánh sau khi xoá xe.
   *
   * Màn này mở được từ HAI khu: đội xe ở cổng quản lý và danh sách xe trong khu tài khoản. Bỏ
   * trống thì về `/manage/vehicles` — mặc định đúng cho khu quản lý. Khu tài khoản PHẢI truyền
   * `/account/vehicles`: không truyền thì xoá một chiếc xe từ hồ sơ cá nhân sẽ ném người dùng
   * sang cổng quản lý, đổi luôn cả thanh tab dưới chân màn hình. Web giải cùng bài này bằng cách
   * cho mỗi vỏ tự truyền `back` và `onDeleted` vào `VehicleDetailContent`.
   */
  backTo?: Href;
  /**
   * Mở từ KHU KHÁCH — ẩn mọi lối dẫn sang `/manage` và đổi đích của các mục còn lại sang không
   * gian quản lý xe của chính khu tài khoản (lối tắt nằm trong tấm ⋮ Thao tác).
   */
  customerScope?: boolean;
}

export function VehicleDetailScreen({
  vehicleId,
  backTo,
  customerScope = false,
}: VehicleDetailScreenProps) {
  const t = useTranslations('Vehicles.detail');
  const router = useRouter();
  const { has, isLoading: permissionsLoading } = usePermissions();
  const canView = has(PERMISSION.VEHICLE_VIEW);

  /*
   * Về danh sách GIỮ chi nhánh đang lọc (ADR 0052, `useBranchReturnHref` bên web): danh sách gửi
   * `branchId` theo link chi tiết; lùi bằng stack thì danh sách vẫn giữ tham số của nó, còn khi mở
   * thẳng (deep link) thì đường lui dựng lại từ đây.
   */
  const returnBranch = useBranchReturnParam();
  const listHref = backTo ?? withBranchParam(ROUTES.manage.vehicles(), returnBranch);
  const back = () => goBackOr(router, listHref);
  const query = useVehicle(vehicleId, canView);

  if (!permissionsLoading && !canView) {
    return (
      <>
        <ManagePageHeader title={t('title')} onBack={back} />
        <Screen scrollReveal={false} edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={t('forbiddenTitle')}
            description={t('forbiddenBody')}
          />
        </Screen>
      </>
    );
  }

  if (query.isPending) {
    return (
      <>
        <ManagePageHeader title={t('title')} onBack={back} />
        <Screen scrollReveal={false} edges={['left', 'right', 'bottom']}>
          <YStack gap={layout.section}>
            <Skeleton height={HERO_HEIGHT} />
            <SkeletonText lines={4} />
            <Skeleton height={160} />
          </YStack>
        </Screen>
      </>
    );
  }

  if (query.isError) {
    /*
     * "Không tìm thấy" là một KẾT CỤC, không phải một lỗi để thử lại.
     *
     * Backend trả 404 cho cả "xe không tồn tại" lẫn "xe của gian hàng khác" — cố ý, để không xác
     * nhận sự tồn tại xe của người khác (CLAUDE.md §3). Nên ở đây lối thoát là quay về danh sách
     * chứ không phải một nút "Thử lại" mà lần nào cũng cho cùng một kết quả. Nhánh theo MÃ lỗi có
     * cấu trúc, không theo câu tiếng Việt của backend (ADR 0012) — cùng cách web phân nhánh.
     */
    const notFound = getErrorCode(query.error) === API_ERROR_CODE.NOT_FOUND;

    return (
      <>
        <ManagePageHeader title={t('title')} onBack={back} />
        <Screen scrollReveal={false} edges={['left', 'right', 'bottom']} scroll={false}>
          {notFound ? (
            <ScreenMessage
              icon="car-outline"
              title={t('notFoundTitle')}
              description={t('notFoundBody')}
              actionLabel={t('backToList')}
              onAction={back}
            />
          ) : (
            <ScreenError
              error={query.error}
              title={t('loadErrorTitle')}
              onRetry={() => void query.refetch()}
            />
          )}
        </Screen>
      </>
    );
  }

  return (
    <VehicleDetailBody
      vehicle={query.data}
      vehicleRefetching={query.isRefetching}
      onRefetchVehicle={() => void query.refetch()}
      onBack={back}
      listHref={listHref}
      customerScope={customerScope}
    />
  );
}

/** Figma `24231:107728`: các thẻ nhóm thông tin cách nhau 12. */
const CONTENT_GAP = 12;


function VehicleDetailBody({
  vehicle,
  vehicleRefetching,
  onRefetchVehicle,
  onBack,
  listHref,
  customerScope,
}: {
  vehicle: VehicleDetail;
  /** Hồ sơ xe đang tải lại (kéo-làm-mới tải CẢ hồ sơ lẫn tóm tắt - 25/11/2026). */
  vehicleRefetching: boolean;
  onRefetchVehicle: () => void;
  onBack: () => void;
  listHref: Href;
  customerScope: boolean;
}) {
  const t = useTranslations('Vehicles.overview');
  const tDetail = useTranslations('Vehicles.detail');
  const tActions = useTranslations('Common.actions');
  const router = useRouter();
  const navigateOnce = useNavigateOnce();
  const toast = useAppToast();
  // Lỗi dịch theo MÃ (ADR 0012) — không hiện nguyên câu server.
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();

  const summary = useVehicleSummary(vehicle.id);
  const queryClient = useQueryClient();
  const remove = useDeleteVehicle();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [todoOpen, setTodoOpen] = useState(false);

  /*
   * "Xem đầy đủ" ở thẻ Thông số chính đổi sang mục Thông số TẠI CHỖ và cuộn lên đầu — web đổi tab
   * và đưa focus theo; ở app, nút vừa bấm nằm trong khối vừa bị ẩn nên phải đưa người dùng về đầu.
   */
  const scrollRef = useRef<ScrollView>(null);
  const canDelete = has(PERMISSION.VEHICLE_DELETE);
  const canEdit = has(PERMISSION.VEHICLE_UPDATE);
  const can = useVehicleCapabilities();
  const [view, setView] = useState<OverviewView>(OVERVIEW_VIEW.OVERVIEW);
  const views = overviewViews(can);
  const todoArgs = {
    vehicle,
    summary: summary.data,
    loading: summary.isPending,
    failed: summary.isError,
    customerScope,
  };
  const todoSignal = useTodoSignal(todoArgs);
  // Hai danh sách đơn chỉ có khi người xem có `bookings.view` — backend BỎ HẲN trường, không trả
  // rỗng. Đang tải/tải hỏng thì chưa biết, nên vẫn dựng thẻ để nó tự báo trạng thái (web
  // `Vehicle360Aside`).
  const summaryUnknown = summary.isPending || summary.isError;
  const showSchedule =
    !customerScope && (summary.data?.upcomingBookings !== undefined || summaryUnknown);
  const showActivity = summary.data?.recentBookings !== undefined || summaryUnknown;

  function onDelete() {
    remove.mutate(vehicle.id, {
      onSuccess: () => {
        toast.showSuccess(tDetail('deleted'));
        setConfirmingDelete(false);
        router.replace(listHref);
      },
      onError: (error) => {
        setConfirmingDelete(false);
        toast.showError(errorMessage(error));
      },
    });
  }

  return (
    <>
      <Screen scrollReveal={false}
        edges={['left', 'right', 'bottom']}
        padded={false}
        refreshing={vehicleRefetching || summary.isRefetching}
        onRefresh={() => {
          onRefetchVehicle();
          void summary.refetch();
          // Thẻ "Tự động nhận chuyến" có truy vấn riêng - làm mới cùng lượt kéo.
          void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.serviceSettings(vehicle.id) });
        }}
        scrollRef={scrollRef}
      >
        {/* Figma "Vehicle Image" `24158:107062`: ảnh trọn bề ngang cao 246, ← và ⋮ phủ trên ảnh. */}
        <DetailHero
          vehicle={vehicle}
          onBack={onBack}
          onMenu={() => setMenuOpen(true)}
          todo={todoSignal.visible ? { ...todoSignal, onOpen: () => setTodoOpen(true) } : null}
          menuLabel={t('actionsMenu')}
        />
        <ProfileCard
          vehicle={vehicle}
          summary={summary.data}
          /*
            Bố cục TAB của web (30/09/2026): Tổng quan · Thông số · Tài chính (`can.money`) · Bảo
            dưỡng (`can.maintenance`). Figma "Điều hướng hồ sơ" `24158:107235`: tab gạch chân NẰM
            TRONG khối tóm tắt; tràn ngang thì cuộn (nhãn dài "Bảo dưỡng & số KM").
          */
          tabs={
            views.length > 1 ? (
              <UnderlineTabs
                items={views.map((key) => ({ key, label: t(`tabs.${key}`) }))}
                value={view}
                onChange={setView}
              />
            ) : null
          }
          {...(customerScope
            ? {}
            : {
                performance: (
                  <PerformanceBlock
                    summary={summary.data}
                    loading={summary.isPending}
                    failed={summary.isError}
                  />
                ),
              })}
        />

        {/* Nội dung dưới khối tóm tắt: thẻ nhóm thông tin cách mép 16, cách nhau 12 (Figma `24231:107728`). */}
        <YStack gap={CONTENT_GAP} px={layout.screenX} pt={CONTENT_GAP} pb={layout.section}>
          {view === OVERVIEW_VIEW.SPECS ? <SpecsCard vehicle={vehicle} /> : null}

          {view === OVERVIEW_VIEW.FINANCE && can.money ? (
            /* Tiền của riêng chiếc xe này, THEO KỲ — gác `can.money` (quyền ∧ cờ gói). */
            /*
              Web thay khối này bằng tab Tài chính đầy đủ (#344/#345 - doanh thu theo nguồn, chi phí,
              nghĩa vụ nguồn xe); app mở nó thành MÀN RIÊNG (người dùng chốt 27/11/2026), tab chỉ còn tóm tắt.
            */
            <VehicleFinanceEntry vehicleId={vehicle.id} />
          ) : null}

          {view === OVERVIEW_VIEW.FEATURES ? <FeaturesCard vehicle={vehicle} /> : null}

          {view === OVERVIEW_VIEW.MAINTENANCE && can.maintenance ? (
            /* Đúng web: tab dựng nguyên khu bảo dưỡng của xe (`VehicleMaintenanceWorkspace`). */
            <VehicleMaintenanceWorkspace vehicleId={vehicle.id} />
          ) : null}

          {view === OVERVIEW_VIEW.OVERVIEW ? (
            <>
              {/*
                Thứ tự theo Figma `24158:108502` (25/11/2026): Thông số chính → Thư viện ảnh → Giá thuê &
                Chính sách → Nguồn xe & Tài chính (cổng quản lý) → Lịch thuê sắp tới → Tự động nhận
                chuyến → Hoạt động gần đây.
              */}
              <KeySpecsCard
                vehicle={vehicle}
                summary={summary.data}
                onViewAll={() => {
                  setView(OVERVIEW_VIEW.SPECS);
                  scrollRef.current?.scrollTo({ y: 0, animated: true });
                }}
                onOdometer={
                  can.maintenance
                    ? () => {
                        setView(OVERVIEW_VIEW.MAINTENANCE);
                        scrollRef.current?.scrollTo({ y: 0, animated: true });
                      }
                    : undefined
                }
              />

              <MediaCard vehicle={vehicle} canEdit={canEdit} customerScope={customerScope} />

              <PricingCard vehicle={vehicle} canEdit={canEdit} customerScope={customerScope} />

              {/* Nguồn xe & tài chính là của gian hàng - chủ xe tuyến hoa hồng không có. */}
              {customerScope ? null : <SourceCard vehicle={vehicle} />}

              {showSchedule ? (
                <ScheduleCard
                  bookings={summary.data?.upcomingBookings}
                  loading={summary.isPending}
                  failed={summary.isError}
                />
              ) : null}

              <AutomationCard vehicle={vehicle} canEdit={canEdit} customerScope={customerScope} />

              {showActivity ? (
                <ActivityCard
                  bookings={summary.data?.recentBookings}
                  loading={summary.isPending}
                  failed={summary.isError}
                />
              ) : null}
            </>
          ) : null}

        </YStack>
      </Screen>

      {/* Figma ⋮ "Thao tác" `24486:80205`: Xóa xe · Chỉnh sửa (viền, một hàng), "Xem lịch xe" vàng trải hàng. */}
      <BottomSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={t('actionsMenu')}
        chrome="v2"
        headerDivider
      >
        <ActionSheetButtons
          actions={[
            ...(canDelete
              ? [
                  {
                    key: 'delete',
                    label: t('deleteShort'),
                    icon: 'trash' as const,
                    danger: true,
                    onPress: () => {
                      setMenuOpen(false);
                      setConfirmingDelete(true);
                    },
                  },
                ]
              : []),
            ...(canEdit
              ? [
                  {
                    key: 'edit',
                    label: t('editMobile'),
                    icon: 'edit' as const,
                    onPress: () => {
                      setMenuOpen(false);
                      navigateOnce(vehicleProfileHref(vehicle.id, customerScope));
                    },
                  },
                ]
              : []),
            {
              key: 'schedule',
              label: t('scheduleMobile'),
              icon: 'calendar' as const,
              primary: true,
              onPress: () => {
                setMenuOpen(false);
                navigateOnce(vehicleSchedulePath(vehicle, { back: true, customerScope }));
              },
            },
          ]}
        />
      </BottomSheet>

      <TodoSheet {...todoArgs} open={todoOpen} onClose={() => setTodoOpen(false)} />

      <AlertDialog
        open={confirmingDelete}
        title={t('deleteConfirmTitle', { name: vehicle.name })}
        message={t('deleteConfirmBody')}
        confirmLabel={tActions('delete')}
        cancelLabel={tActions('cancel')}
        destructive
        loading={remove.isPending}
        onConfirm={onDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </>
  );
}

/**
 * Khoảng thuê dạng NGẮN: `06/09 – 09/09` — chỉ NGÀY, không giờ.
 *
 * Bản sao đúng `useShortRange` của `Vehicle360Overview` bên web. Trước đây hai khối "Lịch thuê
 * sắp tới" và "Hoạt động gần đây" gọi `fmt.shortDateTimeRange`, tức có cả giờ
 * (`10:00 · 06/09 → 12:00 · 09/09`): trên bề ngang điện thoại chuỗi đó dài gấp đôi, mỗi mục
 * xuống hai–ba dòng và cả hai thẻ vỡ bố cục. Giờ nhận/trả chính xác thuộc về màn ĐƠN, không
 * thuộc một danh sách tóm tắt.
 */

function useShortRange(): (from: string, to: string) => string {
  const t = useTranslations('Vehicles.overview');
  const pattern = useDatePickerPattern();
  return (from, to) =>
    t('dateRange', {
      from: toAppTz(from).format(pattern.dayMonth),
      to: toAppTz(to).format(pattern.dayMonth),
    });
}


function Muted({ children }: { children: string }) {
  const colors = useColors();
  return (
    <Text col={colors.textMuted} fos={fontSize.bodySm}>
      {children}
    </Text>
  );
}


/** Bốn trạng thái có dải trên thẻ hồ sơ — đúng `needsBanner` của `Vehicle360Overview` bên web. */
const BANNER_STATUSES: ReadonlySet<string> = new Set([
  VEHICLE_PUBLIC_STATUS.REJECTED,
  VEHICLE_PUBLIC_STATUS.NEEDS_REVISION,
  VEHICLE_PUBLIC_STATUS.HIDDEN,
  VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW,
]);

/** `type` của `publicStatusPresentation` (tông `Alert` web) → tông `Callout`. */
const CALLOUT_TONE: Readonly<Record<'success' | 'info' | 'warning' | 'error', CalloutTone>> = {
  success: 'success',
  info: 'info',
  warning: 'warning',
  error: 'danger',
};

/*
 * Số đo Figma "Vehicle Summary" (Chi tiết xe MB `24158:107080`): khối trắng đệm 16 (đáy 0), các
 * hàng cách 12; tên 18/28 + viên nguồn + công tắc nhỏ; mã | biển | KM | loại xe cỡ 12/18; kiểm duyệt
 * (đĩa 20) cách viên vận hành 32; "Hiệu suất lũy kế" nền `bg/gray-50` bo 12 đệm 12, ba cột.
 */
const HERO_IMAGE_HEIGHT = 246;
const HERO_BUTTON_INSET = 12;
const HERO_BUTTON_SIDE = 16;
const HERO_ICON = '#ffffff';
const SUMMARY_PAD = 16;
const SUMMARY_GAP = 12;
const STATUS_GAP = 32;
const REVIEW_GLYPH = 12;
const METRIC_PAD = 12;

/** Biểu tượng của trạng thái kiểm duyệt — cùng bộ với thẻ danh sách và web `REVIEW_ICON`. */
const REVIEW_ICON: Readonly<Record<VehiclePublicStatus, IconName>> = {
  [VEHICLE_PUBLIC_STATUS.DRAFT]: 'create-outline',
  [VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW]: 'time-outline',
  [VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC]: 'checkmark-outline',
  [VEHICLE_PUBLIC_STATUS.NEEDS_REVISION]: 'alert-circle-outline',
  [VEHICLE_PUBLIC_STATUS.REJECTED]: 'close-outline',
  [VEHICLE_PUBLIC_STATUS.HIDDEN]: 'eye-off-outline',
  [VEHICLE_PUBLIC_STATUS.ARCHIVED]: 'ban-outline',
};

/**
 * Ảnh bìa trọn bề ngang + hai nút kính mờ ← và ⋮ (Figma `24175:60983` / `24175:61002`: đệm 8, bo
 * 12). Dải trên cùng là vùng an toàn của màn hình, nền trắng như thanh trạng thái Figma. Bộ sưu tập
 * ảnh đủ góc vẫn ở thẻ "Hình ảnh" bên dưới.
 */
function DetailHero({
  vehicle,
  onBack,
  onMenu,
  menuLabel,
  todo,
}: {
  vehicle: VehicleDetail;
  onBack: () => void;
  onMenu: () => void;
  menuLabel: string;
  /** Nút "!" cạnh ⋮ - cảnh báo xét duyệt + việc cần làm (thay dòng noti, 25/11/2026). Vắng = không có chuyện gì. */
  todo: { count: number; danger: boolean; onOpen: () => void } | null;
}) {
  const t = useTranslations('Vehicles.overview');
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const tActions = useTranslations('Common.actions');
  const slotLabel = useImageSlotLabel();
  // Figma `24158:107062`: MỘT ảnh bìa tĩnh (25/11/2026 - bỏ dải ảnh nhỏ, bộ đếm, vuốt); đủ ảnh ở thẻ "Thư viện ảnh".
  const cover = vehicleGalleryItems(vehicle, slotLabel)[0]?.url ?? vehicle.mainImageUrl ?? null;
  return (
    <YStack bg={colors.surface}>
      <YStack h={insets.top} />
      <YStack h={HERO_IMAGE_HEIGHT} bg={colors.surfaceMuted} ov="hidden">
        <RemoteImage
          uri={cover}
          recyclingKey={vehicle.id}
          accessibilityLabel={vehicle.name}
          fallback={<Ionicons name="car-outline" size={iconSize.lg * 2} color={colors.placeholder} />}
        />
        {/* Figma "Button" `24175:60983`: kính trắng 20% + blur 6, icon "Left 1" / "Menu Kebab" 20. */}
        <XStack pos="absolute" top={HERO_BUTTON_INSET} left={HERO_BUTTON_SIDE}>
          <GlassIconButton label={tActions('back')} onPress={onBack}>
            <LineIcon name="arrow-left" size={iconSize.lg} color={HERO_ICON} />
          </GlassIconButton>
        </XStack>
        <XStack pos="absolute" top={HERO_BUTTON_INSET} right={HERO_BUTTON_SIDE} gap={space.sm}>
          {todo ? (
            <GlassIconButton
              label={t('todo.notice', { count: todo.count })}
              onPress={todo.onOpen}
              badge={todo.count > 0 ? <CountBadge count={todo.count} tone={todo.danger ? 'danger' : 'primary'} size="sm" /> : undefined}
            >
              <Ionicons name="alert-circle-outline" size={iconSize.lg} color={HERO_ICON} />
            </GlassIconButton>
          ) : null}
          <GlassIconButton label={menuLabel} onPress={onMenu}>
            <LineIcon name="menu-kebab" size={iconSize.lg} color={HERO_ICON} />
          </GlassIconButton>
        </XStack>
      </YStack>
    </YStack>
  );
}


function ProfileCard({
  vehicle,
  summary,
  performance,
  tabs,
}: {
  vehicle: VehicleDetail;
  summary: Vehicle360Summary | undefined;
  /** "Hiệu suất lũy kế" nằm TRONG khối xe (web ProfileCard, ledger §3.6 D2) — chỉ cổng quản lý. */
  performance?: ReactNode;
  /** Dải tab gạch chân cuối khối tóm tắt (Figma "Điều hướng hồ sơ"). */
  tabs?: ReactNode;
}) {
  const colors = useColors();
  const t = useTranslations('Vehicles.overview');
  const tLabels = useTranslations('Common.labels');
  const tList = useTranslations('Vehicles.list');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const pillSkin = usePillSkin();

  const operationStatus = vehicle.operationStatus as VehicleOperationStatus;
  const publicStatus = vehicle.publicStatus as VehiclePublicStatus;
  const reviewSkin =
    pillSkin[pillToneOfStatusColor(metaColor(VEHICLE_PUBLIC_STATUS_META, publicStatus))];
  const sourceType = (vehicle.sourceType ?? VEHICLE_SOURCE_TYPE.OWNED) as VehicleSourceType;
  const odometer = summary?.currentOdometerKm != null ? fmt.km(summary.currentOdometerKm) : '-';
  const kinds = [
    domainLabel('vehicleType', vehicle.vehicleType),
    ...vehicle.serviceTypes.map((service) => domainLabel('serviceType', service as ServiceType)),
  ];

  return (
    <YStack bg={colors.surface} pt={SUMMARY_PAD} gap={SUMMARY_GAP}>
      <YStack px={SUMMARY_PAD} gap={SUMMARY_GAP}>
        <YStack gap={space.sm}>
          {/* Tên + viên nguồn xe; công tắc "Trên chợ" ở mép phải (Figma `_Toggle base` 36×20). */}
          <XStack ai="center" jc="space-between" gap={space.sm}>
            <XStack f={1} minWidth={0} ai="center" gap={6}>
              <Text
                flexShrink={1}
                col={colors.text}
                fos={typeScale.heading.fontSize}
                lh={typeScale.heading.lineHeight}
                fow={fontWeight.semibold}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {vehicle.name}
              </Text>
              <YStack px={space.sm} py={2} br={radius.card} bg={colors.background} flexShrink={0}>
                <Text
                  col={colors.textMuted}
                  fos={typeScale.label.fontSize}
                  lh={typeScale.label.lineHeight}
                  fow={fontWeight.medium}
                >
                  {domainLabel('vehicleSourceType', sourceType)}
                </Text>
              </YStack>
            </XStack>
            {/*
              Trục THỨ BA — "chủ xe có muốn bán chiếc này lúc này không" (ADR 0048): chỉ MỘT chỗ
              này trên cả màn. Thẻ xét duyệt phía dưới cố ý không mang công tắc thứ hai.
            */}
            <MarketplaceVisibilityRow vehicle={vehicle} compact />
          </XStack>

          {/*
            Định danh trên MỘT dải, đúng thứ tự web: ID | biển số | KM (+ nguồn); loại xe / dịch vụ
            ở cuối dải. KM chưa có thì "-", không dựng "0 km"; nguồn cho biết số đến từ bàn giao,
            bảo dưỡng hay chỉnh tay.
          */}
          <XStack ai="center" flexWrap="wrap" columnGap={6} rowGap={2}>
            <Text col={colors.text} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
              {vehicle.code}
            </Text>
            <Bar />
            <Text col={colors.text} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
              {vehicle.plateNumber || tLabels('notAvailable')}
            </Text>
            <Bar />
            <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
              {`${t('odometerLabel')} `}
              <Text col={colors.text}>{odometer}</Text>
              {summary?.currentOdometerSource
                ? ` · ${domainLabel('odometerSource', summary.currentOdometerSource)}`
                : ''}
            </Text>
            <Bar />
            <XStack ai="center" gap={space.sm}>
              {kinds.map((kind, index) => (
                <XStack key={`${kind}-${index}`} ai="center" gap={space.sm}>
                  {index > 0 ? <YStack w={6} h={6} br={radius.pill} bg={colors.border} /> : null}
                  <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
                    {kind}
                  </Text>
                </XStack>
              ))}
            </XStack>
          </XStack>
        </YStack>

        {/*
          Hai trục trạng thái ĐỘC LẬP (vận hành ≠ kiểm duyệt): hai chip đứng cạnh nhau, cách 8.
          (Bản Figma "Vehicle Status" để kiểm duyệt là đĩa biểu tượng + chữ trần - đã gộp vào chip.)
        */}
        {/* Figma "Vehicle Status" `24158:107101`: đĩa 20 + chữ trần 12/18, cách viên vận hành (bo tròn, 10/14) 32. */}
        <XStack ai="center" flexWrap="wrap" columnGap={STATUS_GAP} rowGap={space.xs}>
          <XStack ai="center" gap={6}>
            <YStack w={20} h={20} br={radius.pill} ai="center" jc="center" bg={reviewSkin.bg}>
              {publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC ? (
                <CheckGlyph size={REVIEW_GLYPH} color={reviewSkin.fg} />
              ) : (
                /* Figma chỉ vẽ ca "Đã kiểm duyệt"; trạng thái khác giữ glyph trong cùng khuôn. */
                <Ionicons name={REVIEW_ICON[publicStatus]} size={REVIEW_GLYPH} color={reviewSkin.fg} />
              )}
            </YStack>
            <Text col={reviewSkin.fg} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} numberOfLines={1}>
              {tList(`review.${publicStatus}`)}
            </Text>
          </XStack>
          <Pill
            label={tList(`operation.${operationStatus}`)}
            tone={pillToneOfStatusColor(metaColor(VEHICLE_OPERATION_STATUS_META, operationStatus))}
            size="caption"
          />
        </XStack>


        {performance ? (
          <YStack p={METRIC_PAD} br={radius.control} bg={colors.background}>
            {performance}
          </YStack>
        ) : null}
      </YStack>

      {tabs ? <YStack px={SUMMARY_PAD}>{tabs}</YStack> : null}
    </YStack>
  );
}

/** Vạch đứng "|" ngăn các mục của dải định danh (Figma ký tự `text/gray/disable`). */
function Bar() {
  const colors = useColors();
  return <YStack w={1} h={12} bg={colors.border} />;
}

/**
 * Cảnh báo server nói TRÙNG với việc "đưa xe lên chợ" dựng ở client.
 *
 * `VehicleAlertsService` chỉ nhìn thấy `public_status` + ba trường bắt buộc, nên nó cho ra hai
 * dòng chữ không có nút ("Cần xử lý để xe hiển thị trên sàn", "Thiếu thông tin để gửi duyệt").
 * Màn chi tiết có trong tay cả bản ghi xe nên dựng được việc ĐẦY ĐỦ, có checklist và có CTA —
 * giữ cả hai là kể cùng một chuyện hai lần, lần thứ hai cụt hơn.
 *
 * Lọc ở ĐÂY chứ không ở server: thẻ xe ngoài danh sách vẫn cần hai cảnh báo đó, vì ở đó không có
 * chỗ cho một việc có nút.
 */
const PUBLICATION_ALERT_KINDS: readonly string[] = [
  VEHICLE_ALERT_KIND.PUBLIC_ACTION_REQUIRED,
  VEHICLE_ALERT_KIND.MISSING_VEHICLE_INFO,
];

interface TodoArgs {
  vehicle: VehicleDetail;
  summary: Vehicle360Summary | undefined;
  loading: boolean;
  failed: boolean;
  /** Mở từ khu tài khoản - đích "Liên hệ hỗ trợ" là hỗ trợ của khu đó. */
  customerScope: boolean;
}

/**
 * Trạng thái "Việc cần làm" - một chỗ tính cho cả dòng noti lẫn tấm chi tiết (phương án A 25/11/2026).
 * Cảnh báo vận hành đến nguyên vẹn từ server; việc "đưa xe lên chợ" dựng tại chỗ (ADR 0048) THAY hai
 * cảnh báo server nói trùng. Việc lên chợ mức `critical`/`warning` lên ĐẦU, mức `info` xuống CUỐI.
 */
function useVehicleTodo({ vehicle, summary, loading, failed, customerScope }: TodoArgs) {
  const task = vehiclePublicationTask(vehicle);
  const alertView = useVehicleAlertView(customerScope);
  const alerts = alertView(vehicle.id, summary?.alerts ?? []).filter(
    (alert) => !task || !PUBLICATION_ALERT_KINDS.includes(alert.kind),
  );
  const taskLeads = task !== null && task.tone !== VEHICLE_ALERT_SEVERITY.INFO;
  // Gợi ý không phải "việc cần làm" nên không vào số đếm - viên đếm là số việc thật.
  const count = alerts.length + (taskLeads ? 1 : 0);
  const listReady = !loading && !failed && summary !== undefined;
  const tone = topVehicleAlertSeverity([
    ...(listReady ? alerts : []),
    ...(task ? [{ severity: task.tone }] : []),
  ]);
  // Web `Vehicle360Cards`: không có việc thì không có thẻ; đang tải chưa biết thì cũng chưa dựng.
  const hidden = !task && (loading || (listReady && alerts.length === 0));
  return { task, alerts, taskLeads, count, listReady, tone, hidden };
}

/**
 * Nội dung "Việc cần làm" - nằm TRONG tấm mở từ dòng noti (không còn là thẻ trên tab Tổng quan).
 * "Xử lý ngay" dẫn tới việc ĐẦU BẢNG của server và đứng ngay trong việc đó (web 02/10/2026).
 */
function TodoContent({
  todo,
  vehicle,
  loading,
  failed,
  summary,
  customerScope,
  onNavigate,
}: TodoArgs & { todo: ReturnType<typeof useVehicleTodo>; onNavigate: () => void }) {
  const t = useTranslations('Vehicles.overview');
  const navigateOnce = useNavigateOnce();
  const { task, alerts, taskLeads, listReady, tone } = todo;
  const taskItem = task ? (
    <VehiclePublicationTaskItem vehicle={vehicle} task={task} customerScope={customerScope} />
  ) : null;
  const lead = todoLeadAlert({ alerts, listReady, taskLeads });
  const leadTarget = lead?.target ?? null;
  const leadAction = leadTarget ? (
    <Button
      label={t('todo.handleNow')}
      size="sm"
      variant={tone === VEHICLE_ALERT_SEVERITY.CRITICAL ? 'danger' : 'primary'}
      block={false}
      onPress={() => {
        onNavigate();
        navigateOnce(leadTarget);
      }}
    />
  ) : null;
  if (todo.hidden) return null;
  return (
    <YStack gap={space.sm}>
      {taskLeads ? taskItem : null}
      {loading ? (
        <SkeletonText lines={2} />
      ) : failed || !summary ? (
        <Muted>{t('loadFailed')}</Muted>
      ) : (
        <VehicleAlertList alerts={alerts} showEmpty={!task} leadAction={leadAction} />
      )}
      {task && !taskLeads ? taskItem : null}
    </YStack>
  );
}

/**
 * Có chuyện cần báo trên màn không: cảnh báo xét duyệt (bị từ chối / cần bổ sung / ẩn / chờ duyệt -
 * web `needsBanner`) hoặc "Việc cần làm". Nút "!" cạnh ⋮ trên ảnh (25/11/2026) đọc từ đây.
 */
function useTodoSignal(args: TodoArgs): { visible: boolean; count: number; danger: boolean } {
  const todo = useVehicleTodo(args);
  const banner = BANNER_STATUSES.has(args.vehicle.publicStatus)
    ? publicStatusPresentation(args.vehicle.publicStatus as VehiclePublicStatus)
    : null;
  const visible = Boolean(banner) || (!todo.hidden && (todo.count > 0 || todo.task !== null));
  return {
    visible,
    count: todo.count + (banner ? 1 : 0),
    danger: banner?.type === 'error' || todo.tone === VEHICLE_ALERT_SEVERITY.CRITICAL,
  };
}

/** Tấm mở từ dòng noti: dải cảnh báo xét duyệt (nếu có) + danh sách việc cần làm. */
function TodoSheet({ open, onClose, ...args }: TodoArgs & { open: boolean; onClose: () => void }) {
  const t = useTranslations('Vehicles.overview');
  const tPublish = useTranslations('Vehicles.publish');
  const todo = useVehicleTodo(args);
  const { vehicle } = args;
  const banner = BANNER_STATUSES.has(vehicle.publicStatus)
    ? publicStatusPresentation(vehicle.publicStatus as VehiclePublicStatus)
    : null;
  return (
    <BottomSheet open={open} onClose={onClose} title={t('todo.title')} chrome="v2" headerDivider>
      <YStack gap={space.md}>
        {banner ? (
          <Callout tone={CALLOUT_TONE[banner.type]} title={tPublish(`status.${banner.key}.message`)}>
            {banner.useReason && vehicle.latestPublicReview?.reason
              ? vehicle.latestPublicReview.reason
              : tPublish(`status.${banner.key}.description`)}
          </Callout>
        ) : null}
        <TodoContent {...args} todo={todo} onNavigate={onClose} />
      </YStack>
    </BottomSheet>
  );
}

function ScheduleCard({
  bookings,
  loading,
  failed,
}: {
  bookings: VehicleBookingBrief[] | undefined;
  loading: boolean;
  failed: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Vehicles.overview');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  return (
    <GroupCard title={t('schedules.title')}>
      {loading ? (
        <SkeletonText lines={2} />
      ) : failed || bookings === undefined ? (
        <Muted>{t('loadFailed')}</Muted>
      ) : bookings.length === 0 ? (
        <Muted>{t('schedules.empty')}</Muted>
      ) : (
        /*
          Figma "Chuyến thuê sắp tới": vạch dọc 3px vàng bên trái (web: màu theo trạng thái đơn),
          hàng đầu khách (đậm) · tiền + trạng thái (xám, phải), hàng hai khung giờ nhận - trả.
        */
        <YStack gap={CONTENT_GAP}>
          {bookings.map((booking) => (
            <XStack key={booking.id} gap={layout.cardPad}>
              <YStack
                w={3}
                br={radius.pill}
                bg={statusTone(metaColor(BOOKING_STATUS_META, booking.status), colors).fg}
              />
              <YStack f={1} minWidth={0} gap={6}>
                <XStack jc="space-between" gap={space.sm} ai="flex-start">
                  <Text
                    flexShrink={1}
                    col={colors.text}
                    fos={typeScale.body.fontSize}
                    lh={typeScale.body.lineHeight}
                    fow={fontWeight.semibold}
                    numberOfLines={1}
                  >
                    {booking.customerName}
                  </Text>
                  <Text
                    flexShrink={1}
                    col={colors.placeholder}
                    fos={typeScale.body.fontSize}
                    lh={typeScale.body.lineHeight}
                    ta="right"
                    numberOfLines={1}
                  >
                    {t('schedules.subApp', {
                      amount: fmt.money(booking.totalAmount),
                      status: domainLabel('bookingStatus', booking.status),
                    })}
                  </Text>
                </XStack>
                <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
                  {`${fmt.shortDateTimeRange(booking.pickupAt, booking.returnAt)}`}
                </Text>
              </YStack>
            </XStack>
          ))}
        </YStack>
      )}
    </GroupCard>
  );
}

/**
 * Hiệu suất lũy kế — CHỈ chuyện vận hành (Figma "Hiệu suất lũy kế" `24158:107200`): ba cột chia đều
 * — số chuyến · đơn đang chạy · điểm đánh giá, số 14/20 đậm trên nhãn 12/18.
 *
 * Doanh thu cố ý không nằm ở đây: web đã tách tiền sang khối theo kỳ, và đặt một con số luỹ kế
 * cạnh một con số theo kỳ trên cùng màn là cách chắc chắn để người đọc lấy nhầm số.
 */
function PerformanceBlock({
  summary,
  loading,
  failed,
}: {
  summary: Vehicle360Summary | undefined;
  loading: boolean;
  failed: boolean;
}) {
  const t = useTranslations('Vehicles.overview');
  const fmt = useAppFormat();
  const stats = summary?.stats;
  // Chưa ai chấm thì KHÔNG dựng cột — "0/5" là một lời chê không có thật.
  const rated = stats && stats.ratingCount > 0 && stats.ratingAvg;

  if (loading) return <SkeletonText lines={2} />;
  if (failed || !stats) return <Muted>{t('loadFailed')}</Muted>;
  return (
    /* Các ô chia ĐỀU bề ngang - 2 ô 50/50, 3 ô 33/33/33 (người dùng chốt 25/11/2026). */
    <XStack ai="flex-start" gap={space.sm} accessibilityLabel={t('performance.title')}>
      <StatTile
        label={t('performance.rentals')}
        value={t('performance.tripCount', { count: stats.completedBookings })}
        align="start"
      />
      <StatTile
        label={t('performance.active')}
        value={t('performance.activeCount', { count: stats.activeBookings })}
      />
      {/* Ô sao LUÔN có (25/11/2026): chưa ai chấm thì "-" + "Chưa có đánh giá", không bao giờ "0/5". */}
      <StatTile
        label={
          rated
            ? t('performance.ratingCountApp', { count: stats.ratingCount })
            : t('performance.noRatingApp')
        }
        value={rated ? t('performance.ratingScore', { rating: fmt.rating(Number(stats.ratingAvg)) }) : '-'}
        star
        align="end"
      />
    </XStack>
  );
}

/** Một cột số: số 14/20 đậm ở trên (sao vàng cạnh điểm), nhãn 12/18 `text/gray/low` ở dưới, căn giữa. */
function StatTile({
  label,
  value,
  star = false,
  align = 'center',
}: {
  label: string;
  value: string;
  star?: boolean;
  /** Ô đầu sát trái, ô cuối sát phải (người dùng chốt 26/11/2026). */
  align?: 'start' | 'center' | 'end';
}) {
  const colors = useColors();
  const ai = align === 'start' ? 'flex-start' : align === 'end' ? 'flex-end' : 'center';
  return (
    <YStack f={1} flexBasis={0} gap={4} ai={ai} minWidth={0}>
      <XStack ai="center" gap={4}>
        {star ? <LineIcon name="star" size={iconSize.lg} color={market.star} /> : null}
        <Text
          col={colors.text}
          fos={typeScale.body.fontSize}
          lh={typeScale.body.lineHeight}
          fow={fontWeight.semibold}
          numberOfLines={1}
        >
          {value}
        </Text>
      </XStack>
      <Text
        col={colors.placeholder}
        fos={typeScale.label.fontSize}
        lh={typeScale.label.lineHeight}
        numberOfLines={1}
        ta={align === 'start' ? 'left' : align === 'end' ? 'right' : 'center'}
      >
        {label}
      </Text>
    </YStack>
  );
}

/**
 * Thẻ "Nhóm thông tin" của Chi tiết xe (Figma `24158:108333`): nền trắng, viền `stroke/gray-low200`,
 * bo 16, đệm 16, các khối cách 12; tiêu đề 16/24 đậm, nút sửa (bút) ở mép phải.
 */
function GroupCard({
  title,
  onEdit,
  editLabel,
  action,
  children,
}: {
  title?: string;
  onEdit?: () => void;
  /** Lối tắt ở góc tiêu đề ("Xem đầy đủ →", "+ Thêm ảnh") - thay cho bút sửa. */
  action?: ReactNode;
  editLabel?: string;
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <Card padded={false} lift="flat">
      <YStack p={layout.cardPad} gap={CONTENT_GAP}>
        {title ? (
          <XStack ai="center" jc="space-between" gap={space.sm}>
            <Text
              f={1}
              minWidth={0}
              col={colors.text}
              fos={typeScale.title.fontSize}
              lh={typeScale.title.lineHeight}
              fow={fontWeight.semibold}
              numberOfLines={1}
            >
              {title}
            </Text>
            {action ?? null}
            {!action && onEdit ? (
              <Pressable
                onPress={onEdit}
                hitSlop={space.sm}
                accessibilityRole="button"
                accessibilityLabel={editLabel ?? title}
              >
                <LineIcon name="edit" size={iconSize.lg} color={colors.brandLink} />
              </Pressable>
            ) : null}
          </XStack>
        ) : null}
        {children}
      </YStack>
    </Card>
  );
}

/**
 * TỐI ƯU NHẬN CHUYẾN — Figma "Tự động đồng ý nhận chuyến" `24158:108412`: MỘT thẻ, mỗi dịch vụ một
 * hàng (nhãn 14/20 đậm vừa + mô tả 14/20 + công tắc 44×24). Công tắc LƯU NGAY như web; điều kiện
 * chi tiết ở "Cấu hình". Ẩn khi xe không phục vụ dịch vụ nào CÓ thiết lập riêng: thuê dài hạn luôn do
 * gian hàng chốt lịch tay (ADR 0011).
 */
function AutomationCard({
  vehicle,
  canEdit,
  customerScope,
}: {
  vehicle: VehicleDetail;
  canEdit: boolean;
  customerScope: boolean;
}) {
  const t = useTranslations('Vehicles.overview');
  const navigateOnce = useNavigateOnce();

  const domainLabel = useDomainLabel();
  // Chỉ tự lái có "Nhận chuyến tự động" - có tài xế luôn duyệt tay (web `Vehicle360Cards`, PR #338).
  const services = VEHICLE_SERVICE_SETTING_SERVICES.filter(
    (service) => service === SERVICE_TYPE.SELF_DRIVE && vehicle.serviceTypes.includes(service),
  );
  const settings = useVehicleServiceSettings(vehicle.id, services.length > 0);
  if (services.length === 0) return null;

  return (
    <GroupCard
      {...(canEdit
        ? {
            onEdit: () => navigateOnce(vehicleOptimizationHref(vehicle, customerScope)),
            editLabel: t('automation.editLink'),
          }
        : {})}
    >
      {settings.isLoading ? (
        <MiniRowsSkeleton rows={services.length} />
      ) : settings.isError || !settings.data ? (
        <Muted>{t('loadFailed')}</Muted>
      ) : (
        services.map((service) => {
          const setting = settings.data.find((item) => item.serviceType === service);
          return setting ? (
            <AutoAcceptRow
              key={service}
              vehicleId={vehicle.id}
              setting={setting}
              canEdit={canEdit}
              label={
                services.length > 1
                  ? t('automation.toggleFor', { service: domainLabel('serviceType', service) })
                  : t('automation.toggle')
              }
            />
          ) : null;
        })
      )}
    </GroupCard>
  );
}

function AutoAcceptRow({
  vehicleId,
  setting,
  canEdit,
  label,
}: {
  vehicleId: string;
  setting: VehicleServiceSetting;
  canEdit: boolean;
  label: string;
}) {
  const colors = useColors();
  const t = useTranslations('Vehicles.overview');
  const toggle = useAutoAcceptToggle({ vehicleId, setting, canEdit });
  const [infoOpen, setInfoOpen] = useState(false);
  return (
    <XStack ai="center" gap={20}>
      <YStack f={1} minWidth={0} gap={2}>
        {/* Figma `24158:108493`: nhãn + ⓘ 14 (`text/gray/disable`) cách 4; chạm ⓘ mở lời giải thích. */}
        <XStack ai="flex-start" gap={4}>
          <Text
            flexShrink={1}
            col={colors.text}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
            fow={fontWeight.medium}
          >
            {label}
          </Text>
          <Pressable
            onPress={() => setInfoOpen(true)}
            hitSlop={space.sm}
            accessibilityRole="button"
            accessibilityLabel={t('automation.title')}
          >
            <LineIcon name="info-circle" size={14} color={colors.borderInput} />
          </Pressable>
        </XStack>
        <BottomSheet open={infoOpen} onClose={() => setInfoOpen(false)} title={label} chrome="v2" headerDivider>
          <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
            {t('automation.hint')}
          </Text>
        </BottomSheet>
        {/* Có tài xế chưa đủ năng lực: nói lý do thay cho công tắc mờ câm — như tooltip của web. */}
        <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
          {toggle.blocked ? t('automation.driverRequired') : t('automation.toggleHintApp')}
        </Text>
      </YStack>
      <SettingSwitch
        label={label}
        checked={toggle.enabled}
        disabled={toggle.disabled}
        onToggle={() => toggle.change(!toggle.enabled)}
      />
    </XStack>
  );
}

/** Công tắc của thẻ chi tiết xe - Figma `_Toggle base` 44×24 (cỡ md). */
function SettingSwitch({
  label,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <ToggleSwitch
      value={checked}
      onValueChange={onToggle}
      disabled={disabled}
      accessibilityLabel={label}
    />
  );
}

/** Một ô mức giá (Figma "Mức giá"): nền `bg/primary-25` (vàng nhạt) hoặc `bg/gray-50`, bo 10, đệm 6/16. */
function PriceTile({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  const colors = useColors();
  return (
    <YStack
      f={1}
      minWidth={0}
      ai="center"
      gap={6}
      py={6}
      px={layout.cardPad}
      br={PRICE_TILE_RADIUS}
      bg={muted ? colors.background : colors.primarySubtle}
    >
      <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} numberOfLines={1}>
        {label}
      </Text>
      <Text
        col={colors.brandLink}
        fos={typeScale.body.fontSize}
        lh={typeScale.body.lineHeight}
        fow={fontWeight.semibold}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {value}
      </Text>
    </YStack>
  );
}

/** Figma "Mức giá" bo `10`. */
const PRICE_TILE_RADIUS = 10;

function PricingCard({
  vehicle,
  canEdit,
  customerScope,
}: {
  vehicle: VehicleDetail;
  canEdit: boolean;
  customerScope: boolean;
}) {
  const t = useTranslations('Vehicles.overview');
  const tLabels = useTranslations('Common.labels');
  const colors = useColors();
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();

  const empty = tLabels('emptyValue');

  return (
    <GroupCard
      title={t('pricing.title')}
      {...(canEdit
        ? {
            action: (
              <CardLink
                label={t('editMobile')}
                accessibilityLabel={t('pricing.editLink')}
                icon="edit"
                iconFirst
                onPress={() => navigateOnce(vehiclePricingHref(vehicle.id, customerScope))}
              />
            ),
          }
        : {})}
    >
      {/* Figma "Giá thuê theo ngày": ba ô cạnh nhau cách 12 - ngày thường · cuối tuần · theo giờ. */}
      <XStack gap={CONTENT_GAP}>
        <PriceTile
          label={t('pricing.weekday')}
          value={vehicle.weekdayPrice ? fmt.money(vehicle.weekdayPrice) : empty}
        />
        <PriceTile
          label={t('pricing.weekend')}
          value={vehicle.weekendPrice ? fmt.money(vehicle.weekendPrice) : empty}
        />
        <PriceTile
          muted
          label={t('pricing.hourly')}
          value={vehicle.hourlyPrice ? fmt.money(vehicle.hourlyPrice) : empty}
        />
      </XStack>
      {/* Figma "Thông tin": nhãn 14/20 `text/gray/low` trái, dấu ✓ + "Có hỗ trợ" phải. */}
      <XStack ai="center" jc="space-between" gap={space.sm}>
        <Text col={colors.placeholder} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
          {t('pricing.delivery')}
        </Text>
        <XStack ai="center" gap={space.sm}>
          {vehicle.deliveryEnabled ? (
            <YStack w={20} h={20} br={radius.pill} bg={colors.successSurface} ai="center" jc="center">
              <CheckGlyph size={12} color={colors.success} />
            </YStack>
          ) : null}
          <Text
            col={colors.text}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
            fow={fontWeight.medium}
          >
            {vehicle.deliveryEnabled ? t('pricing.deliveryOn') : t('pricing.deliveryOff')}
          </Text>
        </XStack>
      </XStack>
    </GroupCard>
  );
}

/** Lối tắt ở góc tiêu đề thẻ (Figma "Button" của "Nhóm thông tin"): chữ 14/20 đậm `text/brand/primary-2` + icon 20, khe 6. */
function CardLink({
  label,
  icon,
  iconFirst = false,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  icon: LineIconName;
  iconFirst?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const colors = useColors();
  const glyph = <LineIcon name={icon} size={iconSize.lg} color={colors.brandLink} />;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={space.sm}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
    >
      <XStack ai="center" gap={6}>
        {iconFirst ? glyph : null}
        <Text
          col={colors.brandLink}
          fos={typeScale.body.fontSize}
          lh={typeScale.body.lineHeight}
          fow={fontWeight.semibold}
          numberOfLines={1}
        >
          {label}
        </Text>
        {iconFirst ? null : glyph}
      </XStack>
    </Pressable>
  );
}

/** Một dòng nhãn ↔ giá trị của "Nhóm thông tin" (Figma "Thông tin"): nhãn 14/20 `text/gray/low`, giá trị 14/20 `text/gray/high`. */
function InfoLine({
  label,
  strong = false,
  children,
}: {
  label: string;
  /** Giá trị in đậm (Nguồn xe & Tài chính: ngày mua, giá trị xe - người dùng chốt 26/11/2026). */
  strong?: boolean;
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <XStack ai="center" jc="space-between" gap={space.sm}>
      <Text col={colors.placeholder} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} numberOfLines={1}>
        {label}
      </Text>
      {typeof children === 'string' ? (
        <Text
          flexShrink={1}
          ta="right"
          col={colors.text}
          fos={typeScale.body.fontSize}
          lh={typeScale.body.lineHeight}
          fow={strong ? fontWeight.semibold : fontWeight.regular}
          numberOfLines={1}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </XStack>
  );
}

/** Lát cắt "Thông số chính", theo thứ tự hiện - web `KEY_SPECS`. Ô không áp dụng cho xe tự vắng. */
const KEY_SPECS: readonly VehicleSpecKey[] = ['year', 'seats', 'motorbikeCategory', 'fuel', 'transmission', 'color'];

/** Figma "Thông số chính" `24158:108333`: lưới 3 cột ô `bg/gray-50` bo 10 khe 8, nhãn 12/18, giá trị 14/20 đậm. */
const SPEC_TILE_GAP = 8;
const SPEC_TILE_RADIUS = 10;

/**
 * Thông số chính (tab Tổng quan) - những thông số khách hỏi đầu tiên; bản ĐẦY ĐỦ ở tab Thông số,
 * "Xem đầy đủ" đổi tab tại chỗ. Ô áp dụng mà chưa điền thì "-", để chủ xe thấy còn phải điền gì.
 */
function KeySpecsCard({
  vehicle,
  summary,
  onViewAll,
  onOdometer,
}: {
  vehicle: VehicleDetail;
  summary: Vehicle360Summary | undefined;
  onViewAll: () => void;
  /** "Nhập dữ liệu" → tab Bảo dưỡng & số KM; vắng khi người xem không có module bảo dưỡng. */
  onOdometer?: (() => void) | undefined;
}) {
  const colors = useColors();
  const t = useTranslations('Vehicles.overview');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const specs = useVehicleSpecItems(vehicle);
  const [gridWidth, setGridWidth] = useState(0);

  const empty = tLabels('emptyValue');
  const byKey = new Map(specs.map((item) => [item.key, item]));
  // Hãng + mẫu gộp một ô: "Toyota Vios" là cách người ta gọi chiếc xe, không phải hai thông số.
  const brandModel = [byKey.get('brand')?.value, byKey.get('model')?.value].filter(Boolean).join(' ');
  const tiles = [
    { key: 'brand-model', label: t('keySpecs.brandModel'), value: brandModel || empty },
    ...KEY_SPECS.flatMap((key) => {
      const item = byKey.get(key);
      if (!item) return [];
      // Ô hẹp 1/3: "Số tự động (AT)" ghi gọn "Tự động" (người dùng chốt 26/11/2026).
      const value =
        key === 'transmission' && vehicle.transmission === TRANSMISSION_TYPE.AUTOMATIC
          ? t('keySpecs.transmissionAutoApp')
          : item.value;
      return [{ key, label: item.label, value: value ?? empty }];
    }),
  ];
  const tile = Math.floor((gridWidth - SPEC_TILE_GAP * 2) / 3);

  return (
    <GroupCard
      title={t('keySpecs.title')}
      action={
        <CardLink
          label={t('keySpecs.viewAll')}
          accessibilityLabel={t('keySpecs.viewAllLabel')}
          icon="arrow-right"
          onPress={onViewAll}
        />
      }
    >
      <XStack flexWrap="wrap" gap={SPEC_TILE_GAP} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
        {tile > 0
          ? tiles.map((item) => (
              <YStack
                key={item.key}
                w={tile}
                ai="center"
                gap={6}
                py={6}
                px={space.sm}
                br={SPEC_TILE_RADIUS}
                bg={colors.background}
              >
                {/* Figma một dòng: chữ dài cắt "…", giữ nguyên cỡ chữ. */}
                <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} numberOfLines={1}>
                  {item.label}
                </Text>
                <Text
                  col={colors.text}
                  fos={typeScale.body.fontSize}
                  lh={typeScale.body.lineHeight}
                  fow={fontWeight.semibold}
                  numberOfLines={1}
                >
                  {item.value}
                </Text>
              </YStack>
            ))
          : null}
      </XStack>
      {/* Figma "Số KM hiện tại": nhãn + số (khe 10) bên trái, "Nhập dữ liệu →" vàng bên phải. */}
      <XStack ai="center" jc="space-between" gap={space.sm}>
        <XStack ai="center" gap={10} flexShrink={1}>
          <Text col={colors.placeholder} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
            {t('keySpecs.odometer')}
          </Text>
          <Text col={colors.text} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.medium}>
            {summary ? fmt.km(summary.currentOdometerKm ?? null) : empty}
          </Text>
        </XStack>
        {onOdometer ? (
          <Pressable onPress={onOdometer} hitSlop={space.sm} accessibilityRole="link">
            <Text col={colors.brandLink} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.medium}>
              {t('keySpecs.odometerInputApp')}
            </Text>
          </Pressable>
        ) : null}
      </XStack>
    </GroupCard>
  );
}

/** Figma "Thông số kỹ thuật" `24612:141569`: bảng hai cột viền `stroke/gray-low200` bo 12, nhãn nền `bg/gray-50`, ô đệm 12, chữ 14/20. */
function SpecsCard({ vehicle }: { vehicle: VehicleDetail }) {
  const colors = useColors();
  const t = useTranslations('Vehicles.overview');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  // Danh sách theo ma trận `vehicleFieldPolicy` - ô không áp dụng cho loại xe này VẮNG hẳn.
  const specs = useVehicleSpecItems(vehicle);
  const empty = tLabels('emptyValue');
  const rows = [
    ...specs.map((item) => ({ key: item.key, label: item.label, value: item.value ?? empty })),
    { key: 'updated', label: t('specs.updatedAt'), value: fmt.dateTime(vehicle.updatedAt) },
    { key: 'created', label: t('specs.createdAt'), value: fmt.dateTime(vehicle.createdAt) },
  ];
  return (
    <YStack br={radius.control} bw={1} bc={colors.border} bg={colors.surface} ov="hidden" accessibilityLabel={t('specs.title')}>
      {rows.map((row, index) => (
        <XStack key={row.key} btw={index === 0 ? 0 : 1} bc={colors.border}>
          <YStack f={1} flexBasis={0} p={12} bg={colors.background} brw={1} bc={colors.border}>
            <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
              {row.label}
            </Text>
          </YStack>
          <YStack f={1} flexBasis={0} p={12}>
            <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
              {row.value}
            </Text>
          </YStack>
        </XStack>
      ))}
    </YStack>
  );
}

/**
 * Tab "Tiện ích xe" - Figma "Tiện ích trên xe" `24612:143174`: một cột, dấu ✓ xanh 12 + chữ 14/20
 * `text/gray/medium`, dòng cách 12. Rỗng thì nói rõ. "Mô tả xe" giữ ở thẻ riêng bên dưới.
 */
function FeaturesCard({ vehicle }: { vehicle: VehicleDetail }) {
  const colors = useColors();
  const t = useTranslations('Vehicles.overview');
  const { featureLabel } = useCatalogLabels();
  return (
    <YStack gap={CONTENT_GAP}>
      <GroupCard title={t('features.title')}>
        {vehicle.features.length > 0 ? (
          <YStack gap={12}>
            {vehicle.features.map((key) => (
              <XStack key={key} ai="center" gap={space.sm}>
                <CheckGlyph size={12} color={colors.success} />
                <Text f={1} col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
                  {featureLabel(key)}
                </Text>
              </XStack>
            ))}
          </YStack>
        ) : (
          <Muted>{t('features.empty')}</Muted>
        )}
      </GroupCard>
      <GroupCard title={t('features.descriptionTitle')}>
        <Text col={vehicle.description ? colors.textMuted : colors.placeholder} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
          {vehicle.description || t('features.descriptionEmpty')}
        </Text>
      </GroupCard>
    </YStack>
  );
}

/**
 * Nguồn xe & Tài chính - Figma `24612:142363`. Con số chỉ tải khi người xem có `can.source`;
 * người không có quyền chỉ thấy HÌNH THỨC. Con số đổi theo hình thức, đúng `SourceCard` web.
 */
function SourceCard({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations('Vehicles.overview');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const canViewFinance = useVehicleCapabilities().source;
  const navigateOnce = useNavigateOnce();
  const source = useVehicleSource(vehicle.id, canViewFinance);
  const detail = source.data?.detail ?? null;
  const sourceType = (vehicle.sourceType ?? VEHICLE_SOURCE_TYPE.OWNED) as VehicleSourceType;
  const goSource = () => navigateOnce(ROUTES.manage.vehicleEditTab(vehicle.id, VEHICLE_EDIT_TAB.SOURCE));

  const rows: { key: string; label: string; value: string }[] = [];
  const push = (key: string, label: string, value: string | null | undefined) => {
    if (value) rows.push({ key, label, value });
  };
  if (detail) {
    switch (sourceType) {
      case VEHICLE_SOURCE_TYPE.FINANCED:
        push('bank', t('source.bank'), detail.bankName);
        push('monthly', t('source.monthlyPayment'), detail.monthlyTotal ? fmt.money(detail.monthlyTotal) : null);
        break;
      case VEHICLE_SOURCE_TYPE.RENTED:
        push('owner', t('source.owner'), detail.ownerName);
        push('rent', t('source.rent'), detail.monthlyRent ? fmt.money(detail.monthlyRent) : null);
        break;
      case VEHICLE_SOURCE_TYPE.PARTNERSHIP:
        push('owner', t('source.owner'), detail.ownerName);
        push(
          'share',
          t('source.share'),
          detail.commissionPercent ? t('source.sharePercent', { percent: detail.commissionPercent }) : null,
        );
        break;
      default:
        push('purchaseDate', t('source.purchaseDate'), detail.purchaseDate ? fmt.date(detail.purchaseDate) : null);
        push('purchasePrice', t('source.purchasePrice'), detail.purchasePrice ? fmt.money(detail.purchasePrice) : null);
    }
  }
  // Có hồ sơ ⇒ "Xem hồ sơ →"; chưa khai ⇒ lời mời "Bổ sung" - hai nhánh của web.
  const showLinks = canViewFinance && !source.isPending && (detail || !source.isError);

  return (
    <GroupCard
      title={t('source.title')}
      {...(showLinks
        ? {
            action: (
              <CardLink
                label={detail ? t('source.viewLink') : t('source.addLink')}
                icon={detail ? 'arrow-right' : 'add'}
                iconFirst={!detail}
                onPress={goSource}
              />
            ),
          }
        : {})}
    >
      <InfoLine label={t('source.kind')}>
        <Pill label={domainLabel('vehicleSourceType', sourceType)} tone="success" />
      </InfoLine>
      {source.isPending && canViewFinance ? (
        <SkeletonText lines={2} />
      ) : (
        rows.map((row) => (
          <InfoLine key={row.key} label={row.label} strong>
            {row.value}
          </InfoLine>
        ))
      )}
      {showLinks && !detail ? <Muted>{t('source.missing')}</Muted> : null}
    </GroupCard>
  );
}

/** Figma "Thư viện ảnh" `24612:142219`: lưới 3 cột ô 100×64 bo 12, khe 12. */
const MEDIA_TILE_RATIO = 64 / 100;
const MEDIA_GAP = 12;

/**
 * Thư viện ảnh (tab Tổng quan) - tối đa 6 ô, ô thứ 6 đếm phần dư ("+N", chạm mở đủ lưới). Chạm ảnh
 * xem toàn màn. "Chỉnh sửa" (✎) dẫn tới mục ảnh của màn sửa xe - chỉ khi người xem sửa được.
 */
function MediaCard({
  vehicle,
  canEdit,
  customerScope,
}: {
  vehicle: VehicleDetail;
  canEdit: boolean;
  customerScope: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Vehicles.overview');
  const tStates = useTranslations('Common.states');
  const navigateOnce = useNavigateOnce();
  const slotLabel = useImageSlotLabel();
  const [gridWidth, setGridWidth] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const items = vehicleGalleryItems(vehicle, slotLabel);
  const overflow = items.length - GALLERY_VISIBLE;
  const visible = expanded ? items : items.slice(0, GALLERY_VISIBLE);
  const manageHref = canEdit ? vehicleEditPartHref(vehicle.id, VEHICLE_EDIT_TAB.MEDIA, customerScope) : null;
  const tileW = Math.floor((gridWidth - MEDIA_GAP * (GALLERY_COLUMNS - 1)) / GALLERY_COLUMNS);
  const tileH = Math.round(tileW * MEDIA_TILE_RATIO);

  return (
    <GroupCard
      title={t('media.title')}
      {...(manageHref
        ? {
            // Figma `24612:146742`: "✎ Chỉnh sửa" mở mục ảnh của màn sửa xe.
            action: <CardLink label={t('editMobile')} icon="edit" iconFirst onPress={() => navigateOnce(manageHref)} />,
          }
        : {})}
    >
      {items.length === 0 ? (
        <Muted>{t('media.empty')}</Muted>
      ) : (
        <XStack
          flexWrap="wrap"
          gap={MEDIA_GAP}
          accessibilityLabel={t('media.title')}
          onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}
        >
          {tileW > 0 &&
            visible.map((item, index) => {
              const isMore = !expanded && index === GALLERY_VISIBLE - 1 && overflow > 0;
              return (
                <Pressable
                  key={`${index}-${item.url}`}
                  onPress={() => (isMore ? setExpanded(true) : setPreview(item.url))}
                  accessibilityRole="imagebutton"
                  accessibilityLabel={isMore ? t('media.more', { count: overflow }) : (item.label ?? t('media.title'))}
                >
                  <YStack w={tileW} h={tileH} br={radius.control} overflow="hidden" bg={colors.surfaceMuted}>
                    <Image
                      source={{ uri: item.url }}
                      style={StyleSheet.absoluteFill}
                      cachePolicy="memory-disk"
                      recyclingKey={item.url}
                      accessible={false}
                    />
                    {isMore ? (
                      <YStack pos="absolute" top={0} bottom={0} left={0} right={0} ai="center" jc="center" bg={colors.overlay}>
                        <Text col={colors.textInverse} fos={fontSize.bodyLg} fow={fontWeight.bold}>
                          {t('media.more', { count: overflow })}
                        </Text>
                      </YStack>
                    ) : null}
                  </YStack>
                </Pressable>
              );
            })}
        </XStack>
      )}
      <PhotoViewer url={preview} unavailableLabel={tStates('imageUnavailable')} onClose={() => setPreview(null)} />
    </GroupCard>
  );
}

/**
 * Hoạt động gần đây - Figma `24612:142748`: mỗi đơn một mục dòng thời gian - chấm 10 màu trạng thái ·
 * khách (14 đậm) · số tiền (14 đậm `text/gray/medium`); vạch dọc 1px nối xuống; "Đơn X · khoảng ngày",
 * mốc thời gian (xám) + viên trạng thái bo 6. Mục cách nhau 20.
 */
function ActivityCard({
  bookings,
  loading,
  failed,
}: {
  bookings: VehicleBookingBrief[] | undefined;
  loading: boolean;
  failed: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Vehicles.overview');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const shortRange = useShortRange();
  const pillSkin = usePillSkin();

  return (
    <GroupCard title={t('activity.title')}>
      {loading ? (
        <SkeletonText lines={3} />
      ) : failed || bookings === undefined ? (
        <Muted>{t('loadFailed')}</Muted>
      ) : bookings.length === 0 ? (
        <Muted>{t('activity.empty')}</Muted>
      ) : (
        <YStack gap={20}>
          {bookings.map((booking) => {
            /*
              Figma `24612:142773`: trạng thái chờ (vd "Chờ giao xe") tô CAM `status/orange-*` - tông
              `brand` của Pill ra vàng đậm nhìn như nâu (người dùng báo 26/11/2026).
            */
            const statusTone = pillToneOfStatusColor(metaColor(BOOKING_STATUS_META, booking.status));
            const tone = statusTone === 'brand' || statusTone === 'warning' ? 'orange' : statusTone;
            return (
              <YStack key={booking.id} gap={6}>
                <XStack ai="center" gap={space.sm}>
                  <YStack w={10} h={10} br={radius.pill} bg={pillSkin[tone].fg} />
                  <Text f={1} minWidth={0} col={colors.text} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.semibold} numberOfLines={1}>
                    {booking.customerName}
                  </Text>
                  <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.semibold}>
                    {fmt.money(booking.totalAmount)}
                  </Text>
                </XStack>
                <XStack gap={6}>
                  <YStack w={10} ai="center">
                    <YStack w={1} f={1} bg={colors.border} />
                  </YStack>
                  <YStack f={1} minWidth={0} gap={6}>
                    <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
                      {t('activity.bookingRangeApp', {
                        code: booking.code,
                        range: shortRange(booking.pickupAt, booking.returnAt),
                      })}
                    </Text>
                    <XStack ai="center" jc="space-between" gap={space.sm}>
                      <Text col={colors.placeholder} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
                        {fmt.shortDateTime(booking.updatedAt)}
                      </Text>
                      <Pill label={domainLabel('bookingStatus', booking.status)} tone={tone} shape="tag" />
                    </XStack>
                  </YStack>
                </XStack>
              </YStack>
            );
          })}
        </YStack>
      )}
    </GroupCard>
  );
}
