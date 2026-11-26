import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, Share } from 'react-native';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  API_ERROR_CODE,
  BOOKING_STATUS_META,
  DRIVER_ASSIGNMENT_OUTCOME,
  DRIVER_ASSIGNMENT_OUTCOME_META,
  DRIVER_LICENCE_STATE,
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
import {
  LIST_SEPARATOR,
  dayjs,
  driverWageLine,
  holderNameDiffers,
  nowInAppTz,
} from '@xeprime/domain';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { AppHeader } from '@/components/layout/AppHeader';
import { ManagePageHeader } from '@/features/shell/ManagePageHeader';
import { UnderlineTabs } from '@/components/ui/UnderlineTabs';
import { Pill, pillToneOfStatusColor } from '@/components/ui/Pill';
import { useAccumulatedPages } from '@/hooks/use-accumulated-pages';
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ContactActions } from '@/components/ui/ContactActions';
import { DataRow } from '@/components/ui/DataRow';
import { IconSquareButton } from '@/components/ui/IconSquareButton';
import { MONTH_PERIOD_FORMAT, MonthPeriodField } from '@/components/ui/MonthPeriodField';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { LineIcon } from '@/components/icons/LineIcon';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { getErrorCode } from '@/lib/api-client';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, iconSize, radius, space, typeScale } from '@/theme/tokens';
import type { Driver, DriverOverview } from './api';
import { fetchAllDriverAssignments, wageStatementCsv } from './wage-statement';
import { DriverLicenceDetail } from './components/DriverLicenceStateBadge';
import { EditDriverSheet } from './components/DriverFormSheet';
import { DriverStatusLine } from './components/DriverStatusLine';
import { DriverTripsToolbar } from './components/DriverTripParts';
import {
  useDriverAssignments,
  useDriverOverview,
  useDriverWageSettings,
  useEndDriver,
  useResumeDriver,
  useSetDriverLicenceChecked,
  useSuspendDriver,
} from './hooks/use-drivers';

const TRIP_SEARCH_DEBOUNCE_MS = 400;
/**
 * Kết cục lọc được ở bảng chuyến — đúng 5 kết cục của lượt đã KHÉP (web `DriverTripsTab.TRIP_OUTCOMES`);
 * open/declined/expired không bao giờ có trong bảng chuyến theo tháng.
 */
const TRIP_OUTCOMES: readonly DriverAssignmentOutcome[] = [
  DRIVER_ASSIGNMENT_OUTCOME.COMPLETED,
  DRIVER_ASSIGNMENT_OUTCOME.CANCELLED,
  DRIVER_ASSIGNMENT_OUTCOME.NO_SHOW,
  DRIVER_ASSIGNMENT_OUTCOME.DROPPED,
  DRIVER_ASSIGNMENT_OUTCOME.UNASSIGNED,
];
/** Giá trị "Tất cả trạng thái" của ô lọc chuyến. */
const ALL_STATUSES = 'all';

/** Tab của chi tiết tài xế — cùng giá trị với web `DRIVER_DETAIL_TAB`. */
export const DRIVER_DETAIL_TAB = {
  OVERVIEW: 'overview',
  TRIPS: 'trips',
  /** Web còn tab Hồ sơ; app gộp nó vào cuối Tổng quan (Figma 2 tab) - deep link `tab=profile` mở Tổng quan. */
  PROFILE: 'profile',
} as const;
export type DriverDetailTab = (typeof DRIVER_DETAIL_TAB)[keyof typeof DRIVER_DETAIL_TAB];
type AppTab = typeof DRIVER_DETAIL_TAB.OVERVIEW | typeof DRIVER_DETAIL_TAB.TRIPS;
const APP_TABS: readonly AppTab[] = [DRIVER_DETAIL_TAB.OVERVIEW, DRIVER_DETAIL_TAB.TRIPS];

/** Figma "Tiền công 6 tháng gần nhất": cột rộng 26, cao tối đa 78 (cột tháng đang xem). */
const BAR_WIDTH = 26;
const BAR_MAX = 78;
const BAR_MIN = 4;
const AVATAR = 40;
/** Thẻ khối Figma ("Earnings Summary"): đệm 16, bo 16, viền `stroke/gray-low200`. */
const BLOCK_PAD = space.md;

const currentMonth = () => nowInAppTz().format(MONTH_PERIOD_FORMAT);

/**
 * Chi tiết MỘT tài xế (ADR 0063 · 0074 · 0075) — Figma Partner-XePrime "MB — Vehice / Driver /
 * Detail" (`24512:119081` · `24512:120445`). Route THẬT `/manage/drivers/[id]`:
 *
 *  - Đầu trang trắng: ảnh + tên + SĐT | tài khoản, viên hình thức + trạng thái, Gọi · Zalo, dòng
 *    bằng lái, "Chuyến đang gán", hai tab gạch chân.
 *  - **Tổng quan**: tiền công ghi nhận của tháng + độ tin cậy 90 ngày, xu hướng 6 tháng, chuyến đang
 *    gán, ghi chú nội bộ, thông tin liên kết (tab Hồ sơ cũ) và lối Tạm khoá / Hủy liên kết.
 *  - **Chuyến & tiền công**: tổng tháng + bảng kê, từng chuyến kết thúc trong tháng (phân trang server).
 *
 * Tiền công chỉ là số GHI NHẬN — không có con số nào ở đây là tiền XePrime giữ hay chi (ADR 0075).
 */
export function DriverDetailScreen() {
  const params = useLocalSearchParams<{ id: string; month?: string; tab?: string }>();
  const driverId = params.id ?? '';
  const t = useTranslations('Drivers.detail');
  const tDrivers = useTranslations('Drivers');
  const tApp = useTranslations('Drivers.app.detail');
  const tActions = useTranslations('Common.actions');
  const router = useRouter();
  const colors = useColors();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const permissions = usePermissions();
  const canView = permissions.has(PERMISSION.DRIVER_VIEW);
  const canManage = permissions.has(PERMISSION.DRIVER_MANAGE);

  const [month, setMonth] = useState<string>(
    params.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) ? params.month : currentMonth(),
  );
  const [tab, setTab] = useState<AppTab>(
    params.tab === DRIVER_DETAIL_TAB.TRIPS ? DRIVER_DETAIL_TAB.TRIPS : DRIVER_DETAIL_TAB.OVERVIEW,
  );
  const [editing, setEditing] = useState<Driver | null>(null);
  const [confirm, setConfirm] = useState<'suspend' | 'end' | null>(null);
  const suspend = useSuspendDriver();
  const resume = useResumeDriver();
  const end = useEndDriver();

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
        <ManagePageHeader title={t('fallbackTitle')} onBack={back} />
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
  const open = DRIVER_LINK_OPEN_STATUSES.includes(driver.linkStatus);
  const invited = driver.linkStatus === DRIVER_LINK_STATUS.INVITED;
  const canEdit = canManage && open;
  const busy = suspend.isPending || resume.isPending || end.isPending;
  const accountName = driver.account.displayName ?? null;

  const feedback = (key: 'toast.suspended' | 'toast.resumed' | 'toast.ended' | 'toast.revoked') => ({
    onSuccess: () => toast.showSuccess(tDrivers(key)),
    onError: (err: unknown) => toast.showError(errorMessage(err)),
  });

  return (
    <>
      {/* Figma "Header MB" biến thể chi tiết: ← + "Chi tiết tài xế", nút sửa viền bên phải. */}
      <ManagePageHeader
        title={t('fallbackTitle')}
        onBack={back}
        {...(canEdit
          ? {
              actions: (
                <IconSquareButton label={tApp('edit')} onPress={() => setEditing(driver)}>
                  <LineIcon name="edit" size={iconSize.lg} color={colors.placeholder} />
                </IconSquareButton>
              ),
            }
          : {})}
      />
      <Screen
        scrollReveal
        padded={false}
        edges={['left', 'right', 'bottom']}
        refreshing={query.isRefetching}
        onRefresh={() => void query.refetch()}
      >
        {/* Khối đầu trắng (Figma "_Kanban Items"): đệm 16/16/0, các dòng cách 12, tab ở đáy. */}
        <YStack bg={colors.surface} px={space.md} pt={space.md} gap={12} elevation={1}>
          <XStack ai="center" gap={space.sm}>
            <Avatar name={driver.name} url={driver.account.avatarUrl ?? null} size={AVATAR} />
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
              <XStack ai="center" gap={space.sm} minWidth={0}>
                <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
                  {driver.phone}
                </Text>
                {accountName ? (
                  <>
                    <Text col={colors.textDisabled} fos={typeScale.body.fontSize} aria-hidden>
                      |
                    </Text>
                    <Text
                      f={1}
                      col={colors.textMuted}
                      fos={typeScale.label.fontSize}
                      lh={typeScale.label.lineHeight}
                      numberOfLines={1}
                    >
                      {accountName}
                    </Text>
                  </>
                ) : null}
              </XStack>
            </YStack>
          </XStack>

          <XStack flexWrap="wrap" ai="center" gap={12}>
            <YStack px={space.sm} py={2} br={radius.card} bg={colors.background}>
              <Text
                col={colors.textMuted}
                fos={typeScale.label.fontSize}
                lh={typeScale.label.lineHeight}
                fow={fontWeight.medium}
              >
                <DriverTypeLabel driver={driver} />
              </Text>
            </YStack>
            <LinkStatusPill driver={driver} />
          </XStack>

          {/* Gọi · Zalo bằng SĐT tài xế (bên thuê đã có số này lúc mời); chưa có chat với tài xế nên không có "Nhắn tin". */}
          <ContactActions
            labeled
            phone={driver.phone}
            labels={{ message: '', call: tApp('call'), zalo: tApp('zalo') }}
          />

          <DriverStatusLine driver={driver} variant="detail" />

          <XStack jc="space-between" ai="center" gap={space.sm}>
            <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
              {tDrivers('card.activeTrips')}
            </Text>
            {driver.activeBookingCount > 0 ? (
              <Pressable
                onPress={() => setTab(DRIVER_DETAIL_TAB.OVERVIEW)}
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
                  {tDrivers('activeBookings', { count: driver.activeBookingCount })}
                </Text>
              </Pressable>
            ) : (
              <Text col={colors.textDisabled} fos={typeScale.body.fontSize} fow={fontWeight.medium}>
                {tDrivers('app.noTrips')}
              </Text>
            )}
          </XStack>

          <UnderlineTabs
            stretch
            items={APP_TABS.map((key) => ({ key, label: t(`tabs.${key}`) }))}
            value={tab}
            onChange={setTab}
          />
        </YStack>

        <YStack p={space.md} gap={space.md}>
          {tab === DRIVER_DETAIL_TAB.OVERVIEW ? (
            <DriverOverviewSection
              overview={data}
              onMonthChange={setMonth}
              canEdit={canEdit}
              canManage={canManage}
              onEditNote={() => setEditing(driver)}
            />
          ) : (
            <DriverTripsSection
              key={driver.id}
              driver={driver}
              month={data.month.month}
              wageTotal={data.month.wageTotal}
              onMonthChange={setMonth}
            />
          )}

          {tab === DRIVER_DETAIL_TAB.OVERVIEW && canManage && open ? (
            <XStack ai="center" gap={space.lg} flexWrap="wrap">
              {driver.linkStatus === DRIVER_LINK_STATUS.ACTIVE ? (
                <TextAction label={tDrivers('actions.suspend')} disabled={busy} onPress={() => setConfirm('suspend')} />
              ) : null}
              {driver.linkStatus === DRIVER_LINK_STATUS.SUSPENDED ? (
                <TextAction
                  label={tDrivers('actions.resume')}
                  disabled={busy}
                  onPress={() => resume.mutate(driver.id, feedback('toast.resumed'))}
                />
              ) : null}
              <TextAction
                danger
                label={invited ? tDrivers('actions.revoke') : tApp('unlink')}
                disabled={busy}
                onPress={() => setConfirm('end')}
              />
            </XStack>
          ) : null}
        </YStack>
      </Screen>

      <EditDriverSheet driver={editing} onClose={() => setEditing(null)} />

      <AlertDialog
        open={confirm === 'suspend'}
        title={tDrivers('actions.suspendConfirm')}
        confirmLabel={tDrivers('actions.suspend')}
        cancelLabel={tActions('close')}
        loading={suspend.isPending}
        onConfirm={() => {
          setConfirm(null);
          suspend.mutate(driver.id, feedback('toast.suspended'));
        }}
        onCancel={() => setConfirm(null)}
      />
      <AlertDialog
        open={confirm === 'end'}
        title={
          invited
            ? tDrivers('actions.revokeConfirm')
            : driver.activeBookingCount > 0
              ? tDrivers('actions.endConfirmWithTrips', { count: driver.activeBookingCount })
              : tDrivers('actions.endConfirm')
        }
        confirmLabel={invited ? tDrivers('actions.revoke') : tDrivers('actions.end')}
        cancelLabel={tActions('close')}
        destructive
        loading={end.isPending}
        onConfirm={() => {
          setConfirm(null);
          end.mutate(driver.id, feedback(invited ? 'toast.revoked' : 'toast.ended'));
        }}
        onCancel={() => setConfirm(null)}
      />
    </>
  );

}

function DriverTypeLabel({ driver }: { driver: Driver }) {
  const domainLabel = useDomainLabel();
  return <>{domainLabel('driverType', driver.driverType, driver.driverType)}</>;
}

function LinkStatusPill({ driver }: { driver: Driver }) {
  const domainLabel = useDomainLabel();
  const meta = DRIVER_LINK_STATUS_META[driver.linkStatus];
  return (
    <Pill
      label={domainLabel('driverLinkStatus', driver.linkStatus, meta.label)}
      tone={
        driver.linkStatus === DRIVER_LINK_STATUS.INVITED
          ? 'info'
          : pillToneOfStatusColor(
              driver.linkStatus === DRIVER_LINK_STATUS.SUSPENDED ? STATUS_COLOR.DANGER : meta.color,
            )
      }
    />
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
      style={{ opacity: disabled ? 0.45 : 1 }}
    >
      <Text
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

/** Khung thẻ khối của Figma: nền trắng, viền xám nhạt, bo 16, đệm 16. */
function Block({ children, gap = 10 }: { children: ReactNode; gap?: number }) {
  const colors = useColors();
  return (
    <YStack bg={colors.surface} bw={1} bc={colors.border} br={radius.card} p={BLOCK_PAD} gap={gap}>
      {children}
    </YStack>
  );
}

function BlockTitle({ children, end }: { children: string; end?: ReactNode }) {
  const colors = useColors();
  return (
    <XStack ai="center" jc="space-between" gap={space.sm}>
      <Text
        f={1}
        col={colors.text}
        fos={typeScale.title.fontSize}
        lh={typeScale.title.lineHeight}
        fow={fontWeight.semibold}
      >
        {children}
      </Text>
      {end}
    </XStack>
  );
}

/** Ô số nền xám (Figma "Thông số"): nhãn 12 mờ trên, giá trị 14 đậm dưới. */
function MetricCell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  const colors = useColors();
  return (
    <YStack f={1} minWidth="45%" bg={colors.background} br={radius.control} p={space.sm} gap={space.xs}>
      <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
        {label}
      </Text>
      <Text col={tone ?? colors.text} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.semibold}>
        {value}
      </Text>
    </YStack>
  );
}

/** Tab Tổng quan — Figma `24512:119081`. */
function DriverOverviewSection({
  overview,
  onMonthChange,
  canEdit,
  canManage,
  onEditNote,
}: {
  overview: DriverOverview;
  onMonthChange: (month: string) => void;
  canEdit: boolean;
  canManage: boolean;
  onEditNote: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Drivers.detail.overview');
  const tApp = useTranslations('Drivers.app.detail');
  const tDrivers = useTranslations('Drivers');
  const fmt = useAppFormat();
  const settings = useDriverWageSettings();
  const { driver, month, upcoming, reliability, trend, current } = overview;
  const domainLabel = useDomainLabel();
  const navigateOnce = useNavigateOnce();
  const shopDaily = settings.data?.dailyWage ?? null;
  const [year, mm] = month.month.split('-');

  // So với tháng TRƯỚC trong chuỗi 6 tháng (cùng một lần đọc) - không có số tháng trước thì không vẽ.
  const delta = useMemo(() => {
    const prevKey = dayjs(month.month, MONTH_PERIOD_FORMAT).subtract(1, 'month').format(MONTH_PERIOD_FORMAT);
    const prev = trend.find((p) => p.month === prevKey);
    const prevWage = prev ? Number(prev.wageTotal) : 0;
    if (prevWage <= 0) return null;
    return Math.round(((Number(month.wageTotal) - prevWage) / prevWage) * 100);
  }, [month.month, month.wageTotal, trend]);

  const hasTrend = trend.some((p) => p.trips > 0 || Number(p.wageTotal) > 0);
  const maxWage = Math.max(1, ...trend.map((p) => Number(p.wageTotal)));

  const reliabilityCells = [
    {
      key: 'response',
      label: tApp('response'),
      value:
        reliability.medianResponseMinutes == null
          ? '-'
          : reliability.medianResponseMinutes === 0
            ? t('reliability.underMinute')
            : fmt.minutesDuration(reliability.medianResponseMinutes),
    },
    { key: 'declined', label: tApp('declined'), value: tApp('times', { count: reliability.declined }) },
    {
      key: 'expired',
      label: tApp('expired'),
      value: tApp('trips', { count: reliability.expired }),
      tone: reliability.expired > 0 ? colors.danger : undefined,
    },
    { key: 'pending', label: tApp('pending'), value: tApp('trips', { count: upcoming.pendingTrips }) },
    ...(driver.dropCount > 0
      ? [
          {
            key: 'drops',
            label: t('reliability.drops'),
            value: t('reliability.dropsValue', { count: driver.dropCount, critical: driver.criticalDropCount }),
            tone: colors.danger,
          },
        ]
      : []),
    ...(driver.autoAssignCooldownUntil
      ? [
          {
            key: 'cooldown',
            label: t('reliability.cooldown'),
            value: fmt.dateTime(driver.autoAssignCooldownUntil),
            tone: colors.danger,
          },
        ]
      : []),
  ];

  const ended = driver.linkStatus === DRIVER_LINK_STATUS.ENDED;
  const tProfile = useTranslations('Drivers.detail.profile');

  return (
    <>
      <Block>
        <XStack ai="center" jc="space-between" gap={space.sm}>
          <Text col={colors.text} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} fow={fontWeight.medium}>
            {tApp('wageTitle')}
          </Text>
          <MonthPeriodField
            variant="chip"
            label={tDrivers('wage.month.label')}
            display={tApp('month', { month: `${mm}/${year}` })}
            value={month.month}
            onChange={onMonthChange}
            maxPeriod={currentMonth()}
          />
        </XStack>
        <XStack ai="center" gap={space.sm} flexWrap="wrap">
          <Text col={colors.text} fos={20} lh={30} fow={fontWeight.semibold}>
            {fmt.money(month.wageTotal)}
          </Text>
          {delta != null ? (
            <YStack px={space.sm} py={2} br={radius.pill} bg={delta >= 0 ? colors.successSurface : colors.dangerSurface}>
              <Text
                col={delta >= 0 ? colors.success : colors.danger}
                fos={typeScale.label.fontSize}
                lh={typeScale.label.lineHeight}
                fow={fontWeight.medium}
              >
                {delta >= 0 ? tApp('deltaUp', { pct: delta }) : tApp('deltaDown', { pct: Math.abs(delta) })}
              </Text>
            </YStack>
          ) : null}
        </XStack>
        <XStack gap={space.sm}>
          {[
            { key: 'done', value: fmt.count(month.completedTrips), label: tApp('completed'), tone: colors.text },
            {
              key: 'avg',
              value: month.averageDailyWage == null ? '-' : fmt.moneyCompact(month.averageDailyWage),
              label: tApp('averageDaily'),
              tone: colors.text,
            },
            {
              key: 'upcoming',
              value: String(upcoming.acceptedTrips).padStart(2, '0'),
              label: tApp('upcoming'),
              tone: colors.brandHigh,
            },
          ].map((cell) => (
            <YStack key={cell.key} f={1} ai="center" gap={2} p={space.sm} br={radius.thumb} bg={colors.background}>
              <Text col={cell.tone} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.semibold}>
                {cell.value}
              </Text>
              <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} numberOfLines={1}>
                {cell.label}
              </Text>
            </YStack>
          ))}
        </XStack>
        {/* Chi tiết tiền công Figma không vẽ - giữ gọn dưới ba ô (người dùng 25/11/2026). */}
        <YStack gap={2}>
          <DataRow size="sm" labelWide label={t('wage.agreed', { count: month.agreedTrips })} value={fmt.money(month.agreedWage)} />
          <DataRow size="sm" labelWide label={t('wage.edited')} value={t('wage.editedValue', { count: month.editedTrips })} />
          <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
            {[
              shopDaily ? t('stats.shopDaily', { amount: fmt.money(shopDaily) }) : t('stats.noShopDaily'),
              upcoming.acceptedTrips > 0 ? t('stats.upcomingWage', { amount: fmt.money(upcoming.acceptedWage) }) : null,
            ]
              .filter(Boolean)
              .join(LIST_SEPARATOR)}
          </Text>
          <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
            {t('wage.note')}
          </Text>
        </YStack>

        <YStack h={1} bg={colors.border} my={space.xs} />

        <YStack gap={space.md}>
          <XStack ai="center" jc="space-between" gap={space.sm}>
            <Text f={1} col={colors.text} fos={typeScale.title.fontSize} lh={typeScale.title.lineHeight} fow={fontWeight.semibold}>
              {tApp('reliability')}
            </Text>
            <Text col={colors.textPlaceholder} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
              {tApp('window', { days: reliability.windowDays })}
            </Text>
          </XStack>
          <XStack ai="center" gap={20}>
            <Text col={colors.text} fos={20} lh={30} fow={fontWeight.semibold}>
              {reliability.acceptRate == null ? '-' : t('reliability.rate', { rate: reliability.acceptRate })}
            </Text>
            <YStack f={1} gap={space.xs}>
              <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} numberOfLines={1}>
                {reliability.acceptRate == null
                  ? t('reliability.noSample')
                  : tApp('rateLine', { accepted: reliability.accepted, decided: reliability.decided })}
              </Text>
              <YStack h={8} br={4} bg={colors.successSurface} ov="hidden">
                <YStack h={8} br={4} bg={colors.success} w={`${Math.min(100, Math.max(0, reliability.acceptRate ?? 0))}%`} />
              </YStack>
            </YStack>
          </XStack>
        </YStack>
        <XStack flexWrap="wrap" gap={12}>
          {reliabilityCells.map((cell) => (
            <MetricCell key={cell.key} label={cell.label} value={cell.value} {...(cell.tone ? { tone: cell.tone } : {})} />
          ))}
        </XStack>
      </Block>

      <Block>
        <BlockTitle>{t('trend.title')}</BlockTitle>
        {hasTrend ? (
          <XStack ai="flex-end" gap={space.sm} pt={space.sm}>
            {trend.map((point) => {
              const active = point.month === month.month;
              const h = Math.max(BAR_MIN, Math.round((Number(point.wageTotal) / maxWage) * BAR_MAX));
              return (
                <YStack
                  key={point.month}
                  f={1}
                  ai="center"
                  gap={space.xs}
                  accessible
                  accessibilityLabel={[
                    fmt.monthYear(dayjs(point.month, MONTH_PERIOD_FORMAT).toDate()),
                    fmt.money(point.wageTotal),
                    `${t('trend.trips')}: ${fmt.count(point.trips)}`,
                  ].join(LIST_SEPARATOR)}
                >
                  <YStack
                    w={BAR_WIDTH}
                    h={h}
                    btlr={6}
                    btrr={6}
                    bg={active ? colors.brandShape : colors.barIdle}
                  />
                  <Text
                    col={active ? colors.text : colors.placeholder}
                    fos={typeScale.label.fontSize}
                    lh={typeScale.label.lineHeight}
                    fow={active ? fontWeight.semibold : fontWeight.regular}
                  >
                    {tApp('barMonth', { month: Number(point.month.slice(5, 7)) })}
                  </Text>
                </YStack>
              );
            })}
          </XStack>
        ) : (
          <Text col={colors.textMuted} fos={typeScale.body.fontSize}>
            {t('trend.empty')}
          </Text>
        )}
      </Block>

      {driver.activeBookingCount > 0 ? (
        <Block gap={12}>
          <BlockTitle>{tApp('upcomingTitle')}</BlockTitle>
          {current.map((trip) => {
            const bookingMeta = BOOKING_STATUS_META[trip.bookingStatus as BookingStatus];
            const assignmentMeta = trip.assignmentStatus
              ? DRIVER_ASSIGNMENT_STATUS_META[trip.assignmentStatus as DriverAssignmentStatus]
              : null;
            return (
              <Pressable
                key={trip.bookingId}
                onPress={() => navigateOnce(ROUTES.manage.bookingDetail(trip.bookingId))}
                accessibilityRole="button"
                accessibilityLabel={trip.bookingCode}
              >
                <YStack bw={1} bc={colors.border} br={radius.control} p={12} gap={space.xs}>
                  <XStack ai="center" gap={6} minWidth={0}>
                    <Text col={colors.text} fos={typeScale.title.fontSize} lh={typeScale.title.lineHeight} fow={fontWeight.semibold}>
                      {`#${trip.bookingCode}`}
                    </Text>
                    <YStack w={6} h={6} br={3} bg={colors.textDisabled} />
                    <Text f={1} col={colors.text} fos={typeScale.title.fontSize} lh={typeScale.title.lineHeight} fow={fontWeight.semibold} numberOfLines={1}>
                      {trip.vehiclePlate ? `${trip.vehicleName} · ${trip.vehiclePlate}` : trip.vehicleName}
                    </Text>
                  </XStack>
                  <Text col={colors.placeholder} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
                    {fmt.shortDateTimeRange(trip.pickupAt, trip.returnAt)}
                  </Text>
                  {/* Khách của chuyến (web `PersonCell`). */}
                  <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
                    {[trip.customerName, trip.customerPhone].filter(Boolean).join(LIST_SEPARATOR)}
                  </Text>
                  <XStack gap={space.sm} flexWrap="wrap" pt={space.xs}>
                    {bookingMeta ? (
                      <Pill
                        label={domainLabel('bookingStatus', trip.bookingStatus, bookingMeta.label)}
                        tone={pillToneOfStatusColor(bookingMeta.color)}
                      />
                    ) : null}
                    {assignmentMeta && trip.assignmentStatus ? (
                      <Pill
                        label={domainLabel('driverAssignmentStatus', trip.assignmentStatus, assignmentMeta.label)}
                        tone={pillToneOfStatusColor(assignmentMeta.color)}
                      />
                    ) : null}
                  </XStack>
                </YStack>
              </Pressable>
            );
          })}
          {driver.activeBookingCount > current.length ? (
            <Text col={colors.placeholder} fos={typeScale.label.fontSize}>
              {t('current.more', { shown: current.length })}
            </Text>
          ) : null}
        </Block>
      ) : null}

      <Block gap={12}>
        <BlockTitle
          end={
            canEdit ? (
              <Pressable onPress={onEditNote} accessibilityRole="button" hitSlop={space.sm}>
                <XStack ai="center" gap={6}>
                  <LineIcon name="edit" size={iconSize.lg} color={colors.brandLink} />
                  <Text col={colors.brandLink} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.semibold}>
                    {tApp('noteEdit')}
                  </Text>
                </XStack>
              </Pressable>
            ) : undefined
          }
        >
          {tApp('noteTitle')}
        </BlockTitle>
        <YStack bg={colors.background} br={10} p={12}>
          <Text
            col={driver.note ? colors.textMuted : colors.placeholder}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
          >
            {driver.note ?? tProfile('noNote')}
          </Text>
        </YStack>
      </Block>

      {/* Tab Hồ sơ của web gộp về đây (Figma chỉ còn 2 tab - người dùng 25/11/2026). */}
      <Block gap={space.sm}>
        <BlockTitle>{tApp('linkInfo')}</BlockTitle>
        <DataRow size="md" labelWide label={tProfile('invitedAt')} value={fmt.dateTime(driver.invitedAt)} />
        {driver.respondedAt ? (
          <DataRow size="md" labelWide label={tProfile('respondedAt')} value={fmt.dateTime(driver.respondedAt)} />
        ) : null}
        {ended && driver.endedAt ? (
          <DataRow
            size="md"
            label={tProfile('endedAt')}
            value={`${fmt.dateTime(driver.endedAt)}${
              driver.endedByParty
                ? ` · ${
                    driver.endedByParty === DRIVER_LINK_END_PARTY.DRIVER
                      ? tProfile('endedByDriver')
                      : tProfile('endedByEmployer')
                  }`
                : ''
            }`}
          />
        ) : null}
        <YStack h={1} bg={colors.borderSubtle} my={space.xs} />
        <Text col={colors.text} fos={typeScale.body.fontSize} fow={fontWeight.medium}>
          {tProfile('sectionLicence')}
        </Text>
        <DriverLicenceDetail
          licence={driver.licence}
          invitedName={driver.name}
          checked={Boolean(driver.licenceCheck)}
        />
        {/* Liên kết đã đóng thì server từ chối đối chiếu — web `LicenceCard canManage={canManage && open}`. */}
        <LicenceCheckControl
          driver={driver}
          canManage={canManage && DRIVER_LINK_OPEN_STATUSES.includes(driver.linkStatus)}
        />
      </Block>
    </>
  );
}

/** Tab "Chuyến & tiền công" — Figma `24512:120445`. */
function DriverTripsSection({
  driver,
  month,
  wageTotal,
  onMonthChange,
}: {
  driver: Driver;
  month: string;
  wageTotal: string;
  onMonthChange: (month: string) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Drivers.detail.trips');
  const tApp = useTranslations('Drivers.app');
  const tDrivers = useTranslations('Drivers');
  const tLine = useTranslations('Drivers.wage.line');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const navigateOnce = useNavigateOnce();
  // Tìm + lọc kết cục ở SERVER (web `DriverTripsToolbar`, 25/11/2026).
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search, TRIP_SEARCH_DEBOUNCE_MS).trim() || undefined;
  const [status, setStatus] = useState<string>(ALL_STATUSES);
  const statusFilter = status === ALL_STATUSES ? undefined : status;
  // Trang thuộc về MỘT bộ (tháng, tìm, kết cục): đổi bất kỳ là về trang 1 (như web).
  const pagingKey = `${month}|${q ?? ''}|${statusFilter ?? ''}`;
  const [paging, setPaging] = useState({ key: pagingKey, page: 1 });
  const page = paging.key === pagingKey ? paging.page : 1;
  const query = useDriverAssignments(driver.id, { month, q, status: statusFilter, page });
  const tPage = useTranslations('Drivers.detailPage.trips');
  const tTripsApp = useTranslations('Drivers.app.trips');
  const statusOptions = useMemo(
    () => [
      { value: ALL_STATUSES, label: tPage('allStatuses') },
      ...TRIP_OUTCOMES.map((value) => ({
        value,
        label: domainLabel('driverAssignmentOutcome', value),
      })),
    ],
    [domainLabel, tPage],
  );
  const filtered = Boolean(q || statusFilter);
  const items = useAccumulatedPages(query.data?.items, query.data?.meta?.page);
  const meta = query.data?.meta;
  const tActions = useTranslations('Common.actions');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const [exporting, setExporting] = useState(false);
  const [year, mm] = month.split('-');

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
    <>
      {/* Figma "Tổng ghi nhận · Tháng 10" + "Bảng kê": thẻ trắng bo 12, bóng nhẹ. Bộ chọn tháng giữ ở đây. */}
      <XStack ai="center" jc="space-between" gap={space.sm} p={12} br={radius.control} bg={colors.surface} bw={1} bc={colors.border}>
        <YStack f={1} minWidth={0} gap={2}>
          <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} numberOfLines={1}>
            {tApp('trips.total', { month: tApp('detail.month', { month: `${mm}/${year}` }) })}
          </Text>
          <Text col={colors.text} fos={typeScale.title.fontSize} lh={typeScale.title.lineHeight} fow={fontWeight.semibold}>
            {fmt.money(wageTotal)}
          </Text>
        </YStack>
        <YStack ai="flex-end" gap={space.xs}>
          <MonthPeriodField
            variant="chip"
            label={tDrivers('wage.month.label')}
            display={tApp('detail.month', { month: `${mm}/${year}` })}
            value={month}
            onChange={onMonthChange}
            maxPeriod={currentMonth()}
          />
          <Button
            label={tApp('trips.statement')}
            lineIcon="download"
            variant="secondary"
            size="sm"
            block={false}
            loading={exporting}
            disabled={items.length === 0}
            onPress={() => void exportStatement()}
          />
        </YStack>
      </XStack>

      {/* Figma "Tab List" `24512:121256`: ô tìm + "Trạng thái" cùng hàng. */}
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
        <ScreenError error={query.error} title={t('loadError')} onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        filtered ? (
          <ScreenMessage
            icon="search-outline"
            title={tPage('emptyFiltered')}
            description={tPage('emptyFilteredHint')}
          />
        ) : (
          <ScreenMessage icon="car-outline" title={t('empty')} description={t('emptyHint')} />
        )
      ) : (
        <YStack gap={space.md}>
          {items.map((row) => {
            const line = driverWageLine({ amount: row.wageAmount, stage: row.stage });
            const outcomeMeta = DRIVER_ASSIGNMENT_OUTCOME_META[row.outcome as DriverAssignmentOutcome];
            const amount = line && line.kind !== 'none' ? Number(line.amount) : null;
            const wageText =
              !line || line.kind === 'none'
                ? tLine('none')
                : amount && amount > 0
                  ? `+${fmt.money(line.amount)}`
                  : fmt.money(line.amount);
            const wageColor =
              amount && amount > 0
                ? colors.success
                : outcomeMeta?.color === STATUS_COLOR.DANGER
                  ? colors.danger
                  : colors.placeholder;
            const range = fmt.shortDateTimeRange(row.pickupAt, row.returnAt);
            return (
              <Pressable
                key={row.id}
                onPress={() => navigateOnce(ROUTES.manage.bookingDetail(row.bookingId))}
                accessibilityRole="button"
                accessibilityLabel={row.bookingCode}
              >
                <YStack bg={colors.surface} bw={1} bc={colors.border} br={radius.card} p={space.md} gap={space.sm}>
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
                    {[row.vehicleName, row.vehiclePlate].filter(Boolean).join(LIST_SEPARATOR)}
                  </Text>
                  {/* Figma `24512:121371`: "Khách: <tên>" 12, tên medium. */}
                  <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} numberOfLines={1}>
                    {tTripsApp.rich('customer', {
                      name: [row.customerName, row.customerPhone].filter(Boolean).join(LIST_SEPARATOR),
                      b: (chunks) => (
                        <Text col={colors.textMuted} fos={typeScale.label.fontSize} fow={fontWeight.medium}>
                          {chunks}
                        </Text>
                      ),
                    })}
                  </Text>
                  <XStack ai="center" jc="space-between" gap={space.sm} p={space.sm} br={radius.control} bg={colors.background}>
                    <Text f={1} col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} numberOfLines={1}>
                      {row.wageDays ? tApp('trips.rangeDays', { range, days: row.wageDays }) : range}
                    </Text>
                    <Text col={wageColor} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} fow={fontWeight.semibold}>
                      {wageText}
                    </Text>
                  </XStack>
                </YStack>
              </Pressable>
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
          {meta ? (
            <Text col={colors.textMuted} fos={typeScale.label.fontSize} ta="center">
              {t('total', { count: meta.total })}
            </Text>
          ) : null}
        </YStack>
      )}
    </>
  );
}

/**
 * "Đối chiếu" bằng lái khi tên trên bằng lệch tên đã đặt — native port of web `LicenceCard`
 * (25/11/2026): chưa đối chiếu ⇒ nút "Đánh dấu đã đối chiếu"; đã đối chiếu ⇒ ai, lúc nào + lối
 * "Bỏ đánh dấu" khi bấm nhầm. Tài xế nộp bằng mới thì server tự gỡ đánh dấu.
 */
function LicenceCheckControl({ driver, canManage }: { driver: Driver; canManage: boolean }) {
  const colors = useColors();
  const t = useTranslations('Drivers');
  const tCheck = useTranslations('Drivers.licenceCheck');
  const fmt = useAppFormat();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const setChecked = useSetDriverLicenceChecked();
  const licence = driver.licence;
  const verified = licence.state === DRIVER_LICENCE_STATE.VERIFIED;
  const nameDiffers = verified && holderNameDiffers(licence.fullName, driver.name);
  const check = driver.licenceCheck ?? null;
  const mismatch = nameDiffers && !check;
  const toggle = (checked: boolean) =>
    setChecked.mutate(
      { id: driver.id, checked },
      {
        onSuccess: () =>
          toast.showSuccess(checked ? t('toast.licenceChecked') : t('toast.licenceUnchecked')),
        onError: (err) => toast.showError(errorMessage(err)),
      },
    );

  if (mismatch && canManage) {
    return (
      <XStack>
        <Button
          label={tCheck('mark')}
          variant="secondary"
          size="sm"
          block={false}
          loading={setChecked.isPending}
          onPress={() => toggle(true)}
        />
      </XStack>
    );
  }
  if (!(nameDiffers && check)) return null;
  return (
    <XStack ai="center" jc="space-between" gap={space.sm} flexWrap="wrap">
      <Text f={1} col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
        {check.checkedByName
          ? tCheck('checkedBy', { name: check.checkedByName, time: fmt.dateTime(check.checkedAt) })
          : tCheck('checkedAt', { time: fmt.dateTime(check.checkedAt) })}
      </Text>
      {canManage ? (
        <Button
          label={tCheck('unmark')}
          variant="ghost"
          size="sm"
          block={false}
          loading={setChecked.isPending}
          onPress={() => toggle(false)}
        />
      ) : null}
    </XStack>
  );
}
