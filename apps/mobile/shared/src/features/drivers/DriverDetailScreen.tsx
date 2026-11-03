import { useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  API_ERROR_CODE,
  DRIVER_ASSIGNMENT_OUTCOME_META,
  DRIVER_LINK_END_PARTY,
  DRIVER_LINK_OPEN_STATUSES,
  DRIVER_LINK_STATUS,
  DRIVER_LINK_STATUS_META,
  PERMISSION,
  STATUS_COLOR,
  type DriverAssignmentOutcome,
} from '@xeprime/types';
import { dayjs, driverWageLine, nowInAppTz } from '@xeprime/domain';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CardAccent } from '@/components/ui/CardAccent';
import { DataRow } from '@/components/ui/DataRow';
import { MONTH_PERIOD_FORMAT, MonthPeriodField } from '@/components/ui/MonthPeriodField';
import { Pagination } from '@/components/ui/Pagination';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { StatGrid, type StatCell } from '@/components/ui/StatGrid';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { getErrorCode } from '@/lib/api-client';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import { DRIVER_ASSIGNMENTS_LIMIT, type Driver, type DriverOverview } from './api';
import { DriverLicenceDetail, DriverLicenceStateBadge } from './components/DriverLicenceStateBadge';
import { EditDriverSheet } from './components/DriverFormSheet';
import { useDriverAssignments, useDriverOverview, useDriverWageSettings } from './hooks/use-drivers';

/** Tab của chi tiết tài xế — cùng giá trị với web `DRIVER_DETAIL_TAB`. */
export const DRIVER_DETAIL_TAB = { OVERVIEW: 'overview', TRIPS: 'trips', PROFILE: 'profile' } as const;
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

  const query = useDriverOverview(canView ? driverId : null, month);
  const data = query.data && query.data.driver.id === driverId ? query.data : undefined;
  const back = () => goBackOr(router, ROUTES.manage.drivers());

  if (!permissions.isLoading && !canView) {
    return (
      <>
        <AppHeader title={t('fallbackTitle')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
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
        <Screen edges={['left', 'right', 'bottom']} scroll={!query.isError}>
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
  const canEdit =
    permissions.has(PERMISSION.DRIVER_MANAGE) && DRIVER_LINK_OPEN_STATUSES.includes(driver.linkStatus);

  return (
    <>
      <AppHeader title={driver.name} subtitle={driver.phone} onBack={back} />
      <Screen
        edges={['left', 'right', 'bottom']}
        refreshing={query.isRefetching}
        onRefresh={() => void query.refetch()}
      >
        <YStack gap={layout.section}>
          <DriverHeaderCard driver={driver} onEdit={canEdit ? () => setEditing(driver) : null} />
          <SegmentedTabs
            items={DRIVER_DETAIL_TABS.map((key) => ({ key, label: t(`tabs.${key}`) }))}
            value={tab}
            onChange={setTab}
          />
          {tab === DRIVER_DETAIL_TAB.PROFILE ? null : (
            <MonthPeriodField
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
      <EditDriverSheet driver={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function DriverHeaderCard({ driver, onEdit }: { driver: Driver; onEdit: (() => void) | null }) {
  const colors = useColors();
  const t = useTranslations('Drivers.detail');
  const domainLabel = useDomainLabel();
  const meta = DRIVER_LINK_STATUS_META[driver.linkStatus];
  return (
    <Card>
      <YStack gap={space.sm}>
        <XStack ai="center" gap={space.sm}>
          <Text f={1} col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.semibold}>
            {driver.name}
          </Text>
          <StatusBadge
            label={domainLabel('driverLinkStatus', driver.linkStatus, meta.label)}
            color={meta.color}
            size="sm"
          />
        </XStack>
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {driver.phone}
        </Text>
        {onEdit ? (
          <Button
            label={t('edit')}
            icon="create-outline"
            variant="secondary"
            size="sm"
            block={false}
            onPress={onEdit}
          />
        ) : null}
      </YStack>
    </Card>
  );
}

/** Tab Tổng quan — bản native của web `DriverOverviewTab`. */
function DriverOverviewSection({ overview }: { overview: DriverOverview }) {
  const colors = useColors();
  const t = useTranslations('Drivers.detail.overview');
  const fmt = useAppFormat();
  const settings = useDriverWageSettings();
  const { driver, month, upcoming, reliability, trend } = overview;
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
        hint: monthLabel,
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
        value: month.averageDailyWage == null ? '—' : fmt.money(month.averageDailyWage),
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
      <Text col={colors.textMuted} fos={fontSize.label}>
        {t('period', { month: monthLabel })}
      </Text>
      <StatGrid cells={cells} />

      <Card>
        <YStack gap={space.sm}>
          <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
            {t('wage.title', { month: monthLabel })}
          </Text>
          <DataRow
            label={t('wage.completed', { count: month.completedTrips })}
            value={fmt.money(month.completedWage)}
          />
          <DataRow
            label={t('wage.agreed', { count: month.agreedTrips })}
            value={fmt.money(month.agreedWage)}
          />
          <DataRow label={t('wage.total')} value={fmt.money(month.wageTotal)} strong />
          <DataRow
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
          <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
            {t('reliability.title', { days: reliability.windowDays })}
          </Text>
          <DataRow
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
            label={t('reliability.response')}
            value={
              reliability.medianResponseMinutes == null
                ? '—'
                : reliability.medianResponseMinutes === 0
                  ? t('reliability.underMinute')
                  : fmt.minutesDuration(reliability.medianResponseMinutes)
            }
          />
          <DataRow label={t('reliability.declined')} value={fmt.count(reliability.declined)} />
          <DataRow
            label={t('reliability.expired')}
            value={fmt.count(reliability.expired)}
            tone={reliability.expired > 0 ? 'danger' : 'default'}
          />
          <DataRow
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
          <DataRow label={t('reliability.pending')} value={fmt.count(upcoming.pendingTrips)} />
          {driver.autoAssignCooldownUntil ? (
            <DataRow
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
          <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
            {t('trend.title')}
          </Text>
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
                    {`${fmt.money(point.wageTotal)} · ${t('trend.trips')}: ${fmt.count(point.trips)}`}
                  </Text>
                </YStack>
              </XStack>
            ))
          ) : (
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
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
 * đơn. (Tải bảng kê CSV của web chưa có ở app — cần module chia sẻ tệp.)
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
  const items = query.data?.items ?? [];
  const meta = query.data?.meta;

  return (
    <YStack gap={space.md}>
      <Text col={colors.text} fos={fontSize.bodySm}>
        {t.rich('summary', {
          trips: driver.monthCompletedTrips,
          amount: fmt.money(driver.monthWageTotal),
          b: (chunks) => <Text fow={fontWeight.semibold}>{chunks}</Text>,
        })}
      </Text>
      {query.isPending ? (
        <SkeletonText lines={4} />
      ) : query.isError && !query.data ? (
        <ScreenError error={query.error} title={t('loadError')} onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <ScreenMessage icon="car-outline" title={t('empty')} description={t('emptyHint')} />
      ) : (
        <YStack gap={space.sm}>
          {items.map((row) => {
            const outcomeMeta = DRIVER_ASSIGNMENT_OUTCOME_META[row.outcome as DriverAssignmentOutcome];
            const color = outcomeMeta?.color ?? STATUS_COLOR.NEUTRAL;
            const line = driverWageLine({ amount: row.wageAmount, stage: row.stage });
            return (
              <Card key={row.id} padded={false} onPress={() => navigateOnce(ROUTES.manage.bookingDetail(row.bookingId))}>
                <XStack>
                  <CardAccent color={color} />
                  <YStack f={1} p={space.sm} gap={space.xs}>
                    <XStack ai="center" gap={space.xs}>
                      <Text f={1} col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                        {row.bookingCode}
                      </Text>
                      <StatusBadge
                        label={domainLabel('driverAssignmentOutcome', row.outcome)}
                        color={color}
                        size="sm"
                      />
                    </XStack>
                    <Text col={colors.text} fos={fontSize.bodySm}>
                      {[row.vehicleName, row.vehiclePlate].filter(Boolean).join(' · ')}
                    </Text>
                    <Text col={colors.textMuted} fos={fontSize.label}>
                      {fmt.shortDateTimeRange(row.pickupAt, row.returnAt)}
                    </Text>
                    <Text
                      col={!line || line.kind === 'none' ? colors.textMuted : colors.text}
                      fos={fontSize.bodySm}
                      fow={!line || line.kind === 'none' ? fontWeight.regular : fontWeight.semibold}
                    >
                      {!line
                        ? '—'
                        : line.kind === 'none'
                          ? tLine('none')
                          : tLine(line.kind, {
                              amount: fmt.money(line.amount),
                              days: row.wageDays ?? 0,
                            })}
                    </Text>
                  </YStack>
                </XStack>
              </Card>
            );
          })}
          {meta && meta.total > DRIVER_ASSIGNMENTS_LIMIT ? (
            <Pagination
              page={meta.page}
              limit={meta.limit}
              total={meta.total}
              onChange={(next) => setPaging({ month, page: next })}
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

/** Tab Hồ sơ — bản native của web `DriverProfileTab`. Chỉ TRẠNG THÁI bằng lái, không ảnh/số bằng. */
function DriverProfileSection({ driver }: { driver: Driver }) {
  const colors = useColors();
  const t = useTranslations('Drivers.detail.profile');
  const tCommon = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const ended = driver.linkStatus === DRIVER_LINK_STATUS.ENDED;
  const meta = DRIVER_LINK_STATUS_META[driver.linkStatus];

  return (
    <Card>
      <YStack gap={space.sm}>
        <DataRow label={t('name')} value={driver.name} />
        <DataRow label={t('phone')} value={driver.phone} />
        <DataRow label={t('account')} value={driver.account.displayName ?? tCommon('emptyValue')} />
        <DataRow
          label={t('type')}
          value={domainLabel('driverType', driver.driverType, driver.driverType)}
        />
        <XStack ai="center" jc="space-between" gap={space.sm}>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('licence')}
          </Text>
          <DriverLicenceStateBadge state={driver.licence.state} />
        </XStack>
        <DriverLicenceDetail licence={driver.licence} invitedName={driver.name} />
        <XStack ai="center" jc="space-between" gap={space.sm}>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('status')}
          </Text>
          <StatusBadge
            label={domainLabel('driverLinkStatus', driver.linkStatus, meta.label)}
            color={meta.color}
            size="sm"
          />
        </XStack>
        <DataRow label={t('activeBookings')} value={fmt.count(driver.activeBookingCount)} />
        <DataRow label={t('invitedAt')} value={fmt.dateTime(driver.invitedAt)} />
        {driver.respondedAt ? (
          <DataRow label={t('respondedAt')} value={fmt.dateTime(driver.respondedAt)} />
        ) : null}
        {ended && driver.endedAt ? (
          <DataRow
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
        <DataRow
          label={t('note')}
          value={driver.note ?? t('noNote')}
          tone={driver.note ? 'default' : 'muted'}
          block={Boolean(driver.note)}
        />
      </YStack>
    </Card>
  );
}
