import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  MAINTENANCE_DUE_STATUS,
  MAINTENANCE_DUE_STATUS_META,
  MAINTENANCE_STATUS,
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
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { OdometerCorrectionSheet } from './components/OdometerCorrectionSheet';
import { Button } from '@/components/ui/Button';
import { BlockLink, BlockTitle } from '@/components/ui/BlockTitle';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { Divider } from '@/components/ui/DataRow';
import { NumberField } from '@/components/ui/NumberField';
import { Pagination } from '@/components/ui/Pagination';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SkeletonText } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TextField } from '@/components/ui/TextField';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { VehicleEditTabs } from '@/features/vehicles/components/VehicleEditTabs';
import { DateField } from '@/features/vehicles/components/DateField';
import { useVehicle } from '@/features/vehicles/hooks/use-vehicle';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB } from '@/navigation/vehicle-edit-tab';
import { FIRST_PAGE } from '@/queries/use-clamped-page';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import {
  useMaintenanceProfile,
  useMaintenanceRecords,
  useOdometerHistory,
  useSaveMaintenanceProfile,
} from './hooks/use-maintenance';
import {
  MaintenanceRecordSheet,
  type RecordSheetMode,
} from './components/MaintenanceRecordSheet';
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
  const t = useTranslations('Vehicles.maintenance');
  const tEdit = useTranslations('Vehicles.edit');
  const router = useRouter();
  const { has, isLoading: permissionsLoading } = usePermissions();

  const canView = has(PERMISSION.VEHICLE_MAINTENANCE_VIEW);
  const canManage = has(PERMISSION.VEHICLE_MAINTENANCE_MANAGE);
  const back = () => goBackOr(router, ROUTES.manage.vehicleEdit(vehicleId));
  const title = tEdit('tabs.maintenance');

  const vehicle = useVehicle(vehicleId, has(PERMISSION.VEHICLE_VIEW));
  const profile = useMaintenanceProfile(vehicleId, canView);
  const records = useMaintenanceRecords(vehicleId, canView);

  const [sheet, setSheet] = useState<RecordSheetMode | null>(null);

  if (!permissionsLoading && !canView) {
    return (
      <>
        <AppHeader title={title} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={title}
            description={t('noPermission')}
          />
        </Screen>
      </>
    );
  }

  if (profile.isPending) {
    return (
      <>
        <AppHeader title={title} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']}>
          <SkeletonText lines={10} />
        </Screen>
      </>
    );
  }

  if (profile.isError) {
    return (
      <>
        <AppHeader title={title} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenError
            error={profile.error}
            title={t('loadError')}
            onRetry={() => void profile.refetch()}
          />
        </Screen>
      </>
    );
  }

  const upcoming = (records.data ?? []).filter(
    (record) =>
      record.status === MAINTENANCE_STATUS.SCHEDULED ||
      record.status === MAINTENANCE_STATUS.IN_PROGRESS,
  );
  const history = (records.data ?? []).filter(
    (record) =>
      record.status !== MAINTENANCE_STATUS.SCHEDULED &&
      record.status !== MAINTENANCE_STATUS.IN_PROGRESS,
  );

  return (
    <>
      <AppHeader
        title={title}
        {...(vehicle.data
          ? {
              subtitle: [vehicle.data.name, vehicle.data.plateNumber]
                .filter(Boolean)
                .join(LIST_SEPARATOR),
            }
          : {})}
        onBack={back}
      />
      <VehicleEditTabs vehicleId={vehicleId} active={VEHICLE_EDIT_TAB.MAINTENANCE} />
      <Screen
        edges={['left', 'right', 'bottom']}
        refreshing={profile.isRefetching}
        onRefresh={() => {
          void profile.refetch();
          void records.refetch();
        }}
      >
        <YStack gap={layout.section}>
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
      </Screen>

      {sheet ? (
        <MaintenanceRecordSheet
          vehicleId={vehicleId}
          state={sheet}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </>
  );
}

function OdometerCard({ vehicleId, profile }: { vehicleId: string; profile: MaintenanceProfile }) {
  const t = useTranslations('Vehicles.maintenance.odometer');
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
    <Card>
      <YStack gap={space.sm}>
        <BlockTitle>{t('title')}</BlockTitle>

        {/*
          Số lớn bên trái, liên kết lịch sử bên phải — đúng `odometerRow` bên web. Liên kết đứng
          cùng hàng với CON SỐ chứ không nhét vào hàng tiêu đề: tiêu đề khối này đã dài
          ("CHỈ SỐ KILOMETER HIỆN TẠI (ODO)") nên thêm gì vào đó cũng vỡ ở màn 375pt.
        */}
        <XStack ai="center" jc="space-between" gap={space.sm}>
          {/* Chưa có số thì nói "chưa có" — KHÔNG dựng "0 km". */}
          <Text flexShrink={1} col={colors.text} fos={fontSize.h3} fow={fontWeight.bold}>
            {currentKm == null ? tLabels('notAvailable') : fmt.km(currentKm)}
          </Text>
          <BlockLink label={t('history')} onPress={() => setHistoryOpen(true)} />
        </XStack>

        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {meta}
        </Text>

        {currentKm == null ? (
          <Callout tone="warning" title={t('noDataTitle')}>
            {t('noDataBody')}
          </Callout>
        ) : null}

        {has(PERMISSION.VEHICLE_ODOMETER_CORRECT) ? (
          <Button
            label={t('correct')}
            variant="secondary"
            size="sm"
            onPress={() => setCorrecting(true)}
          />
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

      <BottomSheet open={historyOpen} onClose={() => setHistoryOpen(false)} title={t('historyTitle')}>
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
                    <StatusBadge
                      label={t('historyDecrease')}
                      color={STATUS_COLOR.DANGER}
                      size="sm"
                    />
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
  const t = useTranslations('Vehicles.maintenance.oil');
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
    <Card>
      <YStack gap={space.sm}>
        <BlockTitle>{t('title')}</BlockTitle>

        {/*
          Nhãn hạn đứng RIÊNG một hàng, không nhét vào hàng tiêu đề như `extra` bên web: tiêu đề
          viết hoa ở đây dài gần trọn bề ngang, mà nhãn dài nhất ("Chưa đủ dữ liệu") lại là nhãn
          hay gặp nhất khi xe mới nhập.
        */}
        <StatusBadge
          label={domainLabel(
            'maintenanceDueStatus',
            dueStatus,
            MAINTENANCE_DUE_STATUS_META[dueStatus].label,
          )}
          color={MAINTENANCE_DUE_STATUS_META[dueStatus].color}
          size="sm"
        />

        <NumberField
          control={control}
          name="oilChangeIntervalKm"
          label={t('intervalKm')}
          placeholder={fmt.kmNumber(INTERVAL_PLACEHOLDER_KM)}
          suffix="km"
          min={1}
          integer
          editable={canManage}
        />
        <NumberField
          control={control}
          name="lastServiceKm"
          label={t('lastServiceKm')}
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

        {/*
          Khối mốc bảo dưỡng — `scheduleBlock` bên web dựng lại cho bề ngang hẹp.
          KHÔNG dùng `DataRow` ở đây: nhãn "Mốc bảo dưỡng tiếp theo" dài gấp đôi giá trị
          "50.000 km", mà `DataRow` chia cột 3:7 nên nhãn rơi xuống ba dòng còn cột phải bỏ
          trống. Nhãn xuống dòng RIÊNG, giá trị đứng dưới, "còn bao nhiêu" nằm bên phải.
        */}
        <YStack gap={space.xs} pt={space.xs}>
          <XStack ai="flex-end" jc="space-between" gap={space.sm}>
            <YStack flexShrink={1} gap={2}>
              <Text col={colors.textMuted} fos={fontSize.label}>
                {t('nextDueKm')}
              </Text>
              <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold}>
                {profile.nextMaintenanceKm == null
                  ? tLabels('insufficientData')
                  : fmt.km(profile.nextMaintenanceKm)}
              </Text>
            </YStack>
            <Text
              flexShrink={1}
              col={overdue ? colors.danger : colors.textMuted}
              fos={fontSize.bodySm}
              fow={fontWeight.medium}
              ta="right"
            >
              {fmt.remainingKm(profile.remainingKm)}
            </Text>
          </XStack>

          {hasSchedule ? (
            <ProgressBar
              percent={profile.usedPercent as number}
              tone={overdue ? 'exception' : 'active'}
              label={t('usedOfInterval', {
                used: fmt.kmNumber(profile.usedKm ?? 0),
                total: fmt.km(profile.oilChangeIntervalKm),
              })}
            />
          ) : (
            <Callout tone="info" title={tLabels('insufficientData')}>
              {t('insufficientBody')}
            </Callout>
          )}

          <Text col={colors.placeholder} fos={fontSize.label}>
            {t('dueSoonThreshold', { value: fmt.km(profile.dueSoonKm) })}
          </Text>
        </YStack>

        <TextField
          control={control}
          name="notes"
          label={t('notes')}
          multiline
          rows={3}
          maxLength={2000}
          editable={canManage}
        />

        {canManage ? (
          <Button
            label={tActions('saveChanges')}
            loading={save.isPending}
            disabled={!formState.isDirty}
            onPress={submit}
          />
        ) : null}
      </YStack>
    </Card>
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
  const t = useTranslations('Vehicles.maintenance.records');
  const tActions = useTranslations('Common.actions');
  const navigateOnce = useNavigateOnce();
  const { has } = usePermissions();
  const canManage = has(PERMISSION.VEHICLE_MAINTENANCE_MANAGE);

  return (
    <Card>
      <YStack gap={space.sm}>
        {/*
          "Thêm bảo dưỡng" nằm CUỐI thẻ, không phải ở hàng tiêu đề như `extra` bên web: tiêu đề
          viết hoa ("LỊCH BẢO DƯỠNG SẮP TỚI") đã ăn gần trọn bề ngang thẻ ở màn 375pt, nên nhãn
          nút bị đẩy xuống dòng và hàng tiêu đề cao gấp đôi hàng của ba thẻ còn lại. Đặt dưới
          cùng cũng cho nó vùng chạm 44pt thật, thay vì một liên kết chữ nhỏ.
        */}
        <BlockTitle>{title}</BlockTitle>

        {loading ? (
          <SkeletonText lines={3} />
        ) : failed ? (
          /* Tải hỏng KHÔNG được đọc thành "chưa có phiếu nào" — hai câu trả lời khác hẳn nhau. */
          <YStack gap={space.sm}>
            <Callout tone="danger" title={t('loadError')} />
            <Button label={tActions('retry')} variant="secondary" size="sm" onPress={onRetry} />
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
                onOpenSheet={onOpenSheet}
              />
            </YStack>
          ))
        )}

        {actionable && canManage ? (
          <Button
            label={t('add')}
            variant="secondary"
            size="sm"
            onPress={() => onOpenSheet({ mode: 'create' })}
          />
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
  onOpenSheet,
}: {
  record: MaintenanceRecord;
  canManage: boolean;
  onOpenSheet: (state: RecordSheetMode) => void;
}) {
  const t = useTranslations('Vehicles.maintenance.records');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const { has } = usePermissions();

  const status = record.status as MaintenanceStatus;
  const meta = MAINTENANCE_STATUS_META[status];

  const when = record.completedAt
    ? fmt.date(record.completedAt)
    : record.plannedStartAt && record.plannedEndAt
      ? fmt.shortDateTimeRange(record.plannedStartAt, record.plannedEndAt)
      : record.plannedStartAt
        ? fmt.dateTime(record.plannedStartAt)
        : null;

  const line = [
    when,
    record.odometerKm != null ? fmt.km(record.odometerKm) : null,
    record.providerName,
    record.cost != null ? fmt.money(record.cost) : null,
    has(PERMISSION.VEHICLE_MAINTENANCE_FILE_VIEW) && record.attachmentCount > 0
      ? t('attachmentCount', { count: record.attachmentCount })
      : null,
  ]
    .filter(Boolean)
    .join(LIST_SEPARATOR);

  return (
    <YStack gap={space.xs}>
      <XStack ai="center" jc="space-between" gap={space.sm}>
        <Text f={1} col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
          {record.title || domainLabel('maintenanceType', record.type)}
        </Text>
        <StatusBadge
          label={domainLabel('maintenanceStatus', status, meta.label)}
          color={meta.color}
          size="sm"
        />
      </XStack>

      {line ? (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {line}
        </Text>
      ) : null}
      {record.notes ? (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {record.notes}
        </Text>
      ) : null}

      {canManage ? (
        /*
          ĐÚNG hai nút của `RecordRow` bên web, cùng thứ bậc: "Hoàn tất" là hành động chính
          (`type="primary"`), "Chỉnh sửa" là phụ.

          `Bắt đầu` và `Huỷ phiếu` KHÔNG nằm ở đây — bên web chúng thuộc tấm `MaintenanceEventDialog`
          mở từ màn Lịch, không thuộc tab hồ sơ xe. App chưa có màn Lịch, nên tới khi có thì hai
          thao tác đó chỉ làm được trên web (quyết định của người dùng 04/09/2026).
        */
        <XStack gap={space.xs} jc="space-between">
          <YStack w="48%">
            <Button
              label={t('complete')}
              size="sm"
              onPress={() => onOpenSheet({ mode: 'complete', record })}
            />
          </YStack>
          <YStack w="48%">
            <Button
              label={t('edit')}
              variant="secondary"
              size="sm"
              onPress={() => onOpenSheet({ mode: 'edit', record })}
            />
          </YStack>
        </XStack>
      ) : null}
    </YStack>
  );
}
