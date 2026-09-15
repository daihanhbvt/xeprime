import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, type ListRenderItem } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { PERMISSION, SERVICE_TYPE_VALUES, VEHICLE_OPERATION_STATUS_VALUES } from '@xeprime/types';
import { FILTER_ALL } from '@/constants/filters';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { IconName } from '@/components/ui/Chip';
import { FleetVehicleCardSkeleton } from '@/components/ui/Skeleton';
import { SelectControl } from '@/components/ui/SelectControl';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { Callout } from '@/components/ui/Callout';
import type { CardAction } from '@/components/ui/CardActionBar';
import { VehicleCard } from '@/features/vehicles/components/VehicleCard';
import {
  useInfiniteVehicles,
  useVehicleAlerts,
  useVehicleStats,
} from '@/features/vehicles/hooks/use-vehicles';
import type { VehicleListItem } from '@/features/vehicles/api';
import { useDomainLabel } from '@/i18n/domain';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_REGISTRATION_SOURCE } from '@/navigation/vehicle-registration-source';
import { layout } from '@/theme/layout';
import { MEDIA_LIST_TUNING } from '@/theme/list-tuning';
import { colors, fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';

/** Sentinel "mọi giá trị" của giao diện — không endpoint nào nhận `operationStatus=all`. */
const ALL = FILTER_ALL;

/**
 * Style của vùng cuộn dựng MỘT lần: object literal ở prop là một tham chiếu mới mỗi render, và
 * `FlatList` so sánh nông nên nó tự coi mình vừa đổi cấu hình.
 */
const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: layout.screenX,
    paddingTop: space.md,
    paddingBottom: space.xl,
    gap: layout.inline,
  },
});

const SKELETON_ROWS = 3;

function vehicleKeyExtractor(vehicle: VehicleListItem): string {
  return vehicle.id;
}

/**
 * Danh sách xe của CHỦ XE trong khu tài khoản — bản native của `AccountVehiclesView`.
 *
 * Cùng API, cùng hook và cùng thẻ xe với đội xe ở cổng quản lý (`VehicleListScreen`); khác đúng
 * những gì web khác:
 *  - **bộ lọc ít hơn** — dịch vụ + trạng thái vận hành, không có loại xe / trạng thái công khai /
 *    sắp xếp / tìm kiếm;
 *  - **hai thẻ dẫn đường** tới Cẩm nang và Hợp đồng & Chứng từ, ngay trên bộ lọc;
 *  - **vỏ của khu TÀI KHOẢN** — thanh trên có nút lui về menu tài khoản, không phải `ManageHeader`
 *    với nút mở drawer quản lý.
 *
 * Chi tiết xe và hub sửa xe KHÔNG được nhân bản: chúng là màn chen ngang nằm ngoài bộ tab quản lý
 * (`app/manage/vehicles/[id]/…`), nên mở từ đây vẫn lui về đúng danh sách này. Dựng bản thứ hai
 * của chúng là hai bộ luật giá/giấy tờ/bảo dưỡng sẽ trôi khỏi nhau.
 *
 * Được `OwnerGate` bọc ở route: người không phải chủ gian hàng không tới được đây, nên không có
 * request tenant nào bay đi vô ích.
 */
export function AccountVehiclesScreen() {
  const t = useTranslations('Account.vehicles');
  const tVehicles = useTranslations('Vehicles.list');
  const tLabels = useTranslations('Common.labels');
  const tActions = useTranslations('Common.actions');
  const tPermission = useTranslations('ManageCommon.permission');
  const router = useRouter();
  const domainLabel = useDomainLabel();
  const permissions = usePermissions();

  const [serviceType, setServiceType] = useState<string>(ALL);
  const [operationStatus, setOperationStatus] = useState<string>(ALL);

  const query = useInfiniteVehicles({
    ...(serviceType === ALL ? {} : { serviceType }),
    ...(operationStatus === ALL ? {} : { operationStatus }),
  });

  const { items } = query;
  const ids = useMemo(() => items.map((item) => item.id), [items]);
  const stats = useVehicleStats(ids);
  const alerts = useVehicleAlerts(ids);

  const canCreate = permissions.has(PERMISSION.VEHICLE_CREATE);
  const filtered = serviceType !== ALL || operationStatus !== ALL;

  const openVehicle = useCallback(
    (vehicle: VehicleListItem) => router.push(ROUTES.account.vehicleDetail(vehicle.id)),
    [router],
  );

  // MỘT đích cho cả nút đầu danh sách lẫn nút của trạng thái rỗng — hai bản riêng là hai chỗ có
  // thể trôi khỏi nhau khi nguồn đăng ký đổi.
  const openRegister = useCallback(() => {
    router.push(ROUTES.listYourVehicle.register(VEHICLE_REGISTRATION_SOURCE.ACCOUNT));
  }, [router]);

  const clearFilters = useCallback(() => {
    setServiceType(ALL);
    setOperationStatus(ALL);
  }, []);

  /**
   * ĐÚNG HAI thao tác, đúng thứ tự web đặt ở màn này (`AccountVehiclesView.rowActions`):
   * **Quản lý xe** trước, rồi **Xem chi tiết**.
   *
   * Đây là bộ RIÊNG của khu tài khoản, không phải bộ Xem · Sửa · Lịch của cổng quản lý. Web tách
   * hai bộ vì hai màn trả lời hai câu hỏi khác nhau: ở cổng quản lý người ta đang vận hành đội
   * xe, còn ở đây chủ xe vào để mở KHÔNG GIAN QUẢN LÝ của một chiếc — 13 mục cấu hình dịch vụ,
   * bàn giao, phụ phí. Nhãn "Sửa" dẫn tới cùng đường đó là nói sai việc nó làm.
   *
   * Không gác theo `VEHICLE_UPDATE`: web không gác, và bên trong không gian quản lý mỗi mục đã
   * tự kiểm quyền của chính nó.
   */
  const rowActions = useCallback(
    (vehicle: VehicleListItem): readonly CardAction[] => [
      {
        key: 'manage',
        label: t('manage'),
        icon: 'construct-outline',
        onPress: () => router.push(ROUTES.account.vehicleManage(vehicle.id)),
      },
      {
        key: 'view',
        label: t('viewDetail'),
        icon: 'eye-outline',
        onPress: () => openVehicle(vehicle),
      },
    ],
    [t, router, openVehicle],
  );

  const renderItem = useCallback<ListRenderItem<VehicleListItem>>(
    ({ item }) => (
      <VehicleCard
        vehicle={item}
        onPress={openVehicle}
        actions={rowActions}
        stats={stats.byId.get(item.id)}
        statsLoading={stats.isLoading}
        statsFailed={stats.isError}
        alerts={alerts.byId.get(item.id)}
        alertsLoading={alerts.isLoading}
        alertsFailed={alerts.isError}
      />
    ),
    [
      openVehicle,
      rowActions,
      stats.byId,
      stats.isLoading,
      stats.isError,
      alerts.byId,
      alerts.isLoading,
      alerts.isError,
    ],
  );

  const serviceOptions = useMemo(
    () => [
      { value: ALL, label: tLabels('all') },
      ...SERVICE_TYPE_VALUES.map((value) => ({
        value,
        label: domainLabel('serviceType', value),
      })),
    ],
    [tLabels, domainLabel],
  );

  const statusOptions = useMemo(
    () => [
      { value: ALL, label: t('statusAll') },
      ...VEHICLE_OPERATION_STATUS_VALUES.map((value) => ({
        value,
        label: domainLabel('vehicleOperationStatus', value),
      })),
    ],
    [t, domainLabel],
  );

  const header = (
    <AppHeader
      onBack={() => goBackOr(router, ROUTES.account.home())}
      title={t('title')}
      subtitle={t('subtitle')}
    />
  );

  // Thiếu quyền là 403 của CHÍNH màn này — hiện trạng thái của nó, không đá về đăng nhập.
  if (!permissions.isLoading && !permissions.has(PERMISSION.VEHICLE_VIEW)) {
    return (
      <>
        {header}
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          {/*
            Cùng nội dung `PermissionState` của web: nói KHÔNG CÓ QUYỀN (chứ không lấy tên màn
            làm tiêu đề), nêu đích danh quyền còn thiếu, và một lối về. Thiếu dòng "Cần quyền"
            thì người dùng chỉ biết mình bị chặn mà không biết phải xin cái gì.
          */}
          <ScreenMessage
            icon="lock-closed-outline"
            title={tPermission('deniedTitle')}
            description={`${tPermission('deniedBody')}\n${tPermission('requires')} ${PERMISSION.VEHICLE_VIEW}`}
            actionLabel={tPermission('backHome')}
            onAction={() => router.replace(ROUTES.account.home())}
          />
        </Screen>
      </>
    );
  }

  /**
   * "Thêm xe" — dựng MỘT lần và dùng lại ở cả đầu danh sách lẫn trạng thái rỗng, đúng cách web
   * truyền cùng một `addButton` vào `AccountPageHeader` và vào `emptyAction` của lưới. Chủ xe
   * chưa có chiếc nào thì thứ duy nhất họ cần là nút này, và bắt họ cuộn ngược lên đầu để tìm
   * nó là biến màn rỗng thành một ngõ cụt.
   *
   * Đích KHÁC web một bậc: web đi vào wizard đăng xe nhanh 3 bước
   * (`/list-your-vehicle/register?from=account`), app chưa dựng wizard đó nên vào thẳng biểu mẫu
   * thêm xe đầy đủ. Cùng kết quả, nhiều bước hơn — đây là phần còn lại của khoảng cách
   * `QuickVehicleOwnerStep`, không phải một đích sai.
   */
  const addButton = <Button label={t('addVehicle')} icon="add" onPress={openRegister} />;

  const listHeader = (
    <YStack gap={space.md} pb={space.md}>
      {canCreate ? addButton : null}

      {/* Hai thẻ dẫn đường — trỏ tới tài liệu THẬT trong khu này, không nhắc nghị định/tỷ lệ. */}
      <YStack gap={space.sm}>
        <TipCard
          icon="book-outline"
          title={t('tips.guideTitle')}
          body={t('tips.guideBody')}
          onPress={() => router.push(ROUTES.account.hostGuide())}
        />
        <TipCard
          icon="documents-outline"
          title={t('tips.documentsTitle')}
          body={t('tips.documentsBody')}
          onPress={() => router.push(ROUTES.account.contractsDocuments())}
        />
      </YStack>

      <YStack gap={space.sm}>
        <SelectControl
          label={t('serviceFilterLabel')}
          value={serviceType}
          options={serviceOptions}
          onChange={setServiceType}
        />
        <SelectControl
          label={t('statusFilterLabel')}
          value={operationStatus}
          options={statusOptions}
          onChange={setOperationStatus}
        />
      </YStack>

      {/*
        Cảnh báo/KM tải hỏng là hỏng MỘT PHẦN, và web nói ra nó ở đầu lưới thay vì để mỗi thẻ tự
        thì thầm: danh sách vẫn đọc được, nhưng "việc cần làm" và số KM đang vắng mặt — không nói
        thì chủ xe đọc một đội xe không có việc nào cần làm và tin là thật.
      */}
      {alerts.isError ? (
        <Callout tone="warning" title={tVehicles('grid.alertsErrorTitle')}>
          <YStack gap={space.sm}>
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {tVehicles('grid.alertsErrorBody')}
            </Text>
            <Button
              label={tActions('retry')}
              icon="refresh-outline"
              variant="ghost"
              size="sm"
              onPress={() => void alerts.refetch()}
            />
          </YStack>
        </Callout>
      ) : null}

      {/*
        Đếm kết quả — bản native của dòng `grid.showing` ở chân lưới web. Ở đây nó lên ĐẦU vì
        danh sách cuộn vô hạn không có chân để đặt, và "đang xem 12 trong 48 xe" là thứ cần biết
        TRƯỚC khi cuộn chứ không phải sau.
      */}
      {items.length > 0 ? (
        <Text col={colors.textMuted} fos={fontSize.label}>
          {tVehicles('grid.showing', { from: 1, to: items.length, total: query.total })}
        </Text>
      ) : null}
    </YStack>
  );

  /**
   * Khung xương, lỗi và rỗng đều nằm DƯỚI khối đầu trang, không thay chỗ nó: bộ lọc phải còn đó
   * để gỡ ra — nếu không, "không khớp bộ lọc" thành một ngõ cụt.
   */
  const body: ReactNode = query.isInitialLoading ? (
    <YStack gap={layout.inline}>
      {Array.from({ length: SKELETON_ROWS }, (_, i) => (
        <FleetVehicleCardSkeleton key={i} />
      ))}
    </YStack>
  ) : query.initialError ? (
    <ScreenError
      error={query.initialError}
      title={tVehicles('grid.loadErrorTitle')}
      onRetry={query.retry}
    />
  ) : (
    /*
      "Đang lọc mà rỗng" và "chưa có xe nào" là hai câu chuyện khác nhau: một cái lối ra là gỡ bộ
      lọc, cái kia là thêm xe đầu tiên. Dùng chung một câu là bỏ rơi cả hai.
    */
    <ScreenMessage
      icon={filtered ? 'search-outline' : 'car-outline'}
      title={filtered ? tVehicles('grid.noResultsTitle') : tVehicles('grid.emptyTitle')}
      description={filtered ? tVehicles('grid.noResultsBody') : tVehicles('grid.emptyBody')}
      {...(filtered
        ? {
            actionLabel: tActions('clear'),
            actionIcon: 'close-outline' as const,
            onAction: clearFilters,
          }
        : canCreate
          ? { actionLabel: t('addVehicle'), actionIcon: 'add' as const, onAction: openRegister }
          : {})}
    />
  );

  return (
    <>
      {header}
      <Screen edges={['left', 'right', 'bottom']} scroll={false} padded={false}>
        <FlatList
          data={items}
          keyExtractor={vehicleKeyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={body}
          {...MEDIA_LIST_TUNING}
          onEndReached={query.fetchNextPage}
          ListFooterComponent={
            query.appendError != null ? (
              <Button
                label={tActions('retry')}
                icon="refresh-outline"
                variant="ghost"
                size="sm"
                onPress={query.fetchNextPage}
              />
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={query.isRefreshing}
              onRefresh={query.retry}
              tintColor={colors.primaryActive}
            />
          }
        />
      </Screen>
    </>
  );
}

/** Thẻ dẫn đường tới một tài liệu của chủ xe — hình tròn, hai dòng chữ, mũi tên. */
function TipCard({
  icon,
  title,
  body,
  onPress,
}: {
  icon: IconName;
  title: string;
  body: string;
  onPress: () => void;
}) {
  return (
    <Card padded={false} lift="flat">
      <Pressable
        onPress={onPress}
        accessibilityRole="link"
        accessibilityLabel={title}
        style={({ pressed }) => (pressed ? { backgroundColor: colors.surfaceMuted } : null)}
      >
        <XStack ai="center" gap={space.sm} p={space.md} minHeight={sizing.touchTarget}>
          <YStack w={36} h={36} br={radius.sm} bg={colors.primaryLight} ai="center" jc="center">
            <Ionicons name={icon} size={iconSize.sm} color={colors.primaryActive} />
          </YStack>
          <YStack f={1} minWidth={0} gap={2}>
            <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {title}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.label}>
              {body}
            </Text>
          </YStack>
          <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.placeholder} />
        </XStack>
      </Pressable>
    </Card>
  );
}
