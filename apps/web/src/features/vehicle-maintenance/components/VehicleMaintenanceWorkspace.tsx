'use client';

import { EditOutlined, HistoryOutlined, PlusOutlined } from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App, Button, Card, Col, Form, List, Progress, Row, Skeleton, Tag } from 'antd';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  MAINTENANCE_DUE_STATUS, MAINTENANCE_DUE_STATUS_META, MAINTENANCE_STATUS, MAINTENANCE_STATUS_META, MAINTENANCE_TYPE_LABEL, ODOMETER_SOURCE_LABEL, PERMISSION, type MaintenanceDueStatus, type MaintenanceStatus, type MaintenanceType, type OdometerSource, } from '@xeprime/types';
import {
  maintenanceProfileFormSchema, type MaintenanceProfileFormValues, } from '@xeprime/validators';
import { StatusTag } from '@/components/data-display/StatusTag';
import { PermissionState } from '@/components/feedback/PermissionState';
import { NumberField } from '@/components/form/NumberField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { DateTimeField } from '@/components/form/DateTimeField';
import { ROUTES } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { getErrorCode, getErrorMessage } from '@/services/api-client';
import type { VehicleDetail } from '@/features/vehicles/types';
import { saveMaintenanceProfile } from '../api';
import { useInvalidateMaintenance, useMaintenanceProfile, useMaintenanceRecords } from '../hooks';
import type { MaintenanceProfile, MaintenanceRecord } from '../types';
import { MaintenanceRecordDialog } from './MaintenanceRecordDialog';
import { OdometerCorrectionDialog } from './OdometerCorrectionDialog';
import { OdometerHistoryDialog } from './OdometerHistoryDialog';
import styles from './VehicleMaintenanceWorkspace.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
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
        message={t('workspace.loadError')}
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
  const errorMessage = useErrorMessage();
  const fmt = useAppFormat();

  const { message } = App.useApp();
  const invalidate = useInvalidateMaintenance(vehicle.id);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [recordDialog, setRecordDialog] = useState<
    { mode: 'create' } | { mode: 'edit' | 'complete'; record: MaintenanceRecord } | null
  >(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const upcoming = useMemo(
    () =>
      records.filter((row) =>
        (
          [MAINTENANCE_STATUS.SCHEDULED, MAINTENANCE_STATUS.IN_PROGRESS] as string[]
        ).includes(row.status),
      ),
    [records],
  );
  const history = useMemo(
    () =>
      records.filter((row) =>
        ([MAINTENANCE_STATUS.COMPLETED, MAINTENANCE_STATUS.CANCELED] as string[]).includes(
          row.status,
        ),
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
  const { control, handleSubmit, formState } = useForm<MaintenanceProfileFormValues>({
    resolver: yupResolver(maintenanceProfileFormSchema),
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

  const dueStatus = profile.dueStatus as MaintenanceDueStatus;
  const hasSchedule = profile.nextMaintenanceKm != null && profile.remainingKm != null;

  return (
    <div className={styles.stack}>
      {!canManage ? (
        <Alert
          type="info"
          showIcon
          message={t('workspace.readOnlyBanner')}
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
            message={t('workspace.noOdometer')}
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
        <Form component={false} layout="vertical" colon={false} disabled={!canManage}>
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
              message={tCommon('labels.insufficientData')}
              description={t('workspace.nextDueHint')}
            />
          )}
          <p className={styles.thresholdNote}>
            {t('workspace.dueSoonThreshold', { value: fmt.km(profile.dueSoonKm) })}
          </p>
        </div>

        <Form component={false} layout="vertical" colon={false} disabled={!canManage}>
          <TextAreaField
            control={control}
            name="notes"
            label={t('workspace.oilNotes')}
            rows={2}
            maxLength={2000}
          />
        </Form>

        {canManage ? (
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
          canManage ? (
            <Button icon={<PlusOutlined />} onClick={() => setRecordDialog({ mode: 'create' })}>
              {t('workspace.addRecord')}
            </Button>
          ) : null
        }
      >
        {recordsFailed ? (
          <Alert
            type="error"
            showIcon
            message={t('workspace.recordsLoadError')}
            description={
              <Button size="small" onClick={onRetryRecords}>
                {tCommon('actions.retry')}
              </Button>
            }
          />
        ) : upcoming.length === 0 ? (
          <p className={styles.emptyText}>
            {t('workspace.upcomingEmpty')}{' '}
            <Link href={ROUTES.MANAGE.MAINTENANCE}>{t('workspace.boardLink')}</Link>
          </p>
        ) : (
          <List
            dataSource={upcoming}
            renderItem={(record) => (
              <RecordRow
                key={record.id}
                record={record}
                canManage={canManage}
                onEdit={() => setRecordDialog({ mode: 'edit', record })}
                onComplete={() => setRecordDialog({ mode: 'complete', record })}
              />
            )}
          />
        )}
      </Card>

      {/* ── Lịch sử ── */}
      <Card className={styles.card} title={t('workspace.historyCard')}>
        {history.length === 0 ? (
          <p className={styles.emptyText}>{t('workspace.historyEmpty')}</p>
        ) : (
          <List
            dataSource={history}
            renderItem={(record) => (
              <RecordRow key={record.id} record={record} canManage={false} canViewFiles={canViewFiles} />
            )}
          />
        )}
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

function RecordRow({
  record,
  canManage,
  canViewFiles,
  onEdit,
  onComplete,
}: {
  record: MaintenanceRecord;
  canManage: boolean;
  canViewFiles?: boolean;
  onEdit?: () => void;
  onComplete?: () => void;
}) {
  const fmt = useAppFormat();
  const t = useTranslations('Maintenance');
  const tCommon = useTranslations('Common');

  const title =
    record.title ||
    record.customTypeName ||
    MAINTENANCE_TYPE_LABEL[record.type as MaintenanceType] ||
    record.type;
  const when = record.completedAt
    ? fmt.date(record.completedAt)
    : record.plannedStartAt
      ? fmt.dateTime(record.plannedStartAt)
      : null;

  return (
    <List.Item className={styles.recordRow}>
      <div className={styles.recordBody}>
        <div className={styles.recordHead}>
          <strong>{title}</strong>
          <StatusTag value={record.status as MaintenanceStatus} meta={MAINTENANCE_STATUS_META} group="maintenanceStatus" />
        </div>
        <div className={styles.recordMeta}>
          {when ? <span>{when}</span> : null}
          {record.odometerKm != null ? <span>{fmt.km(record.odometerKm)}</span> : null}
          {record.providerName ? <span>{record.providerName}</span> : null}
          {/* `cost` vắng mặt = thiếu quyền tiền (server đã lược); null = chưa nhập. */}
          {record.cost != null ? (
            <span className={styles.recordCost}>{fmt.money(record.cost)}</span>
          ) : null}
          {canViewFiles && record.attachmentCount > 0 ? (
            <Tag>{t('workspace.attachments', { count: record.attachmentCount })}</Tag>
          ) : null}
        </div>
        {record.notes ? <p className={styles.recordNotes}>{record.notes}</p> : null}
      </div>
      {canManage ? (
        <div className={styles.recordActions}>
          {onComplete ? (
            <Button size="small" type="primary" onClick={onComplete}>
              {t('actions.complete')}
            </Button>
          ) : null}
          {onEdit ? (
            <Button size="small" onClick={onEdit}>
              {tCommon('actions.edit')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </List.Item>
  );
}
