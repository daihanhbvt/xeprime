'use client';

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
import { dayjs, formatDateTimeRange } from '@/lib/datetime';
import { getErrorCode, getErrorMessage } from '@/services/api-client';
import type { ApiClientError } from '@/services/api-client';
import {
  completeMaintenanceRecord,
  createMaintenanceRecord,
  updateMaintenanceRecord,
} from '../api';
import {
  maintenanceRecordFormSchema,
  type MaintenanceRecordFormValues,
} from '../schema';
import type { MaintenanceRecord } from '../types';
import styles from './VehicleMaintenanceWorkspace.module.css';

const TYPE_OPTIONS = MAINTENANCE_TYPE_VALUES.map((value) => ({
  value,
  label: MAINTENANCE_TYPE_LABEL[value as MaintenanceType],
}));

type DialogState =
  | { mode: 'create' }
  | { mode: 'edit' | 'complete'; record: MaintenanceRecord }
  | null;

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
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const [conflicts, setConflicts] = useState<ScheduleConflict[]>([]);
  const record = state && state.mode !== 'create' ? state.record : null;
  const completing = state?.mode === 'complete';

  const defaults = useMemo<MaintenanceRecordFormValues>(
    () => ({
      type: (record?.type ?? MAINTENANCE_TYPE.OIL_CHANGE) as MaintenanceRecordFormValues['type'],
      customTypeName: record?.customTypeName ?? '',
      title: record?.title ?? '',
      // ISO từ API → Dayjs cho DatePicker; chiều ngược lại serialize lúc gửi.
      plannedStartAt: record?.plannedStartAt ? dayjs(record.plannedStartAt) : null,
      plannedEndAt: record?.plannedEndAt ? dayjs(record.plannedEndAt) : null,
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
    resolver: yupResolver(maintenanceRecordFormSchema),
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
        message.success('Đã lưu bảo dưỡng thành công!');
      } else {
        const body = {
          type: values.type,
          customTypeName:
            values.type === MAINTENANCE_TYPE.OTHER ? text(values.customTypeName) : null,
          title: text(values.title),
          // API nhận ISO 8601 (UTC) — CLAUDE.md §9: lưu UTC, hiển thị Asia/Ho_Chi_Minh.
          plannedStartAt: values.plannedStartAt?.toISOString() ?? null,
          plannedEndAt: values.plannedEndAt?.toISOString() ?? null,
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
          message.success('Đã cập nhật phiếu bảo dưỡng');
        } else {
          await createMaintenanceRecord(vehicleId, body);
          message.success('Đã tạo lịch bảo dưỡng');
        }
      }
      onSaved();
    } catch (err) {
      const code = getErrorCode(err);
      if (code === 'BOOKING_SCHEDULE_CONFLICT') {
        // Giữ nguyên form: người dùng chỉ cần đổi ngày, không phải nhập lại.
        const details = (err as ApiClientError).details as { conflicts?: ScheduleConflict[] } | undefined;
        setConflicts(details?.conflicts ?? []);
        message.error('Khoảng thời gian này đã có lịch khác — hãy chọn thời điểm khác.');
      } else if (code === 'CONFLICT') {
        message.error('Phiếu vừa được người khác cập nhật — đóng hộp thoại và tải lại trang.');
      } else if (code === 'ODOMETER_DECREASE_FORBIDDEN') {
        message.error('Số KM nhập vào thấp hơn KM hiện tại của xe — kiểm tra lại chỉ số.');
      } else {
        message.error(getErrorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  }

  const title = completing
    ? 'Hoàn tất bảo dưỡng'
    : record
      ? 'Chỉnh sửa bảo dưỡng'
      : 'Thêm bảo dưỡng';

  return (
    <ResponsiveDialog
      open={Boolean(state)}
      title={title}
      size="md"
      mobileMode="fullscreen"
      confirmLoading={saving}
      onClose={handleClose}
      onOk={() => void handleSubmit(save)()}
      okText={completing ? 'Lưu bảo dưỡng' : record ? 'Lưu thay đổi' : 'Tạo lịch'}
      cancelText="Hủy"
    >
      <div className={styles.recordForm}>
        {conflicts.length > 0 ? (
          <Alert
            type="error"
            showIcon
            role="alert"
            className={styles.conflictAlert}
            message="Xe đã có lịch khác trùng khoảng thời gian này"
            description={
              <List
                size="small"
                dataSource={conflicts}
                renderItem={(conflict) => (
                  <List.Item key={`${conflict.sourceType}-${conflict.startAt}`}>
                    {conflict.label}: {formatDateTimeRange(conflict.startAt, conflict.endAt)}
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
                label="Loại bảo dưỡng"
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
                  label="Tên hạng mục"
                  placeholder="VD: Cân chỉnh thước lái"
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
                    label="Mô tả ngắn"
                    placeholder="VD: Bảo dưỡng mốc 45.000 km"
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <DateTimeField control={control} name="plannedStartAt" label="Bắt đầu dự kiến" />
                </Col>
                <Col xs={24} sm={12}>
                  <DateTimeField control={control} name="plannedEndAt" label="Kết thúc dự kiến" />
                </Col>
                <Col xs={24}>
                  <p className={styles.attachmentNote}>
                    Nhập đủ cặp thời gian thì lịch sẽ giữ chỗ thật trên lịch xe — khoảng đó
                    không nhận đơn thuê được nữa.
                  </p>
                </Col>
                <Col xs={24} sm={12}>
                  <TextField
                    control={control}
                    name="providerName"
                    label="Garage / Đơn vị thực hiện"
                    placeholder="VD: Toyota Đông Sài Gòn"
                  />
                </Col>
              </>
            ) : null}
            <Col xs={24} sm={12}>
              <NumberField
                control={control}
                name="odometerKm"
                label="Odo bảo dưỡng"
                placeholder="45.000"
                addonAfter="km"
                min={0}
                help={completing ? 'Bỏ trống nếu ghi nhận hồi tố, không muốn đổi KM hiện tại.' : undefined}
              />
            </Col>
            <Col xs={24} sm={12}>
              <NumberField control={control} name="cost" label="Chi phí (VNĐ)" money min={0} />
            </Col>
            <Col xs={24} sm={12}>
              <TextField
                control={control}
                name="receiptCode"
                label="Mã phiếu chi / chứng từ"
                placeholder="VD: CT-40092"
              />
            </Col>
            <Col xs={24}>
              <TextAreaField
                control={control}
                name="notes"
                label="Ghi chú"
                rows={2}
                maxLength={2000}
              />
            </Col>
          </Row>
        </Form>

        {completing ? (
          <Alert
            type="info"
            showIcon
            message="Hoàn tất sẽ giải phóng lịch xe và cập nhật KM hiện tại (nếu nhập). Riêng thay nhớt sẽ dời mốc bảo dưỡng tiếp theo."
          />
        ) : null}
        {record && canViewFiles && record.attachmentCount > 0 ? (
          <p className={styles.attachmentNote}>
            Phiếu này có {record.attachmentCount} chứng từ đính kèm.
          </p>
        ) : null}
      </div>
    </ResponsiveDialog>
  );
}
