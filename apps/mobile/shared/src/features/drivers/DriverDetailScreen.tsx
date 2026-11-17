import { useMemo, useState } from 'react';
import { Pressable, Share } from 'react-native';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  API_ERROR_CODE,
  BOOKING_STATUS_META,
  DRIVER_ASSIGNMENT_OUTCOME_META,
  DRIVER_ASSIGNMENT_STATUS_META,
  DRIVER_LINK_END_PARTY,
  DRIVER_LINK_OPEN_STATUSES,
  DRIVER_LINK_STATUS,
  DRIVER_LINK_STATUS_META,
  PERMISSION,
  STATUS_COLOR,
  type BookingStatus,
  type DriverAssignmentOutcome,
  type DriverAssignmentStatus,
} from '@xeprime/types';
import { LIST_SEPARATOR, dayjs, driverWageLine, nowInAppTz } from '@xeprime/domain';
import { AppHeader } from '@/components/layout/AppHeader';
import { ManagePageHeader } from '@/features/shell/ManagePageHeader';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { FactRow } from '@/components/ui/FactRow';
import { Pill, pillToneOfStatusColor } from '@/components/ui/Pill';
import { useAccumulatedPages } from '@/hooks/use-accumulated-pages';
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/CardTitle';
import { DataRow } from '@/components/ui/DataRow';
import { MONTH_PERIOD_FORMAT, MonthPeriodField } from '@/components/ui/MonthPeriodField';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import type { StatCell } from '@/components/ui/StatGrid';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { getErrorCode } from '@/lib/api-client';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space, typeScale } from '@/theme/tokens';
import { Ionicons } from '@/components/icons/Ionicons';
import type { Driver, DriverOverview } from './api';
import { fetchAllDriverAssignments, wageStatementCsv } from './wage-statement';
import { DriverLicenceDetail, DriverLicenceStateBadge } from './components/DriverLicenceStateBadge';
import { EditDriverSheet } from './components/DriverFormSheet';
import {
  useDriverAssignments,
  useDriverOverview,
  useDriverWageSettings,
} from './hooks/use-drivers';

/** Tab của chi tiết tài xế — cùng giá trị với web `DRIVER_DETAIL_TAB`. */
export const DRIVER_DETAIL_TAB = {
  OVERVIEW: 'overview',
  TRIPS: 'trips',
  PROFILE: 'profile',
} as const;
export type DriverDetailTab = (typeof DRIVER_DETAIL_TAB)[keyof typeof DRIVER_DETAIL_TAB];
const DRIVER_DETAIL_TABS: readonly DriverDetailTab[] = Object.values(DRIVER_DETAIL_TAB);

/** Cao thanh xu hướng — một vạch mỏng/tháng, đủ đọc độ lớn tương đối. */
const BAR_HEIGHT = 8;
const MONTH_LABEL_WIDTH = 72;

const currentMonth = () => nowInAppTz().format(MONTH_PERIOD_FORMAT);

/**
 * Chi tiết MỘT tài xế (ADR 0063 · 0074 · 0075) — bản native của web `DriverDetailDrawer`. Route
 * THẬT `/manage/drivers/[id]` (deep-link được, như hồ sơ khách) thay cho ngăn kéo:
 *
 *  - **Tổng quan**: tiền công ghi nhận của tháng, việc đang treo, độ tin cậy khi được gán (90 ngày),
 *    xu hướng 6 tháng — mọi số từ MỘT lần đọc `GET /drivers/:id/overview`.
 *  - **Chuyến & tiền công**: từng chuyến kết thúc trong tháng, phân trang ở server.
 *  - **Hồ sơ**: liên kết, bằng lái, mốc mời/đồng ý/kết thúc, ghi chú.
 *
 * Tham số `month` / `tab` đến từ route (màn danh sách truyền tháng đang xem). Tiền công chỉ là số
 * GHI NHẬN — không có con số nào ở đây là tiền XePrime giữ hay chi.
 */
export function DriverDetailScreen() {
  const params = useLocalSearchParams<{ id: string; month?: string; tab?: string }>();
  const driverId = params.id ?? '';
  const t = useTranslations('Drivers.detail');
  const tDrivers = useTranslations('Drivers');
  const router = useRouter();
  const colors = useColors();
  const permissions = usePermissions();
  const canView = permissions.has(PERMISSION.DRIVER_VIEW);

  const [month, setMonth] = useState<string>(
    params.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) ? params.month : currentMonth(),
  );
  const [tab, setTab] = useState<DriverDetailTab>(
    (DRIVER_DETAIL_TABS as readonly string[]).includes(params.tab ?? '')
      ? (params.tab as DriverDetailTab)
      : DRIVER_DETAIL_TAB.OVERVIEW,
  );
  const [editing, setEditing] = useState<Driver | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const domainLabel = useDomainLabel();

  const query = useDriverOverview(canView ? driverId : null, month);
  const data = query.data && query.data.driver.id === driverId ? query.data : undefined;
  const back = () => goBackOr(router, ROUTES.manage.drivers());

  if (!permissions.isLoading && !canView) {
    return (
      <>
        <AppHeader title={t('fallbackTitle')} onBack={back} />
        <Screen scrollReveal edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={tDrivers('page.forbidden.title')}
            description={tDrivers('page.forbidden.description')}
          />
        </Screen>
      </>
    );
  }

  if (!data) {
    const notFound = getErrorCode(query.error) === API_ERROR_CODE.NOT_FOUND;
    return (
      <>
        <AppHeader title={t('fallbackTitle')} onBack={back} />
        <Screen scrollReveal edges={['left', 'right', 'bottom']} scroll={!query.isError}>
          {query.isError ? (
            notFound ? (
              <ScreenMessage icon="search-outline" title={t('notFound')} />
            ) : (
              <ScreenError
                error={query.error}
                title={t('loadError')}
                onRetry={() => void query.refetch()}
              />
            )
          ) : (
            <YStack gap={layout.section}>
              <Skeleton height={96} />
              <SkeletonText lines={4} />
            </YStack>
          )}
        </Screen>
      </>
    );
  }

  const driver = data.driver;
  const linkMeta = DRIVER_LINK_STATUS_META[driver.linkStatus];
  const canEdit =
    permissions.has(PERMISSION.DRIVER_MANAGE) &&
    DRIVER_LINK_OPEN_STATUSES.includes(driver.linkStatus);

  return (
    <>
      {/* Khuôn Chi tiết đơn: ← + tên, dòng phụ là SĐT (Figma "Header MB" biến thể chi tiết). */}
      <ManagePageHeader
        title={driver.name}
        subtitle={
          <XStack ai="center" jc="space-between" gap={space.sm}>
            <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} numberOfLines={1} flexShrink={1}>
              {driver.phone}
            </Text>
            <Pill
              label={domainLabel('driverLinkStatus', driver.linkStatus, linkMeta.label)}
              tone={pillToneOfStatusColor(
                driver.linkStatus === DRIVER_LINK_STATUS.SUSPENDED ? STATUS_COLOR.DANGER : linkMeta.color,
              )}
            />
          </XStack>
        }
        onBack={back}
        {...(canEdit
          ? {
              actions: (
                <Pressable
                  onPress={() => setMenuOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel={t('menuTitle')}
                  hitSlop={12}
                >
                  <Ionicons name="ellipsis-vertical" size={20} color={colors.textMuted} />
                </Pressable>
              ),
            }
          : {})}
      />
      <Screen
        scrollReveal
        edges={['left', 'right', 'bottom']}
        refreshing={query.isRefetching}
        onRefresh={() => void query.refetch()}
      >
        <YStack gap={layout.section}>
          {/* Ba tab chia đều trọn bề ngang (người dùng 16/11/2026). */}
          <SegmentedTabs
            fit
            variant="neutral"
            items={DRIVER_DETAIL_TABS.map((key) => ({ key, label: t(`tabs.${key}`) }))}
            value={tab}
            onChange={setTab}
          />
          {tab === DRIVER_DETAIL_TAB.PROFILE ? null : (
            <MonthPeriodField
              variant="stepper"
              label={tDrivers('wage.month.label')}
              value={data.month.month}
              onChange={setMonth}
              // Tháng sau chưa có chuyến nào kết thúc — như `maxDate` của web.
              maxPeriod={currentMonth()}
            />
          )}
          {tab === DRIVER_DETAIL_TAB.OVERVIEW ? (
            <DriverOverviewSection overview={data} />
          ) : tab === DRIVER_DETAIL_TAB.TRIPS ? (
            <DriverTripsSection key={driver.id} driver={driver} month={data.month.month} />
          ) : (
            <DriverProfileSection driver={driver} />
          )}
        </YStack>
      </Screen>
      {/* Tấm "Thao tác" - khuôn chi tiết đơn thuê / hồ sơ khách. */}
      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} title={t('menuTitle')}>
        <Button
          label={t('edit')}
          icon="create-outline"
          variant="gradient"
          onPress={() => {
            setMenuOpen(false);
            setEditing(driver);
          }}
        />
      </BottomSheet>
      <EditDriverSheet driver={editing} onClose={() => setEditing(null)} />
    </>
  );
}

/** Tab Tổng quan — bản native của web `DriverOverviewTab`. */
function DriverOverviewSection({ overview }: { overview: DriverOverview }) {
  const colors = useColors();
  const t = useTranslations('Drivers.detail.overview');
  const fmt = useAppFormat();
  const settings = useDriverWageSettings();
  const { driver, month, upcoming, reliability, trend, current } = overview;
  const domainLabel = useDomainLabel();
  const navigateOnce = useNavigateOnce();
  const monthLabel = fmt.monthYear(dayjs(month.month, MONTH_PERIOD_FORMAT).toDate());
  const shopDaily = settings.data?.dailyWage ?? null;
  const hasTrend = trend.some((p) => p.trips > 0 || Number(p.wageTotal) > 0);
  const maxWage = Math.max(1, ...trend.map((p) => Number(p.wageTotal)));

  const cells = useMemo<StatCell[]>(
    () => [
      {
        key: 'wageTotal',
        icon: 'wallet-outline',
        label: t('stats.wageTotal'),
        value: fmt.money(month.wageTotal),
        tone: colors.warning,
        surface: colors.warningSurface,
      },
      {
        key: 'completedTrips',
        icon: 'car-outline',
        label: t('stats.completedTrips'),
        value: fmt.count(month.completedTrips),
        hint: t('stats.drivenDays', { count: month.drivenDays }),
        tone: colors.success,
        surface: colors.successSurface,
      },
      {
        key: 'averageDaily',
        icon: 'calendar-outline',
        label: t('stats.averageDaily'),
        value: month.averageDailyWage == null ? '-' : fmt.money(month.averageDailyWage),
        hint: shopDaily
          ? t('stats.shopDaily', { amount: fmt.money(shopDaily) })
          : t('stats.noShopDaily'),
        tone: colors.info,
        surface: colors.infoSurface,
      },
      {
        key: 'upcoming',
        icon: 'time-outline',
        label: t('stats.upcoming'),
        value: fmt.count(upcoming.acceptedTrips),
        hint:
          upcoming.acceptedTrips > 0
            ? t('stats.upcomingWage', { amount: fmt.money(upcoming.acceptedWage) })
            : t('stats.upcomingNone'),
        tone: colors.info,
        surface: colors.infoSurface,
      },
    ],
    [t, fmt, month, monthLabel, shopDaily, upcoming, colors],
  );

  return (
    <YStack gap={layout.section}>
      {/* Số liệu tháng: MỘT thẻ, mỗi chỉ số một dòng nhãn/giá trị (+ chú thích nhỏ) - bỏ lưới ô 2×2. */}
      <Card>
        <YStack gap={space.sm}>
          <SectionHeader icon="stats-chart-outline">{t('stats.title')}</SectionHeader>
          {cells.map((cell) => (
            <FactRow key={cell.key} label={cell.label} sub={typeof cell.hint === 'string' ? cell.hint : null}>
              {cell.value}
            </FactRow>
          ))}
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('period', { month: monthLabel })}
          </Text>
        </YStack>
      </Card>

      {/* Chuyến đang gán, sớm nhất trước — như khối "Chuyến đang gán" của web `DriverOverviewTab`. */}
      {driver.activeBookingCount > 0 ? (
        <Card>
          <YStack gap={space.sm}>
            <SectionHeader>
              {t('current.title', { count: driver.activeBookingCount })}
            </SectionHeader>
            {current.map((trip) => {
              const bookingMeta = BOOKING_STATUS_META[trip.bookingStatus as BookingStatus];
              const assignmentMeta = trip.assignmentStatus
                ? DRIVER_ASSIGNMENT_STATUS_META[trip.assignmentStatus as DriverAssignmentStatus]
                : null;
              return (
                <Card
                  key={trip.bookingId}
                  tone="muted"
                  lift="flat"
                  onPress={() => navigateOnce(ROUTES.manage.bookingDetail(trip.bookingId))}
                >
                  <YStack gap={space.xs}>
                    <XStack ai="center" jc="space-between" gap={space.sm}>
                      <Text
                        f={1}
                        col={colors.primaryActive}
                        fos={fontSize.body}
                        fow={fontWeight.semibold}
                      >
                        {trip.bookingCode}
                      </Text>
                      {bookingMeta ? (
                        <Pill
                          label={domainLabel('bookingStatus', trip.bookingStatus, bookingMeta.label)}
                          tone={pillToneOfStatusColor(bookingMeta.color)}
                        />
                      ) : null}
                    </XStack>
                    <Text col={colors.text} fos={typeScale.body.fontSize}>
                      {trip.vehiclePlate
                        ? `${trip.vehicleName} · ${trip.vehiclePlate}`
                        : trip.vehicleName}
                    </Text>
                    <XStack ai="center" jc="space-between" gap={space.sm}>
                      <Text f={1} col={colors.textMuted} fos={fontSize.label}>
                        {fmt.shortDateTimeRange(trip.pickupAt, trip.returnAt)}
                      </Text>
                      {assignmentMeta && trip.assignmentStatus ? (
                        <Pill
                          label={domainLabel(
                            'driverAssignmentStatus',
                            trip.assignmentStatus,
                            assignmentMeta.label,
                          )}
                          tone={pillToneOfStatusColor(assignmentMeta.color)}
                        />
                      ) : null}
                    </XStack>
                  </YStack>
                </Card>
              );
            })}
            {driver.activeBookingCount > current.length ? (
              <Text col={colors.textMuted} fos={fontSize.label}>
                {t('current.more', { shown: current.length })}
              </Text>
            ) : null}
          </YStack>
        </Card>
      ) : null}

      <Card>
        <YStack gap={space.sm}>
          <SectionHeader icon="wallet-outline">{t('wage.title', { month: monthLabel })}</SectionHeader>
          <DataRow
            size="md"
            labelWide
            label={t('wage.completed', { count: month.completedTrips })}
            value={fmt.money(month.completedWage)}
          />
          <DataRow
            size="md"
            labelWide
            label={t('wage.agreed', { count: month.agreedTrips })}
            value={fmt.money(month.agreedWage)}
          />
          <DataRow size="md" labelWide label={t('wage.total')} value={fmt.money(month.wageTotal)} strong />
          <DataRow
            size="md"
            labelWide
            label={t('wage.edited')}
            value={t('wage.editedValue', { count: month.editedTrips })}
          />
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('wage.note')}
          </Text>
        </YStack>
      </Card>

      <Card>
        <YStack gap={space.sm}>
          <SectionHeader icon="shield-checkmark-outline">{t('reliability.title', { days: reliability.windowDays })}</SectionHeader>
          <DataRow
            size="md"
            labelWide
            label={t('reliability.acceptRate')}
            value={
              reliability.acceptRate == null
                ? t('reliability.noSample')
                : `${t('reliability.rate', { rate: reliability.acceptRate })} ${t(
                    'reliability.rateOf',
                    { accepted: reliability.accepted, decided: reliability.decided },
                  )}`
            }
            tone={reliability.acceptRate == null ? 'muted' : 'default'}
          />
          <DataRow
            size="md"
            labelWide
            label={t('reliability.response')}
            value={
              reliability.medianResponseMinutes == null
                ? '-'
                : reliability.medianResponseMinutes === 0
                  ? t('reliability.underMinute')
                  : fmt.minutesDuration(reliability.medianResponseMinutes)
            }
          />
          <DataRow size="md" labelWide label={t('reliability.declined')} value={fmt.count(reliability.declined)} />
          <DataRow
            size="md"
            labelWide
            label={t('reliability.expired')}
            value={fmt.count(reliability.expired)}
            tone={reliability.expired > 0 ? 'danger' : 'default'}
          />
          <DataRow
            size="md"
            labelWide
            label={t('reliability.drops')}
            value={
              driver.dropCount > 0
                ? t('reliability.dropsValue', {
                    count: driver.dropCount,
                    critical: driver.criticalDropCount,
                  })
                : fmt.count(0)
            }
            tone={driver.dropCount > 0 ? 'danger' : 'default'}
          />
          <DataRow size="md" labelWide label={t('reliability.pending')} value={fmt.count(upcoming.pendingTrips)} />
          {driver.autoAssignCooldownUntil ? (
            <DataRow
            size="md"
              label={t('reliability.cooldown')}
              value={fmt.dateTime(driver.autoAssignCooldownUntil)}
              tone="danger"
            />
          ) : null}
        </YStack>
      </Card>

      {/* Xu hướng 6 tháng — vạch ngang theo tiền công + số chuyến, như `TripsTrendPanel`. */}
      <Card>
        <YStack gap={space.sm}>
          <SectionHeader icon="trending-up-outline">{t('trend.title')}</SectionHeader>
          {hasTrend ? (
            trend.map((point) => (
              <XStack key={point.month} ai="center" gap={space.sm}>
                <Text w={MONTH_LABEL_WIDTH} col={colors.textMuted} fos={fontSize.label}>
                  {fmt.monthYear(dayjs(point.month, MONTH_PERIOD_FORMAT).toDate())}
                </Text>
                <YStack f={1} gap={2}>
                  <YStack h={BAR_HEIGHT} br={radius.sm} bg={colors.border} overflow="hidden">
                    <YStack
                      h={BAR_HEIGHT}
                      w={`${Math.round((Number(point.wageTotal) / maxWage) * 100)}%`}
                      bg={colors.warning}
                    />
                  </YStack>
                  <Text col={colors.textMuted} fos={fontSize.label}>
                    {`${t('trend.money')}: ${fmt.money(point.wageTotal)}${LIST_SEPARATOR}${t('trend.trips')}: ${fmt.count(point.trips)}`}
                  </Text>
                </YStack>
              </XStack>
            ))
          ) : (
            <Text col={colors.textMuted} fos={typeScale.body.fontSize}>
              {t('trend.empty')}
            </Text>
          )}
        </YStack>
      </Card>
    </YStack>
  );
}

/**
 * Tab "Chuyến & tiền công" — bản native của web `DriverTripsTab`: các chuyến kết thúc trong tháng
 * (giờ VN), mỗi chuyến kèm tiền công đã ghi; phân trang server-side. Chạm một chuyến mở chi tiết
 * đơn. "Tải bảng kê" của web: gom cả tháng rồi dựng CSV, app gửi qua bảng CHIA SẺ của hệ điều
 * hành (lưu tệp, Zalo, mail…) - không cần module tệp riêng.
 */
function DriverTripsSection({ driver, month }: { driver: Driver; month: string }) {
  const colors = useColors();
  const t = useTranslations('Drivers.detail.trips');
  const tLine = useTranslations('Drivers.wage.line');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const navigateOnce = useNavigateOnce();
  // Trang thuộc về MỘT tháng: đổi tháng là về trang 1 (như web).
  const [paging, setPaging] = useState({ month, page: 1 });
  const page = paging.month === month ? paging.page : 1;
  const query = useDriverAssignments(driver.id, month, page);
  // Dồn các trang đã tải (nút "Xem thêm"); đổi tháng thì mảng dồn về trang 1 vì `page` quay về 1.
  const items = useAccumulatedPages(query.data?.items, query.data?.meta?.page);
  const meta = query.data?.meta;
  const tActions = useTranslations('Common.actions');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const [exporting, setExporting] = useState(false);

  async function exportStatement() {
    if (exporting) return;
    setExporting(true);
    try {
      const rows = await fetchAllDriverAssignments(driver.id, month);
      const csv = wageStatementCsv(rows, {
        headers: {
          booking: t('csv.booking'),
          vehicle: t('csv.vehicle'),
          plate: t('csv.plate'),
          pickupAt: t('csv.pickupAt'),
          returnAt: t('csv.returnAt'),
          days: t('csv.days'),
          outcome: t('csv.outcome'),
          wage: t('csv.wage'),
        },
        total: t('csv.total'),
        outcome: (o) => domainLabel('driverAssignmentOutcome', o),
        dateTime: (iso) => fmt.dateTime(iso),
      });
      const result = await Share.share({
        title: `${t('csv.fileName', { month })}-${driver.phone}.csv`,
        message: csv,
      });
      if (result.action === Share.sharedAction) {
        toast.showSuccess(t('exported', { count: rows.length }));
      }
    } catch (err) {
      toast.showError(errorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  return (
    <YStack gap={space.md}>
      <Text col={colors.text} fos={typeScale.body.fontSize}>
        {t.rich('summary', {
          trips: driver.monthCompletedTrips,
          amount: fmt.money(driver.monthWageTotal),
          b: (chunks) => <Text fow={fontWeight.semibold}>{chunks}</Text>,
        })}
      </Text>
      {/* Web: nút "Tải bảng kê" cạnh bộ chọn tháng, tắt khi tháng không có chuyến. */}
      <XStack>
        <Button
          label={t('export')}
          icon="download-outline"
          variant="secondary"
          size="sm"
          block={false}
          loading={exporting}
          disabled={items.length === 0}
          onPress={() => void exportStatement()}
        />
      </XStack>
      {query.isPending ? (
        <SkeletonText lines={4} />
      ) : query.isError && !query.data ? (
        <ScreenError
          error={query.error}
          title={t('loadError')}
          onRetry={() => void query.refetch()}
        />
      ) : items.length === 0 ? (
        <ScreenMessage icon="car-outline" title={t('empty')} description={t('emptyHint')} />
      ) : (
        <YStack gap={space.sm}>
          {items.map((row) => {
            const line = driverWageLine({ amount: row.wageAmount, stage: row.stage });
            const outcomeMeta =
              DRIVER_ASSIGNMENT_OUTCOME_META[row.outcome as DriverAssignmentOutcome];
            return (
              // Khuôn thẻ Lịch sử đơn thuê: mã + kết cục, xe, các dòng nhãn/giá trị, nút vàng.
              <Card
                key={row.id}
                onPress={() => navigateOnce(ROUTES.manage.bookingDetail(row.bookingId))}
                accessibilityLabel={row.bookingCode}
              >
                <YStack gap={space.sm}>
                  <XStack ai="center" jc="space-between" gap={space.sm}>
                    <Text col={colors.text} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.medium} numberOfLines={1} flexShrink={1}>
                      {`#${row.bookingCode}`}
                    </Text>
                    <Pill
                      label={domainLabel('driverAssignmentOutcome', row.outcome)}
                      tone={pillToneOfStatusColor(outcomeMeta?.color ?? STATUS_COLOR.NEUTRAL)}
                    />
                  </XStack>
                  <Text col={colors.text} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.semibold} numberOfLines={2}>
                    {[row.vehicleName, row.vehiclePlate].filter(Boolean).join(' · ')}
                  </Text>
                  <FactRow label={t('period')}>{fmt.rentalRange(row.pickupAt, row.returnAt)}</FactRow>
                  <FactRow label={t('wage')}>
                    {!line
                      ? '-'
                      : line.kind === 'none'
                        ? tLine('none')
                        : tLine(line.kind, {
                            amount: fmt.money(line.amount),
                            days: row.wageDays ?? 0,
                          })}
                  </FactRow>
                  <YStack pt={space.xs}>
                    <Button
                      label={tActions('viewDetail')}
                      variant="gradient"
                      size="compact"
                      onPress={() => navigateOnce(ROUTES.manage.bookingDetail(row.bookingId))}
                    />
                  </YStack>
                </YStack>
              </Card>
            );
          })}
          {meta && meta.page * meta.limit < meta.total ? (
            <Button
              label={tActions('viewMore')}
              variant="outline"
              size="compact"
              loading={query.isFetching}
              onPress={() => setPaging({ month, page: page + 1 })}
            />
          ) : null}
          {meta ? (
            <Text col={colors.textMuted} fos={fontSize.label} ta="center">
              {t('total', { count: meta.total })}
            </Text>
          ) : null}
        </YStack>
      )}
    </YStack>
  );
}

/** Tab Hồ sơ — bản native của web `DriverProfileTab`: bốn thẻ nhóm (tài xế · bằng lái · liên kết · ghi chú). */
function DriverProfileSection({ driver }: { driver: Driver }) {
  const colors = useColors();
  const t = useTranslations('Drivers.detail.profile');
  const tCommon = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const ended = driver.linkStatus === DRIVER_LINK_STATUS.ENDED;
  const meta = DRIVER_LINK_STATUS_META[driver.linkStatus];

  return (
    <YStack gap={layout.section}>
      <Card>
        <YStack gap={space.sm}>
          <SectionHeader icon="person-outline">{t('sectionInfo')}</SectionHeader>
          <DataRow size="md" labelWide label={t('name')} value={driver.name} />
          <DataRow size="md" labelWide label={t('phone')} value={driver.phone} />
          <DataRow size="md" labelWide label={t('account')} value={driver.account.displayName ?? tCommon('emptyValue')} />
          <XStack ai="center" jc="space-between" gap={space.sm}>
            <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
              {t('type')}
            </Text>
            <Pill label={domainLabel('driverType', driver.driverType, driver.driverType)} tone="neutral" />
          </XStack>
        </YStack>
      </Card>

      <Card>
        <YStack gap={space.sm}>
          <SectionHeader icon="id-card-outline">{t('sectionLicence')}</SectionHeader>
          <XStack ai="center" jc="space-between" gap={space.sm}>
            <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
              {t('licence')}
            </Text>
            <DriverLicenceStateBadge state={driver.licence.state} />
          </XStack>
          <DriverLicenceDetail licence={driver.licence} invitedName={driver.name} />
        </YStack>
      </Card>

      <Card>
        <YStack gap={space.sm}>
          <SectionHeader icon="link-outline">{t('sectionLink')}</SectionHeader>
          <XStack ai="center" jc="space-between" gap={space.sm}>
            <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
              {t('status')}
            </Text>
            <Pill
              label={domainLabel('driverLinkStatus', driver.linkStatus, meta.label)}
              tone={pillToneOfStatusColor(
                driver.linkStatus === DRIVER_LINK_STATUS.SUSPENDED ? STATUS_COLOR.DANGER : meta.color,
              )}
            />
          </XStack>
          <DataRow size="md" labelWide label={t('activeBookings')} value={fmt.count(driver.activeBookingCount)} />
          <DataRow size="md" labelWide label={t('invitedAt')} value={fmt.dateTime(driver.invitedAt)} />
          {driver.respondedAt ? (
            <DataRow size="md" labelWide label={t('respondedAt')} value={fmt.dateTime(driver.respondedAt)} />
          ) : null}
          {ended && driver.endedAt ? (
            <DataRow
              size="md"
              label={t('endedAt')}
              value={`${fmt.dateTime(driver.endedAt)}${
                driver.endedByParty
                  ? ` · ${
                      driver.endedByParty === DRIVER_LINK_END_PARTY.DRIVER
                        ? t('endedByDriver')
                        : t('endedByEmployer')
                    }`
                  : ''
              }`}
            />
          ) : null}
        </YStack>
      </Card>

      <Card>
        <YStack gap={space.sm}>
          <SectionHeader icon="document-text-outline">{t('sectionNote')}</SectionHeader>
          <Text
            col={driver.note ? colors.text : colors.textMuted}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
          >
            {driver.note ?? t('noNote')}
          </Text>
        </YStack>
      </Card>
    </YStack>
  );
}
