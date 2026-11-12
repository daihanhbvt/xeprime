'use client';

import { useTranslations } from 'next-intl';
import { Alert, App, Col, Form, Row } from 'antd';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  MAINTENANCE_TYPE,
  MAINTENANCE_TYPE_LABEL,
  PERMISSION,
  MAINTENANCE_TYPE_VALUES,
  type MaintenanceType,
} from '@xeprime/types';
import { DateTimeField } from '@/components/form/DateTimeField';
import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { DAY_PARAM_FORMAT, startOfAppDay, toAppTz } from '@/lib/datetime';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';
import { usePermissions } from '@/hooks/use-permissions';
import { getErrorCode } from '@/services/api-client';
import { useErrorMessage } from '@/i18n/use-error-message';
import {
  completeMaintenanceRecord,
  createMaintenanceRecord,
  updateMaintenanceRecord,
} from '../api';
import { maintenanceRecordFormSchema, type MaintenanceRecordFormValues } from '../schema';
import type { MaintenanceRecord } from '../types';
import styles from './VehicleMaintenanceWorkspace.module.css';
import { useValidationResolver } from '@/i18n/use-validation-resolver';

const TYPE_OPTIONS = MAINTENANCE_TYPE_VALUES.map((value) => ({
  value,
  label: MAINTENANCE_TYPE_LABEL[value as MaintenanceType],
}));

type DialogState =
  { mode: 'create' } | { mode: 'edit' | 'complete'; record: MaintenanceRecord } | null;

/**
 * Thêm / sửa / hoàn tất một phiếu bảo dưỡng (Wave 6 §9.2).
 *
 * Lịch chỉ có MỘT ngày dự kiến để nhắc — không giữ chỗ lịch xe nên không còn báo trùng lịch
 * (ADR 0079).
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
  const { message } = App.useApp();
  const t = useTranslations('Maintenance');
  const tCommon = useTranslations('Common');
  const errorMessage = useErrorMessage();
  const [saving, setSaving] = useState(false);
  const record = state && state.mode !== 'create' ? state.record : null;
  const completing = state?.mode === 'complete';
  /*
   * Chi phí + mã phiếu chi đi theo `vehicles.maintenance.view_cost`: thiếu quyền thì hai ô không
   * có mặt và KHÔNG có trong lệnh gửi — gửi `null` là xoá chi phí đang lưu, và backend từ chối
   * lệnh có hai trường này từ người không thấy chúng.
   */
  const { has } = usePermissions();
  const canViewCost = has(PERMISSION.VEHICLE_MAINTENANCE_COST_VIEW);
  /*
   * Phiên hỗ trợ gian hàng (ADR 0050): ngày dự kiến và KM hiện ở dạng CHỈ ĐỌC và không
   * có trong lệnh — lập lịch bảo dưỡng không thuộc Đợt 1. Backend cũng chặn.
   */
  const scheduleLocked = useSupportHides(SUPPORT_HIDDEN_AREA.MAINTENANCE_SCHEDULE);

  const defaults = useMemo<MaintenanceRecordFormValues>(
    () => ({
      type: (record?.type ?? MAINTENANCE_TYPE.OIL_CHANGE) as MaintenanceRecordFormValues['type'],
      customTypeName: record?.customTypeName ?? '',
      title: record?.title ?? '',
      // ISO (mốc UTC) từ API → NGÀY theo giờ Việt Nam; chiều gửi đi là 00:00 giờ VN của ngày đó.
      plannedDate: record?.plannedStartAt
        ? toAppTz(record.plannedStartAt).format(DAY_PARAM_FORMAT)
        : null,
      odometerKm: record?.odometerKm ?? null,
      providerName: record?.providerName ?? '',
      // `cost` vắng mặt khi thiếu quyền tiền — không dựng số 0 giả vào form.
      cost: record?.cost != null ? Number(record.cost) : null,
      receiptCode: record?.receiptCode ?? '',
      notes: record?.notes ?? '',
    }),
    [record],
  );

  const resolver = useValidationResolver<MaintenanceRecordFormValues>(
    maintenanceRecordFormSchema,
    'Maintenance.validation',
  );
  // `values` để RHF tự đồng bộ khi đổi phiếu — không cần effect reset thủ công.
  const { control, handleSubmit, reset } = useForm<MaintenanceRecordFormValues>({
    resolver,
    defaultValues: defaults,
    values: defaults,
  });
  const type = useWatch({ control, name: 'type' });

  /** Đóng là hành động của người dùng → dọn trạng thái ở đây, không qua effect. */
  function handleClose() {
    reset(defaults);
    onClose();
  }

  async function save(values: MaintenanceRecordFormValues) {
    setSaving(true);
    const text = (value: string | null | undefined) => (value?.trim() ? value.trim() : null);
    try {
      if (completing && record) {
        await completeMaintenanceRecord(vehicleId, record.id, {
          odometerKm: values.odometerKm,
          ...(canViewCost
            ? {
                cost: values.cost != null ? String(values.cost) : null,
                receiptCode: text(values.receiptCode),
              }
            : {}),
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
          ...(scheduleLocked
            ? {}
            : {
                // API nhận ISO 8601 (UTC) — CLAUDE.md §9: lưu UTC, hiển thị Asia/Ho_Chi_Minh.
                plannedStartAt: values.plannedDate
                  ? startOfAppDay(values.plannedDate).toISOString()
                  : null,
                odometerKm: values.odometerKm,
              }),
          providerName: text(values.providerName),
          ...(canViewCost
            ? {
                cost: values.cost != null ? String(values.cost) : null,
                receiptCode: text(values.receiptCode),
              }
            : {}),
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
      if (code === 'CONFLICT') {
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
                    name="plannedDate"
                    label={t('record.plannedDate')}
                    dateOnly
                    disabled={scheduleLocked}
                  />
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
                disabled={scheduleLocked}
                help={completing ? t('record.odometerHelp') : undefined}
              />
            </Col>
            {canViewCost ? (
              <>
                <Col xs={24} sm={12}>
                  <NumberField
                    control={control}
                    name="cost"
                    label={t('record.cost')}
                    money
                    min={0}
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <TextField
                    control={control}
                    name="receiptCode"
                    label={t('record.receipt')}
                    placeholder={t('record.receiptPlaceholder')}
                  />
                </Col>
              </>
            ) : null}
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

        {completing ? <Alert type="info" showIcon title={t('record.completeHint')} /> : null}
        {record && canViewFiles && record.attachmentCount > 0 ? (
          <p className={styles.attachmentNote}>
            {t('record.attachments', { count: record.attachmentCount })}
          </p>
        ) : null}
      </div>
    </ResponsiveDialog>
  );
}
