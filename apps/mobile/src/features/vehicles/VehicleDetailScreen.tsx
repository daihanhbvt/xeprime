import { useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  PERMISSION,
  STATUS_COLOR,
  BOOKING_STATUS,
  BOOKING_STATUS_META,
  VEHICLE_ALERT_KIND,
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_PUBLIC_STATUS_META,
  VEHICLE_SOURCE_TYPE,
  type BookingStatus,
  type VehicleOperationStatus,
  type VehiclePublicStatus,
  type VehicleSourceType,
} from '@xeprime/types';
import { LIST_SEPARATOR, toAppTz } from '@xeprime/domain';
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
import { useErrorMessage } from '@/i18n/use-error-message';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB, type VehicleEditTab } from '@/navigation/vehicle-edit-tab';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { VehicleAlertList } from './components/VehicleAlertList';
import { VehiclePublishCard } from './components/VehiclePublishCard';
import { discountedPriceVnd } from './pricing';
import {
  useDeleteVehicle,
  useVehicle,
  useVehicleSource,
  useVehicleSummary,
} from './hooks/use-vehicle';
import type { Vehicle360Summary, VehicleBookingBrief, VehicleDetail } from './api';

const HERO_HEIGHT = 200;
const GALLERY_THUMB = 96;

/* `Image` của React Native cần style phẳng — Tamagui không có primitive ảnh thay thế. */
const styles = StyleSheet.create({
  hero: { width: '100%', height: HERO_HEIGHT, backgroundColor: colors.surfaceMuted },
  thumb: {
    width: GALLERY_THUMB,
    height: GALLERY_THUMB,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
});

/**
 * Hồ sơ 360 của một xe (VEH-03) + tiến trình lên chợ (VEH-12).
 *
 * Thứ tự khối lấy nguyên của web: ảnh + định danh + KM + hai trục trạng thái → việc cần làm ·
 * lịch thuê sắp tới · hiệu suất → giá & chính sách → giấy tờ (chỉ ĐẾM) → thông số → nguồn xe →
 * thư viện ảnh → gửi duyệt → hoạt động gần đây.
 *
 * Khối tiền theo kỳ (`FinanceEntityPanel` của web) KHÔNG có ở đây: nó thuộc module Finance,
 * chưa có bản native. Bịa một khối tiền rỗng còn tệ hơn là không có nó.
 */
export function VehicleDetailScreen({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations('Vehicles.detail');
  const router = useRouter();
  const { has, isLoading: permissionsLoading } = usePermissions();
  const canView = has(PERMISSION.VEHICLE_VIEW);

  const back = () => goBackOr(router, ROUTES.manage.vehicles());
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
    return (
      <>
        <AppHeader title={t('title')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenError
            error={query.error}
            title={t('loadErrorTitle')}
            onRetry={() => void query.refetch()}
          />
        </Screen>
      </>
    );
  }

  return <VehicleDetailBody vehicle={query.data} onBack={back} />;
}

function VehicleDetailBody({ vehicle, onBack }: { vehicle: VehicleDetail; onBack: () => void }) {
  const t = useTranslations('Vehicles.overview');
  const tDetail = useTranslations('Vehicles.detail');
  const tActions = useTranslations('Common.actions');
  const router = useRouter();
  const navigateOnce = useNavigateOnce();
  const toast = useAppToast();
  const tStates = useTranslations('Common.states');
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();

  const summary = useVehicleSummary(vehicle.id);
  const remove = useDeleteVehicle();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const canDelete = has(PERMISSION.VEHICLE_DELETE);
  const canEdit = has(PERMISSION.VEHICLE_UPDATE);

  function onDelete() {
    remove.mutate(vehicle.id, {
      onSuccess: () => {
        toast.showSuccess(tDetail('deleted'));
        setConfirmingDelete(false);
        router.replace(ROUTES.manage.vehicles());
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
      >
        <YStack gap={layout.section}>
          <ProfileCard vehicle={vehicle} summary={summary.data} />

          <TodoCard
            summary={summary.data}
            loading={summary.isPending}
            failed={summary.isError}
          />

          {has(PERMISSION.BOOKING_VIEW) ? (
            <ScheduleCard
              bookings={summary.data?.upcomingBookings}
              loading={summary.isPending}
              failed={summary.isError}
            />
          ) : null}

          <PerformanceCard
            summary={summary.data}
            loading={summary.isPending}
            failed={summary.isError}
          />

          <ModuleLinks vehicle={vehicle} canEdit={canEdit} />

          <PricingCard vehicle={vehicle} canEdit={canEdit} />

          {has(PERMISSION.VEHICLE_DOCUMENT_VIEW) ? (
            <DocumentsCard vehicleId={vehicle.id} summary={summary.data} />
          ) : null}

          <SpecsCard vehicle={vehicle} />

          <MediaCard vehicle={vehicle} />

          {/*
            Nguồn xe đứng SAU thư viện ảnh, đúng thứ tự web đọc ra ở khổ một cột: cột trái của
            web là giá → giấy tờ → thông số → ảnh, rồi mới sang cột phải nguồn xe → bảo dưỡng →
            gửi duyệt. Ở mobile hai cột đó xếp nối nhau.
          */}
          <SourceCard vehicle={vehicle} />

          <VehiclePublishCard vehicle={vehicle} />

          {has(PERMISSION.BOOKING_VIEW) ? (
            <ActivityCard
              bookings={summary.data?.recentBookings}
              loading={summary.isPending}
              failed={summary.isError}
            />
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
                  onPress={() => navigateOnce(ROUTES.manage.vehicleEdit(vehicle.id))}
                />
              </YStack>
            ) : null}
            <YStack f={1}>
              <Button
                label={t('scheduleMobile')}
                variant="secondary"
                size="sm"
                onPress={() => toast.showInfo(tStates('featureComingSoon'))}
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

function ProfileCard({
  vehicle,
  summary,
}: {
  vehicle: VehicleDetail;
  summary: Vehicle360Summary | undefined;
}) {
  const t = useTranslations('Vehicles.overview');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const operationStatus = vehicle.operationStatus as VehicleOperationStatus;
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
        <XStack ai="center" gap={space.xs}>
          <Text f={1} col={colors.text} fos={fontSize.h3} fow={fontWeight.bold}>
            {vehicle.name}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {vehicle.code}
          </Text>
        </XStack>

        {/*
          `plate` và `odometer` mang thẻ rich `<b>` — phải đi qua `t.rich`. Gọi bằng `t()` thường
          thì use-intl không dựng nổi và trả về NGUYÊN KHOÁ ra màn hình.
        */}
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t.rich('plate', {
            value: vehicle.plateNumber || tLabels('notAvailable'),
            b: (chunks) => <Strong>{chunks}</Strong>,
          })}
          {` • ${domainLabel('vehicleType', vehicle.vehicleType)} / ${fmt.serviceTypes(vehicle.serviceTypes)}`}
        </Text>

        {/*
          KM có thẩm quyền + NGUỒN của nó. Chưa có số thì nói "Chưa có" — không dựng "0 km".
          Nguồn cho biết số đến từ bàn giao, bảo dưỡng hay chỉnh tay, để người đọc biết tin nó
          tới đâu.
        */}
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t.rich('odometer', {
            value: fmt.km(summary?.currentOdometerKm ?? null),
            b: (chunks) => <Strong>{chunks}</Strong>,
          })}
          {summary?.currentOdometerSource
            ? ` · ${domainLabel('odometerSource', summary.currentOdometerSource)}`
            : ''}
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
                VEHICLE_OPERATION_STATUS_META[operationStatus].label,
              )}
              color={VEHICLE_OPERATION_STATUS_META[operationStatus].color}
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
                VEHICLE_PUBLIC_STATUS_META[publicStatus].label,
              )}
              color={VEHICLE_PUBLIC_STATUS_META[publicStatus].color}
              size="sm"
            />
          </XStack>
        </XStack>
      </YStack>
    </Card>
  );
}

function TodoCard({
  summary,
  loading,
  failed,
}: {
  summary: Vehicle360Summary | undefined;
  loading: boolean;
  failed: boolean;
}) {
  const t = useTranslations('Vehicles.overview');
  const alerts = summary?.alerts ?? [];

  return (
    <Card>
      <YStack gap={space.sm}>
        {/*
          Viên đếm CHỈ hiện khi có việc — `alerts.length > 0`, đúng điều kiện của web.

          Hiện "0" thì con số đỏ mất hết sức nặng: nó phải là thứ chỉ xuất hiện khi có chuyện,
          không phải một ô luôn nằm đó. Đang tải cũng không hiện, vì lúc đó `alerts` rỗng nhưng
          chưa biết thật sự có việc hay không.
        */}
        <BlockTitle
          {...(alerts.length > 0
            ? { action: <CountBadge count={alerts.length} tone="danger" /> }
            : {})}
        >
          {t('todo.title')}
        </BlockTitle>
        {loading ? (
          <SkeletonText lines={2} />
        ) : failed || !summary ? (
          <Muted>{t('loadFailed')}</Muted>
        ) : (
          <VehicleAlertList alerts={summary.alerts ?? []} />
        )}
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
                <YStack w={3} br={radius.pill} bg={statusTone(BOOKING_STATUS_META[booking.status as BookingStatus].color).fg} />
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
 * Dải LIÊN KẾT NHANH tới các mục con của xe — bản native của `ModuleLinks` bên web.
 *
 * Cùng danh sách, cùng thứ tự, cùng điều kiện quyền. Hai mục của web không có đích ở app và
 * KHÔNG dựng ra ở đây thay vì dựng một nút chết: `calendar` (màn lịch CAL-01 chưa làm) và
 * `receipts` (sổ thu chi của xe — module tài chính chưa mở ở app). Chúng sẽ tự xuất hiện khi hai
 * màn đó có mặt; danh sách này là nơi duy nhất phải sửa.
 *
 * Chip chứ không phải danh sách dọc: chín lối đi mà mỗi lối một hàng thì khối này dài hơn cả
 * phần nội dung nó dẫn tới.
 */
function ModuleLinks({ vehicle, canEdit }: { vehicle: VehicleDetail; canEdit: boolean }) {
  const t = useTranslations('Vehicles.overview.links');
  const tStates = useTranslations('Common.states');
  const { has } = usePermissions();
  const navigateOnce = useNavigateOnce();
  const toast = useAppToast();

  /**
   * `href` trống = mục CÓ ở web nhưng app chưa có màn đích.
   *
   * Vẫn hiện đúng chỗ của nó và chạm vào báo "đang phát triển" — cùng quy ước `comingSoon` mà
   * `ManageDrawer` đang dùng. Ẩn đi thì người dùng không biết chức năng có tồn tại, và người
   * dựng app quên mất còn nợ cái gì.
   */
  const links: { key: string; label: string; icon: IconName; href?: Href }[] = [];
  const tab = (value: VehicleEditTab) => ROUTES.manage.vehicleEditTab(vehicle.id, value);

  if (canEdit) {
    links.push(
      {
        key: 'information',
        label: t('information'),
        icon: 'car-outline',
        href: tab(VEHICLE_EDIT_TAB.INFORMATION),
      },
      {
        key: 'media',
        label: t('media'),
        icon: 'images-outline',
        href: tab(VEHICLE_EDIT_TAB.MEDIA),
      },
      {
        key: 'pricing',
        label: t('pricing'),
        icon: 'pricetag-outline',
        href: ROUTES.manage.vehiclePricing(vehicle.id),
      },
    );
    if (has(PERMISSION.FINANCE_VIEW)) {
      links.push({
        key: 'source',
        label: t('source'),
        icon: 'wallet-outline',
        href: tab(VEHICLE_EDIT_TAB.SOURCE),
      });
    }
  }
  if (has(PERMISSION.VEHICLE_DOCUMENT_VIEW)) {
    links.push({
      key: 'documents',
      label: t('documents'),
      icon: 'document-text-outline',
      href: tab(VEHICLE_EDIT_TAB.DOCUMENTS),
    });
  }
  if (has(PERMISSION.VEHICLE_MAINTENANCE_VIEW)) {
    links.push(
      {
        key: 'maintenance',
        label: t('maintenance'),
        icon: 'construct-outline',
        href: tab(VEHICLE_EDIT_TAB.MAINTENANCE),
      },
      {
        key: 'maintenanceCenter',
        label: t('maintenanceCenter'),
        icon: 'build-outline',
        href: ROUTES.manage.maintenance(),
      },
    );
  }
  if (has(PERMISSION.CALENDAR_VIEW)) {
    // Màn lịch (CAL-01) chưa có ở app — hiện mục, chạm vào báo đang phát triển.
    links.push({ key: 'calendar', label: t('calendar'), icon: 'calendar-outline' });
  }
  if (has(PERMISSION.BOOKING_VIEW)) {
    // Kèm `vehicleId` như web: bấm từ hồ sơ xe thì ra đơn CỦA XE NÀY, không phải cả gian hàng.
    links.push({
      key: 'bookings',
      label: t('bookings'),
      icon: 'receipt-outline',
      href: ROUTES.manage.bookings({ vehicleId: vehicle.id }),
    });
  }
  if (has(PERMISSION.FINANCE_VIEW)) {
    // Sổ thu chi của riêng xe — module tài chính chưa mở ở app.
    links.push({ key: 'receipts', label: t('receipts'), icon: 'cash-outline' });
  }

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
      <XStack flexWrap="wrap" gap={space.xs} accessibilityLabel={t('ariaLabel')}>
        {links.map((link) => (
          <Chip
            key={link.key}
            label={link.label}
            icon={link.icon}
            tone="accent"
            role="button"
            size="sm"
            onPress={() =>
              link.href
                ? navigateOnce(link.href)
                : toast.showInfo(tStates('featureComingSoon'))
            }
          />
        ))}
      </XStack>
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
  const stats = summary?.stats;

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
          <XStack gap={space.xs}>
            <StatTile
              label={t('performance.rentals')}
              value={t('performance.tripCount', { count: stats.completedBookings })}
            />
            <StatTile
              label={t('performance.activeLabel')}
              value={t('performance.activeCount', { count: stats.activeBookings })}
              tone={stats.activeBookings > 0 ? colors.info : undefined}
            />
          </XStack>
        )}
      </YStack>
    </Card>
  );
}

function PricingCard({ vehicle, canEdit }: { vehicle: VehicleDetail; canEdit: boolean }) {
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
                    onPress={() => navigateOnce(ROUTES.manage.vehiclePricing(vehicle.id))}
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
}: {
  vehicleId: string;
  summary: Vehicle360Summary | undefined;
}) {
  const t = useTranslations('Vehicles.overview');
  const navigateOnce = useNavigateOnce();
  const alerts = summary?.alerts ?? [];
  const expired = alerts.find((a) => a.kind === VEHICLE_ALERT_KIND.DOCUMENT_EXPIRED);
  const expiring = alerts.find((a) => a.kind === VEHICLE_ALERT_KIND.DOCUMENT_EXPIRING);

  return (
    <Card>
      <YStack gap={space.sm}>
        <BlockTitle
          action={
            <BlockLink
              label={t('documents.manageLink')}
              onPress={() =>
                navigateOnce(ROUTES.manage.vehicleEditTab(vehicleId, VEHICLE_EDIT_TAB.DOCUMENTS))
              }
            />
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

function SpecsCard({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations('Vehicles.overview');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  // Xe lưu KEY của danh mục, không lưu nhãn — nhãn tra từ `catalog_items` do admin cấu hình.
  const { brandLabel, bodyTypeLabel, fuelTypeLabel, featureLabel } = useCatalogLabels();

  const empty = tLabels('emptyValue');
  /*
   * Số đo kèm đơn vị. Con số đi qua `fmt.count` để dấu phân tách nhóm theo ngôn ngữ đang xem
   * (`4.630` vi · `4,630` en). Đơn vị (mm/kg/cc/HP/L per 100km) là KÝ HIỆU, không dịch.
   */
  const metric = (value: number | string | null | undefined, unit: string): string =>
    value == null || value === '' ? empty : t('metric', { value: fmt.count(Number(value)), unit });

  /**
   * 17 dòng thông số, dựng thành DỮ LIỆU thay vì 17 khối JSX.
   *
   * Khoá message liệt kê tường minh trong hàm này chứ không ghép động: `t('specs.' + name)` lọt
   * qua typecheck của use-intl rồi vỡ lúc chạy khi một khoá bị đổi tên.
   */
  const specRows = (): { label: string; value: string }[] => [
    { label: t('specs.brand'), value: brandLabel(vehicle.brand) || empty },
    { label: t('specs.model'), value: vehicle.model || empty },
    { label: t('specs.bodyType'), value: bodyTypeLabel(vehicle.bodyType) ?? empty },
    {
      label: t('specs.manufactureYear'),
      value: vehicle.manufactureYear ? String(vehicle.manufactureYear) : empty,
    },
    { label: t('specs.seatCount'), value: vehicle.seatCount ? String(vehicle.seatCount) : empty },
    { label: t('specs.fuelType'), value: fuelTypeLabel(vehicle.fuelType) ?? empty },
    { label: t('specs.color'), value: vehicle.color || empty },
    { label: t('specs.length'), value: metric(vehicle.lengthMm, 'mm') },
    { label: t('specs.width'), value: metric(vehicle.widthMm, 'mm') },
    { label: t('specs.height'), value: metric(vehicle.heightMm, 'mm') },
    { label: t('specs.curbWeight'), value: metric(vehicle.curbWeightKg, 'kg') },
    {
      label: t('specs.engineDisplacement'),
      value: metric(vehicle.engineDisplacementCc, 'cc'),
    },
    { label: t('specs.horsepower'), value: metric(vehicle.horsepowerHp, 'HP') },
    {
      label: t('specs.transmission'),
      value: vehicle.transmission ? domainLabel('transmissionType', vehicle.transmission) : empty,
    },
    {
      label: t('specs.fuelCombined'),
      value: metric(vehicle.fuelConsumptionCombined, 'L/100km'),
    },
    { label: t('specs.createdAt'), value: fmt.dateTime(vehicle.createdAt) },
    { label: t('specs.updatedAt'), value: fmt.dateTime(vehicle.updatedAt) },
  ];

  return (
    <Card>
      <YStack gap={space.sm}>
        <BlockTitle>{t('specs.title')}</BlockTitle>

        {/*
          Bảng thông số là chỗ DUY NHẤT trong app có nhãn dài mà giá trị ngắn ("Trọng lượng bản
          thân" ↔ "—"), nên `labelWide` bật cho CẢ bảng thay vì gõ lại ở từng dòng — tỉ lệ 3:7
          mặc định làm gần như mọi nhãn ở đây xuống hai dòng.

          Vẫn liệt kê ĐỦ mọi dòng kể cả khi rỗng, y như `Descriptions` của web: một ô "—" nói
          "chưa nhập", còn giấu hẳn dòng đi thì người dùng không biết trường đó có tồn tại.
        */}
        {specRows().map((row) => (
          <DataRow key={row.label} label={row.label} value={row.value} labelWide />
        ))}

        {vehicle.features.length > 0 ? (
          <XStack flexWrap="wrap" gap={space.xs}>
            {vehicle.features.map((key) => (
              <YStack
                key={key}
                bg={colors.surfaceMuted}
                br={radius.pill}
                px={space.xs}
                py={2}
              >
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
  const { has } = usePermissions();

  const canViewFinance = has(PERMISSION.FINANCE_VIEW);
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
              label={t('source.detailLink')}
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

function MediaCard({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations('Vehicles.overview');
  const tStates = useTranslations('Common.states');
  /*
    State đặt TRƯỚC lệnh thoát sớm: hook phải chạy đủ và đúng thứ tự ở mọi lần render, mà số ảnh
    thì đổi được sau khi tải xong.
  */
  const [preview, setPreview] = useState<string | null>(null);

  if (vehicle.images.length === 0) return null;

  return (
    <Card>
      <YStack gap={space.sm}>
        <BlockTitle>{t('media.title')}</BlockTitle>
        {/* Cuộn ngang: mười ảnh xếp lưới dọc đẩy mọi khối bên dưới ra khỏi tầm với. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <XStack gap={space.xs}>
            {vehicle.images.map((url) => (
              /*
                Chạm để xem TOÀN MÀN — web bọc lưới trong `PreviewImageGroup` của AntD, và một
                thư viện ảnh không phóng to được thì chỉ là mấy con tem: ở 72pt không nhìn ra vết
                xước hay móp, tức không dùng được vào đúng việc người ta mở nó ra để làm.
              */
              <Pressable
                key={url}
                onPress={() => setPreview(url)}
                accessibilityRole="imagebutton"
                accessibilityLabel={t('media.title')}
              >
                <Image
                  source={{ uri: url }}
                  style={styles.thumb}
                  cachePolicy="memory-disk"
                  transition={150}
                  accessible={false}
                />
              </Pressable>
            ))}
          </XStack>
        </ScrollView>
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
                    <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                      {t('activity.item', {
                        code: booking.code,
                        status: domainLabel('bookingStatus', booking.status),
                      })}
                    </Text>
                    <Text col={colors.textMuted} fos={fontSize.bodySm}>
                      {t('activity.sub', {
                        customer: booking.customerName,
                        range: shortRange(booking.pickupAt, booking.returnAt),
                        amount: fmt.money(booking.totalAmount),
                      })}
                    </Text>
                    <Text col={colors.textMuted} fos={fontSize.label}>
                      {fmt.dateTime(booking.updatedAt)}
                    </Text>
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
