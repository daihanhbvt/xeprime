'use client';

import { useTranslations } from 'next-intl';
import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App, Col, Form, List, Row } from 'antd';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  MAINTENANCE_TYPE,
  MAINTENANCE_TYPE_LABEL,
  MAINTENANCE_TYPE_VALUES,
  type MaintenanceType,
} from '@xeprime/types';
import { DateTimeField } from '@/components/form/DateTimeField';
import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { appWallClockToIso, toAppTz } from '@/lib/datetime';
import { getErrorCode } from '@/services/api-client';
import { useErrorMessage } from '@/i18n/use-error-message';
import type { ApiClientError } from '@/services/api-client';
import {
  completeMaintenanceRecord,
  createMaintenanceRecord,
  updateMaintenanceRecord,
} from '../api';
import { makeMaintenanceRecordFormSchema, type MaintenanceRecordFormValues } from '../schema';
import type { MaintenanceRecord } from '../types';
import styles from './VehicleMaintenanceWorkspace.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

const TYPE_OPTIONS = MAINTENANCE_TYPE_VALUES.map((value) => ({
  value,
  label: MAINTENANCE_TYPE_LABEL[value as MaintenanceType],
}));

type DialogState =
  { mode: 'create' } | { mode: 'edit' | 'complete'; record: MaintenanceRecord } | null;

interface ScheduleConflict {
  sourceType: string;
  startAt: string;
  endAt: string;
  label: string;
}

/**
 * Thêm / sửa / hoàn tất một phiếu bảo dưỡng (Wave 6 §9.2).
 *
 * Khi khoảng thời gian đụng đơn thuê hoặc lịch khác, backend trả 409 kèm CHÍNH khoảng bị
 * trùng — màn này hiển thị nguyên khoảng đó và GIỮ NGUYÊN dữ liệu người dùng đã nhập để họ
 * chỉ phải đổi ngày, không phải gõ lại từ đầu.
 */
export function MaintenanceRecordDialog({
  state,
  vehicleId,
  canViewFiles,
  onClose,
  onSaved,
}: {
  state: DialogState;
  vehicleId: string;
  canViewFiles: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fmt = useAppFormat();

  const { message } = App.useApp();
  const t = useTranslations('Maintenance');
  const tCommon = useTranslations('Common');
  const recordSchema = useMemo(
    () => makeMaintenanceRecordFormSchema(t as (key: string) => string),
    [t],
  );
  const errorMessage = useErrorMessage();
  const [saving, setSaving] = useState(false);
  const [conflicts, setConflicts] = useState<ScheduleConflict[]>([]);
  const record = state && state.mode !== 'create' ? state.record : null;
  const completing = state?.mode === 'complete';

  const defaults = useMemo<MaintenanceRecordFormValues>(
    () => ({
      type: (record?.type ?? MAINTENANCE_TYPE.OIL_CHANGE) as MaintenanceRecordFormValues['type'],
      customTypeName: record?.customTypeName ?? '',
      title: record?.title ?? '',
      // ISO (mốc UTC) từ API → giờ VIỆT NAM cho DatePicker; chiều gửi đi là
      // `appWallClockToIso`, vì giờ người dùng chọn luôn hiểu theo giờ VN (CLAUDE.md §9).
      plannedStartAt: record?.plannedStartAt ? toAppTz(record.plannedStartAt) : null,
      plannedEndAt: record?.plannedEndAt ? toAppTz(record.plannedEndAt) : null,
      odometerKm: record?.odometerKm ?? null,
      providerName: record?.providerName ?? '',
      // `cost` vắng mặt khi thiếu quyền tiền — không dựng số 0 giả vào form.
      cost: record?.cost != null ? Number(record.cost) : null,
      receiptCode: record?.receiptCode ?? '',
      notes: record?.notes ?? '',
    }),
    [record],
  );

  // `values` để RHF tự đồng bộ khi đổi phiếu — không cần effect reset thủ công.
  const { control, handleSubmit, reset } = useForm<MaintenanceRecordFormValues>({
    resolver: yupResolver(recordSchema),
    defaultValues: defaults,
    values: defaults,
  });
  const type = useWatch({ control, name: 'type' });

  /** Đóng là hành động của người dùng → dọn trạng thái ở đây, không qua effect. */
  function handleClose() {
    setConflicts([]);
    reset(defaults);
    onClose();
  }

  async function save(values: MaintenanceRecordFormValues) {
    setSaving(true);
    setConflicts([]);
    const text = (value: string | null | undefined) => (value?.trim() ? value.trim() : null);
    try {
      if (completing && record) {
        await completeMaintenanceRecord(vehicleId, record.id, {
          odometerKm: values.odometerKm,
          cost: values.cost != null ? String(values.cost) : null,
          receiptCode: text(values.receiptCode),
          notes: text(values.notes),
          expectedRowVersion: record.rowVersion,
        });
        message.success(t('toast.completed'));
      } else {
        const body = {
          type: values.type,
          customTypeName:
            values.type === MAINTENANCE_TYPE.OTHER ? text(values.customTypeName) : null,
          title: text(values.title),
          // API nhận ISO 8601 (UTC) — CLAUDE.md §9: lưu UTC, hiển thị Asia/Ho_Chi_Minh.
          plannedStartAt: values.plannedStartAt ? appWallClockToIso(values.plannedStartAt) : null,
          plannedEndAt: values.plannedEndAt ? appWallClockToIso(values.plannedEndAt) : null,
          odometerKm: values.odometerKm,
          providerName: text(values.providerName),
          cost: values.cost != null ? String(values.cost) : null,
          receiptCode: text(values.receiptCode),
          notes: text(values.notes),
        };
        if (record) {
          await updateMaintenanceRecord(vehicleId, record.id, {
            ...body,
            expectedRowVersion: record.rowVersion,
          });
          message.success(t('toast.updated'));
        } else {
          await createMaintenanceRecord(vehicleId, body);
          message.success(t('toast.created'));
        }
      }
      onSaved();
    } catch (err) {
      const code = getErrorCode(err);
      if (code === 'BOOKING_SCHEDULE_CONFLICT') {
        // Giữ nguyên form: người dùng chỉ cần đổi ngày, không phải nhập lại.
        const details = (err as ApiClientError).details as
          { conflicts?: ScheduleConflict[] } | undefined;
        setConflicts(details?.conflicts ?? []);
        message.error(t('toast.scheduleConflict'));
      } else if (code === 'CONFLICT') {
        message.error(t('toast.staleRecord'));
      } else if (code === 'ODOMETER_DECREASE_FORBIDDEN') {
        message.error(t('toast.odometerTooLow'));
      } else {
        message.error(errorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  }

  const title = completing
    ? t('record.titleComplete')
    : record
      ? t('record.titleEdit')
      : t('record.titleCreate');

  return (
    <ResponsiveDialog
      open={Boolean(state)}
      title={title}
      size="md"
      mobileMode="fullscreen"
      confirmLoading={saving}
      onClose={handleClose}
      onOk={() => void handleSubmit(save)()}
      okText={
        completing ? t('record.okComplete') : record ? t('record.okEdit') : t('record.okCreate')
      }
      cancelText={tCommon('actions.cancel')}
    >
      <div className={styles.recordForm}>
        {conflicts.length > 0 ? (
          <Alert
            type="error"
            showIcon
            role="alert"
            className={styles.conflictAlert}
            message={t('record.conflictAlert')}
            description={
              <List
                size="small"
                dataSource={conflicts}
                renderItem={(conflict) => (
                  <List.Item key={`${conflict.sourceType}-${conflict.startAt}`}>
                    {conflict.label}: {fmt.dateTimeRange(conflict.startAt, conflict.endAt)}
                  </List.Item>
                )}
              />
            }
          />
        ) : null}

        <Form component={false} layout="vertical" colon={false}>
          <Row gutter={16}>
            <Col xs={24}>
              <SelectField
                control={control}
                name="type"
                label={t('record.type')}
                options={TYPE_OPTIONS}
                required
                disabled={completing}
              />
            </Col>
            {type === MAINTENANCE_TYPE.OTHER ? (
              <Col xs={24}>
                <TextField
                  control={control}
                  name="customTypeName"
                  label={t('record.customType')}
                  placeholder={t('record.customTypePlaceholder')}
                  required
                  disabled={completing}
                />
              </Col>
            ) : null}
            {!completing ? (
              <>
                <Col xs={24}>
                  <TextField
                    control={control}
                    name="title"
                    label={t('record.title')}
                    placeholder={t('record.titlePlaceholder')}
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <DateTimeField
                    control={control}
                    name="plannedStartAt"
                    label={t('record.plannedStart')}
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <DateTimeField
                    control={control}
                    name="plannedEndAt"
                    label={t('record.plannedEnd')}
                  />
                </Col>
                <Col xs={24}>
                  <p className={styles.attachmentNote}>{t('record.scheduleHoldNote')}</p>
                </Col>
                <Col xs={24} sm={12}>
                  <TextField
                    control={control}
                    name="providerName"
                    label={t('record.provider')}
                    placeholder={t('record.providerPlaceholder')}
                  />
                </Col>
              </>
            ) : null}
            <Col xs={24} sm={12}>
              <NumberField
                control={control}
                name="odometerKm"
                label={t('record.odometer')}
                placeholder={t('record.odometerPlaceholder')}
                addonAfter="km"
                min={0}
                help={completing ? t('record.odometerHelp') : undefined}
              />
            </Col>
            <Col xs={24} sm={12}>
              <NumberField control={control} name="cost" label={t('record.cost')} money min={0} />
            </Col>
            <Col xs={24} sm={12}>
              <TextField
                control={control}
                name="receiptCode"
                label={t('record.receipt')}
                placeholder={t('record.receiptPlaceholder')}
              />
            </Col>
            <Col xs={24}>
              <TextAreaField
                control={control}
                name="notes"
                label={t('record.notes')}
                rows={2}
                maxLength={2000}
              />
            </Col>
          </Row>
        </Form>

        {completing ? <Alert type="info" showIcon message={t('record.completeHint')} /> : null}
        {record && canViewFiles && record.attachmentCount > 0 ? (
          <p className={styles.attachmentNote}>
            {t('record.attachments', { count: record.attachmentCount })}
          </p>
        ) : null}
      </div>
    </ResponsiveDialog>
  );
}
