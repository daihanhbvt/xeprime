import { useRef, useState, type ReactNode } from 'react';
import { Ionicons } from '@/components/icons/Ionicons';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Switch } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  API_ERROR_CODE,
  PERMISSION,
  STATUS_COLOR,
  BOOKING_STATUS_META,
  BOOKING_STATUS,
  SERVICE_TYPE,
  VEHICLE_ALERT_KIND,
  VEHICLE_ALERT_SEVERITY,
  topVehicleAlertSeverity,
  type VehicleAlertSeverity,
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
import { metaColor, metaLabel } from '@/lib/status-meta';
import { getErrorCode } from '@/lib/api-client';
import { ManagePageHeader } from '@/features/shell/ManagePageHeader';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckGlyph } from '@/components/icons/CheckGlyph';
import { LineIcon } from '@/components/icons/LineIcon';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Pill, pillToneOfStatusColor, usePillSkin } from '@/components/ui/Pill';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { UnderlineTabs } from '@/components/ui/UnderlineTabs';
import { Screen } from '@/components/layout/Screen';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { BlockLink } from '@/components/ui/BlockTitle';
import { SectionHeader } from '@/components/ui/CardTitle';
import { FeatureItem } from '@/features/marketplace/components/FeatureChip';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { CountBadge } from '@/components/ui/CountBadge';
import { DataRow, Divider } from '@/components/ui/DataRow';
import { PhotoViewer } from '@/components/ui/PhotoViewer';
import { MiniRowsSkeleton, Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { StatusBadge, statusTone } from '@/components/ui/StatusBadge';
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
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB } from '@/navigation/vehicle-edit-tab';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { layout } from '@/theme/layout';
import { themed, useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space, typeScale, type AppColors } from '@/theme/tokens';
import { FinanceEntityPanel } from '@/features/finance/components/FinanceEntityPanel';
import { VehicleAlertList } from './components/VehicleAlertList';
import { publicStatusPresentation, todoLeadAlert, vehiclePublicationTask } from './publication';
import { Callout, type CalloutTone } from '@/components/ui/Callout';
import { MarketplaceVisibilityRow } from './components/MarketplaceVisibilityRow';
import { VehiclePublicationTaskItem } from './components/VehiclePublicationTaskItem';
import { VehicleMaintenanceWorkspace } from '@/features/vehicle-maintenance/VehicleMaintenanceScreen';
import { vehicleSchedulePath } from './calendar-link';
import { vehicleGalleryItems } from './display-media';
import { VehicleGallery } from '@/components/vehicle/VehicleGallery';
import {
  useImageSlotLabel,
  useVehicleSpecItems,
  type VehicleSpecKey,
} from './hooks/use-vehicle-spec-items';
import {
  OVERVIEW_VIEW,
  overviewViews,
  vehicleModuleLinks,
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
import { discountedPriceVnd } from './pricing';
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
 * Khối TIỀN THEO KỲ (`FinanceEntityPanel`) đứng ngay sau dải liên kết nhanh, đúng vị trí web —
 * và là ĐÚNG component mà hồ sơ khách dùng, chỉ khác mệnh đề thu hẹp. Hai bề mặt là cùng một
 * câu truy vấn nên con số của chúng không thể lệch nhau.
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
   * gian quản lý xe của chính khu tài khoản. Xem docblock của `ModuleLinks`.
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
        <Screen scrollReveal edges={['left', 'right', 'bottom']} scroll={false}>
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
        <Screen scrollReveal edges={['left', 'right', 'bottom']}>
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
        <Screen scrollReveal edges={['left', 'right', 'bottom']} scroll={false}>
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
      onBack={back}
      listHref={listHref}
      customerScope={customerScope}
    />
  );
}

/** Figma `24231:107728`: các thẻ nhóm thông tin cách nhau 12. */
const CONTENT_GAP = 12;
/** Hai nút một hàng trong tấm "Thao tác khác" (khe 8). */
const MENU_CELL = '48.5%';

function VehicleDetailBody({
  vehicle,
  onBack,
  listHref,
  customerScope,
}: {
  vehicle: VehicleDetail;
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
  const remove = useDeleteVehicle();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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
  const showSpecs = () => {
    setView(OVERVIEW_VIEW.SPECS);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };
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
      <Screen scrollReveal
        edges={['left', 'right', 'bottom']}
        padded={false}
        refreshing={summary.isRefetching}
        onRefresh={() => void summary.refetch()}
        scrollRef={scrollRef}
      >
        {/* Figma "Vehicle Image" `24158:107062`: ảnh trọn bề ngang cao 246, ← và ⋮ phủ trên ảnh. */}
        <DetailHero
          vehicle={vehicle}
          onBack={onBack}
          onMenu={() => setMenuOpen(true)}
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
            <FinanceEntityPanel
              scope={{ vehicleId: vehicle.id }}
              kind="vehicle"
              canCreateReceipt={can.createReceipt}
            />
          ) : null}

          {view === OVERVIEW_VIEW.FEATURES ? <FeaturesCard vehicle={vehicle} /> : null}

          {view === OVERVIEW_VIEW.MAINTENANCE && can.maintenance ? (
            /* Đúng web: tab dựng nguyên khu bảo dưỡng của xe (`VehicleMaintenanceWorkspace`). */
            <VehicleMaintenanceWorkspace vehicleId={vehicle.id} />
          ) : null}

          {view === OVERVIEW_VIEW.OVERVIEW ? (
            <>
              {/*
                Thứ tự ĐÚNG web (03/11/2026) ở khổ hẹp: tab Tổng quan (việc cần làm → thông số
                chính → ảnh → nguồn xe (cổng quản lý) → tối ưu nhận chuyến), rồi cột phụ xếp xuống
                dưới (giá & chính sách → lịch sắp tới → hoạt động gần đây → lối tắt).

                Thẻ "Giấy tờ" đã gỡ (ledger §3.6 D5): cảnh báo giấy tờ nằm trong "Việc cần làm",
                có lối xử lý. "Hiệu suất lũy kế" đã vào thẻ xe (D2).
              */}
              <TodoCard
                vehicle={vehicle}
                summary={summary.data}
                loading={summary.isPending}
                failed={summary.isError}
                customerScope={customerScope}
              />

              {/* Thứ tự theo Figma `24158:106582`: Giá thuê & Chính sách → Lịch thuê sắp tới → Tự động nhận chuyến. */}
              <PricingCard vehicle={vehicle} canEdit={canEdit} customerScope={customerScope} />

              {showSchedule ? (
                <ScheduleCard
                  bookings={summary.data?.upcomingBookings}
                  loading={summary.isPending}
                  failed={summary.isError}
                />
              ) : null}

              <AutomationCard vehicle={vehicle} canEdit={canEdit} customerScope={customerScope} />

              <KeySpecsCard
                vehicle={vehicle}
                summary={summary.data}
                onViewAll={showSpecs}
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

              {/* Nguồn xe & tài chính là của gian hàng — chủ xe tuyến hoa hồng không có. */}
              {customerScope ? null : <SourceCard vehicle={vehicle} />}


              {showActivity ? (
                <ActivityCard
                  bookings={summary.data?.recentBookings}
                  loading={summary.isPending}
                  failed={summary.isError}
                />
              ) : null}

              <ModuleLinks vehicle={vehicle} canEdit={canEdit} customerScope={customerScope} />
            </>
          ) : null}

        </YStack>
      </Screen>

      {/* Figma ⋮ "Thao tác" (ledger §3.6 D1): Chỉnh sửa · Xem lịch xe · Xoá - mỗi nút một hàng. */}
      <BottomSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={t('actionsMenu')}
        chrome="v2"
        headerDivider
      >
        {/* Dạng lưới hai cột nút vàng + "Đóng" như tấm "Thao tác khác" của chi tiết đơn. */}
        <YStack gap={space.md} alignSelf="stretch">
          <XStack flexWrap="wrap" gap={space.sm}>
            {canEdit ? (
              <YStack w={MENU_CELL}>
                <Button
                  icon="create-outline"
                  label={t('editMobile')}
                  variant="gradient"
                  size="compact"
                  onPress={() => {
                    setMenuOpen(false);
                    navigateOnce(vehicleProfileHref(vehicle.id, customerScope));
                  }}
                />
              </YStack>
            ) : null}
            <YStack w={MENU_CELL}>
              <Button
                icon="calendar-outline"
                label={t('scheduleMobile')}
                variant="gradient"
                size="compact"
                onPress={() => {
                  setMenuOpen(false);
                  navigateOnce(vehicleSchedulePath(vehicle, { back: true, customerScope }));
                }}
              />
            </YStack>
            {canDelete ? (
              <YStack w={MENU_CELL}>
                <Button
                  icon="trash-outline"
                  label={t('delete')}
                  variant="dangerOutline"
                  size="compact"
                  onPress={() => {
                    setMenuOpen(false);
                    setConfirmingDelete(true);
                  }}
                />
              </YStack>
            ) : null}
          </XStack>
          <Button
            label={tActions('close')}
            variant="ghost"
            onPress={() => setMenuOpen(false)}
          />
        </YStack>
      </BottomSheet>

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
/** Ô tròn đựng biểu tượng hoạt động — đủ to để hình 16px không dính mép. */
const ACTIVITY_ICON_BOX = 28;

function useShortRange(): (from: string, to: string) => string {
  const t = useTranslations('Vehicles.overview');
  const pattern = useDatePickerPattern();
  return (from, to) =>
    t('dateRange', {
      from: toAppTz(from).format(pattern.dayMonth),
      to: toAppTz(to).format(pattern.dayMonth),
    });
}

/**
 * Biểu tượng của một hoạt động, MÀU theo trạng thái đơn — đúng `activityIcon` của web.
 *
 * Một cột biểu tượng bên trái biến ba dòng chữ rời thành một dòng thời gian đọc được, và màu
 * cho biết chuyện gì đã xảy ra trước khi mắt kịp đọc chữ.
 */
function activityIcon(status: string, colors: AppColors): { name: IconName; color: string } {
  switch (status) {
    case BOOKING_STATUS.COMPLETED:
      return { name: 'checkmark-circle', color: colors.success };
    case BOOKING_STATUS.ACTIVE:
      return { name: 'car', color: colors.info };
    case BOOKING_STATUS.CANCELLED:
    case BOOKING_STATUS.NO_SHOW:
      return { name: 'close-circle-outline', color: colors.danger };
    default:
      return { name: 'time-outline', color: colors.textMuted };
  }
}

function Muted({ children }: { children: string }) {
  const colors = useColors();
  return (
    <Text col={colors.textMuted} fos={fontSize.bodySm}>
      {children}
    </Text>
  );
}

/** Phần `<b>` của một message rich — giá trị được nhấn, chữ dẫn quanh nó vẫn mờ. */
function Strong({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <Text col={colors.text} fow={fontWeight.semibold}>
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
const REVIEW_DISC = 20;
const REVIEW_GLYPH = 10;
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
}: {
  vehicle: VehicleDetail;
  onBack: () => void;
  onMenu: () => void;
  menuLabel: string;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const tActions = useTranslations('Common.actions');
  const slotLabel = useImageSlotLabel();
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
        <HeroButton side="left" label={tActions('back')} onPress={onBack}>
          <Ionicons name="arrow-back" size={iconSize.md} color={HERO_ICON} />
        </HeroButton>
        <HeroButton side="right" label={menuLabel} onPress={onMenu}>
          <Ionicons name="ellipsis-vertical" size={iconSize.md} color={HERO_ICON} />
        </HeroButton>
      </YStack>
    </YStack>
  );
}

function HeroButton({
  side,
  label,
  onPress,
  children,
}: {
  side: 'left' | 'right';
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={space.sm}
      style={[heroStyles.button, side === 'left' ? heroStyles.left : heroStyles.right]}
    >
      {children}
    </Pressable>
  );
}

const heroStyles = StyleSheet.create({
  button: {
    position: 'absolute',
    top: HERO_BUTTON_INSET,
    padding: 8,
    borderRadius: radius.control,
    // Nền đen mờ để icon luôn đọc được trên mọi ảnh (người dùng chốt 16/11/2026: bản kính trắng bị chìm).
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
  },
  left: { left: HERO_BUTTON_SIDE },
  right: { right: HERO_BUTTON_SIDE },
});

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
  const tPublish = useTranslations('Vehicles.publish');
  const tLabels = useTranslations('Common.labels');
  const tList = useTranslations('Vehicles.list');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const pillSkin = usePillSkin();

  const operationStatus = vehicle.operationStatus as VehicleOperationStatus;
  const banner = BANNER_STATUSES.has(vehicle.publicStatus)
    ? publicStatusPresentation(vehicle.publicStatus as VehiclePublicStatus)
    : null;
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
          Hai trục trạng thái ĐỘC LẬP (vận hành ≠ kiểm duyệt) - Figma "Vehicle Status": kiểm duyệt
          (đĩa biểu tượng + chữ) cách viên vận hành 32.
        */}
        <XStack ai="center" flexWrap="wrap" columnGap={STATUS_GAP} rowGap={space.xs}>
          <XStack ai="center" gap={6}>
            <YStack
              w={REVIEW_DISC}
              h={REVIEW_DISC}
              br={radius.pill}
              bg={reviewSkin.bg}
              ai="center"
              jc="center"
            >
              {publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC ? (
                <CheckGlyph color={reviewSkin.fg} />
              ) : (
                <Ionicons name={REVIEW_ICON[publicStatus]} size={REVIEW_GLYPH} color={reviewSkin.fg} />
              )}
            </YStack>
            <Text col={reviewSkin.fg} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
              {tList(`review.${publicStatus}`)}
            </Text>
          </XStack>
          <Pill
            label={tList(`operation.${operationStatus}`)}
            tone={pillToneOfStatusColor(metaColor(VEHICLE_OPERATION_STATUS_META, operationStatus))}
            size="caption"
            shape="tag"
          />
        </XStack>

        {performance ? (
          <YStack p={METRIC_PAD} br={radius.control} bg={colors.background}>
            {performance}
          </YStack>
        ) : null}

        {banner ? (
          <Callout tone={CALLOUT_TONE[banner.type]} title={tPublish(`status.${banner.key}.message`)}>
            {banner.useReason && vehicle.latestPublicReview?.reason
              ? vehicle.latestPublicReview.reason
              : tPublish(`status.${banner.key}.description`)}
          </Callout>
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

/** Biểu tượng theo mức nặng nhất — web `TODO_TONE_ICON`. */
const useTodoToneIcon = themed<
  Readonly<Record<VehicleAlertSeverity, { name: IconName; color: string }>>
>((colors) => ({
  [VEHICLE_ALERT_SEVERITY.CRITICAL]: { name: 'alert-circle', color: colors.danger },
  [VEHICLE_ALERT_SEVERITY.WARNING]: { name: 'alert-circle', color: colors.warning },
  [VEHICLE_ALERT_SEVERITY.INFO]: { name: 'information-circle', color: colors.info },
}));
/** Đã biết chắc không còn việc gì (tải xong và rỗng). Đang tải/hỏng thì KHÔNG có biểu tượng. */
const useTodoClearIcon = themed<{ name: IconName; color: string }>((colors) => ({
  name: 'checkmark-circle',
  color: colors.success,
}));

/**
 * Việc cần làm — cảnh báo vận hành TỪ SERVER (`VehicleAlertsService`, cùng phép tính với thẻ xe
 * ngoài danh sách) cộng MỘT việc "đưa xe lên chợ" dựng tại chỗ từ bản ghi xe (ADR 0048).
 *
 * Cảnh báo vận hành vẫn đến nguyên vẹn từ server và KHÔNG bị sắp xếp lại; phần thêm vào là đúng
 * một việc, và nó THAY hai cảnh báo server nói trùng thay vì cộng thêm.
 *
 * Thứ tự: việc lên chợ mức `critical`/`warning` lên ĐẦU (xe không bán được thì mọi việc khác là
 * thứ yếu); mức `info` — lời nhắc "xe đang tạm ẩn", "đang chờ duyệt" — xuống CUỐI, vì một gợi ý
 * không được đẩy một chuyến sắp phải giao ra khỏi ba dòng đầu.
 */
function TodoCard({
  vehicle,
  summary,
  loading,
  failed,
  customerScope,
}: {
  vehicle: VehicleDetail;
  summary: Vehicle360Summary | undefined;
  loading: boolean;
  failed: boolean;
  /** Mở từ khu tài khoản — đích "Liên hệ hỗ trợ" là hỗ trợ của khu đó. */
  customerScope: boolean;
}) {
  const TODO_TONE_ICON = useTodoToneIcon();
  const TODO_CLEAR_ICON = useTodoClearIcon();
  const t = useTranslations('Vehicles.overview');
  const navigateOnce = useNavigateOnce();
  const task = vehiclePublicationTask(vehicle);
  const alertView = useVehicleAlertView(customerScope);
  // Lọc theo năng lực + đổi đích về đúng khu TRƯỚC, rồi bỏ hai cảnh báo nói trùng với việc lên chợ.
  const alerts = alertView(vehicle.id, summary?.alerts ?? []).filter(
    (alert) => !task || !PUBLICATION_ALERT_KINDS.includes(alert.kind),
  );
  const taskLeads = task !== null && task.tone !== VEHICLE_ALERT_SEVERITY.INFO;
  // Gợi ý không phải "việc cần làm" nên không vào số đếm — viên đếm là số việc thật.
  const count = alerts.length + (taskLeads ? 1 : 0);
  const taskItem = task ? (
    <VehiclePublicationTaskItem vehicle={vehicle} task={task} customerScope={customerScope} />
  ) : null;
  const listReady = !loading && !failed && summary !== undefined;
  // Mức nặng nhất của những gì ĐANG hiện — tô biểu tượng tiêu đề (web đổi nền thẻ theo nó).
  const tone = topVehicleAlertSeverity([
    ...(listReady ? alerts : []),
    ...(task ? [{ severity: task.tone }] : []),
  ]);
  /*
   * "Xử lý ngay" dẫn tới việc ĐẦU BẢNG của server (đã sắp theo ưu tiên) và đứng NGAY TRONG chính
   * việc đó — đúng web 02/10/2026. Chỉ dựng khi việc đầu bảng là việc phải làm (không phải lời
   * nhắc `info`), có đích, và việc lên chợ không đứng trên nó (việc đó có nút riêng).
   */
  const lead = todoLeadAlert({ alerts, listReady, taskLeads });
  const leadTarget = lead?.target ?? null;
  const leadAction = leadTarget ? (
    <Button
      label={t('todo.handleNow')}
      size="sm"
      variant={tone === VEHICLE_ALERT_SEVERITY.CRITICAL ? 'danger' : 'primary'}
      block={false}
      onPress={() => navigateOnce(leadTarget)}
    />
  ) : null;
  const toneIcon = tone ? TODO_TONE_ICON[tone] : listReady ? TODO_CLEAR_ICON : null;

  /*
   * Web `Vehicle360Cards`: không có việc thì không có thẻ; đang tải mà chưa biết có việc gì cũng
   * không dựng (khung xương to rồi biến mất làm trang nhảy). Tải hỏng thì vẫn nói một dòng.
   */
  if (!task && (loading || (listReady && alerts.length === 0))) return null;

  return (
    <Card>
      <YStack gap={space.sm}>
        {/*
          Viên đếm CHỈ hiện khi có việc — đúng điều kiện của web. Biểu tượng mức nặng nhất đứng
          cạnh nó; màu không bao giờ là kênh duy nhất — từng việc vẫn nói mức bằng chữ.
        */}
        <SectionHeader
          {...(count > 0 || toneIcon
            ? {
                action: (
                  <XStack ai="center" gap={space.xs}>
                    {toneIcon ? (
                      <Ionicons
                        name={toneIcon.name}
                        size={iconSize.sm}
                        color={toneIcon.color}
                        accessible={false}
                      />
                    ) : null}
                    {count > 0 ? <CountBadge count={count} tone="danger" /> : null}
                  </XStack>
                ),
              }
            : {})}
        >
          {t('todo.title')}
        </SectionHeader>
        {taskLeads ? taskItem : null}
        {loading ? (
          <SkeletonText lines={2} />
        ) : failed || !summary ? (
          <Muted>{t('loadFailed')}</Muted>
        ) : (
          /*
            `showEmpty` tắt khi đã có việc lên chợ: "Không có việc cần làm" ngay dưới một việc
            đang hiện là đúng câu tự mâu thuẫn mà ADR 0048 điều 6 sửa.
          */
          <VehicleAlertList alerts={alerts} showEmpty={!task} leadAction={leadAction} />
        )}
        {task && !taskLeads ? taskItem : null}
      </YStack>
    </Card>
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
                    {t('schedules.sub', {
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
 * "Lối tắt" của hồ sơ xe — bản native của `ModuleLinks` bên web (`Vehicle360Aside`). Danh sách,
 * quyền và đích theo khu nằm ở `vehicleModuleLinks` (hàm thuần, có test).
 */
function ModuleLinks({
  vehicle,
  canEdit,
  customerScope,
}: {
  vehicle: VehicleDetail;
  canEdit: boolean;
  /**
   * Mở từ KHU TÀI KHOẢN (chủ xe tuyến hoa hồng) hay từ cổng quản lý. Chủ xe tuyến hoa hồng không
   * vào được `/manage` (ADR 0038 điều 4) — mọi mục đổi đích sang khu của họ hoặc không hiện.
   */
  customerScope: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Vehicles.overview.links');
  const { has } = usePermissions();
  const navigateOnce = useNavigateOnce();

  const can = useVehicleCapabilities();
  const links = vehicleModuleLinks({ vehicle, canEdit, customerScope, has, can });
  if (links.length === 0) return null;

  return (
    /*
      Web `ModuleLinks` (`Vehicle360Aside`): thẻ "Lối tắt", mỗi lối một DÒNG cao tối thiểu 44 - icon
      vàng · nhãn · mũi tên `›` - xếp dọc, không phải viên xuống dòng.
    */
    <GroupCard title={t('shortcuts')}>
      <YStack accessibilityLabel={t('ariaLabel')} gap={space.xs}>
        {links.map((link) => (
          <Pressable
            key={link.key}
            onPress={() => navigateOnce(link.href)}
            accessibilityRole="link"
            accessibilityLabel={t(link.key)}
            style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
          >
            <XStack ai="center" gap={space.sm} minHeight={44} px={space.sm}>
              <Ionicons name={link.icon} size={iconSize.md} color={colors.brandLink} />
              <Text
                f={1}
                minWidth={0}
                col={colors.text}
                fos={typeScale.body.fontSize}
                lh={typeScale.body.lineHeight}
                numberOfLines={1}
              >
                {t(link.key)}
              </Text>
              <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.placeholder} />
            </XStack>
          </Pressable>
        ))}
      </YStack>
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
  const colors = useColors();
  const t = useTranslations('Vehicles.overview');
  const fmt = useAppFormat();
  const stats = summary?.stats;
  // Chưa ai chấm thì KHÔNG dựng cột — "0/5" là một lời chê không có thật.
  const rated = stats && stats.ratingCount > 0 && stats.ratingAvg;

  if (loading) return <SkeletonText lines={2} />;
  if (failed || !stats) return <Muted>{t('loadFailed')}</Muted>;
  return (
    <XStack jc="space-between" ai="flex-start" gap={space.sm} accessibilityLabel={t('performance.title')}>
      <StatTile
        label={t('performance.rentals')}
        value={t('performance.tripCount', { count: stats.completedBookings })}
      />
      <StatTile
        label={t('performance.active')}
        value={t('performance.activeCount', { count: stats.activeBookings })}
      />
      {rated ? (
        <StatTile
          label={t('performance.ratingCount', { count: stats.ratingCount })}
          value={t('performance.ratingScore', { rating: fmt.rating(Number(stats.ratingAvg)) })}
          star
        />
      ) : null}
    </XStack>
  );
}

/** Một cột số: số 14/20 đậm ở trên (sao vàng cạnh điểm), nhãn 12/18 `text/gray/low` ở dưới, căn giữa. */
function StatTile({
  label,
  value,
  star = false,
}: {
  label: string;
  value: string;
  star?: boolean;
}) {
  const colors = useColors();
  return (
    <YStack f={1} gap={4} ai="center" minWidth={0}>
      <XStack ai="center" gap={4}>
        {star ? <Ionicons name="star" size={iconSize.md} color={colors.brandShape} /> : null}
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
        ta="center"
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
  children,
}: {
  title?: string;
  onEdit?: () => void;
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
            {onEdit ? (
              <Pressable
                onPress={onEdit}
                hitSlop={space.sm}
                accessibilityRole="button"
                accessibilityLabel={editLabel ?? title}
              >
                <Ionicons name="create-outline" size={iconSize.md} color={colors.brandLink} />
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
  const services = VEHICLE_SERVICE_SETTING_SERVICES.filter((service) =>
    vehicle.serviceTypes.includes(service),
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
  return (
    <XStack ai="center" gap={20}>
      <YStack f={1} minWidth={0} gap={2}>
        <Text
          col={colors.text}
          fos={typeScale.body.fontSize}
          lh={typeScale.body.lineHeight}
          fow={fontWeight.medium}
        >
          {label}
        </Text>
        {/* Có tài xế chưa đủ năng lực: nói lý do thay cho công tắc mờ câm — như tooltip của web. */}
        <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
          {toggle.blocked ? t('automation.driverRequired') : t('automation.toggleHint')}
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

/** Công tắc của thẻ chi tiết xe — cùng bảng màu rãnh với `PolicySwitch` (tắt đậm hơn nền thẻ). */
const useSwitchTrack = themed((colors) => ({ false: colors.borderInput, true: colors.primary }));

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
  const colors = useColors();
  const track = useSwitchTrack();
  return (
    <Switch
      value={checked}
      onValueChange={onToggle}
      disabled={disabled}
      accessibilityLabel={label}
      trackColor={track}
      thumbColor={colors.surface}
      ios_backgroundColor={colors.borderInput}
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
  const discounted = discountedPriceVnd(vehicle.weekdayPrice, vehicle.discountPercent);

  return (
    <GroupCard
      title={t('pricing.title')}
      {...(canEdit
        ? {
            onEdit: () => navigateOnce(vehiclePricingHref(vehicle.id, customerScope)),
            editLabel: t('pricing.editLink'),
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
      {vehicle.discountPercent ? (
        <DataRow label={t('pricing.discount')} value={`${vehicle.discountPercent}%`} />
      ) : null}
      {discounted != null ? (
        <DataRow label={t('pricing.publicPrice')} value={fmt.money(discounted)} strong />
      ) : null}
      {/* Giá có tài xế / giá tháng — chỉ khi xe phục vụ dịch vụ đó và đã có giá (ledger §3.6 D8). */}
      {vehicle.serviceTypes.includes(SERVICE_TYPE.WITH_DRIVER) && vehicle.withDriverDailyPrice ? (
        <DataRow
          labelWide
          label={t('pricing.withDriver')}
          value={fmt.pricePerDay(vehicle.withDriverDailyPrice)}
        />
      ) : null}
      {vehicle.serviceTypes.includes(SERVICE_TYPE.LONG_TERM) && vehicle.monthlyPrice ? (
        <DataRow
          labelWide
          label={t('pricing.monthly')}
          value={t('pricing.perMonth', { price: fmt.money(vehicle.monthlyPrice) })}
        />
      ) : null}
      {/* Figma "Thông tin": nhãn 14/20 `text/gray/low` trái, dấu ✓ + "Có hỗ trợ" phải. */}
      <XStack ai="center" jc="space-between" gap={space.sm}>
        <Text col={colors.placeholder} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
          {t('pricing.delivery')}
        </Text>
        <XStack ai="center" gap={space.sm}>
          {vehicle.deliveryEnabled ? (
            <YStack w={20} h={20} br={radius.pill} bg={colors.successSurface} ai="center" jc="center">
              <Ionicons name="checkmark-outline" size={12} color={colors.success} />
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

/**
 * Lát cắt của thẻ "Thông số chính", theo thứ tự hiện — web `KEY_SPECS`. Ô nào ma trận
 * `vehicleFieldPolicy` ẩn cho xe này tự vắng — `useVehicleSpecItems` đã bỏ nó.
 */
const KEY_SPECS: readonly VehicleSpecKey[] = [
  'year',
  'seats',
  'motorbikeCategory',
  'fuel',
  'transmission',
  'color',
];

/**
 * Những thông số khách hỏi đầu tiên — bản ĐẦY ĐỦ ở mục "Thông số", "Xem đầy đủ" đổi mục tại chỗ.
 * Ô áp dụng mà chưa điền thì nói thiếu (`—`), để chủ xe thấy còn phải điền gì.
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

  const empty = tLabels('emptyValue');
  const byKey = new Map(specs.map((item) => [item.key, item]));
  // Hãng + mẫu gộp một ô: "Toyota Vios" là cách người ta gọi chiếc xe, không phải hai thông số.
  const brandModel = [byKey.get('brand')?.value, byKey.get('model')?.value]
    .filter(Boolean)
    .join(' ');
  const tiles = [
    { key: 'brand-model', label: t('keySpecs.brandModel'), value: brandModel || empty },
    ...KEY_SPECS.flatMap((key) => {
      const item = byKey.get(key);
      return item ? [{ key, label: item.label, value: item.value ?? empty }] : [];
    }),
  ];

  return (
    <Card>
      <YStack gap={space.sm}>
        <SectionHeader
          action={
            <BlockLink
              label={t('keySpecs.viewAll')}
              accessibilityLabel={t('keySpecs.viewAllLabel')}
              onPress={onViewAll}
            />
          }
        >
          {t('keySpecs.title')}
        </SectionHeader>
        {/* Lưới hai cột ô nhỏ — ô "Hãng & mẫu" trải hết hàng vì tên xe thường dài. */}
        <XStack flexWrap="wrap" gap={space.xs}>
          {tiles.map((tile, index) => (
            <YStack
              key={tile.key}
              w={index === 0 ? '100%' : '48%'}
              f={index === 0 ? undefined : 1}
              minWidth="45%"
              gap={2}
              p={space.sm}
              br={radius.sm}
              bg={colors.surfaceMuted}
            >
              <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
                {tile.label}
              </Text>
              <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                {tile.value}
              </Text>
            </YStack>
          ))}
        </XStack>
        {/* Số KM hiện tại + "Nhập dữ liệu" — web `odometerRow` (ledger §3.6 D9). */}
        <XStack ai="center" gap={space.xs} pt={space.xs}>
          <Ionicons name="speedometer-outline" size={iconSize.sm} color={colors.textMuted} />
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('keySpecs.odometer')}
          </Text>
          <Text f={1} col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
            {summary ? fmt.km(summary.currentOdometerKm ?? null) : empty}
          </Text>
          {onOdometer ? (
            <BlockLink label={t('keySpecs.odometerInput')} onPress={onOdometer} />
          ) : null}
        </XStack>
      </YStack>
    </Card>
  );
}

function SpecsCard({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations('Vehicles.overview');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  // Danh sách theo ma trận `vehicleFieldPolicy` — ô không áp dụng cho loại xe này VẮNG hẳn.
  const specs = useVehicleSpecItems(vehicle);

  const empty = tLabels('emptyValue');
  const rows = [
    ...specs.map((item) => ({ key: item.key, label: item.label, value: item.value ?? empty })),
    { key: 'created', label: t('specs.createdAt'), value: fmt.dateTime(vehicle.createdAt) },
    { key: 'updated', label: t('specs.updatedAt'), value: fmt.dateTime(vehicle.updatedAt) },
  ];

  return (
    <Card>
      <YStack gap={space.sm}>
        <SectionHeader icon="settings-outline">{t('specs.title')}</SectionHeader>

        {/*
          `labelWide` cho CẢ bảng: nhãn dài, giá trị ngắn. Ô áp dụng mà chưa nhập vẫn có dòng "—"
          (y như `Descriptions` của web); ô không áp dụng cho loại xe thì không có dòng.
        */}
        {rows.map((row) => (
          <DataRow key={row.key} label={row.label} value={row.value} labelWide />
        ))}

      </YStack>
    </Card>
  );
}

/**
 * Tab "Tiện ích xe" — web `FeaturesCard` (ledger §3.6 D14–D15): danh sách tiện ích PHẲNG hai cột
 * có dấu tích (danh mục chưa có nhóm), rồi khối "Mô tả xe" ở cuối tab. Rỗng thì nói rõ, không ẩn.
 */
function FeaturesCard({ vehicle }: { vehicle: VehicleDetail }) {
  const colors = useColors();
  const t = useTranslations('Vehicles.overview');
  const { featureLabel } = useCatalogLabels();

  return (
    <YStack gap={layout.section}>
      <Card>
        <YStack gap={space.sm}>
          <SectionHeader icon="checkmark-done-outline" lead={t('features.subtitle')}>
            {t('features.title')}
          </SectionHeader>
          {vehicle.features.length > 0 ? (
            /* Lưới 2 cột, khe 12, icon riêng từng tiện ích - khuôn khối tiện ích của app khách. */
            <XStack flexWrap="wrap" rowGap={12}>
              {vehicle.features.map((key) => (
                <YStack key={key} w="50%" paddingRight={space.xs}>
                  <FeatureItem featureKey={key} label={featureLabel(key)} />
                </YStack>
              ))}
            </XStack>
          ) : (
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('features.empty')}
            </Text>
          )}
        </YStack>
      </Card>
      <Card>
        <YStack gap={space.sm}>
          <SectionHeader icon="document-text-outline">{t('features.descriptionTitle')}</SectionHeader>
          <Text
            col={vehicle.description ? colors.text : colors.textMuted}
            fos={fontSize.bodySm}
          >
            {vehicle.description || t('features.descriptionEmpty')}
          </Text>
        </YStack>
      </Card>
    </YStack>
  );
}

/**
 * Tóm tắt nguồn xe. Chi tiết tài chính chỉ tải khi người xem có `finance.view` — người không có
 * quyền chỉ thấy HÌNH THỨC (đã nằm sẵn trên bản ghi xe), không thấy con số.
 */
function SourceCard({ vehicle }: { vehicle: VehicleDetail }) {
  const colors = useColors();
  const t = useTranslations('Vehicles.overview');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  // Web: `can.source` (quyền ∧ cờ gói finance) — chỉ đọc permission thì tuyến không có gói
  // nhận 403 cho `GET /vehicles/:id/source`.
  const canViewFinance = useVehicleCapabilities().source;
  const navigateOnce = useNavigateOnce();
  const source = useVehicleSource(vehicle.id, canViewFinance);
  const detail = source.data?.detail ?? null;
  const sourceType = (vehicle.sourceType ?? VEHICLE_SOURCE_TYPE.OWNED) as VehicleSourceType;

  /*
   * Con số đổi theo HÌNH THỨC, đúng `SourceCard` web: sở hữu - ngày mua · giá trị xe; trả góp -
   * ngân hàng · phải đóng mỗi tháng; thuê lại - chủ xe · tiền thuê; hợp tác - chủ xe · % chia.
   * Ô chưa khai thì không dựng.
   */
  const rows: { key: string; label: string; value: string }[] = [];
  const push = (key: string, label: string, value: string | null | undefined) => {
    if (value) rows.push({ key, label, value });
  };
  if (detail) {
    switch (sourceType) {
      case VEHICLE_SOURCE_TYPE.FINANCED:
        push('bank', t('source.bank'), detail.bankName);
        push(
          'monthly',
          t('source.monthlyPayment'),
          detail.monthlyTotal ? fmt.money(detail.monthlyTotal) : null,
        );
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
          detail.commissionPercent
            ? t('source.sharePercent', { percent: detail.commissionPercent })
            : null,
        );
        break;
      default:
        push(
          'purchaseDate',
          t('source.purchaseDate'),
          detail.purchaseDate ? fmt.date(detail.purchaseDate) : null,
        );
        push(
          'purchasePrice',
          t('source.purchasePrice'),
          detail.purchasePrice ? fmt.money(detail.purchasePrice) : null,
        );
    }
  }

  return (
    <Card>
      <YStack gap={space.sm}>
        <SectionHeader icon="business-outline">{t('source.title')}</SectionHeader>

        {/*
          Hình thức nguồn xe là một CHIP vàng, đứng cùng hàng với nhãn — đúng `<Tag color="gold">`
          của web. Trước đây nó đi qua `DataRow`, tức một nhãn dài cạnh một giá trị ngắn chia
          nhau theo tỉ lệ 3:7 và "Trả góp" bị đẩy xuống hàng riêng cho một từ.
        */}
        <XStack ai="center" gap={space.sm}>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('source.kind')}
          </Text>
          <StatusBadge
            label={domainLabel('vehicleSourceType', sourceType)}
            color={STATUS_COLOR.ACCENT}
          />
        </XStack>

        {source.isPending && canViewFinance ? (
          <SkeletonText lines={2} />
        ) : (
          rows.map((row) => <DataRow key={row.key} label={row.label} value={row.value} />)
        )}

        {/*
          Liên kết xuống hồ sơ nguồn xe & tài chính — web có, app thiếu cho tới giờ.
          Chưa khai nguồn xe thì đổi thành lời mời bổ sung, đúng hai nhánh của web.
        */}
        {canViewFinance && !source.isPending && (detail || !source.isError) ? (
          detail ? (
            <BlockLink
              label={t('source.viewLink')}
              onPress={() =>
                navigateOnce(ROUTES.manage.vehicleEditTab(vehicle.id, VEHICLE_EDIT_TAB.SOURCE))
              }
            />
          ) : (
            <YStack gap={space.xs}>
              <Muted>{t('source.missing')}</Muted>
              <BlockLink
                label={t('source.missingLink')}
                onPress={() =>
                  navigateOnce(ROUTES.manage.vehicleEditTab(vehicle.id, VEHICLE_EDIT_TAB.SOURCE))
                }
              />
            </YStack>
          )
        ) : null}
      </YStack>
    </Card>
  );
}

/**
 * Thư viện ảnh — bản native của `MediaCard` web (02/10/2026): luôn có mặt (rỗng thì nói rỗng),
 * ảnh bìa đứng đầu kèm nhãn "Ảnh bìa", mỗi ô mang nhãn vị trí, tối đa 6 ô và ô thứ 6 đếm phần dư.
 *
 * Ảnh loại "Ảnh khác" KHÔNG trưng — luật của app, xem `vehicleGalleryItems`.
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
  // Bề ngang THẬT của lưới (đo lúc layout) — đệm thẻ đổi theo theme nên không suy từ màn hình được.
  const [gridWidth, setGridWidth] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  /*
   * Web giữ ảnh dư trong nhóm xem trước để mũi tên lướt qua đủ mọi ảnh. `PhotoViewer` của app
   * xem từng ảnh, nên chạm ô "+N" MỞ RỘNG lưới ra đủ ảnh — mọi ảnh vẫn tới được trình xem.
   */
  const [expanded, setExpanded] = useState(false);

  const items = vehicleGalleryItems(vehicle, slotLabel);
  const overflow = items.length - GALLERY_VISIBLE;
  const visible = expanded ? items : items.slice(0, GALLERY_VISIBLE);
  const manageHref = canEdit
    ? vehicleEditPartHref(vehicle.id, VEHICLE_EDIT_TAB.MEDIA, customerScope)
    : null;
  // Lưới 3 cột phủ kín bề ngang thẻ: chia ba sau hai khe.
  const tile = Math.floor((gridWidth - space.xs * (GALLERY_COLUMNS - 1)) / GALLERY_COLUMNS);

  return (
    <Card>
      <YStack gap={space.sm}>
        <SectionHeader
          {...(manageHref
            ? {
                action: (
                  <BlockLink
                    label={t('media.manageLink')}
                    onPress={() => navigateOnce(manageHref)}
                  />
                ),
              }
            : {})}
        >
          {t('media.title')}
        </SectionHeader>
        {items.length === 0 ? (
          <XStack ai="center" gap={space.sm}>
            <Ionicons name="image-outline" size={iconSize.md} color={colors.textMuted} />
            <Muted>{t('media.empty')}</Muted>
          </XStack>
        ) : (
          <XStack
            flexWrap="wrap"
            gap={space.xs}
            accessibilityLabel={t('media.title')}
            onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}
          >
            {tile > 0 &&
              visible.map((item, index) => {
                const isMore = !expanded && index === GALLERY_VISIBLE - 1 && overflow > 0;
                return (
                  /*
                  Chạm để xem TOÀN MÀN — ở cỡ ô nhỏ không nhìn ra vết xước hay móp, tức không dùng
                  được vào đúng việc người ta mở thư viện ra để làm.
                */
                  <Pressable
                    key={`${index}-${item.url}`}
                    onPress={() => (isMore ? setExpanded(true) : setPreview(item.url))}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={
                      isMore
                        ? t('media.more', { count: overflow })
                        : (item.label ?? t('media.title'))
                    }
                  >
                    <YStack
                      w={tile}
                      h={tile}
                      br={radius.sm}
                      overflow="hidden"
                      bg={colors.surfaceMuted}
                    >
                      <Image
                        source={{ uri: item.url }}
                        style={StyleSheet.absoluteFill}
                        cachePolicy="memory-disk"
                        transition={150}
                        accessible={false}
                      />
                      {index === 0 && item.url === vehicle.mainImageUrl ? (
                        <XStack
                          pos="absolute"
                          top={space.xs}
                          left={space.xs}
                          ai="center"
                          gap={2}
                          px={space.xs}
                          py={1}
                          br={radius.pill}
                          bg={colors.primary}
                        >
                          <Ionicons name="star" size={10} color={colors.text} />
                          <Text col={colors.text} fos={fontSize.label} fow={fontWeight.semibold}>
                            {t('media.cover')}
                          </Text>
                        </XStack>
                      ) : null}
                      {item.label ? (
                        <YStack
                          pos="absolute"
                          bottom={0}
                          left={0}
                          right={0}
                          px={space.xs}
                          py={2}
                          bg={colors.overlay}
                        >
                          <Text col={colors.textInverse} fos={fontSize.label} numberOfLines={1}>
                            {item.label}
                          </Text>
                        </YStack>
                      ) : null}
                      {isMore ? (
                        <YStack
                          pos="absolute"
                          top={0}
                          bottom={0}
                          left={0}
                          right={0}
                          ai="center"
                          jc="center"
                          bg={colors.overlay}
                        >
                          <Text
                            col={colors.textInverse}
                            fos={fontSize.bodyLg}
                            fow={fontWeight.bold}
                          >
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
      </YStack>

      <PhotoViewer
        url={preview}
        unavailableLabel={tStates('imageUnavailable')}
        onClose={() => setPreview(null)}
      />
    </Card>
  );
}

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

  return (
    <Card>
      <YStack gap={space.sm}>
        <SectionHeader icon="time-outline">{t('activity.title')}</SectionHeader>
        {loading ? (
          <SkeletonText lines={3} />
        ) : failed || bookings === undefined ? (
          <Muted>{t('loadFailed')}</Muted>
        ) : bookings.length === 0 ? (
          <Muted>{t('activity.empty')}</Muted>
        ) : (
          bookings.map((booking, index) => {
            const icon = activityIcon(booking.status, colors);
            return (
              <YStack key={booking.id} gap={space.xs}>
                {index > 0 ? <Divider /> : null}
                <XStack gap={space.sm} pt={index > 0 ? space.xs : 0}>
                  {/* Cột biểu tượng như web: màu nói trạng thái, hình neo dòng thời gian. */}
                  <YStack
                    w={ACTIVITY_ICON_BOX}
                    h={ACTIVITY_ICON_BOX}
                    br={radius.pill}
                    bg={colors.surfaceMuted}
                    ai="center"
                    jc="center"
                  >
                    <Ionicons name={icon.name} size={iconSize.sm} color={icon.color} />
                  </YStack>

                  {/*
                    BA HÀNG chồng nhau, không phải "tiêu đề và mốc chia nhau một hàng".

                    Hàng đó luôn hỏng: tiêu đề (`Đơn DH4WSDQ9 · Đã giữ xe`) và mốc thời gian đều
                    là chuỗi không rút ngắn được, cộng lại đã sát bề ngang khả dụng ở cỡ chữ mặc
                    định — chỉ cần người dùng phóng chữ hệ thống lên một nấc là một trong hai bị
                    cắt. Xếp dọc thì mỗi mảnh có trọn bề ngang và không mảnh nào phải nhường.

                    Đổi lại là mất một dòng cho mỗi mục, nên mốc thời gian dùng cỡ `label` và
                    đứng CUỐI: nó là thứ ít được đọc nhất trong ba.
                  */}
                  <YStack f={1} gap={2}>
                    <XStack gap={space.sm} ai="flex-start">
                      <Text f={1} col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                        {booking.customerName}
                      </Text>
                      <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                        {fmt.money(booking.totalAmount)}
                      </Text>
                    </XStack>
                    <Text col={colors.textMuted} fos={fontSize.bodySm}>
                      {t('activity.bookingRange', {
                        code: booking.code,
                        range: shortRange(booking.pickupAt, booking.returnAt),
                      })}
                    </Text>
                    <XStack ai="center" jc="space-between" gap={space.sm} flexWrap="wrap">
                      <Text col={colors.textMuted} fos={fontSize.label}>
                        {fmt.shortDateTime(booking.updatedAt)}
                      </Text>
                      <StatusBadge
                        label={domainLabel('bookingStatus', booking.status)}
                        color={metaColor(BOOKING_STATUS_META, booking.status)}
                        size="sm"
                      />
                    </XStack>
                  </YStack>
                </XStack>
              </YStack>
            );
          })
        )}
      </YStack>
    </Card>
  );
}
