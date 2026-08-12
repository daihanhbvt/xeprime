'use client';

import { EditOutlined, HistoryOutlined, PlusOutlined } from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App, Button, Card, Col, Form, List, Progress, Row, Skeleton, Tag } from 'antd';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  MAINTENANCE_DUE_STATUS,
  MAINTENANCE_DUE_STATUS_META,
  MAINTENANCE_STATUS,
  MAINTENANCE_STATUS_META,
  MAINTENANCE_TYPE_LABEL,
  ODOMETER_SOURCE_LABEL,
  PERMISSION,
  type MaintenanceDueStatus,
  type MaintenanceStatus,
  type MaintenanceType,
  type OdometerSource,
} from '@xeprime/types';
import {
  maintenanceProfileFormSchema,
  type MaintenanceProfileFormValues,
} from '@xeprime/validators';
import { StatusTag } from '@/components/data-display/StatusTag';
import { PermissionState } from '@/components/feedback/PermissionState';
import { NumberField } from '@/components/form/NumberField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { DateTimeField } from '@/components/form/DateTimeField';
import { ROUTES } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { formatDate, formatDateTime } from '@/lib/datetime';
import { formatMoneyVnd } from '@/lib/money';
import { formatKm, formatRemainingKm, INSUFFICIENT_DATA_LABEL } from '@/lib/odometer';
import { getErrorCode, getErrorMessage } from '@/services/api-client';
import type { VehicleDetail } from '@/features/vehicles/types';
import { saveMaintenanceProfile } from '../api';
import { useInvalidateMaintenance, useMaintenanceProfile, useMaintenanceRecords } from '../hooks';
import type { MaintenanceProfile, MaintenanceRecord } from '../types';
import { MaintenanceRecordDialog } from './MaintenanceRecordDialog';
import { OdometerCorrectionDialog } from './OdometerCorrectionDialog';
import { OdometerHistoryDialog } from './OdometerHistoryDialog';
import styles from './VehicleMaintenanceWorkspace.module.css';

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
        title="Không có quyền xem bảo dưỡng"
        description="Bạn không có quyền xem thông tin bảo dưỡng và số KM của xe này. Liên hệ chủ gian hàng để được cấp quyền."
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
        message="Không tải được thông tin bảo dưỡng"
        description={
          <Button size="small" onClick={() => void profile.refetch()}>
            Thử lại
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
      message.success('Đã lưu cấu hình bảo dưỡng');
      invalidate();
    } catch (err) {
      if (getErrorCode(err) === 'CONFLICT') {
        message.error('Thông tin vừa được người khác cập nhật — tải lại trang trước khi lưu tiếp.');
      } else {
        message.error(getErrorMessage(err));
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
          message="Chế độ xem — Bạn chỉ có quyền xem bảo dưỡng, không thể chỉnh sửa."
        />
      ) : null}

      {/* ── Chỉ số KM hiện tại ── */}
      <Card
        className={styles.card}
        title="Chỉ số Kilometer hiện tại (Odo)"
        extra={
          canCorrectOdometer ? (
            <Button icon={<EditOutlined />} onClick={() => setCorrectionOpen(true)}>
              Điều chỉnh thủ công
            </Button>
          ) : null
        }
      >
        <div className={styles.odometerRow}>
          <div className={styles.odometerMain}>
            <p className={styles.odometerValue}>{formatKm(profile.currentOdometerKm)}</p>
            <p className={styles.odometerMeta}>
              {profile.currentOdometerAt ? (
                <>
                  Cập nhật {formatDateTime(profile.currentOdometerAt)}
                  {profile.currentOdometerRefLabel ? ` · ${profile.currentOdometerRefLabel}` : ''}
                  {profile.currentOdometerSource
                    ? ` · ${ODOMETER_SOURCE_LABEL[profile.currentOdometerSource as OdometerSource] ?? profile.currentOdometerSource}`
                    : ''}
                </>
              ) : (
                'Chưa ghi nhận số KM nào cho xe này.'
              )}
            </p>
          </div>
          <Button
            type="link"
            icon={<HistoryOutlined />}
            onClick={() => setHistoryOpen(true)}
            className={styles.historyLink}
          >
            Lịch sử KM
          </Button>
        </div>
        {profile.currentOdometerKm == null ? (
          <Alert
            className={styles.inlineAlert}
            type="warning"
            showIcon
            message="Chưa có dữ liệu KM"
            description="Nhập số KM hiện tại để tính được mốc bảo dưỡng tiếp theo. KM cũng được cập nhật tự động sau khi hoàn tất trả xe."
          />
        ) : null}
      </Card>

      {/* ── Chu kỳ thay nhớt ── */}
      <Card
        className={styles.card}
        title="Theo dõi Thay nhớt định kỳ"
        extra={<StatusTag value={dueStatus} meta={MAINTENANCE_DUE_STATUS_META} />}
      >
        <Form component={false} layout="vertical" colon={false} disabled={!canManage}>
          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <NumberField
                control={control}
                name="oilChangeIntervalKm"
                label="Chu kỳ thay nhớt định kỳ"
                placeholder="5.000"
                addonAfter="km"
                min={1}
              />
            </Col>
            <Col xs={24} sm={8}>
              <NumberField
                control={control}
                name="lastServiceKm"
                label="KM thay nhớt lần gần nhất"
                placeholder="40.000"
                addonAfter="km"
                min={0}
              />
            </Col>
            <Col xs={24} sm={8}>
              <DateTimeField
                control={control}
                name="lastServiceAt"
                label="Ngày thay nhớt gần nhất"
                dateOnly
              />
            </Col>
          </Row>
        </Form>

        <div className={styles.scheduleBlock}>
          <div className={styles.scheduleHead}>
            <span>
              Mốc bảo dưỡng tiếp theo:{' '}
              <strong>
                {profile.nextMaintenanceKm != null
                  ? formatKm(profile.nextMaintenanceKm)
                  : INSUFFICIENT_DATA_LABEL}
              </strong>
            </span>
            <span
              className={
                dueStatus === MAINTENANCE_DUE_STATUS.OVERDUE ? styles.overdueText : undefined
              }
            >
              {formatRemainingKm(profile.remainingKm)}
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
              message={INSUFFICIENT_DATA_LABEL}
              description="Cần đủ KM hiện tại, chu kỳ và KM lần thay gần nhất mới tính được mốc tiếp theo."
            />
          )}
          <p className={styles.thresholdNote}>
            Ngưỡng cảnh báo &ldquo;sắp đến hạn&rdquo; của gian hàng: còn {formatKm(profile.dueSoonKm)}.
          </p>
        </div>

        <Form component={false} layout="vertical" colon={false} disabled={!canManage}>
          <TextAreaField
            control={control}
            name="notes"
            label="Ghi chú kỹ thuật khi thay nhớt"
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
              Lưu thay đổi
            </Button>
          </div>
        ) : null}
      </Card>

      {/* ── Lịch sắp tới ── */}
      <Card
        className={styles.card}
        title="Lịch bảo dưỡng sắp tới"
        extra={
          canManage ? (
            <Button icon={<PlusOutlined />} onClick={() => setRecordDialog({ mode: 'create' })}>
              Thêm bảo dưỡng
            </Button>
          ) : null
        }
      >
        {recordsFailed ? (
          <Alert
            type="error"
            showIcon
            message="Không tải được danh sách bảo dưỡng"
            description={
              <Button size="small" onClick={onRetryRecords}>
                Thử lại
              </Button>
            }
          />
        ) : upcoming.length === 0 ? (
          <p className={styles.emptyText}>
            Chưa có lịch bảo dưỡng nào sắp tới.{' '}
            <Link href={ROUTES.MANAGE.MAINTENANCE}>Xem trung tâm bảo dưỡng</Link>
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
      <Card className={styles.card} title="Lịch sử bảo dưỡng & Sửa chữa">
        {history.length === 0 ? (
          <p className={styles.emptyText}>Chưa có lần bảo dưỡng nào được ghi nhận.</p>
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
  const title =
    record.title ||
    record.customTypeName ||
    MAINTENANCE_TYPE_LABEL[record.type as MaintenanceType] ||
    record.type;
  const when = record.completedAt
    ? formatDate(record.completedAt)
    : record.plannedStartAt
      ? formatDateTime(record.plannedStartAt)
      : null;

  return (
    <List.Item className={styles.recordRow}>
      <div className={styles.recordBody}>
        <div className={styles.recordHead}>
          <strong>{title}</strong>
          <StatusTag value={record.status as MaintenanceStatus} meta={MAINTENANCE_STATUS_META} />
        </div>
        <div className={styles.recordMeta}>
          {when ? <span>{when}</span> : null}
          {record.odometerKm != null ? <span>{formatKm(record.odometerKm)}</span> : null}
          {record.providerName ? <span>{record.providerName}</span> : null}
          {/* `cost` vắng mặt = thiếu quyền tiền (server đã lược); null = chưa nhập. */}
          {record.cost != null ? (
            <span className={styles.recordCost}>{formatMoneyVnd(record.cost)}</span>
          ) : null}
          {canViewFiles && record.attachmentCount > 0 ? (
            <Tag>{record.attachmentCount} chứng từ</Tag>
          ) : null}
        </div>
        {record.notes ? <p className={styles.recordNotes}>{record.notes}</p> : null}
      </div>
      {canManage ? (
        <div className={styles.recordActions}>
          {onComplete ? (
            <Button size="small" type="primary" onClick={onComplete}>
              Hoàn tất
            </Button>
          ) : null}
          {onEdit ? (
            <Button size="small" onClick={onEdit}>
              Chỉnh sửa
            </Button>
          ) : null}
        </div>
      ) : null}
    </List.Item>
  );
}
