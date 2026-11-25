import { useState } from 'react';
import { Pressable } from 'react-native';
import { LineIcon, type LineIconName } from '@/components/icons/LineIcon';
import { VehicleEditSummaryCard } from '@/features/vehicles/components/VehicleEditSummaryCard';
import { useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  API_ERROR_CODE,
  MAINTENANCE_DUE_STATUS,
  MAINTENANCE_DUE_STATUS_META,
  MAINTENANCE_STATUS,
  MAINTENANCE_STATUS_HOLDING_SCHEDULE,
  MAINTENANCE_STATUS_META,
  PERMISSION,
  STATUS_COLOR,
  type MaintenanceDueStatus,
  type MaintenanceStatus,
} from '@xeprime/types';
import {
  maintenanceProfileFormSchema,
  type MaintenanceProfileFormValues,
} from '@xeprime/validators';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { metaColor, metaLabel } from '@/lib/status-meta';
import { VehicleEditHeader } from '@/features/vehicles/components/VehicleEditHeader';
import { VEHICLE_EDIT_TAB } from '@/navigation/vehicle-edit-tab';
import { Screen } from '@/components/layout/Screen';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { OdometerCorrectionSheet } from './components/OdometerCorrectionSheet';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { BlockLink } from '@/components/ui/BlockTitle';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { Divider } from '@/components/ui/DataRow';
import { NumberField } from '@/components/ui/NumberField';
import { Pagination } from '@/components/ui/Pagination';
import { SkeletonText } from '@/components/ui/Skeleton';
import { Pill, pillToneOfStatusColor } from '@/components/ui/Pill';
import { TextField } from '@/components/ui/TextField';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { DateField } from '@/components/ui/DateField';
import { useVehicle } from '@/features/vehicles/hooks/use-vehicle';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { getErrorCode } from '@/lib/api-client';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { FIRST_PAGE } from '@/queries/use-clamped-page';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space, typeScale } from '@/theme/tokens';
import {
  useMaintenanceProfile,
  useMaintenanceRecords,
  useOdometerHistory,
  useSaveMaintenanceProfile,
  useTransitionMaintenanceRecord,
} from './hooks/use-maintenance';
import { MaintenanceRecordSheet, type RecordSheetMode } from './components/MaintenanceRecordSheet';
import type { MaintenanceProfile, MaintenanceRecord } from './api';

/**
 * Bảo dưỡng của MỘT xe (VEH-09) + số KM (VEH-10).
 *
 * Bốn khối, đúng thứ tự VÀ đúng nội dung của tab "Bảo dưỡng & KM" bên web
 * (`apps/web/src/features/vehicle-maintenance/components/VehicleMaintenanceWorkspace.tsx`):
 * chỉ số KM hiện tại → theo dõi thay nhớt định kỳ → lịch bảo dưỡng sắp tới → lịch sử. Nhãn lấy
 * từ CÙNG khoá message với web, nên hai client không bao giờ gọi một thứ bằng hai tên.
 *
 * KM là dữ liệu có thẩm quyền: chưa có số thì nói "chưa có", **không** dựng `0 km`; và mọi lần
 * điều chỉnh đều BẮT BUỘC có lý do (ba lớp cùng ép: form, DTO, CHECK ở DB).
 */
export function VehicleMaintenanceScreen({ vehicleId }: { vehicleId: string }) {
  const tEdit = useTranslations('Vehicles.edit');
  const router = useRouter();
  const { has } = usePermissions();

  const canView = has(PERMISSION.VEHICLE_MAINTENANCE_VIEW);
  const back = () => goBackOr(router, ROUTES.manage.vehicleEdit(vehicleId));
  const title = tEdit('tabs.maintenance');

  const vehicle = useVehicle(vehicleId, has(PERMISSION.VEHICLE_VIEW));
  // Cùng query key với `VehicleMaintenanceWorkspace` — chỉ để kéo-làm-mới, không gọi thêm request.
  const profile = useMaintenanceProfile(vehicleId, canView);
  const records = useMaintenanceRecords(vehicleId, canView);

  return (
    <>
      <VehicleEditHeader
        vehicleId={vehicleId}
        tab={VEHICLE_EDIT_TAB.MAINTENANCE}
        title={tEdit('title')}
        onBack={back}
      />
      <Screen scrollReveal
        edges={['left', 'right', 'bottom']}
        refreshing={profile.isRefetching}
        onRefresh={() => {
          void profile.refetch();
          void records.refetch();
        }}
      >
        <YStack gap={layout.section}>
          <VehicleEditSummaryCard vehicleId={vehicleId} tab={VEHICLE_EDIT_TAB.MAINTENANCE} />
          <VehicleMaintenanceWorkspace vehicleId={vehicleId} />
        </YStack>
      </Screen>
    </>
  );
}

/**
 * Thân khu bảo dưỡng của MỘT xe — bản native của `VehicleMaintenanceWorkspace` bên web.
 *
 * Dùng ở hai chỗ như web: màn bảo dưỡng của xe, và tab "Bảo dưỡng" trên hồ sơ 360. Không có
 * header/khung cuộn riêng — nơi nhúng lo phần đó.
 */
export function VehicleMaintenanceWorkspace({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations('Vehicles.maintenance');
  const tEdit = useTranslations('Vehicles.edit');
  const { has, isLoading: permissionsLoading } = usePermissions();

  const canView = has(PERMISSION.VEHICLE_MAINTENANCE_VIEW);
  const canManage = has(PERMISSION.VEHICLE_MAINTENANCE_MANAGE);

  const profile = useMaintenanceProfile(vehicleId, canView);
  const records = useMaintenanceRecords(vehicleId, canView);

  const [sheet, setSheet] = useState<RecordSheetMode | null>(null);

  if (!permissionsLoading && !canView) {
    return (
      <ScreenMessage
        icon="lock-closed-outline"
        title={tEdit('tabs.maintenance')}
        description={t('noPermission')}
      />
    );
  }

  if (profile.isPending) return <SkeletonText lines={10} />;

  if (profile.isError) {
    return (
      <ScreenError
        error={profile.error}
        title={t('loadError')}
        onRetry={() => void profile.refetch()}
      />
    );
  }

  // Sắp tới: ngày dự kiến gần nhất trước, phiếu chưa có ngày xuống cuối — như web.
  const upcoming = (records.data ?? [])
    .filter((record) =>
      MAINTENANCE_STATUS_HOLDING_SCHEDULE.includes(record.status as MaintenanceStatus),
    )
    .sort((a, b) =>
      (a.plannedStartAt ?? '￿').localeCompare(b.plannedStartAt ?? '￿'),
    );
  // Lịch sử: chỉ phiếu đã hoàn tất / đã huỷ, mới nhất trước (phiếu huỷ xếp theo lần cập nhật).
  const history = (records.data ?? [])
    .filter(
      (record) =>
        record.status === MAINTENANCE_STATUS.COMPLETED ||
        record.status === MAINTENANCE_STATUS.CANCELED,
    )
    .sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt));

  return (
    <>
      {/* Figma "Tab Content - Bảo dưỡng & số KM" `24620:34510`: các thẻ cách nhau 12. */}
      <YStack gap={CARD_GAP}>
        {!canManage ? <Callout tone="info" title={t('readOnly')} /> : null}

        <OdometerCard vehicleId={vehicleId} profile={profile.data} />
        <OilCard vehicleId={vehicleId} profile={profile.data} />
        <RecordsCard
          title={t('records.upcoming')}
          records={upcoming}
          loading={records.isPending}
          failed={records.isError}
          onRetry={() => void records.refetch()}
          actionable
          onOpenSheet={setSheet}
        />
        <RecordsCard
          title={t('records.history')}
          records={history}
          loading={records.isPending}
          failed={records.isError}
          onRetry={() => void records.refetch()}
          actionable={false}
          onOpenSheet={setSheet}
        />
      </YStack>

      {sheet ? (
        <MaintenanceRecordSheet
          vehicleId={vehicleId}
          state={sheet}
          canViewFiles={has(PERMISSION.VEHICLE_MAINTENANCE_FILE_VIEW)}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </>
  );
}

function OdometerCard({ vehicleId, profile }: { vehicleId: string; profile: MaintenanceProfile }) {
  const colors = useColors();
  const t = useTranslations('Vehicles.maintenance.odometer');
  const tApp = useTranslations('Vehicles.maintenance.app');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const { has } = usePermissions();

  const [correcting, setCorrecting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  /* Mỗi chuyến thuê sinh một dòng KM nên danh sách này chỉ có lớn thêm — phân trang ở SERVER,
     đúng như `OdometerHistoryDialog` bên web. */
  const [historyPage, setHistoryPage] = useState(FIRST_PAGE);
  const history = useOdometerHistory(vehicleId, historyPage, historyOpen);

  const currentKm = profile.currentOdometerKm;

  /* Web dựng một dòng phụ `Cập nhật <lúc> · <chứng từ> · <nguồn>` — giữ nguyên thứ tự đó. */
  const meta = profile.currentOdometerAt
    ? [
        t('updatedMeta', { value: fmt.dateTime(profile.currentOdometerAt) }),
        profile.currentOdometerRefLabel,
        profile.currentOdometerSource
          ? domainLabel('odometerSource', profile.currentOdometerSource)
          : null,
      ]
        .filter(Boolean)
        .join(LIST_SEPARATOR)
    : t('noReading');

  return (
    <Card lift="flat">
      <YStack gap={CARD_GAP}>
        {/* Figma `24620:34543`: tiêu đề + "Điều chỉnh" (bút) ở mép phải - cùng thao tác nút cũ, cùng quyền. */}
        <CardHeader
          title={tApp('odoTitle')}
          {...(has(PERMISSION.VEHICLE_ODOMETER_CORRECT)
            ? { action: { label: tApp('adjust'), icon: 'edit' as const, onPress: () => setCorrecting(true) } }
            : {})}
        />

        {/* Figma "Odo Summary": nền `bg/gray-50` bo 12 đệm 12 - số 20/30 đậm + dòng cập nhật 12/18; nút "Lịch sử KM". */}
        <XStack ai="center" gap={CARD_GAP} p={CARD_GAP} br={radius.control} bg={colors.background}>
          <YStack f={1} minWidth={0} gap={2}>
            {/* Chưa có số thì nói "chưa có" - KHÔNG dựng "0 km". */}
            <Text col={colors.text} fos={typeScale.lead.fontSize} lh={typeScale.lead.lineHeight} fow={fontWeight.semibold} numberOfLines={1}>
              {currentKm == null ? tLabels('notAvailable') : fmt.km(currentKm)}
            </Text>
            <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
              {meta}
            </Text>
          </YStack>
          <Pressable
            onPress={() => setHistoryOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('history')}
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
          >
            <XStack ai="center" gap={4} px={space.sm} py={6} br={HISTORY_CHIP_RADIUS} bw={1} bc={colors.border} bg={colors.surface}>
              <LineIcon name="rotate-right" size={14} color={colors.infoStrong} />
              <Text col={colors.infoStrong} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} fow={fontWeight.semibold}>
                {t('history')}
              </Text>
            </XStack>
          </Pressable>
        </XStack>

        {currentKm == null ? (
          <Callout tone="warning" title={t('noDataTitle')}>
            {t('noDataBody')}
          </Callout>
        ) : null}
      </YStack>

      {/*
        Tấm trượt dùng CHUNG với Trung tâm bảo dưỡng — xem `OdometerCorrectionSheet`.

        Trước đây form này viết thẳng ở đây; khi bảng bảo dưỡng cần đúng thao tác đó, chép sang
        là chép cả cảnh báo giảm KM, khoá lạc quan và lý do bắt buộc — ba thứ mà một hôm sẽ chỉ
        được sửa ở một bên.
      */}
      <OdometerCorrectionSheet
        open={correcting}
        vehicleId={vehicleId}
        currentOdometerKm={profile.currentOdometerKm ?? null}
        rowVersion={profile.rowVersion}
        onClose={() => setCorrecting(false)}
      />

      <BottomSheet
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title={t('historyTitle')}
      >
        {history.isPending ? (
          <SkeletonText lines={5} />
        ) : history.isError ? (
          <Callout tone="danger" title={t('historyError')} />
        ) : history.data.items.length === 0 ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('historyEmpty')}
          </Text>
        ) : (
          <YStack gap={space.md}>
            {history.data.items.map((reading) => (
              <YStack key={reading.id} gap={2}>
                <XStack ai="center" gap={space.xs} flexWrap="wrap">
                  <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold}>
                    {fmt.km(reading.odometerKm)}
                  </Text>
                  {reading.previousKm != null ? (
                    <Text col={colors.placeholder} fos={fontSize.bodySm}>
                      {t('historyFrom', { value: fmt.km(reading.previousKm) })}
                    </Text>
                  ) : null}
                  {reading.isDecrease ? (
                    <Pill label={t('historyDecrease')} tone={pillToneOfStatusColor(STATUS_COLOR.DANGER)} />
                  ) : null}
                </XStack>
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {[
                    domainLabel('odometerSource', reading.source),
                    fmt.dateTime(reading.recordedAt),
                    reading.recordedByName,
                  ]
                    .filter(Boolean)
                    .join(LIST_SEPARATOR)}
                </Text>
                {reading.reason ? (
                  <Text col={colors.textMuted} fos={fontSize.bodySm}>
                    {reading.reason}
                  </Text>
                ) : null}
              </YStack>
            ))}

            <Pagination
              page={history.data.meta.page}
              limit={history.data.meta.limit}
              total={history.data.meta.total}
              onChange={setHistoryPage}
            />
          </YStack>
        )}
      </BottomSheet>
    </Card>
  );
}

/** Gợi ý trong ô nhập — con số đi qua bộ định dạng nên ra `5.000` ở vi và `5,000` ở en. */
const INTERVAL_PLACEHOLDER_KM = 5000;
const LAST_SERVICE_PLACEHOLDER_KM = 40000;

function OilCard({ vehicleId, profile }: { vehicleId: string; profile: MaintenanceProfile }) {
  const colors = useColors();
  const t = useTranslations('Vehicles.maintenance.oil');
  const tApp = useTranslations('Vehicles.maintenance.app');
  const tActions = useTranslations('Common.actions');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();
  const canManage = has(PERMISSION.VEHICLE_MAINTENANCE_MANAGE);

  const save = useSaveMaintenanceProfile(vehicleId);
  const resolver = useValidationResolver<MaintenanceProfileFormValues>(
    maintenanceProfileFormSchema,
    'Vehicles.maintenance.validation',
  );

  const { control, handleSubmit, formState } = useForm<MaintenanceProfileFormValues>({
    resolver,
    values: {
      oilChangeIntervalKm: profile.oilChangeIntervalKm ?? null,
      lastServiceKm: profile.lastServiceKm ?? null,
      lastServiceAt: profile.lastServiceAt ?? null,
      notes: profile.notes ?? '',
    },
  });

  function submit() {
    void handleSubmit((values) => {
      save.mutate(
        {
          oilChangeIntervalKm: values.oilChangeIntervalKm,
          lastServiceKm: values.lastServiceKm,
          lastServiceAt: values.lastServiceAt || null,
          notes: values.notes?.trim() || null,
          ...(profile.rowVersion > 0 ? { expectedRowVersion: profile.rowVersion } : {}),
        },
        {
          onSuccess: () => toast.showSuccess(t('saved')),
          onError: (error) => toast.showError(errorMessage(error)),
        },
      );
    })();
  }

  const dueStatus = profile.dueStatus as MaintenanceDueStatus;
  const overdue = dueStatus === MAINTENANCE_DUE_STATUS.OVERDUE;
  /* Thiếu một trong ba (KM hiện tại · chu kỳ · KM lần gần nhất) thì không có mốc để vẽ. */
  const hasSchedule =
    profile.nextMaintenanceKm != null && profile.remainingKm != null && profile.usedPercent != null;

  return (
    <Card lift="flat">
      <YStack gap={CARD_GAP}>
        {/* Figma `24620:34561`: tiêu đề + nhãn hạn (viên bo tròn) cùng một hàng. */}
        <XStack ai="center" jc="space-between" gap={space.sm}>
          <Text flexShrink={1} col={colors.text} fos={typeScale.title.fontSize} lh={typeScale.title.lineHeight} fow={fontWeight.semibold}>
            {tApp('oilTitle')}
          </Text>
          <Pill
            label={domainLabel(
              'maintenanceDueStatus',
              dueStatus,
              metaLabel(MAINTENANCE_DUE_STATUS_META, dueStatus),
            )}
            tone={pillToneOfStatusColor(metaColor(MAINTENANCE_DUE_STATUS_META, dueStatus))}
          />
        </XStack>

        {/* Figma "KM Inputs": hai ô cạnh nhau, cách 12. */}
        <XStack gap={CARD_GAP}>
          <YStack f={1} minWidth={0}>
            <NumberField
              control={control}
              name="oilChangeIntervalKm"
              label={tApp('intervalKm')}
              placeholder={fmt.kmNumber(INTERVAL_PLACEHOLDER_KM)}
              suffix="km"
              min={1}
              integer
              editable={canManage}
            />
          </YStack>
          <YStack f={1} minWidth={0}>
            <NumberField
              control={control}
              name="lastServiceKm"
              label={tApp('lastServiceKm')}
              placeholder={fmt.kmNumber(LAST_SERVICE_PLACEHOLDER_KM)}
              suffix="km"
              min={0}
              integer
              editable={canManage}
            />
          </YStack>
        </XStack>
        <DateField
          control={control}
          name="lastServiceAt"
          label={t('lastServiceAt')}
          disabled={!canManage}
        />

        {/* Figma "Milestone Progress": nền `bg/gray-50` bo 12 đệm 12 - "Mốc tiếp theo: X" · "Còn N km", thanh 8. */}
        <YStack gap={space.sm} p={CARD_GAP} br={radius.control} bg={colors.background}>
          <XStack ai="center" jc="space-between" gap={space.sm}>
            <XStack flexShrink={1} ai="center" gap={4}>
              <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
                {tApp('nextMilestone')}
              </Text>
              <Text col={colors.text} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} fow={fontWeight.semibold}>
                {profile.nextMaintenanceKm == null
                  ? tLabels('insufficientData')
                  : fmt.km(profile.nextMaintenanceKm)}
              </Text>
            </XStack>
            {/* Chưa có mốc thì vế trái đã nói "Chưa đủ dữ liệu" - không lặp lại bên phải. */}
            {profile.remainingKm == null ? null : (
            <Text
              flexShrink={1}
              col={overdue ? colors.danger : colors.infoStrong}
              fos={typeScale.label.fontSize}
              lh={typeScale.label.lineHeight}
              fow={fontWeight.medium}
              ta="right"
            >
              {fmt.remainingKm(profile.remainingKm)}
            </Text>
            )}
          </XStack>

          {hasSchedule ? (
            <YStack
              h={MILESTONE_BAR}
              br={radius.pill}
              bg={colors.border}
              ov="hidden"
              accessibilityRole="progressbar"
              accessibilityLabel={t('usedOfInterval', {
                used: fmt.kmNumber(profile.usedKm ?? 0),
                total: fmt.km(profile.oilChangeIntervalKm),
              })}
            >
              <YStack
                h={MILESTONE_BAR}
                br={radius.pill}
                w={`${Math.min(Math.max(profile.usedPercent as number, 0), 100)}%`}
                bg={overdue ? colors.danger : colors.info}
              />
            </YStack>
          ) : (
            <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
              {t('insufficientBody')}
            </Text>
          )}
          {/* Không có trong Figma - giữ để không mất ngưỡng "sắp đến hạn" của gian hàng. */}
          <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
            {t('dueSoonThreshold', { value: fmt.km(profile.dueSoonKm) })}
          </Text>
        </YStack>

        <TextField
          control={control}
          name="notes"
          label={t('notes')}
          placeholder={tApp('notesPlaceholder')}
          multiline scrollable
          rows={3}
          maxLength={2000}
          editable={canManage}
        />

        {/* Figma "Save Row": nút vàng co theo chữ, căn phải, icon Tick. */}
        {canManage ? (
          <XStack jc="flex-end">
            <Button
              label={tActions('saveChanges')}
              lineIcon="tick"
              variant="gradient"
              block={false}
              loading={save.isPending}
              disabled={!formState.isDirty}
              onPress={submit}
            />
          </XStack>
        ) : null}
      </YStack>
    </Card>
  );
}

/** Figma "Nhóm thông tin": thẻ đệm 16 (Card), các khối cách 12. */
const CARD_GAP = 12;
/** Figma "Lịch sử KM": nút viền bo 8. */
const HISTORY_CHIP_RADIUS = 8;
/** Figma "Milestone Progress": thanh cao 8. */
const MILESTONE_BAR = 8;

/**
 * Hàng tiêu đề "Nhóm thông tin" của tab Bảo dưỡng (Figma `23664:32461`): tiêu đề 16/24 đậm, mép phải
 * là một liên kết vàng 14/20 kèm icon nét 20 (Điều chỉnh · Thêm) hoặc một ghi chú xám (N lần hoàn tất).
 */
function CardHeader({
  title,
  action,
  note,
}: {
  title: string;
  action?: { label: string; icon: LineIconName; onPress: () => void };
  note?: string;
}) {
  const colors = useColors();
  return (
    <XStack ai="center" jc="space-between" gap={space.sm}>
      <Text f={1} minWidth={0} col={colors.text} fos={typeScale.title.fontSize} lh={typeScale.title.lineHeight} fow={fontWeight.semibold}>
        {title}
      </Text>
      {action ? (
        <Pressable
          onPress={action.onPress}
          hitSlop={space.sm}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
        >
          <XStack ai="center" gap={6}>
            <LineIcon name={action.icon} size={iconSize.lg} color={colors.brandLink} />
            <Text col={colors.brandLink} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.semibold}>
              {action.label}
            </Text>
          </XStack>
        </Pressable>
      ) : note ? (
        <Text col={colors.placeholder} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
          {note}
        </Text>
      ) : null}
    </XStack>
  );
}

function RecordsCard({
  title,
  records,
  loading,
  failed,
  onRetry,
  actionable,
  onOpenSheet,
}: {
  title: string;
  records: MaintenanceRecord[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  /** Nhóm SẮP TỚI mới có nút thêm và thao tác; lịch sử chỉ để đọc. */
  actionable: boolean;
  onOpenSheet: (state: RecordSheetMode) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Vehicles.maintenance.records');
  const tApp = useTranslations('Vehicles.maintenance.app');
  const tActions = useTranslations('Common.actions');
  const navigateOnce = useNavigateOnce();
  const { has } = usePermissions();
  const canManage = has(PERMISSION.VEHICLE_MAINTENANCE_MANAGE);
  const completedCount = records.filter((record) => record.status === MAINTENANCE_STATUS.COMPLETED).length;

  return (
    <Card lift="flat">
      <YStack gap={CARD_GAP}>
        {/*
          Figma `24612:146449`: "+ Thêm" ở mép phải hàng tiêu đề (nhóm sắp tới, cùng quyền nút cũ);
          nhóm lịch sử ghi "N lần hoàn tất" xám ở đó.
        */}
        <CardHeader
          title={title}
          {...(actionable && canManage
            ? { action: { label: tApp('add'), icon: 'add' as const, onPress: () => onOpenSheet({ mode: 'create' }) } }
            : {})}
          {...(!actionable && !loading && !failed && completedCount > 0
            ? { note: tApp('completedCount', { count: completedCount }) }
            : {})}
        />

        {loading ? (
          <SkeletonText lines={3} />
        ) : failed ? (
          /* Tải hỏng KHÔNG được đọc thành "chưa có phiếu nào" — hai câu trả lời khác hẳn nhau. */
          <YStack gap={space.sm}>
            <Callout tone="danger" title={t('loadError')} />
            <Button
              label={tActions('retry')}
              icon="refresh-outline"
              variant="outline"
              size="sm"
              onPress={onRetry}
            />
          </YStack>
        ) : records.length === 0 ? (
          <YStack gap={space.xs}>
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {actionable ? t('emptyUpcoming') : t('emptyHistory')}
            </Text>
            {actionable ? (
              <BlockLink
                label={t('boardLink')}
                onPress={() => navigateOnce(ROUTES.manage.maintenance())}
              />
            ) : null}
          </YStack>
        ) : (
          records.map((record, index) => (
            /* Kẻ NGĂN giữa hai phiếu — vai trò `List.Item` bên web. Không có nó thì phần thao
               tác của phiếu trên đọc như thuộc về phiếu dưới. */
            <YStack key={record.id} gap={space.sm}>
              {index > 0 ? <Divider /> : null}
              <RecordRow
                record={record}
                canManage={actionable && canManage}
                spread={!actionable}
                onOpenSheet={onOpenSheet}
              />
            </YStack>
          ))
        )}

      </YStack>
    </Card>
  );
}

/**
 * Một phiếu bảo dưỡng — cùng thứ tự đọc với `RecordRow` bên web: tiêu đề + trạng thái, rồi MỘT
 * dòng thông tin gộp (thời điểm · KM · nơi thực hiện · chi phí · số chứng từ), rồi ghi chú.
 *
 * `cost` VẮNG MẶT nghĩa là thiếu quyền xem tiền (server đã lược khỏi response), khác `null` là
 * chưa nhập. Cả hai đều không hiện gì — nhưng không trường hợp nào được dựng số 0.
 */
function RecordRow({
  record,
  canManage,
  spread,
  onOpenSheet,
}: {
  record: MaintenanceRecord;
  canManage: boolean;
  /** Nhóm lịch sử: "Chi phí" trái · "Odo" phải (Figma `24612:146681`); nhóm sắp tới xếp liền. */
  spread: boolean;
  onOpenSheet: (state: RecordSheetMode) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Vehicles.maintenance.records');
  const tApp = useTranslations('Vehicles.maintenance.app');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const { has } = usePermissions();
  const tMaintenance = useTranslations('Maintenance');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const transition = useTransitionMaintenanceRecord(record.vehicleId);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  /** Thùng rác của design = HUỶ lịch: phiếu ở lại lịch sử với nhãn "Đã huỷ" — như web. */
  function cancelSchedule() {
    transition.mutate(
      { action: 'cancel', recordId: record.id, expectedRowVersion: record.rowVersion },
      {
        onSuccess: () => {
          setConfirmingCancel(false);
          toast.showSuccess(tMaintenance('toast.canceled'));
        },
        onError: (error) => {
          setConfirmingCancel(false);
          toast.showError(
            getErrorCode(error) === API_ERROR_CODE.CONFLICT
              ? tMaintenance('toast.staleRecord')
              : errorMessage(error),
          );
        },
      },
    );
  }

  const status = record.status as MaintenanceStatus;
  const meta = MAINTENANCE_STATUS_META[status];

  const when = record.completedAt
    ? fmt.date(record.completedAt)
    : // Một NGÀY dự kiến (ADR 0079) — phiếu cũ có mốc kết thúc vẫn chỉ hiện ngày bắt đầu, như web.
      record.plannedStartAt
      ? fmt.date(record.plannedStartAt)
      : null;

  const detail = [
    record.cost != null ? tApp('cost', { value: fmt.money(record.cost) }) : null,
    record.odometerKm != null ? tApp('odo', { value: fmt.km(record.odometerKm) }) : null,
    record.providerName,
    has(PERMISSION.VEHICLE_MAINTENANCE_FILE_VIEW) && record.attachmentCount > 0
      ? t('attachmentCount', { count: record.attachmentCount })
      : null,
  ].filter((part): part is string => Boolean(part));

  return (
    <YStack gap={space.sm}>
      {/* Figma "Title & Badge": tiêu đề 14/20 đậm + viên trạng thái (bo tròn, chữ 14). */}
      <XStack ai="center" jc="space-between" gap={space.sm}>
        <Text f={1} col={colors.text} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.semibold}>
          {record.title || domainLabel('maintenanceType', record.type)}
        </Text>
        <Pill size="lg" label={domainLabel('maintenanceStatus', status, meta.label)} tone={pillToneOfStatusColor(meta.color)} />
      </XStack>

      {when ? (
        <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
          {when}
        </Text>
      ) : null}
      {/* Figma "Cost & Odo": "Chi phí: …" · "Odo: …" 12/18 đậm vừa; nơi thực hiện + chứng từ đi tiếp cùng hàng. */}
      {detail.length > 0 ? (
        <XStack flexWrap="wrap" columnGap={space.sm} rowGap={2} jc={spread ? 'space-between' : 'flex-start'}>
          {detail.map((part) => (
            <Text key={part} col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} fow={fontWeight.medium}>
              {part}
            </Text>
          ))}
        </XStack>
      ) : null}
      {record.notes ? (
        <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
          {record.notes}
        </Text>
      ) : null}

      {canManage ? (
        /*
          Figma "Actions": "Chỉnh sửa" (viền xám) trái · "Hoàn tất" (viền vàng nhạt, chữ vàng) phải,
          chia đều. Cùng hai thao tác như web; `Bắt đầu`/`Huỷ phiếu` vẫn thuộc màn Lịch (04/09/2026).
        */
        <XStack gap={space.sm}>
          <YStack f={1} flexBasis={0}>
            <Button
              label={t('edit')}
              lineIcon="edit"
              variant="neutral"
              onPress={() => onOpenSheet({ mode: 'edit', record })}
            />
          </YStack>
          <YStack f={1} flexBasis={0}>
            <Button
              label={t('complete')}
              lineIcon="tick"
              variant="brandOutline"
              onPress={() => onOpenSheet({ mode: 'complete', record })}
            />
          </YStack>
        </XStack>
      ) : null}
      {canManage ? (
        <Button
          label={tMaintenance('actions.cancelSchedule')}
          icon="trash-outline"
          variant="ghostDanger"
          size="sm"
          onPress={() => setConfirmingCancel(true)}
        />
      ) : null}
      <AlertDialog
        open={confirmingCancel}
        title={tMaintenance('actions.cancelSchedule')}
        message={tMaintenance('actions.cancelScheduleConfirm')}
        confirmLabel={tMaintenance('actions.cancelSchedule')}
        destructive
        loading={transition.isPending}
        onCancel={() => setConfirmingCancel(false)}
        onConfirm={cancelSchedule}
      />
    </YStack>
  );
}
