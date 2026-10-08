import { useRef, useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  API_ERROR_CODE,
  PERMISSION,
  STATUS_COLOR,
  BOOKING_STATUS_META,
  BOOKING_STATUS,
  VEHICLE_ALERT_KIND,
  VEHICLE_ALERT_SEVERITY,
  topVehicleAlertSeverity,
  type VehicleAlertSeverity,
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_PUBLIC_STATUS_META,
  VEHICLE_SERVICE_SETTING_SERVICES,
  VEHICLE_SOURCE_TYPE,
  type VehicleOperationStatus,
  type VehiclePublicStatus,
  type VehicleSourceType,
} from '@xeprime/types';
import { LIST_SEPARATOR, toAppTz } from '@xeprime/domain';
import { metaColor, metaLabel } from '@/lib/status-meta';
import { getErrorCode } from '@/lib/api-client';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { BlockLink, BlockTitle } from '@/components/ui/BlockTitle';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { CountBadge } from '@/components/ui/CountBadge';
import { DataRow, Divider } from '@/components/ui/DataRow';
import { IconButton } from '@/components/ui/IconButton';
import { PhotoViewer } from '@/components/ui/PhotoViewer';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
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
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { FinanceEntityPanel } from '@/features/finance/components/FinanceEntityPanel';
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

const HERO_HEIGHT = 200;
/** Số ô HIỆN trong thẻ thư viện (3 × 2) — web `GALLERY_VISIBLE`. */
const GALLERY_VISIBLE = 6;
const GALLERY_COLUMNS = 3;

/* `Image` của React Native cần style phẳng — Tamagui không có primitive ảnh thay thế. */
const styles = StyleSheet.create({
  hero: { width: '100%', height: HERO_HEIGHT, backgroundColor: colors.surfaceMuted },
});

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
        <AppHeader title={t('title')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
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
        <AppHeader title={t('title')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']}>
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
        <AppHeader title={t('title')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
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
      <AppHeader
        title={tDetail('title')}
        onBack={onBack}
        right={
          canDelete ? (
            <IconButton
              icon="trash-outline"
              label={t('delete')}
              tone="danger"
              onPress={() => setConfirmingDelete(true)}
            />
          ) : null
        }
      />
      <Screen
        edges={['left', 'right', 'bottom']}
        refreshing={summary.isRefetching}
        onRefresh={() => void summary.refetch()}
        scrollRef={scrollRef}
      >
        <YStack gap={layout.section}>
          <ProfileCard vehicle={vehicle} summary={summary.data} />

          {/*
            Bố cục TAB của web (30/09/2026): Tổng quan · Thông số · Tài chính (`can.money`) · Bảo
            dưỡng (`can.maintenance`). Ở app là dải viên segmented ngay dưới thẻ hồ sơ.
          */}
          {views.length > 1 ? (
            <XStack gap={space.xs} accessibilityRole="tablist">
              {views.map((key) => (
                <Chip
                  key={key}
                  label={t(`tabs.${key}`)}
                  selected={view === key}
                  onPress={() => setView(key)}
                  variant="segmented"
                  size="sm"
                  grow
                />
              ))}
            </XStack>
          ) : null}

          {view === OVERVIEW_VIEW.SPECS ? <SpecsCard vehicle={vehicle} /> : null}

          {view === OVERVIEW_VIEW.FINANCE && can.money ? (
            /* Tiền của riêng chiếc xe này, THEO KỲ — gác `can.money` (quyền ∧ cờ gói). */
            <FinanceEntityPanel
              scope={{ vehicleId: vehicle.id }}
              kind="vehicle"
              canCreateReceipt={can.createReceipt}
            />
          ) : null}

          {view === OVERVIEW_VIEW.MAINTENANCE && can.maintenance ? (
            /* Đúng web: tab dựng nguyên khu bảo dưỡng của xe (`VehicleMaintenanceWorkspace`). */
            <VehicleMaintenanceWorkspace vehicleId={vehicle.id} />
          ) : null}

          {view === OVERVIEW_VIEW.OVERVIEW ? (
            <>
              {/*
                Thứ tự ĐÚNG web (02/10/2026) khi xếp một cột: việc cần làm → thông số chính → ảnh →
                giấy tờ → giá → nhận chuyến → nguồn xe (cổng quản lý) → hiệu suất (cổng quản lý) →
                lịch sắp tới → hoạt động gần đây → liên kết (cuối, như cột phụ web).
              */}
              <TodoCard
                vehicle={vehicle}
                summary={summary.data}
                loading={summary.isPending}
                failed={summary.isError}
                customerScope={customerScope}
              />

              <KeySpecsCard vehicle={vehicle} onViewAll={showSpecs} />

              <MediaCard vehicle={vehicle} canEdit={canEdit} customerScope={customerScope} />

              {can.documents ? (
                <DocumentsCard
                  vehicleId={vehicle.id}
                  summary={summary.data}
                  customerScope={customerScope}
                />
              ) : null}

              <PricingCard vehicle={vehicle} canEdit={canEdit} customerScope={customerScope} />

              <AutomationCard vehicle={vehicle} canEdit={canEdit} customerScope={customerScope} />

              {/* Nguồn xe & tài chính là của gian hàng — chủ xe tuyến hoa hồng không có. */}
              {customerScope ? null : <SourceCard vehicle={vehicle} />}

              {/* Hiệu suất chỉ ở cổng quản lý (web 30/09/2026). */}
              {customerScope ? null : (
                <PerformanceCard
                  summary={summary.data}
                  loading={summary.isPending}
                  failed={summary.isError}
                />
              )}
              {showSchedule ? (
                <ScheduleCard
                  bookings={summary.data?.upcomingBookings}
                  loading={summary.isPending}
                  failed={summary.isError}
                />
              ) : null}

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

          {/*
            Hai nút cuối trang, đúng `styles.mobileActions` của web (Figma `236:4890`).

            Cuối trang chứ không dính đáy màn: web cũng đặt chúng trong luồng, và một thanh dính
            đáy sẽ che mất phần cuối của khối hoạt động trên chính màn có nhiều khối nhất app.
            "Chỉnh sửa xe" chỉ hiện khi có quyền sửa — web ẩn cả nút, không làm mờ.
          */}
          {/*
            MỘT hàng hai nút, mỗi nút nửa bề ngang. Web xếp dọc vì ở đó chúng nằm trong một cột
            hẹp; ở đây cả hàng rộng bằng màn hình nên xếp dọc chỉ tốn thêm một hàng.

            `size="sm"` để nhãn dài nhất ("Xem lịch biểu") vừa nửa hàng — `sm` rút ĐỆM và cỡ
            chữ chứ không rút vùng chạm, nút vẫn cao đủ 44pt.
          */}
          <XStack gap={space.sm}>
            {canEdit ? (
              <YStack f={1}>
                <Button
                  label={t('editMobile')}
                  variant="primary"
                  size="sm"
                  /* Web `vehiclePaths.profile(id)`: cổng quản lý → màn sửa xe; khu tài khoản → mục Thông tin xe. */
                  onPress={() => navigateOnce(vehicleProfileHref(vehicle.id, customerScope))}
                />
              </YStack>
            ) : null}
            <YStack f={1}>
              <Button
                label={t('scheduleMobile')}
                variant="secondary"
                size="sm"
                /* Cùng đích với viên "Lịch xe" ở mục lục và với nút Lịch ở thẻ đội xe —
                   `onSchedule` của web cũng dẫn tới đúng màn lịch đã lọc theo chính xe này. */
                onPress={() =>
                  navigateOnce(vehicleSchedulePath(vehicle, { back: true, customerScope }))
                }
              />
            </YStack>
          </XStack>
        </YStack>
      </Screen>

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
function activityIcon(status: string): { name: IconName; color: string } {
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
  return (
    <Text col={colors.textMuted} fos={fontSize.bodySm}>
      {children}
    </Text>
  );
}

/** Phần `<b>` của một message rich — giá trị được nhấn, chữ dẫn quanh nó vẫn mờ. */
function Strong({ children }: { children: ReactNode }) {
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

function ProfileCard({
  vehicle,
  summary,
}: {
  vehicle: VehicleDetail;
  summary: Vehicle360Summary | undefined;
}) {
  const t = useTranslations('Vehicles.overview');
  const tPublish = useTranslations('Vehicles.publish');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const operationStatus = vehicle.operationStatus as VehicleOperationStatus;
  const banner = BANNER_STATUSES.has(vehicle.publicStatus)
    ? publicStatusPresentation(vehicle.publicStatus as VehiclePublicStatus)
    : null;
  const publicStatus = vehicle.publicStatus as VehiclePublicStatus;

  return (
    <Card padded={false}>
      {vehicle.mainImageUrl ? (
        <Image
          source={{ uri: vehicle.mainImageUrl }}
          style={styles.hero}
          cachePolicy="memory-disk"
          transition={150}
          accessible={false}
        />
      ) : (
        <YStack style={styles.hero} ai="center" jc="center">
          <Ionicons name="car-outline" size={iconSize.lg} color={colors.textMuted} />
        </YStack>
      )}

      <YStack p={space.md} gap={space.sm}>
        <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.bold}>
          {vehicle.name}
        </Text>

        {/*
          Định danh trên MỘT dải, đúng thứ tự web: ID · biển số · KM (+ nguồn). `idLabel`, `plate`
          và `odometer` mang thẻ rich `<b>` — phải đi qua `t.rich`, gọi `t()` thường thì use-intl
          trả về NGUYÊN KHOÁ. KM chưa có thì "Chưa có", không dựng "0 km"; nguồn cho biết số đến từ
          bàn giao, bảo dưỡng hay chỉnh tay.
        */}
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t.rich('idLabel', { value: vehicle.code, b: (chunks) => <Strong>{chunks}</Strong> })}
          {' · '}
          {t.rich('plate', {
            value: vehicle.plateNumber || tLabels('notAvailable'),
            b: (chunks) => <Strong>{chunks}</Strong>,
          })}
          {' · '}
          {t.rich('odometer', {
            value: fmt.km(summary?.currentOdometerKm ?? null),
            b: (chunks) => <Strong>{chunks}</Strong>,
          })}
          {summary?.currentOdometerSource
            ? ` · ${domainLabel('odometerSource', summary.currentOdometerSource)}`
            : ''}
        </Text>

        {/* Loại xe / dịch vụ trên dòng RIÊNG — web `typeLine`. */}
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {`${domainLabel('vehicleType', vehicle.vehicleType)} / ${fmt.serviceTypes(vehicle.serviceTypes)}`}
        </Text>

        {/*
          Hai trục trạng thái là HAI THỨ ĐỘC LẬP (vận hành ≠ công khai), nên mỗi trục giữ nhãn
          riêng — bỏ nhãn đi thì hai viên nằm cạnh nhau đọc thành một cặp cùng loại.

          Nhãn nằm CÙNG HÀNG với viên chứ không nằm trên: xếp dọc làm khối này cao gấp đôi cho
          hai chữ, mà đây mới là thẻ đầu trang — mọi thứ bên dưới bị đẩy xuống theo.
        */}
        <XStack flexWrap="wrap" gap={space.md} rowGap={space.xs}>
          <XStack ai="center" gap={space.xs}>
            <Text col={colors.textMuted} fos={fontSize.label}>
              {t('axisOperation')}
            </Text>
            <StatusBadge
              label={domainLabel(
                'vehicleOperationStatus',
                operationStatus,
                metaLabel(VEHICLE_OPERATION_STATUS_META, operationStatus),
              )}
              color={metaColor(VEHICLE_OPERATION_STATUS_META, operationStatus)}
              size="sm"
            />
          </XStack>
          <XStack ai="center" gap={space.xs}>
            <Text col={colors.textMuted} fos={fontSize.label}>
              {t('axisPublic')}
            </Text>
            <StatusBadge
              label={domainLabel(
                'vehiclePublicStatus',
                publicStatus,
                metaLabel(VEHICLE_PUBLIC_STATUS_META, publicStatus),
              )}
              color={metaColor(VEHICLE_PUBLIC_STATUS_META, publicStatus)}
              size="sm"
            />
          </XStack>
        </XStack>

        {/*
          Trục THỨ BA — "chủ xe có muốn bán chiếc này lúc này không" (ADR 0048).

          KHÔNG nằm trong hàng hai trục phía trên: hai viên kia là trạng thái ĐỌC, còn hàng này
          mang một công tắc GHI. Nó trải hết bề ngang, ngay dưới chúng — đúng chỗ ADR 0048 điều 6
          đặt nó ở khổ hẹp ("các NÚT chuyển xuống thanh CTA đáy màn còn hàng này ở lại").

          Và chỉ có MỘT chỗ này trên cả màn: thẻ xét duyệt phía dưới cố ý không mang công tắc
          thứ hai cho cùng một trạng thái.
        */}
        <YStack pt={space.xs} borderTopWidth={1} borderColor={colors.borderSubtle}>
          <MarketplaceVisibilityRow vehicle={vehicle} />
        </YStack>

        {/*
          Dải trạng thái xét duyệt ở CUỐI thẻ hồ sơ — đúng `Alert` của `Vehicle360Overview` bên web:
          chỉ bốn trạng thái cần chú ý (từ chối · cần bổ sung · bị ẩn · chờ duyệt); đã duyệt và nháp
          thì không (nháp đã có "Việc cần làm", thẻ xét duyệt nói chi tiết hơn). Câu của người
          duyệt đi nguyên văn khi trạng thái dùng lý do.
        */}
        {banner ? (
          <Callout
            tone={CALLOUT_TONE[banner.type]}
            title={tPublish(`status.${banner.key}.message`)}
          >
            {banner.useReason && vehicle.latestPublicReview?.reason
              ? vehicle.latestPublicReview.reason
              : tPublish(`status.${banner.key}.description`)}
          </Callout>
        ) : null}
      </YStack>
    </Card>
  );
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
const TODO_TONE_ICON: Readonly<Record<VehicleAlertSeverity, { name: IconName; color: string }>> = {
  [VEHICLE_ALERT_SEVERITY.CRITICAL]: { name: 'alert-circle', color: colors.danger },
  [VEHICLE_ALERT_SEVERITY.WARNING]: { name: 'alert-circle', color: colors.warning },
  [VEHICLE_ALERT_SEVERITY.INFO]: { name: 'information-circle', color: colors.info },
};
/** Đã biết chắc không còn việc gì (tải xong và rỗng). Đang tải/hỏng thì KHÔNG có biểu tượng. */
const TODO_CLEAR_ICON: { name: IconName; color: string } = {
  name: 'checkmark-circle',
  color: colors.success,
};

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

  return (
    <Card>
      <YStack gap={space.sm}>
        {/*
          Viên đếm CHỈ hiện khi có việc — đúng điều kiện của web. Biểu tượng mức nặng nhất đứng
          cạnh nó; màu không bao giờ là kênh duy nhất — từng việc vẫn nói mức bằng chữ.
        */}
        <BlockTitle
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
        </BlockTitle>
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
  const t = useTranslations('Vehicles.overview');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const shortRange = useShortRange();

  return (
    <Card>
      <YStack gap={space.sm}>
        <BlockTitle>{t('schedules.title')}</BlockTitle>
        {loading ? (
          <SkeletonText lines={2} />
        ) : failed || bookings === undefined ? (
          <Muted>{t('loadFailed')}</Muted>
        ) : bookings.length === 0 ? (
          <Muted>{t('schedules.empty')}</Muted>
        ) : (
          /*
            Mỗi lượt thuê là một Ô RIÊNG trên nền mờ, không phải hai dòng chữ ngăn bằng vạch kẻ.
            Ba lượt xếp liền nhau trong một thẻ trắng đọc thành một khối chữ liền; cho mỗi lượt
            một mặt phẳng thì ranh giới tự hiện ra mà không cần thêm đường kẻ nào.
          */
          <YStack gap={space.xs}>
            {bookings.map((booking) => (
              <XStack
                key={booking.id}
                gap={space.sm}
                p={space.sm}
                br={radius.sm}
                bg={colors.surfaceMuted}
              >
                {/* Vạch màu theo trạng thái đơn — nhận ra lượt nào đang chạy mà không phải đọc. */}
                <YStack
                  w={3}
                  br={radius.pill}
                  bg={statusTone(metaColor(BOOKING_STATUS_META, booking.status)).fg}
                />
                <YStack f={1} gap={2}>
                  <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                    {t('schedules.item', {
                      customer: booking.customerName,
                      range: shortRange(booking.pickupAt, booking.returnAt),
                    })}
                  </Text>
                  <Text col={colors.textMuted} fos={fontSize.bodySm}>
                    {t('schedules.sub', {
                      amount: fmt.money(booking.totalAmount),
                      status: domainLabel('bookingStatus', booking.status),
                    })}
                  </Text>
                </YStack>
              </XStack>
            ))}
          </YStack>
        )}
      </YStack>
    </Card>
  );
}

/**
 * Dải LIÊN KẾT NHANH tới các mục con của xe — bản native của `ModuleLinks` bên web. Danh sách,
 * thứ tự, quyền và đích theo khu nằm ở `vehicleModuleLinks` (hàm thuần, có test).
 *
 * Chip chứ không phải danh sách dọc: chín lối đi mà mỗi lối một hàng thì khối này dài hơn cả
 * phần nội dung nó dẫn tới.
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
  const t = useTranslations('Vehicles.overview.links');
  const { has } = usePermissions();
  const navigateOnce = useNavigateOnce();

  const can = useVehicleCapabilities();
  const links = vehicleModuleLinks({ vehicle, canEdit, customerScope, has, can });
  if (links.length === 0) return null;

  return (
    <Card>
      {/*
        Viên XUỐNG DÒNG, không cuộn ngang.

        Cuộn ngang giấu mất mục thứ tư trở đi ngoài mép màn: người dùng phải đoán là còn nữa rồi
        mới quét tìm. Ở đây là MỤC LỤC của cả màn, nên mười lối đi phải thấy được cùng lúc —
        viên chữ ngắn nên ba dòng vẫn gọn hơn hẳn một dải ô hình.

        Tông `accent` (viền + icon + chữ vàng đậm) chứ không phải viên xám: viền xám của viên
        chọn nói "đây là một lựa chọn đang tắt", trong khi mấy viên này là lối ĐI. Cũng vì thế
        `role="button"`, không phải `tab`.
      */}
      <YStack gap={space.sm}>
        {/* Tiêu đề dải — web `bandTitle`: nói đúng vai "đây là các khu vực của chiếc xe này". */}
        <BlockTitle>{t('title')}</BlockTitle>
        <XStack flexWrap="wrap" gap={space.xs} accessibilityLabel={t('ariaLabel')}>
          {links.map((link) => (
            <Chip
              key={link.key}
              label={t(link.key)}
              icon={link.icon}
              tone="accent"
              role="button"
              size="sm"
              onPress={() => navigateOnce(link.href)}
            />
          ))}
        </XStack>
      </YStack>
    </Card>
  );
}

/**
 * Một ô số: nhãn nhỏ ở trên, con số lớn ở dưới, trên nền mờ.
 *
 * `tone` chỉ tô khi con số ĐANG NÓI ĐIỀU GÌ ĐÓ (có đơn đang chạy). Tô cả hai ô thì màu hết là
 * tín hiệu và thành trang trí.
 */
function StatTile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <YStack f={1} gap={2} p={space.sm} br={radius.sm} bg={colors.surfaceMuted}>
      <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
        {label}
      </Text>
      <Text col={tone ?? colors.text} fos={fontSize.bodyLg} fow={fontWeight.bold} numberOfLines={1}>
        {value}
      </Text>
    </YStack>
  );
}

/**
 * Hiệu suất — CHỈ chuyện vận hành: xe đã chạy bao nhiêu chuyến, đang có mấy đơn.
 *
 * Doanh thu cố ý không nằm ở đây: web đã tách tiền sang khối theo kỳ, và đặt một con số luỹ kế
 * cạnh một con số theo kỳ trên cùng màn là cách chắc chắn để người đọc lấy nhầm số.
 */
function PerformanceCard({
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
  // Chưa ai chấm thì KHÔNG dựng ô — "0/5" là một lời chê không có thật.
  const rated = stats && stats.ratingCount > 0 && stats.ratingAvg;

  return (
    <Card>
      <YStack gap={space.sm}>
        <BlockTitle>{t('performance.title')}</BlockTitle>
        {loading ? (
          <SkeletonText lines={2} />
        ) : failed || !stats ? (
          <Muted>{t('loadFailed')}</Muted>
        ) : (
          /*
            HAI Ô SỐ nằm cạnh nhau, không phải hai dòng nhãn–giá trị.

            Đây là hai con số ĐỘC LẬP và ngắn; xếp thành dòng `DataRow` thì nhãn dài chiếm hơn
            nửa bề ngang để trưng một con số hai chữ, và cả khối đọc như bảng thông số kỹ thuật.
            Ô số cho chúng đúng trọng lượng: số to, nhãn nhỏ ở trên.
          */
          <YStack gap={space.xs}>
            <XStack gap={space.xs}>
              <StatTile
                label={t('performance.rentals')}
                value={t('performance.tripCount', { count: stats.completedBookings })}
              />
              <StatTile
                label={t('performance.active')}
                value={t('performance.activeCount', { count: stats.activeBookings })}
                tone={stats.activeBookings > 0 ? colors.info : undefined}
              />
            </XStack>
            {rated ? (
              <StatTile
                label={t('performance.rating')}
                value={t('performance.ratingValue', {
                  rating: fmt.rating(Number(stats.ratingAvg)),
                  count: stats.ratingCount,
                })}
              />
            ) : null}
          </YStack>
        )}
      </YStack>
    </Card>
  );
}

/**
 * TỐI ƯU NHẬN CHUYẾN — thẻ riêng trên hồ sơ xe, đúng `AutomationCard` của web.
 *
 * Trước đợt này app chỉ có MỘT dòng trong dải liên kết `ModuleLinks`. Về mặt điều hướng thì tới
 * được, nhưng nó nằm lẫn giữa chín mục khác và không mang câu giải thích nào — người dùng đọc
 * hết hồ sơ xe vẫn không biết "tự động nhận chuyến" là gì và bật nó được ở đâu. Web cố ý tách nó
 * thành thẻ có tiêu đề + một câu mô tả + lối "Cấu hình"; app giờ cũng vậy, và dòng trong
 * `ModuleLinks` được gỡ đi để không còn hai lối vào cùng một màn.
 *
 * Ẩn khi xe không phục vụ dịch vụ nào CÓ thiết lập riêng: thuê dài hạn luôn do gian hàng chốt
 * lịch tay (ADR 0011), nên với xe chỉ cho thuê dài hạn thẻ này không có gì để nói.
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

  const hasConfigurableService = VEHICLE_SERVICE_SETTING_SERVICES.some((service) =>
    vehicle.serviceTypes.includes(service),
  );
  if (!hasConfigurableService) return null;

  return (
    <Card>
      <YStack gap={space.sm}>
        <BlockTitle
          {...(canEdit
            ? {
                action: (
                  <BlockLink
                    label={t('automation.editLink')}
                    onPress={() => navigateOnce(vehicleOptimizationHref(vehicle, customerScope))}
                  />
                ),
              }
            : {})}
        >
          {t('automation.title')}
        </BlockTitle>
        <Muted>{t('automation.hint')}</Muted>
      </YStack>
    </Card>
  );
}

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
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();

  const empty = tLabels('emptyValue');
  const discounted = discountedPriceVnd(vehicle.weekdayPrice, vehicle.discountPercent);

  return (
    <Card>
      <YStack gap={space.sm}>
        <BlockTitle
          {...(canEdit
            ? {
                action: (
                  <BlockLink
                    label={t('pricing.editLink')}
                    onPress={() => navigateOnce(vehiclePricingHref(vehicle.id, customerScope))}
                  />
                ),
              }
            : {})}
        >
          {t('pricing.title')}
        </BlockTitle>
        <DataRow
          labelWide
          label={t('pricing.weekday')}
          value={vehicle.weekdayPrice ? fmt.pricePerDay(vehicle.weekdayPrice) : empty}
        />
        <DataRow
          labelWide
          label={t('pricing.weekend')}
          value={vehicle.weekendPrice ? fmt.pricePerDay(vehicle.weekendPrice) : empty}
        />
        {vehicle.hourlyPrice ? (
          <DataRow label={t('pricing.hourly')} value={fmt.pricePerHour(vehicle.hourlyPrice)} />
        ) : null}
        {vehicle.discountPercent ? (
          <DataRow label={t('pricing.discount')} value={`${vehicle.discountPercent}%`} />
        ) : null}
        {discounted != null ? (
          <DataRow label={t('pricing.publicPrice')} value={fmt.money(discounted)} strong />
        ) : null}
        <DataRow
          labelWide
          label={t('pricing.delivery')}
          value={vehicle.deliveryEnabled ? t('pricing.deliveryOn') : t('pricing.deliveryOff')}
        />
      </YStack>
    </Card>
  );
}

/**
 * Tóm tắt giấy tờ.
 *
 * CỐ Ý chỉ hiện ĐẾM theo cảnh báo do server tính — không loại giấy tờ, không số hiệu, không ngày
 * hết hạn cụ thể. Những thứ đó nằm sau `documents.view_details`; lặp lại chúng ở đây là mở một
 * cửa sau vào dữ liệu PII.
 */
function DocumentsCard({
  vehicleId,
  summary,
  customerScope,
}: {
  vehicleId: string;
  summary: Vehicle360Summary | undefined;
  customerScope: boolean;
}) {
  const t = useTranslations('Vehicles.overview');
  const navigateOnce = useNavigateOnce();
  const alerts = summary?.alerts ?? [];
  const expired = alerts.find((a) => a.kind === VEHICLE_ALERT_KIND.DOCUMENT_EXPIRED);
  const expiring = alerts.find((a) => a.kind === VEHICLE_ALERT_KIND.DOCUMENT_EXPIRING);

  // Không có mục Giấy tờ ở khu đang đứng ⇒ không bày lối vào (web `part()` trả null).
  const manageHref = vehicleEditPartHref(vehicleId, VEHICLE_EDIT_TAB.DOCUMENTS, customerScope);

  return (
    <Card>
      <YStack gap={space.sm}>
        <BlockTitle
          action={
            manageHref ? (
              <BlockLink
                label={t('documents.manageLink')}
                onPress={() => navigateOnce(manageHref)}
              />
            ) : undefined
          }
        >
          {t('documents.title')}
        </BlockTitle>
        {expired || expiring ? (
          <>
            {expired ? (
              <Text col={colors.danger} fos={fontSize.bodySm}>
                {t('documents.expired', { count: expired.count ?? 1 })}
              </Text>
            ) : null}
            {expiring ? (
              <Text col={colors.warning} fos={fontSize.bodySm}>
                {t('documents.expiring', { count: expiring.count ?? 1 })}
              </Text>
            ) : null}
          </>
        ) : summary ? (
          <Muted>{t('documents.clear')}</Muted>
        ) : (
          <Muted>{t('documents.unknown')}</Muted>
        )}
      </YStack>
    </Card>
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
function KeySpecsCard({ vehicle, onViewAll }: { vehicle: VehicleDetail; onViewAll: () => void }) {
  const t = useTranslations('Vehicles.overview');
  const tLabels = useTranslations('Common.labels');
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
        <BlockTitle
          action={
            <BlockLink
              label={t('keySpecs.viewAll')}
              accessibilityLabel={t('keySpecs.viewAllLabel')}
              onPress={onViewAll}
            />
          }
        >
          {t('keySpecs.title')}
        </BlockTitle>
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
      </YStack>
    </Card>
  );
}

function SpecsCard({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations('Vehicles.overview');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const { featureLabel } = useCatalogLabels();
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
        <BlockTitle>{t('specs.title')}</BlockTitle>

        {/*
          `labelWide` cho CẢ bảng: nhãn dài, giá trị ngắn. Ô áp dụng mà chưa nhập vẫn có dòng "—"
          (y như `Descriptions` của web); ô không áp dụng cho loại xe thì không có dòng.
        */}
        {rows.map((row) => (
          <DataRow key={row.key} label={row.label} value={row.value} labelWide />
        ))}

        {vehicle.features.length > 0 ? (
          <XStack flexWrap="wrap" gap={space.xs}>
            {vehicle.features.map((key) => (
              <YStack key={key} bg={colors.surfaceMuted} br={radius.pill} px={space.xs} py={2}>
                <Text col={colors.text} fos={fontSize.label}>
                  {featureLabel(key)}
                </Text>
              </YStack>
            ))}
          </XStack>
        ) : null}

        {vehicle.description ? (
          <Text col={colors.text} fos={fontSize.bodySm}>
            {vehicle.description}
          </Text>
        ) : null}
      </YStack>
    </Card>
  );
}

/**
 * Tóm tắt nguồn xe. Chi tiết tài chính chỉ tải khi người xem có `finance.view` — người không có
 * quyền chỉ thấy HÌNH THỨC (đã nằm sẵn trên bản ghi xe), không thấy con số.
 */
function SourceCard({ vehicle }: { vehicle: VehicleDetail }) {
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

  const summaryLine = detail
    ? [
        detail.bankName,
        detail.ownerName,
        detail.monthlyTotal
          ? t('source.monthlyTotal', { amount: fmt.money(detail.monthlyTotal) })
          : null,
        detail.monthlyRent
          ? t('source.monthlyRent', { amount: fmt.money(detail.monthlyRent) })
          : null,
        detail.commissionPercent
          ? t('source.commission', { percent: detail.commissionPercent })
          : null,
        detail.paymentDay ? t('source.paymentDay', { day: detail.paymentDay }) : null,
      ]
        .filter(Boolean)
        .join(LIST_SEPARATOR)
    : '';

  return (
    <Card>
      <YStack gap={space.sm}>
        <BlockTitle>{t('source.title')}</BlockTitle>

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

        {detail && summaryLine ? (
          <Text col={colors.text} fos={fontSize.bodySm}>
            {summaryLine}
          </Text>
        ) : null}

        {/*
          Liên kết xuống hồ sơ nguồn xe & tài chính — web có, app thiếu cho tới giờ.
          Chưa khai nguồn xe thì đổi thành lời mời bổ sung, đúng hai nhánh của web.
        */}
        {canViewFinance && !source.isPending ? (
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
        <BlockTitle
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
        </BlockTitle>
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
  const t = useTranslations('Vehicles.overview');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const shortRange = useShortRange();

  return (
    <Card>
      <YStack gap={space.sm}>
        <BlockTitle>{t('activity.title')}</BlockTitle>
        {loading ? (
          <SkeletonText lines={3} />
        ) : failed || bookings === undefined ? (
          <Muted>{t('loadFailed')}</Muted>
        ) : bookings.length === 0 ? (
          <Muted>{t('activity.empty')}</Muted>
        ) : (
          bookings.map((booking, index) => {
            const icon = activityIcon(booking.status);
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
