import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MAIN_GRADIENT } from '@/components/ui/Button';
import { LineIcon, type LineIconName } from '@/components/icons/LineIcon';
import { useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  API_ERROR_CODE,
  MAINTENANCE_STATUS,
  MAINTENANCE_STATUS_HOLDING_SCHEDULE,
  MAINTENANCE_STATUS_META,
  PERMISSION,
  STATUS_COLOR,
  type MaintenanceStatus,
} from '@xeprime/types';
import {
  maintenanceProfileFormSchema,
  type MaintenanceProfileFormValues,
} from '@xeprime/validators';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { VehicleEditHeader } from '@/features/vehicles/components/VehicleEditHeader';
import { VEHICLE_EDIT_TAB } from '@/navigation/vehicle-edit-tab';
import { Screen } from '@/components/layout/Screen';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { OdometerCorrectionSheet } from './components/OdometerCorrectionSheet';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { Divider } from '@/components/ui/DataRow';
import { NumberField } from '@/components/ui/NumberField';
import { Pagination } from '@/components/ui/Pagination';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SkeletonText } from '@/components/ui/Skeleton';
import { Pill, pillToneOfStatusColor, usePillSkin, type PillTone } from '@/components/ui/Pill';
import { TextField } from '@/components/ui/TextField';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { DateField } from '@/components/ui/DateField';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { getErrorCode } from '@/lib/api-client';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
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

  // Cùng query key với `VehicleMaintenanceWorkspace` — chỉ để kéo-làm-mới, không gọi thêm request.
  const profile = useMaintenanceProfile(vehicleId, canView);
  const records = useMaintenanceRecords(vehicleId, canView);
  // Figma: thẻ thay nhớt KHÔNG có nút Lưu riêng - chân "Hoàn tác / Lưu thay đổi" ghim đáy như mọi tab.
  const [saveBar, setSaveBar] = useState<ReactNode>(null);

  return (
    <>
      <VehicleEditHeader
        vehicleId={vehicleId}
        tab={VEHICLE_EDIT_TAB.MAINTENANCE}
        title={tEdit('title')}
        onBack={back}
      />
      <Screen scrollReveal={false} motion={false}
        edges={['left', 'right', 'bottom']}
        {...(saveBar ? { footer: saveBar } : {})}
        refreshing={profile.isRefetching}
        onRefresh={() => {
          void profile.refetch();
          void records.refetch();
        }}
      >
        <YStack gap={layout.section}>
          <VehicleMaintenanceWorkspace vehicleId={vehicleId} onSaveBar={setSaveBar} />
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
export function VehicleMaintenanceWorkspace({
  vehicleId,
  onSaveBar,
}: {
  vehicleId: string;
  /**
   * Màn sửa xe truyền vào để nhận chân "Hoàn tác / Lưu thay đổi" (Figma). Nơi nhúng khác (hồ sơ
   * 360) không truyền ⇒ thẻ thay nhớt giữ nút Lưu trong thẻ.
   */
  onSaveBar?: (bar: ReactNode) => void;
}) {
  const t = useTranslations('Vehicles.maintenance');
  const tApp = useTranslations('Vehicles.maintenance.app');
  const tEdit = useTranslations('Vehicles.edit');
  const colors = useColors();
  const { has, isLoading: permissionsLoading } = usePermissions();

  const canView = has(PERMISSION.VEHICLE_MAINTENANCE_VIEW);
  const canManage = has(PERMISSION.VEHICLE_MAINTENANCE_MANAGE);

  const profile = useMaintenanceProfile(vehicleId, canView);
  const records = useMaintenanceRecords(vehicleId, canView);

  const [sheet, setSheet] = useState<RecordSheetMode | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

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
        <OilCard vehicleId={vehicleId} profile={profile.data} {...(onSaveBar ? { onSaveBar } : {})} />
        <RecordsCard
          title={t('records.upcoming')}
          records={upcoming}
          loading={records.isPending}
          failed={records.isError}
          onRetry={() => void records.refetch()}
          onOpenSheet={setSheet}
          onOpenHistory={() => setHistoryOpen(true)}
        />
      </YStack>

      {/* Figma không có thẻ lịch sử: lượt đã xong / đã huỷ nằm sau link "Lịch sử" (chốt 27/11/2026). */}
      <BottomSheet
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title={tApp('historyTitle')}
        chrome="v2"
        headerDivider
        scroll={false}
      >
        <ScrollView style={STYLES.fill} contentContainerStyle={STYLES.historyContent} showsVerticalScrollIndicator>
          {records.isPending ? (
            <SkeletonText lines={4} />
          ) : records.isError ? (
            <Callout tone="danger" title={t('records.loadError')} />
          ) : history.length === 0 ? (
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('records.emptyHistory')}
            </Text>
          ) : (
            <YStack gap={space.sm}>
              {history.map((record, index) => (
                <YStack key={record.id} gap={space.sm}>
                  {index > 0 ? <Divider /> : null}
                  <RecordRow record={record} canManage={false} spread onOpenSheet={setSheet} />
                </YStack>
              ))}
            </YStack>
          )}
        </ScrollView>
      </BottomSheet>

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


  return (
    <Card lift="flat">
      <YStack gap={CARD_GAP}>
        {/* Figma `24238:59369`: tiêu đề + link vàng "Lịch sử" (Document Align Right 17). */}
        <CardHeader
          title={tApp('odoTitle')}
          action={{
            label: tApp('history'),
            icon: 'document-align-right-17',
            onPress: () => setHistoryOpen(true),
          }}
        />

        {/* Figma "Document item": số km 16/24 + viên nguồn (xanh), "Cập nhật gần nhất: …" 14/20. */}
        <YStack gap={space.sm}>
          <XStack ai="center" gap={space.sm} flexWrap="wrap">
            {/* Chưa có số thì nói "chưa có" - KHÔNG dựng "0 km". */}
            <Text col={colors.text} fos={typeScale.title.fontSize} lh={typeScale.title.lineHeight} fow={fontWeight.medium}>
              {currentKm == null ? tLabels('notAvailable') : fmt.km(currentKm)}
            </Text>
            {profile.currentOdometerSource ? (
              <StatusChip
                label={domainLabel('odometerSource', profile.currentOdometerSource)}
                tone={pillToneOfStatusColor(STATUS_COLOR.INFO)}
              />
            ) : null}
          </XStack>
          {profile.currentOdometerAt ? (
            <Text col={colors.placeholder} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
              {tApp.rich('updatedLast', {
                value: [fmt.dateTime(profile.currentOdometerAt), profile.currentOdometerRefLabel]
                  .filter(Boolean)
                  .join(LIST_SEPARATOR),
                b: (chunks) => (
                  <Text col={colors.textMuted} fow={fontWeight.medium}>
                    {chunks}
                  </Text>
                ),
              })}
            </Text>
          ) : (
            <Text col={colors.placeholder} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
              {t('noReading')}
            </Text>
          )}
        </YStack>

        {/* "+ Thêm số km mới" = lối điều chỉnh KM hiện có (cùng tấm, cùng quyền). */}
        {has(PERMISSION.VEHICLE_ODOMETER_CORRECT) ? (
          <XStack>
            <TabButton
              label={tApp('addReading')}
              icon="add"
              tone="neutral"
              height={ROW_BUTTON_HEIGHT}
              onPress={() => setCorrecting(true)}
            />
          </XStack>
        ) : null}

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

      {/* Tấm CAO cố định (90% màn) + vùng cuộn riêng - danh sách KM dài vẫn cuộn được (góp ý 26/11/2026). */}
      <BottomSheet
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title={t('historyTitle')}
        chrome="v2"
        headerDivider
        scroll={false}
      >
        <ScrollView style={STYLES.fill} contentContainerStyle={STYLES.historyContent} showsVerticalScrollIndicator>
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
        </ScrollView>
      </BottomSheet>
    </Card>
  );
}

/** Gợi ý trong ô nhập — con số đi qua bộ định dạng nên ra `5.000` ở vi và `5,000` ở en. */
const INTERVAL_PLACEHOLDER_KM = 5000;
const LAST_SERVICE_PLACEHOLDER_KM = 40000;

function OilCard({
  vehicleId,
  profile,
  onSaveBar,
}: {
  vehicleId: string;
  profile: MaintenanceProfile;
  onSaveBar?: (bar: ReactNode) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Vehicles.maintenance.oil');
  const tApp = useTranslations('Vehicles.maintenance.app');
  const tActions = useTranslations('Common.actions');
  const tEdit = useTranslations('Vehicles.edit');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();
  const canManage = has(PERMISSION.VEHICLE_MAINTENANCE_MANAGE);

  const save = useSaveMaintenanceProfile(vehicleId);
  const resolver = useValidationResolver<MaintenanceProfileFormValues>(
    maintenanceProfileFormSchema,
    'Vehicles.maintenance.validation',
  );

  const { control, handleSubmit, formState, reset } = useForm<MaintenanceProfileFormValues>({
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

  // Chân "Hoàn tác / Lưu thay đổi" của màn (Figma) - đẩy lên mỗi khi trạng thái form đổi.
  const dirty = formState.isDirty;
  const saving = save.isPending;
  useEffect(() => {
    if (!onSaveBar) return;
    onSaveBar(
      canManage ? (
        <XStack gap={space.sm}>
          <YStack flexGrow={1} flexShrink={1} flexBasis="auto">
            <Button
              label={tEdit('revert')}
              variant="outline"
              disabled={!dirty || saving}
              onPress={() => reset()}
            />
          </YStack>
          <YStack flexGrow={1} flexShrink={1} flexBasis="auto">
            <Button
              variant="gradient"
              label={tActions('saveChanges')}
              lineIcon="tick"
              loading={saving}
              disabled={!dirty}
              onPress={submit}
            />
          </YStack>
        </XStack>
      ) : null,
    );
    // `submit` đọc form qua handleSubmit - đổi theo `dirty` là đủ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSaveBar, canManage, dirty, saving]);
  useEffect(() => () => onSaveBar?.(null), [onSaveBar]);

  /* Thiếu một trong ba (KM hiện tại · chu kỳ · KM lần gần nhất) thì không có mốc để vẽ. */
  const hasSchedule =
    profile.nextMaintenanceKm != null && profile.remainingKm != null && profile.usedPercent != null;

  return (
    <Card lift="flat">
      <YStack gap={CARD_GAP}>
        {/* Figma `24238:60181`: tiêu đề chỉ chữ; ba ô xếp dọc. */}
        <CardHeader title={tApp('oilTitle')} />
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
        <DateField
          control={control}
          name="lastServiceAt"
          label={t('lastServiceAt')}
          disabled={!canManage}
        />

        {/* Figma "Task Progress": "Tiếp theo: X km" trái · "đã đi / chu kỳ" phải, thanh xanh 8. */}
        <YStack gap={space.sm}>
          <XStack ai="center" jc="space-between" gap={space.sm}>
            <XStack flexShrink={1} ai="center" gap={space.sm}>
              <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
                {tApp('nextMilestone')}
              </Text>
              <Text col={colors.text} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.medium}>
                {profile.nextMaintenanceKm == null
                  ? tLabels('insufficientData')
                  : fmt.km(profile.nextMaintenanceKm)}
              </Text>
            </XStack>
            {hasSchedule ? (
              <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
                {`${fmt.kmNumber(profile.usedKm ?? 0)} / `}
                <Text col={colors.textMuted} fos={typeScale.body.fontSize} fow={fontWeight.medium}>
                  {fmt.kmNumber(profile.oilChangeIntervalKm as number)}
                </Text>
              </Text>
            ) : null}
          </XStack>
          {hasSchedule ? (
            <ProgressBar
              percent={profile.usedPercent as number}
              color={colors.infoStrong}
              trackColor={colors.infoSurface}
              label={undefined}
            />
          ) : (
            <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
              {t('insufficientBody')}
            </Text>
          )}
        </YStack>

        <TextField
          control={control}
          name="notes"
          // Figma không có nhãn - người dùng chốt 27/11/2026 thêm nhãn "Ghi chú kỹ thuật khi thay nhớt".
          label={t('notes')}
          placeholder={tApp('notesPlaceholder')}
          multiline scrollable
          rows={3}
          maxLength={2000}
          editable={canManage}
        />

        {/* Nơi nhúng không nhận chân Lưu (hồ sơ 360) ⇒ nút Lưu nằm trong thẻ như trước. */}
        {canManage && !onSaveBar ? (
          <XStack jc="flex-end">
            <TabButton
              label={tActions('saveChanges')}
              icon="tick"
              tone="primary"
              height={ROW_BUTTON_HEIGHT}
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
/** Figma "Milestone Progress": thanh cao 8. */
/** Figma "Actions" (Chỉnh sửa · Hoàn tất): đệm 8/14 + chữ 20 ⇒ cao 36. "Lưu thay đổi" dùng CHUNG khuôn này (người dùng chốt 26/11/2026). */
const ROW_BUTTON_HEIGHT = 36;

/**
 * Viên trạng thái phiếu - Figma "_Badge" `24612:146458`: đệm 2/8, chữ 14/20 đậm vừa, bo tròn, CAO 24
 * (viền nằm TRONG khung). `Pill size="lg"` cộng viền ra ngoài thành 26 - trông mập hơn Figma.
 */
function StatusChip({ label, tone }: { label: string; tone: PillTone }) {
  const skin = usePillSkin()[tone];
  return (
    <XStack h={24} px={8} ai="center" jc="center" br={radius.pill} bw={1} bc={skin.border} bg={skin.bg} flexShrink={0}>
      <Text col={skin.fg} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.medium} numberOfLines={1}>
        {label}
      </Text>
    </XStack>
  );
}

const STYLES = StyleSheet.create({
  fill: { flex: 1 },
  historyContent: { paddingBottom: 16 },
  pressed: { opacity: 0.7 },
});

/**
 * Nút của tab Bảo dưỡng, ĐÚNG số đo Figma (`24620:34623` / `24612:146442`): bo 12, icon nét 20 + khe 6
 * + chữ 14/20 đậm; viền 1. `Button` dùng chung cao 40/44 và chữ 16 nên lệch - dựng riêng ở đây.
 * Tông: `primary` dải vàng · `brand` vàng nhạt viền vàng · `neutral` trắng viền xám · `danger` viền đỏ.
 */
function TabButton({
  label,
  icon,
  tone,
  height,
  iconOnly = false,
  loading = false,
  disabled = false,
  onPress,
}: {
  label: string;
  icon: LineIconName;
  tone: 'primary' | 'brand' | 'neutral' | 'danger';
  height: number;
  iconOnly?: boolean;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const blocked = disabled || loading;
  const skin = {
    primary: { bg: 'transparent', bc: 'transparent', fg: colors.text },
    brand: { bg: colors.brandWash, bc: colors.brandBorderStrong, fg: colors.brandLink },
    neutral: { bg: colors.surface, bc: colors.borderInput, fg: colors.textMuted },
    danger: { bg: colors.surface, bc: colors.dangerBorder, fg: colors.danger },
  }[tone];
  const gradient = tone === 'primary' && !blocked;
  const fg = blocked && tone === 'primary' ? colors.brandHigh : skin.fg;
  return (
    <Pressable
      onPress={onPress}
      disabled={blocked}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: blocked, busy: loading }}
      style={({ pressed }) => (pressed ? STYLES.pressed : null)}
    >
      <XStack
        h={height}
        {...(iconOnly ? { w: height } : { px: 14 })}
        ai="center"
        jc="center"
        gap={6}
        br={radius.control}
        ov="hidden"
        bw={gradient ? 0 : 1}
        bc={blocked && tone === 'primary' ? colors.brandBorder : skin.bc}
        bg={blocked && tone === 'primary' ? colors.brandLow : skin.bg}
      >
        {gradient ? (
          <LinearGradient
            colors={MAIN_GRADIENT.colors}
            locations={MAIN_GRADIENT.locations}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        {loading ? (
          <ActivityIndicator size="small" color={fg} />
        ) : (
          <>
            <LineIcon name={icon} size={iconSize.lg} color={fg} />
            {iconOnly ? null : (
              <Text col={fg} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.semibold} numberOfLines={1}>
                {label}
              </Text>
            )}
          </>
        )}
      </XStack>
    </Pressable>
  );
}

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
  onOpenSheet,
  onOpenHistory,
}: {
  title: string;
  records: MaintenanceRecord[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onOpenSheet: (state: RecordSheetMode) => void;
  onOpenHistory: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Vehicles.maintenance.records');
  const tApp = useTranslations('Vehicles.maintenance.app');
  const tActions = useTranslations('Common.actions');
  const { has } = usePermissions();
  const canManage = has(PERMISSION.VEHICLE_MAINTENANCE_MANAGE);

  return (
    <Card lift="flat">
      <YStack gap={CARD_GAP}>
        {/* Figma `24238:60372`: tiêu đề + link vàng "Lịch sử" (lượt đã xong / huỷ). */}
        <CardHeader
          title={title}
          action={{ label: tApp('history'), icon: 'document-align-right-17', onPress: onOpenHistory }}
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
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('emptyUpcoming')}
          </Text>
        ) : (
          records.map((record) => (
            <UpcomingRecordItem
              key={record.id}
              record={record}
              canManage={canManage}
              onOpenSheet={onOpenSheet}
            />
          ))
        )}

        {/* Figma: nút viền "+ Thêm lịch bảo dưỡng" cuối thẻ; bỏ link Trung tâm bảo dưỡng trên app Partner (chốt 27/11/2026). */}
        {canManage ? (
          <XStack>
            <TabButton
              label={tApp('addSchedule')}
              icon="add"
              tone="neutral"
              height={ROW_BUTTON_HEIGHT}
              onPress={() => onOpenSheet({ mode: 'create' })}
            />
          </XStack>
        ) : null}

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
    // Figma chỉ có "Chi phí" · "Odo" - garage, chứng từ, ghi chú xem trong tấm Chỉnh sửa (người dùng chốt 26/11/2026).
  ].filter((part): part is string => Boolean(part));

  return (
    <YStack gap={space.sm}>
      {/* Figma "Title & Badge": tiêu đề 14/20 đậm + viên trạng thái (bo tròn, chữ 14). */}
      <XStack ai="center" jc="space-between" gap={space.sm}>
        <Text f={1} col={colors.text} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.semibold}>
          {record.title || domainLabel('maintenanceType', record.type)}
        </Text>
        <StatusChip label={domainLabel('maintenanceStatus', status, meta.label)} tone={pillToneOfStatusColor(meta.color)} />
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
      {canManage ? (
        /*
          Figma "Actions": "Chỉnh sửa" (viền xám) trái · "Hoàn tất" (viền vàng nhạt, chữ vàng) phải,
          chia đều. Cùng hai thao tác như web; `Bắt đầu`/`Huỷ phiếu` vẫn thuộc màn Lịch (04/09/2026).
        */
        <XStack gap={space.sm}>
          {/* "Huỷ lịch" (không có trong Figma) gọn thành nút vuông thùng rác đứng đầu hàng - hết vỡ hàng riêng. */}
          <TabButton
            label={tMaintenance('actions.cancelSchedule')}
            icon="trash"
            tone="danger"
            iconOnly
            height={ROW_BUTTON_HEIGHT}
            onPress={() => setConfirmingCancel(true)}
          />
          <YStack f={1} flexBasis={0}>
            <TabButton
              label={t('edit')}
              icon="edit"
              tone="neutral"
              height={ROW_BUTTON_HEIGHT}
              onPress={() => onOpenSheet({ mode: 'edit', record })}
            />
          </YStack>
          <YStack f={1} flexBasis={0}>
            <TabButton
              label={t('complete')}
              icon="tick"
              tone="brand"
              height={ROW_BUTTON_HEIGHT}
              onPress={() => onOpenSheet({ mode: 'complete', record })}
            />
          </YStack>
        </XStack>
      ) : null}
      <AlertDialog
        open={confirmingCancel}
        title={tMaintenance('actions.cancelSchedule')}
        message={tMaintenance('actions.cancelScheduleConfirm')}
        confirmLabel={tMaintenance('actions.cancelSchedule')}
        destructive
        // Một nút "Hủy lịch", đóng bằng ✕ ở góc (người dùng chốt 26/11/2026).
        dismissIcon
        loading={transition.isPending}
        onCancel={() => setConfirmingCancel(false)}
        onConfirm={cancelSchedule}
      />
    </YStack>
  );
}

/**
 * Một lịch bảo dưỡng SẮP TỚI - Figma "Document item" `24238:60392`: thẻ viền bo 12 đệm 12; tên 14/20;
 * Xoá (= huỷ lịch, như web) + Sửa góc phải; "Thời gian dự kiến"; Odo · Chi phí · Mã phiếu chi; Ghi chú.
 * "Hoàn tất" là icon Tick Circle cạnh Sửa/Xoá - thứ tự Hoàn tất · Sửa · Xoá (Figma không vẽ - người dùng chốt 27/11/2026).
 */
function UpcomingRecordItem({
  record,
  canManage,
  onOpenSheet,
}: {
  record: MaintenanceRecord;
  canManage: boolean;
  onOpenSheet: (state: RecordSheetMode) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Vehicles.maintenance.records');
  const tApp = useTranslations('Vehicles.maintenance.app');
  const tCommon = useTranslations('Common');
  const tMaintenance = useTranslations('Maintenance');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const transition = useTransitionMaintenanceRecord(record.vehicleId);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const empty = tCommon('labels.emptyValue');

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

  const planned = record.plannedStartAt
    ? [fmt.dateTime(record.plannedStartAt), record.plannedEndAt ? fmt.dateTime(record.plannedEndAt) : null]
        .filter(Boolean)
        .join(' - ')
    : empty;
  const label = (text: string) => (
    <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
      {text}
    </Text>
  );
  const value = (text: string) => (
    <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.medium}>
      {text}
    </Text>
  );

  return (
    <YStack p={CARD_GAP} gap={CARD_GAP} br={radius.control} bw={1} bc={colors.border} bg={colors.surface}>
      <XStack ai="flex-start" gap={CARD_GAP}>
        <Text f={1} minWidth={0} col={colors.text} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.medium}>
          {record.title || domainLabel('maintenanceType', record.type)}
        </Text>
        {canManage ? (
          <XStack gap={CARD_GAP} ai="center">
            {/* "Hoàn tất" = icon Tick Circle đứng đầu cụm thao tác (người dùng chốt 27/11/2026, thay nút to cuối thẻ). */}
            <Pressable
              onPress={() => onOpenSheet({ mode: 'complete', record })}
              hitSlop={space.sm}
              accessibilityRole="button"
              accessibilityLabel={t('complete')}
            >
              <LineIcon name="tick-circle" color={colors.success} />
            </Pressable>
            <Pressable
              onPress={() => onOpenSheet({ mode: 'edit', record })}
              hitSlop={space.sm}
              accessibilityRole="button"
              accessibilityLabel={t('edit')}
            >
              <LineIcon name="edit" color={colors.placeholder} />
            </Pressable>
            <Pressable
              onPress={() => setConfirmingCancel(true)}
              hitSlop={space.sm}
              accessibilityRole="button"
              accessibilityLabel={tMaintenance('actions.cancelSchedule')}
            >
              <LineIcon name="delete-2" size={iconSize.lg} color={colors.danger} />
            </Pressable>
          </XStack>
        ) : null}
      </XStack>

      <YStack gap={space.sm}>
        <YStack gap={space.xs}>
          {label(tApp('plannedTime'))}
          {value(planned)}
        </YStack>
        <XStack jc="space-between" gap={space.sm}>
          <YStack gap={space.xs}>
            {label(tApp('odoLabel'))}
            {value(record.odometerKm != null ? fmt.kmNumber(record.odometerKm) : empty)}
          </YStack>
          {/* `cost` VẮNG = thiếu quyền xem tiền ⇒ ẩn hẳn cột, không dựng "0 đ". */}
          {record.cost !== undefined ? (
            <YStack gap={space.xs}>
              {label(tApp('costLabel'))}
              {value(record.cost != null ? fmt.money(record.cost) : empty)}
            </YStack>
          ) : null}
          <YStack gap={space.xs}>
            {label(tApp('receiptLabel'))}
            {value(record.receiptCode || empty)}
          </YStack>
        </XStack>
      </YStack>

      <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
        {tApp.rich('notesLabel', {
          value: record.notes || empty,
          b: (chunks) => (
            <Text col={colors.textMuted} fos={typeScale.body.fontSize} fow={fontWeight.medium}>
              {chunks}
            </Text>
          ),
        })}
      </Text>


      <AlertDialog
        open={confirmingCancel}
        title={tMaintenance('actions.cancelSchedule')}
        message={tMaintenance('actions.cancelScheduleConfirm')}
        confirmLabel={tMaintenance('actions.cancelSchedule')}
        destructive
        dismissIcon
        loading={transition.isPending}
        onCancel={() => setConfirmingCancel(false)}
        onConfirm={cancelSchedule}
      />
    </YStack>
  );
}
