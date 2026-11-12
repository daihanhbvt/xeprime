'use client';

import {
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  HistoryOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { Alert, App, Button, Card, Col, Form, Progress, Row, Skeleton, Tooltip } from 'antd';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  MAINTENANCE_DUE_STATUS, MAINTENANCE_DUE_STATUS_META, MAINTENANCE_STATUS, MAINTENANCE_STATUS_HOLDING_SCHEDULE, ODOMETER_SOURCE_LABEL, PERMISSION, type MaintenanceDueStatus, type OdometerSource, } from '@xeprime/types';
import {
  maintenanceProfileFormSchema, type MaintenanceProfileFormValues, } from '@xeprime/validators';
import { StatusTag } from '@/components/data-display/StatusTag';
import { PermissionState } from '@/components/feedback/PermissionState';
import { NumberField } from '@/components/form/NumberField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { DateTimeField } from '@/components/form/DateTimeField';
import { ROUTES } from '@/constants/routes';
import { useBranchReturnHref } from '@/features/branches/hooks/use-branch-return';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';
import { usePermissions } from '@/hooks/use-permissions';
import { getErrorCode } from '@/services/api-client';
import type { VehicleDetail } from '@/features/vehicles/types';
import { cancelMaintenanceRecord, saveMaintenanceProfile } from '../api';
import { useInvalidateMaintenance, useMaintenanceProfile, useMaintenanceRecords } from '../hooks';
import type { MaintenanceProfile, MaintenanceRecord } from '../types';
import { MaintenanceHistoryDialog } from './MaintenanceHistoryDialog';
import { MaintenanceRecordDialog } from './MaintenanceRecordDialog';
import { MaintenanceRecordItem } from './MaintenanceRecordItem';
import { OdometerCorrectionDialog } from './OdometerCorrectionDialog';
import { OdometerHistoryDialog } from './OdometerHistoryDialog';
import styles from './VehicleMaintenanceWorkspace.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { useTranslations } from 'next-intl';

/**
 * Tab "Bảo dưỡng & KM" của Vehicle 360 (Wave 6) — docs/design/12 §9.
 *
 * Quyền phản chiếu backend (guard mới là lớp thật):
 *  - thiếu `vehicles.maintenance.view` → màn không có quyền, KHÔNG gọi API;
 *  - `manage` → cấu hình chu kỳ, thêm/sửa/hoàn tất/hủy phiếu;
 *  - `odometer.correct` → điều chỉnh KM (bắt buộc lý do);
 *  - `maintenance.view_cost` → thấy chi phí (server đã lược khỏi response nếu thiếu quyền).
 *
 * Thiếu dữ liệu để tính mốc thì nói `Chưa đủ dữ liệu` — không bao giờ hiển thị 0 km giả.
 */
export function VehicleMaintenanceWorkspace({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations('Maintenance');
  const tCommon = useTranslations('Common');
  const permissions = usePermissions();
  const canView = permissions.has(PERMISSION.VEHICLE_MAINTENANCE_VIEW);
  const canManage = permissions.has(PERMISSION.VEHICLE_MAINTENANCE_MANAGE);
  const canCorrectOdometer = permissions.has(PERMISSION.VEHICLE_ODOMETER_CORRECT);
  const canDecreaseOdometer = permissions.has(PERMISSION.VEHICLE_ODOMETER_DECREASE);
  const canViewFiles = permissions.has(PERMISSION.VEHICLE_MAINTENANCE_FILE_VIEW);

  const profile = useMaintenanceProfile(vehicle.id, canView);
  const records = useMaintenanceRecords(vehicle.id, canView);

  if (!canView) {
    return (
      <PermissionState
        kind="forbidden"
        title={t('workspace.noPermission')}
        description={t('workspace.noPermissionHint')}
        missingPermissions={[PERMISSION.VEHICLE_MAINTENANCE_VIEW]}
      />
    );
  }

  if (profile.isLoading || records.isLoading) return <Skeleton active paragraph={{ rows: 10 }} />;

  if (profile.isError || !profile.data) {
    return (
      <Alert
        type="error"
        showIcon
        title={t('workspace.loadError')}
        description={
          <Button size="small" onClick={() => void profile.refetch()}>
            {tCommon('actions.retry')}
          </Button>
        }
      />
    );
  }

  return (
    <MaintenanceTab
      vehicle={vehicle}
      profile={profile.data}
      records={records.data ?? []}
      recordsFailed={records.isError}
      onRetryRecords={() => void records.refetch()}
      canManage={canManage}
      canCorrectOdometer={canCorrectOdometer}
      canDecreaseOdometer={canDecreaseOdometer}
      canViewFiles={canViewFiles}
    />
  );
}

function MaintenanceTab({
  vehicle,
  profile,
  records,
  recordsFailed,
  onRetryRecords,
  canManage,
  canCorrectOdometer,
  canDecreaseOdometer,
  canViewFiles,
}: {
  vehicle: VehicleDetail;
  profile: MaintenanceProfile;
  records: MaintenanceRecord[];
  recordsFailed: boolean;
  onRetryRecords: () => void;
  canManage: boolean;
  canCorrectOdometer: boolean;
  canDecreaseOdometer: boolean;
  canViewFiles: boolean;
}) {
  const tCommon = useTranslations('Common');
  const t = useTranslations('Maintenance');
  // Về bảng bảo dưỡng tổng vẫn giữ chi nhánh người dùng đang lọc (ADR 0052).
  const boardHref = useBranchReturnHref(ROUTES.MANAGE.MAINTENANCE);
  const errorMessage = useErrorMessage();
  const fmt = useAppFormat();

  const { message, modal } = App.useApp();
  const invalidate = useInvalidateMaintenance(vehicle.id);
  /*
   * Phiên hỗ trợ của nhân sự nền tảng (ADR 0050) chỉ tạo và sửa phiếu. Chu kỳ bảo dưỡng, hoàn tất
   * phiếu (ghi KM, dời mốc, sinh phiếu chi) và bảng bảo dưỡng toàn đội xe nằm ngoài Đợt 1 —
   * backend cũng chặn chúng. Sửa KM đã tự ẩn vì phiên không có quyền đó.
   */
  const scheduleHidden = useSupportHides(SUPPORT_HIDDEN_AREA.MAINTENANCE_SCHEDULE);
  const canEditCycle = canManage && !scheduleHidden;
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [recordHistoryOpen, setRecordHistoryOpen] = useState(false);
  const [recordDialog, setRecordDialog] = useState<
    { mode: 'create' } | { mode: 'edit' | 'complete'; record: MaintenanceRecord } | null
  >(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // Sắp tới: ngày gần nhất trước, phiếu chưa có ngày xuống cuối.
  const upcoming = useMemo(
    () =>
      records
        .filter((row) => (MAINTENANCE_STATUS_HOLDING_SCHEDULE as string[]).includes(row.status))
        .sort((a, b) =>
          (a.plannedStartAt ?? '￿').localeCompare(b.plannedStartAt ?? '￿'),
        ),
    [records],
  );
  // Lịch sử: mới nhất trước — phiếu huỷ không có `completedAt` nên xếp theo lần cập nhật.
  const history = useMemo(
    () =>
      records
        .filter((row) =>
          ([MAINTENANCE_STATUS.COMPLETED, MAINTENANCE_STATUS.CANCELED] as string[]).includes(
            row.status,
          ),
        )
        .sort((a, b) =>
          (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt),
        ),
    [records],
  );

  const defaults = useMemo<MaintenanceProfileFormValues>(
    () => ({
      oilChangeIntervalKm: profile.oilChangeIntervalKm ?? null,
      lastServiceKm: profile.lastServiceKm ?? null,
      lastServiceAt: profile.lastServiceAt ?? null,
      notes: profile.notes ?? '',
    }),
    [profile],
  );
  const resolver = useValidationResolver<MaintenanceProfileFormValues>(
    maintenanceProfileFormSchema,
    'Maintenance.validation',
  );
  const { control, handleSubmit, formState } = useForm<MaintenanceProfileFormValues>({
    resolver,
    defaultValues: defaults,
    values: defaults,
  });

  async function saveConfig(values: MaintenanceProfileFormValues) {
    setSavingProfile(true);
    try {
      await saveMaintenanceProfile(vehicle.id, {
        oilChangeIntervalKm: values.oilChangeIntervalKm,
        lastServiceKm: values.lastServiceKm,
        lastServiceAt: values.lastServiceAt || null,
        notes: values.notes?.trim() || null,
        expectedRowVersion: profile.rowVersion > 0 ? profile.rowVersion : undefined,
      });
      message.success(t('workspace.profileSaved'));
      invalidate();
    } catch (err) {
      if (getErrorCode(err) === 'CONFLICT') {
        message.error(t('workspace.profileStale'));
      } else {
        message.error(errorMessage(err));
      }
    } finally {
      setSavingProfile(false);
    }
  }

  /** Thùng rác của design = HUỶ lịch: phiếu ở lại trong lịch sử với nhãn "Đã huỷ" (sổ E22). */
  function confirmCancel(record: MaintenanceRecord) {
    modal.confirm({
      title: t('actions.cancelScheduleConfirm'),
      okText: t('actions.cancelSchedule'),
      okButtonProps: { danger: true },
      cancelText: tCommon('actions.close'),
      onOk: async () => {
        try {
          await cancelMaintenanceRecord(vehicle.id, record.id, record.rowVersion);
          message.success(t('toast.canceled'));
          invalidate();
        } catch (err) {
          message.error(
            getErrorCode(err) === 'CONFLICT' ? t('toast.staleRecord') : errorMessage(err),
          );
        }
      },
    });
  }

  const dueStatus = profile.dueStatus as MaintenanceDueStatus;
  const hasSchedule = profile.nextMaintenanceKm != null && profile.remainingKm != null;

  return (
    <div className={styles.stack}>
      {!canManage ? (
        <Alert
          type="info"
          showIcon
          title={t('workspace.readOnlyBanner')}
        />
      ) : null}

      {/* ── Chỉ số KM hiện tại ── */}
      <Card
        className={styles.card}
        title={t('workspace.odometerCard')}
        extra={
          canCorrectOdometer ? (
            <Button icon={<EditOutlined />} onClick={() => setCorrectionOpen(true)}>
              {t('workspace.adjustManually')}
            </Button>
          ) : null
        }
      >
        <div className={styles.odometerRow}>
          <div className={styles.odometerMain}>
            <p className={styles.odometerValue}>{fmt.km(profile.currentOdometerKm)}</p>
            <p className={styles.odometerMeta}>
              {profile.currentOdometerAt ? (
                <>
                  {t('workspace.updatedAt', { at: fmt.dateTime(profile.currentOdometerAt) })}
                  {profile.currentOdometerRefLabel ? ` · ${profile.currentOdometerRefLabel}` : ''}
                  {profile.currentOdometerSource
                    ? ` · ${ODOMETER_SOURCE_LABEL[profile.currentOdometerSource as OdometerSource] ?? profile.currentOdometerSource}`
                    : ''}
                </>
              ) : (
                t('workspace.noReading')
              )}
            </p>
          </div>
          <Button
            type="link"
            icon={<HistoryOutlined />}
            onClick={() => setHistoryOpen(true)}
            className={styles.historyLink}
          >
            {t('workspace.historyLink')}
          </Button>
        </div>
        {profile.currentOdometerKm == null ? (
          <Alert
            className={styles.inlineAlert}
            type="warning"
            showIcon
            title={t('workspace.noOdometer')}
            description={t('workspace.noOdometerHint')}
          />
        ) : null}
      </Card>

      {/* ── Chu kỳ thay nhớt ── */}
      <Card
        className={styles.card}
        title={t('workspace.oilCard')}
        extra={<StatusTag value={dueStatus} meta={MAINTENANCE_DUE_STATUS_META} group="maintenanceDueStatus" />}
      >
        <Form component={false} layout="vertical" colon={false} disabled={!canEditCycle}>
          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <NumberField
                control={control}
                name="oilChangeIntervalKm"
                label={t('workspace.oilInterval')}
                placeholder="5.000"
                addonAfter="km"
                min={1}
              />
            </Col>
            <Col xs={24} sm={8}>
              <NumberField
                control={control}
                name="lastServiceKm"
                label={t('workspace.lastServiceKm')}
                placeholder="40.000"
                addonAfter="km"
                min={0}
              />
            </Col>
            <Col xs={24} sm={8}>
              <DateTimeField
                control={control}
                name="lastServiceAt"
                label={t('workspace.lastServiceAt')}
                dateOnly
              />
            </Col>
          </Row>
        </Form>

        <div className={styles.scheduleBlock}>
          <div className={styles.scheduleHead}>
            <span>
              {t('workspace.nextMilestone')}{' '}
              <strong>
                {profile.nextMaintenanceKm != null
                  ? fmt.km(profile.nextMaintenanceKm)
                  : tCommon('labels.insufficientData')}
              </strong>
            </span>
            <span
              className={
                dueStatus === MAINTENANCE_DUE_STATUS.OVERDUE ? styles.overdueText : undefined
              }
            >
              {fmt.remainingKm(profile.remainingKm)}
            </span>
          </div>
          {hasSchedule && profile.usedPercent != null ? (
            <Progress
              percent={Math.min(100, Math.max(0, profile.usedPercent))}
              status={dueStatus === MAINTENANCE_DUE_STATUS.OVERDUE ? 'exception' : 'active'}
              format={() =>
                `${profile.usedKm?.toLocaleString('vi-VN') ?? 0} / ${profile.oilChangeIntervalKm?.toLocaleString('vi-VN') ?? 0} km`
              }
            />
          ) : (
            <Alert
              type="info"
              showIcon
              title={tCommon('labels.insufficientData')}
              description={t('workspace.nextDueHint')}
            />
          )}
          <p className={styles.thresholdNote}>
            {t('workspace.dueSoonThreshold', { value: fmt.km(profile.dueSoonKm) })}
          </p>
        </div>

        <Form component={false} layout="vertical" colon={false} disabled={!canEditCycle}>
          <TextAreaField
            control={control}
            name="notes"
            label={t('workspace.oilNotes')}
            rows={2}
            maxLength={2000}
          />
        </Form>

        {canEditCycle ? (
          <div className={styles.configActions}>
            <Button
              type="primary"
              loading={savingProfile}
              disabled={!formState.isDirty}
              onClick={() => void handleSubmit(saveConfig)()}
            >
              {tCommon('actions.saveChanges')}
            </Button>
          </div>
        ) : null}
      </Card>

      {/* ── Lịch sắp tới ── */}
      <Card
        className={styles.card}
        title={t('workspace.upcomingCard')}
        extra={
          <Button
            type="text"
            icon={<FileTextOutlined />}
            className={styles.cardLink}
            onClick={() => setRecordHistoryOpen(true)}
          >
            {t('workspace.recordHistoryLink')}
          </Button>
        }
      >
        {recordsFailed ? (
          <Alert
            type="error"
            showIcon
            title={t('workspace.recordsLoadError')}
            description={
              <Button size="small" onClick={onRetryRecords}>
                {tCommon('actions.retry')}
              </Button>
            }
          />
        ) : upcoming.length === 0 ? (
          <p className={styles.emptyText}>
            {t('workspace.upcomingEmpty')}
            {scheduleHidden ? null : (
              <>
                {' '}
                <Link href={boardHref}>{t('workspace.boardLink')}</Link>
              </>
            )}
          </p>
        ) : (
          <div className={styles.recordList}>
            {upcoming.map((record) => (
              <MaintenanceRecordItem
                key={record.id}
                record={record}
                showStatus={false}
                canViewFiles={canViewFiles}
                actions={
                  canManage ? (
                    <UpcomingActions
                      onComplete={
                        scheduleHidden
                          ? undefined
                          : () => setRecordDialog({ mode: 'complete', record })
                      }
                      onCancel={scheduleHidden ? undefined : () => confirmCancel(record)}
                      onEdit={() => setRecordDialog({ mode: 'edit', record })}
                    />
                  ) : null
                }
              />
            ))}
          </div>
        )}
        {canManage ? (
          <Button
            icon={<PlusOutlined />}
            className={styles.addRecord}
            onClick={() => setRecordDialog({ mode: 'create' })}
          >
            {t('workspace.addSchedule')}
          </Button>
        ) : null}
      </Card>

      <OdometerCorrectionDialog
        open={correctionOpen}
        vehicleId={vehicle.id}
        profile={profile}
        canDecrease={canDecreaseOdometer}
        onClose={() => setCorrectionOpen(false)}
        onSaved={() => {
          setCorrectionOpen(false);
          invalidate();
        }}
      />

      <OdometerHistoryDialog
        open={historyOpen}
        vehicleId={vehicle.id}
        onClose={() => setHistoryOpen(false)}
      />

      <MaintenanceHistoryDialog
        open={recordHistoryOpen}
        records={history}
        canViewFiles={canViewFiles}
        onClose={() => setRecordHistoryOpen(false)}
      />

      <MaintenanceRecordDialog
        state={recordDialog}
        vehicleId={vehicle.id}
        canViewFiles={canViewFiles}
        onClose={() => setRecordDialog(null)}
        onSaved={() => {
          setRecordDialog(null);
          invalidate();
        }}
      />
    </div>
  );
}

/**
 * Thao tác của một lịch sắp tới: thùng rác (huỷ) + bút (sửa) như design, và "Hoàn tất" — việc ghi
 * KM + dời mốc thay nhớt, không có chỗ trong design nhưng là tính năng phải giữ.
 * Phiên hỗ trợ (ADR 0050) không hoàn tất, không huỷ được — hai nút vắng mặt.
 */
function UpcomingActions({
  onComplete,
  onCancel,
  onEdit,
}: {
  onComplete?: () => void;
  onCancel?: () => void;
  onEdit: () => void;
}) {
  const t = useTranslations('Maintenance');
  const tCommon = useTranslations('Common');
  return (
    <>
      {onComplete ? (
        <Button size="small" type="link" className={styles.completeLink} onClick={onComplete}>
          {t('actions.complete')}
        </Button>
      ) : null}
      {onCancel ? (
        <Tooltip title={t('actions.cancelSchedule')}>
          <Button
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            aria-label={t('actions.cancelSchedule')}
            onClick={onCancel}
          />
        </Tooltip>
      ) : null}
      <Tooltip title={tCommon('actions.edit')}>
        <Button
          size="small"
          type="text"
          icon={<EditOutlined />}
          aria-label={tCommon('actions.edit')}
          onClick={onEdit}
        />
      </Tooltip>
    </>
  );
}
