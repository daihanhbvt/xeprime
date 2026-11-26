import { useMemo, useState, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  API_ERROR_CODE,
  BOOKING_STATUS_META,
  BOOKING_STATUS_VALUES,
  PERMISSION,
  STATUS_COLOR,
  type BookingStatus,
} from '@xeprime/types';
import { LIST_SEPARATOR, nowInAppTz } from '@xeprime/domain';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ContactActions } from '@/components/ui/ContactActions';
import { DataRow } from '@/components/ui/DataRow';
import { IconSquareButton } from '@/components/ui/IconSquareButton';
import { InfoHint } from '@/components/ui/InfoHint';
import { MONTH_PERIOD_FORMAT, MonthPeriodField } from '@/components/ui/MonthPeriodField';
import { pillToneOfStatusColor } from '@/components/ui/Pill';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { UnderlineTabs } from '@/components/ui/UnderlineTabs';
import { LineIcon } from '@/components/icons/LineIcon';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { ManagePageHeader } from '@/features/shell/ManagePageHeader';
import { useAccumulatedPages } from '@/hooks/use-accumulated-pages';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { getErrorCode } from '@/lib/api-client';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, iconSize, radius, space, typeScale } from '@/theme/tokens';
import type { InternalDriver, InternalDriverOverview } from './api';
import { DriverTripCard, DriverTripsToolbar } from './components/DriverTripParts';
import { InternalDriverFormSheet } from './components/InternalDriverFormSheet';
import {
  useArchiveInternalDriver,
  useInternalDriverDetail,
  useInternalDriverTrips,
  useRestoreInternalDriver,
} from './hooks/use-internal-drivers';

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const SEARCH_DEBOUNCE_MS = 400;
const ALL_STATUSES = 'all';
const AVATAR = 40;
/** Ảnh khách trong khối "Chuyến sắp tới" (Figma `24512:120426`: 32). */
const CUSTOMER_AVATAR = 32;

const TAB = { OVERVIEW: 'overview', TRIPS: 'trips' } as const;
type Tab = (typeof TAB)[keyof typeof TAB];

const currentMonth = () => nowInAppTz().format(MONTH_PERIOD_FORMAT);

/**
 * Chi tiết MỘT tài xế NỘI BỘ (ADR 0108) — dữ liệu và thao tác như web `InternalDriverDetailPage`;
 * hình theo KHUÔN chi tiết tài xế liên kết của Figma Partner-XePrime "MB — Vehice / Driver / Detail"
 * (`24512:119081` · `24512:120445`) vì Figma không vẽ bản nội bộ (người dùng chốt 26/11/2026):
 *
 *  - Đầu trang trắng: ảnh + tên + SĐT, viên "Nhân viên nội bộ" + trạng thái, Gọi · Zalo, "Chuyến
 *    đang gán", hai tab gạch chân.
 *  - **Tổng quan**: Chuyến sắp tới (Xem lịch xe), Ghi chú nội bộ (Chỉnh sửa; câu "không ghi tiền
 *    công" ở dấu (!)), ngày thêm / lưu trữ, lối "Ngừng hợp tác" / "Khôi phục".
 *  - **Chuyến đã gán**: tháng, tìm + trạng thái đơn, thẻ chuyến (không có tiền công).
 */
export function InternalDriverDetailScreen() {
  const params = useLocalSearchParams<{ id: string; month?: string }>();
  const id = params.id ?? '';
  const t = useTranslations('Drivers');
  const tPage = useTranslations('Drivers.detailPage');
  const tInt = useTranslations('Drivers.internalDetail');
  const tApp = useTranslations('Drivers.app.detail');
  const tTabs = useTranslations('Drivers.detail.tabs');
  const tActions = useTranslations('Common.actions');
  const router = useRouter();
  const colors = useColors();
  const toast = useAppToast();
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const permissions = usePermissions();
  const canView = permissions.has(PERMISSION.DRIVER_VIEW);
  const canManage = permissions.has(PERMISSION.DRIVER_MANAGE);

  const [month, setMonth] = useState<string>(
    params.month && MONTH_PATTERN.test(params.month) ? params.month : currentMonth(),
  );
  const [tab, setTab] = useState<Tab>(TAB.OVERVIEW);
  const [editing, setEditing] = useState<InternalDriver | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const detail = useInternalDriverDetail(canView ? id : null);
  const archive = useArchiveInternalDriver();
  const restore = useRestoreInternalDriver();
  const back = () => goBackOr(router, ROUTES.manage.drivers());

  if (!permissions.isLoading && !canView) {
    return (
      <>
        <AppHeader title={tPage('pageTitle')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={t('page.forbidden.title')}
            description={t('page.forbidden.description')}
          />
        </Screen>
      </>
    );
  }

  const data = detail.data && detail.data.driver.id === id ? detail.data : undefined;
  if (!data) {
    const notFound = getErrorCode(detail.error) === API_ERROR_CODE.NOT_FOUND;
    return (
      <>
        <ManagePageHeader title={tPage('pageTitle')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={!detail.isError}>
          {detail.isError ? (
            notFound ? (
              <ScreenMessage icon="search-outline" title={tPage('notFound')} />
            ) : (
              <ScreenError
                error={detail.error}
                title={tPage('loadError')}
                onRetry={() => void detail.refetch()}
              />
            )
          ) : (
            <YStack gap={space.md}>
              <Skeleton height={96} />
              <SkeletonText lines={4} />
            </YStack>
          )}
        </Screen>
      </>
    );
  }

  const driver = data.driver;
  const archived = driver.archivedAt != null;
  const canEdit = canManage && !archived;
  const feedback = (key: 'internal.toast.archived' | 'internal.toast.restored') => ({
    onSuccess: () => toast.showSuccess(t(key)),
    onError: (err: unknown) => toast.showError(errorMessage(err)),
  });

  return (
    <>
      {/* Figma "Header MB" biến thể chi tiết: ← + "Chi tiết tài xế", nút sửa viền bên phải. */}
      <ManagePageHeader
        title={tPage('pageTitle')}
        onBack={back}
        {...(canEdit
          ? {
              actions: (
                <IconSquareButton label={tPage('profile.edit')} onPress={() => setEditing(driver)}>
                  <LineIcon name="edit" size={iconSize.lg} color={colors.placeholder} />
                </IconSquareButton>
              ),
            }
          : {})}
      />
      <Screen
        padded={false}
        edges={['left', 'right', 'bottom']}
        refreshing={detail.isRefetching}
        onRefresh={() => void detail.refetch()}
      >
        {/* Khối đầu trắng (Figma "_Kanban Items" `24512:119675`): đệm 16/16/0, các dòng cách 12, tab ở đáy. */}
        <YStack bg={colors.surface} px={space.md} pt={space.md} gap={12} elevation={1}>
          <XStack ai="center" gap={space.sm}>
            <Avatar name={driver.name} url={driver.photoUrl ?? null} size={AVATAR} />
            <YStack f={1} minWidth={0}>
              <Text
                col={colors.text}
                fos={typeScale.body.fontSize}
                lh={typeScale.body.lineHeight}
                fow={fontWeight.medium}
                numberOfLines={1}
              >
                {driver.name}
              </Text>
              <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
                {driver.phone}
              </Text>
            </YStack>
          </XStack>

          {/* Figma "Driver Status" `24512:119725`: viên loại xám + viên trạng thái. */}
          <XStack flexWrap="wrap" ai="center" gap={12}>
            <YStack px={space.sm} py={2} br={radius.card} bg={colors.background}>
              <Text
                col={colors.textMuted}
                fos={typeScale.label.fontSize}
                lh={typeScale.label.lineHeight}
                fow={fontWeight.medium}
              >
                {t('roster.typeInternal')}
              </Text>
            </YStack>
            <StatePill archived={archived} />
          </XStack>

          {/* Gọi · Zalo bằng SĐT tài xế nội bộ — không có chat (không tài khoản). */}
          <ContactActions
            labeled
            phone={driver.phone}
            labels={{ message: '', call: tApp('call'), zalo: tApp('zalo') }}
          />

          <XStack jc="space-between" ai="center" gap={space.sm}>
            <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
              {t('card.activeTrips')}
            </Text>
            {driver.activeTripCount > 0 ? (
              <Pressable
                onPress={() => setTab(TAB.OVERVIEW)}
                accessibilityRole="link"
                hitSlop={space.xs}
              >
                <Text
                  col={colors.brandLink}
                  fos={typeScale.body.fontSize}
                  lh={typeScale.body.lineHeight}
                  fow={fontWeight.medium}
                  textDecorationLine="underline"
                >
                  {t('activeBookings', { count: driver.activeTripCount })}
                </Text>
              </Pressable>
            ) : (
              <Text col={colors.textDisabled} fos={typeScale.body.fontSize} fow={fontWeight.medium}>
                {t('app.noTrips')}
              </Text>
            )}
          </XStack>

          <UnderlineTabs
            stretch
            items={[
              { key: TAB.OVERVIEW, label: tTabs('overview') },
              { key: TAB.TRIPS, label: tInt('tripsTitle') },
            ]}
            value={tab}
            onChange={setTab}
          />
        </YStack>

        <YStack p={space.md} gap={space.md}>
          {tab === TAB.OVERVIEW ? (
            <>
              <UpcomingTrips overview={data} />

              {/* Figma "Ghi chú nội bộ" `24512:120318`. */}
              <Block gap={12}>
                <BlockTitle
                  adornment={<InfoHint label={tPage('note.title')} content={tInt('noWageNote')} />}
                  end={
                    canEdit ? (
                      <Pressable onPress={() => setEditing(driver)} accessibilityRole="button" hitSlop={space.sm}>
                        <XStack ai="center" gap={6}>
                          <LineIcon name="edit" size={iconSize.lg} color={colors.brandLink} />
                          <Text
                            col={colors.brandLink}
                            fos={typeScale.body.fontSize}
                            lh={typeScale.body.lineHeight}
                            fow={fontWeight.semibold}
                          >
                            {tApp('noteEdit')}
                          </Text>
                        </XStack>
                      </Pressable>
                    ) : undefined
                  }
                >
                  {tPage('note.title')}
                </BlockTitle>
                <YStack bg={colors.background} br={10} p={12}>
                  <Text
                    col={driver.note ? colors.textMuted : colors.placeholder}
                    fos={typeScale.body.fontSize}
                    lh={typeScale.body.lineHeight}
                  >
                    {driver.note ?? tPage('note.empty')}
                  </Text>
                </YStack>
              </Block>

              <Block gap={space.sm}>
                <DataRow size="md" labelWide label={tPage('profile.addedAt')} value={fmt.date(driver.createdAt)} />
                {driver.archivedAt ? (
                  <DataRow
                    size="md"
                    labelWide
                    label={tPage('profile.archivedAt')}
                    value={fmt.date(driver.archivedAt)}
                  />
                ) : null}
              </Block>

              {/* Lối chữ cuối trang (Figma "Hủy liên kết" `24512:120196`: 14 semibold đỏ). */}
              {canManage ? (
                <XStack>
                  {archived ? (
                    <TextAction
                      label={tInt('restore')}
                      disabled={restore.isPending}
                      onPress={() => restore.mutate(driver.id, feedback('internal.toast.restored'))}
                    />
                  ) : (
                    <TextAction
                      danger
                      label={tInt('archive')}
                      disabled={archive.isPending}
                      onPress={() => setConfirmArchive(true)}
                    />
                  )}
                </XStack>
              ) : null}
            </>
          ) : (
            <InternalTripsSection key={driver.id} driverId={driver.id} month={month} onMonthChange={setMonth} />
          )}
        </YStack>
      </Screen>

      <InternalDriverFormSheet open={editing !== null} driver={editing} onClose={() => setEditing(null)} />

      <AlertDialog
        open={confirmArchive}
        title={t('internal.actions.archiveConfirm', { name: driver.name })}
        {...(driver.activeTripCount > 0
          ? { message: t('internal.actions.archiveHasTrips', { count: driver.activeTripCount }) }
          : {})}
        confirmLabel={tInt('archive')}
        cancelLabel={tActions('close')}
        destructive
        loading={archive.isPending}
        onConfirm={() => {
          setConfirmArchive(false);
          archive.mutate(driver.id, feedback('internal.toast.archived'));
        }}
        onCancel={() => setConfirmArchive(false)}
      />
    </>
  );
}

/** Viên trạng thái danh bạ: đang hoạt động (xanh) / đã lưu trữ (xám). */
function StatePill({ archived }: { archived: boolean }) {
  const colors = useColors();
  const t = useTranslations('Drivers.roster');
  return (
    <XStack
      px={space.sm}
      py={2}
      br={radius.card}
      bw={1}
      bc={archived ? colors.border : colors.success}
      bg={archived ? colors.background : colors.successSurface}
    >
      <Text
        col={archived ? colors.textMuted : colors.success}
        fos={typeScale.label.fontSize}
        lh={typeScale.label.lineHeight}
        fow={fontWeight.medium}
      >
        {archived ? t('internalArchived') : t('internalActive')}
      </Text>
    </XStack>
  );
}

/** Lối chữ cuối trang (Figma "Hủy liên kết": chữ 14 đậm, đỏ). */
function TextAction({
  label,
  onPress,
  danger = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      hitSlop={space.sm}
    >
      <Text
        opacity={disabled ? 0.45 : 1}
        col={danger ? colors.danger : colors.textMuted}
        fos={typeScale.body.fontSize}
        lh={typeScale.body.lineHeight}
        fow={fontWeight.semibold}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Khung thẻ khối của Figma: nền trắng, viền `stroke/gray-low200`, bo 16, đệm 16. */
function Block({ children, gap = 10 }: { children: ReactNode; gap?: number }) {
  const colors = useColors();
  return (
    <YStack bg={colors.surface} bw={1} bc={colors.border} br={radius.card} p={space.md} gap={gap}>
      {children}
    </YStack>
  );
}

/** Đầu khối Figma: tiêu đề 16/24 semibold, dấu (!) sát tiêu đề, nút chữ bên phải. */
function BlockTitle({
  children,
  end,
  adornment,
}: {
  children: string;
  end?: ReactNode;
  adornment?: ReactNode;
}) {
  const colors = useColors();
  return (
    <XStack ai="center" jc="space-between" gap={space.sm}>
      <XStack f={1} ai="center" gap={space.xs} minWidth={0}>
        <Text
          flexShrink={1}
          col={colors.text}
          fos={typeScale.title.fontSize}
          lh={typeScale.title.lineHeight}
          fow={fontWeight.semibold}
        >
          {children}
        </Text>
        {adornment}
      </XStack>
      {end}
    </XStack>
  );
}

/**
 * "Chuyến sắp tới" — Figma `24512:120175`: tiêu đề + "Xem lịch xe →" (lịch thuê, như web
 * `DriverUpcomingTrips`); mỗi đơn một ô viền bo 12 đệm 12: "#mã • xe" (16 semibold), giờ (14 xám
 * nhạt), ảnh + tên + SĐT khách. Tài xế nội bộ không có tiền công nên không có cột tiền.
 */
function UpcomingTrips({ overview }: { overview: InternalDriverOverview }) {
  const colors = useColors();
  const t = useTranslations('Drivers.detailPage.overview.upcoming');
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();
  const { driver, current } = overview;

  return (
    <Block gap={12}>
      <BlockTitle
        end={
          <Pressable
            onPress={() => navigateOnce(ROUTES.manage.calendar())}
            accessibilityRole="link"
            hitSlop={space.sm}
          >
            <XStack ai="center" gap={6}>
              <Text col={colors.brandLink} fos={typeScale.body.fontSize} lh={20} fow={fontWeight.semibold}>
                {t('viewCalendar')}
              </Text>
              <LineIcon name="arrow-right" size={iconSize.lg} color={colors.brandLink} />
            </XStack>
          </Pressable>
        }
      >
        {t('title')}
      </BlockTitle>
      {current.length === 0 ? (
        <Text col={colors.textMuted} fos={typeScale.body.fontSize}>
          {t('empty')}
        </Text>
      ) : (
        current.map((trip) => (
          <Pressable
            key={trip.bookingId}
            onPress={() => navigateOnce(ROUTES.manage.bookingDetail(trip.bookingId))}
            accessibilityRole="button"
            accessibilityLabel={trip.bookingCode}
          >
            <YStack bw={1} bc={colors.border} br={12} p={12} gap={space.md}>
              <YStack gap={space.xs}>
                <XStack ai="center" gap={6} minWidth={0}>
                  <Text
                    col={colors.text}
                    fos={typeScale.title.fontSize}
                    lh={typeScale.title.lineHeight}
                    fow={fontWeight.semibold}
                  >
                    {`#${trip.bookingCode}`}
                  </Text>
                  <YStack w={6} h={6} br={3} bg={colors.textDisabled} />
                  <Text
                    f={1}
                    col={colors.text}
                    fos={typeScale.title.fontSize}
                    lh={typeScale.title.lineHeight}
                    fow={fontWeight.semibold}
                    numberOfLines={1}
                  >
                    {[trip.vehicleName, trip.vehiclePlate].filter(Boolean).join(LIST_SEPARATOR)}
                  </Text>
                </XStack>
                <Text col={colors.placeholder} fos={typeScale.body.fontSize} lh={20}>
                  {fmt.shortDateTimeRange(trip.pickupAt, trip.returnAt)}
                </Text>
              </YStack>
              <XStack ai="center" gap={space.sm}>
                <Avatar name={trip.customerName} url={null} size={CUSTOMER_AVATAR} />
                <YStack f={1} minWidth={0}>
                  <Text
                    col={colors.text}
                    fos={typeScale.body.fontSize}
                    lh={20}
                    fow={fontWeight.medium}
                    numberOfLines={1}
                  >
                    {trip.customerName}
                  </Text>
                  {trip.customerPhone ? (
                    <Text col={colors.placeholder} fos={typeScale.body.fontSize} lh={20}>
                      {trip.customerPhone}
                    </Text>
                  ) : null}
                </YStack>
              </XStack>
            </YStack>
          </Pressable>
        ))
      )}
      {driver.activeTripCount > current.length ? (
        <Text col={colors.placeholder} fos={typeScale.label.fontSize}>
          {t('more', { shown: current.length, total: driver.activeTripCount })}
        </Text>
      ) : null}
    </Block>
  );
}

/**
 * Tab "Chuyến đã gán" — khuôn tab "Chuyến & tiền công" của Figma (`24512:120445`): thẻ tháng (Figma
 * `24512:121231`, bản nội bộ không có tổng tiền / bảng kê), hàng tìm + "Trạng thái" (trạng thái ĐƠN),
 * thẻ chuyến. Tìm + lọc ở server, tải thêm theo trang (web `InternalDriverDetailPage`).
 */
function InternalTripsSection({
  driverId,
  month,
  onMonthChange,
}: {
  driverId: string;
  month: string;
  onMonthChange: (month: string) => void;
}) {
  const colors = useColors();
  const tInt = useTranslations('Drivers.internalDetail');
  const tTrips = useTranslations('Drivers.detailPage.trips');
  const tDrivers = useTranslations('Drivers');
  const tApp = useTranslations('Drivers.app.detail');
  const tActions = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const navigateOnce = useNavigateOnce();

  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search, SEARCH_DEBOUNCE_MS).trim() || undefined;
  const [status, setStatus] = useState<string>(ALL_STATUSES);
  const statusFilter = status === ALL_STATUSES ? undefined : status;
  const pagingKey = `${month}|${q ?? ''}|${statusFilter ?? ''}`;
  const [paging, setPaging] = useState({ key: pagingKey, page: 1 });
  const page = paging.key === pagingKey ? paging.page : 1;
  const query = useInternalDriverTrips(driverId, { month, q, status: statusFilter, page });
  const items = useAccumulatedPages(query.data?.items, query.data?.meta?.page);
  const meta = query.data?.meta;
  const filtered = Boolean(q || statusFilter);
  const [year, mm] = month.split('-');

  const statusOptions = useMemo(
    () => [
      { value: ALL_STATUSES, label: tTrips('allStatuses') },
      ...BOOKING_STATUS_VALUES.map((value) => ({
        value,
        label: domainLabel('bookingStatus', value),
      })),
    ],
    [domainLabel, tTrips],
  );

  return (
    <>
      {/* Figma `24512:121231`: thẻ trắng bo 12, đệm 12 — tiêu đề + gợi ý trái, chọn tháng phải. */}
      <XStack
        ai="center"
        jc="space-between"
        gap={space.sm}
        p={12}
        br={radius.control}
        bg={colors.surface}
        bw={1}
        bc={colors.border}
      >
        <YStack f={1} minWidth={0} gap={2}>
          <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} numberOfLines={2}>
            {tInt('tripsHint')}
          </Text>
          <Text col={colors.text} fos={typeScale.title.fontSize} lh={typeScale.title.lineHeight} fow={fontWeight.semibold}>
            {meta ? tDrivers('activeBookings', { count: meta.total }) : '-'}
          </Text>
        </YStack>
        <MonthPeriodField
          variant="chip"
          label={tDrivers('wage.month.label')}
          display={tApp('month', { month: `${mm}/${year}` })}
          value={month}
          onChange={onMonthChange}
          maxPeriod={currentMonth()}
        />
      </XStack>

      <DriverTripsToolbar
        search={search}
        onSearch={setSearch}
        status={status}
        allValue={ALL_STATUSES}
        options={statusOptions}
        onStatus={setStatus}
      />

      {query.isPending ? (
        <SkeletonText lines={4} />
      ) : query.isError && !query.data ? (
        <ScreenError error={query.error} title={tInt('loadError')} onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        filtered ? (
          <ScreenMessage icon="search-outline" title={tTrips('emptyFiltered')} description={tTrips('emptyFilteredHint')} />
        ) : (
          <ScreenMessage icon="car-outline" title={tInt('empty')} description={tInt('emptyHint')} />
        )
      ) : (
        <YStack gap={space.md} accessibilityLabel={tInt('tableLabel')}>
          {items.map((row) => {
            const meta2 = BOOKING_STATUS_META[row.bookingStatus as BookingStatus];
            return (
              <DriverTripCard
                key={row.bookingId}
                bookingCode={row.bookingCode}
                statusLabel={domainLabel('bookingStatus', row.bookingStatus, meta2?.label)}
                statusTone={pillToneOfStatusColor(meta2?.color ?? STATUS_COLOR.NEUTRAL)}
                vehicleName={row.vehicleName}
                vehiclePlate={row.vehiclePlate}
                customerName={row.customerName}
                customerPhone={row.customerPhone}
                timeText={fmt.shortDateTimeRange(row.pickupAt, row.returnAt)}
                onPress={() => navigateOnce(ROUTES.manage.bookingDetail(row.bookingId))}
              />
            );
          })}
          {meta && meta.page * meta.limit < meta.total ? (
            <Button
              label={tActions('viewMore')}
              variant="outline"
              size="compact"
              loading={query.isFetching}
              onPress={() => setPaging({ key: pagingKey, page: page + 1 })}
            />
          ) : null}
        </YStack>
      )}
    </>
  );
}
