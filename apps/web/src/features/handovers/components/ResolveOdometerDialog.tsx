'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App, Form } from 'antd';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  ODOMETER_CORRECTION_REASON, ODOMETER_CORRECTION_REASON_LABEL, ODOMETER_CORRECTION_REASON_VALUES, type HandoverType, type OdometerCorrectionReason, } from '@xeprime/types';
import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { getErrorCode, getErrorMessage } from '@/services/api-client';
import { resolveHandoverOdometer } from '../api';
import { resolveOdometerSchema, type ResolveOdometerFormValues } from '../schema';
import type { Handover, HandoverContext } from '../types';
import styles from './Handover.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

const REASON_OPTIONS = ODOMETER_CORRECTION_REASON_VALUES.map((value) => ({
  value,
  label: ODOMETER_CORRECTION_REASON_LABEL[value as OdometerCorrectionReason],
}));

/**
 * Bổ sung/sửa KM trên biên bản ĐÃ XÁC NHẬN — đường duy nhất chạm vào biên bản chỉ-đọc.
 *
 * Lý do là bắt buộc (CHECK ở DB cũng đòi), và nếu số mới thấp hơn KM hiện tại của xe thì
 * backend từ chối bằng mã riêng: người đủ quyền thấy hộp xác nhận, người không đủ quyền thấy
 * hướng dẫn xin phê duyệt — không phải một alert lỗi chung.
 */
export function ResolveOdometerDialog({
  open,
  type,
  context,
  handover,
  onClose,
  onSaved,
}: {
  open: boolean;
  type: HandoverType;
  context: HandoverContext;
  handover: Handover;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fmt = useAppFormat();

  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const [decreaseWarning, setDecreaseWarning] = useState<string | null>(null);

  const defaults = useMemo<ResolveOdometerFormValues>(
    () => ({
      odometerKm: handover.odometerKm ?? 0,
      reasonCode: ODOMETER_CORRECTION_REASON.HANDOVER_ERROR,
      reason: '',
    }),
    [handover],
  );

  const { control, handleSubmit, reset } = useForm<ResolveOdometerFormValues>({
    resolver: yupResolver(resolveOdometerSchema),
    defaultValues: defaults,
    values: defaults,
  });

  function handleClose() {
    setDecreaseWarning(null);
    reset(defaults);
    onClose();
  }

  async function save(values: ResolveOdometerFormValues, confirmDecrease = false) {
    setSaving(true);
    setDecreaseWarning(null);
    try {
      await resolveHandoverOdometer(context.bookingId, type, {
        odometerKm: values.odometerKm,
        reasonCode: values.reasonCode,
        reason: values.reason,
        confirmDecrease,
        expectedRowVersion: handover.rowVersion,
      });
      message.success('Đã cập nhật chỉ số KM của biên bản');
      onSaved();
      handleClose();
    } catch (err) {
      const code = getErrorCode(err);
      if (code === 'ODOMETER_DECREASE_FORBIDDEN') {
        setDecreaseWarning(getErrorMessage(err));
      } else if (code === 'CONFLICT') {
        message.error('Biên bản vừa được người khác cập nhật — đóng và mở lại.');
        onSaved();
      } else {
        message.error(getErrorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      title={handover.odometerMissing ? 'Bổ sung KM còn thiếu' : 'Điều chỉnh KM biên bản'}
      size="sm"
      confirmLoading={saving}
      onClose={handleClose}
      onOk={() => void handleSubmit((values) => save(values))()}
      okText="Lưu chỉ số KM"
      cancelText="Hủy"
    >
      <div className={styles.dialogBody}>
        {handover.odometerMissing ? (
          <Alert
            type="warning"
            showIcon
            className={styles.inlineAlert}
            message="Biên bản này đang thiếu chỉ số KM"
            description="KM hiện tại của xe chưa được cập nhật từ chuyến này. Nhập số đọc thực tế để đồng bộ lại hồ sơ xe và mốc bảo dưỡng."
          />
        ) : null}

        <div className={styles.summaryBox}>
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>KM hiện tại của xe</span>
            <span className={styles.summaryValue}>{fmt.km(context.vehicleOdometerKm)}</span>
          </div>
          {context.pickupOdometerKm != null ? (
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>KM lúc giao</span>
              <span className={styles.summaryValue}>{fmt.km(context.pickupOdometerKm)}</span>
            </div>
          ) : null}
        </div>

        {decreaseWarning ? (
          <Alert
            type="error"
            showIcon
            role="alert"
            className={styles.inlineAlert}
            message="Số KM mới thấp hơn KM hiện tại"
            description={decreaseWarning}
            action={
              <button
                type="button"
                className={styles.linkButton}
                onClick={() => void handleSubmit((values) => save(values, true))()}
              >
                Tôi có thẩm quyền, vẫn giảm
              </button>
            }
          />
        ) : null}

        <Form component={false} layout="vertical" colon={false}>
          <NumberField
            control={control}
            name="odometerKm"
            label="Chỉ số KM thực tế"
            addonAfter="km"
            min={0}
            required
          />
          <SelectField
            control={control}
            name="reasonCode"
            label="Lý do"
            options={REASON_OPTIONS}
            required
          />
          <TextAreaField
            control={control}
            name="reason"
            label="Diễn giải chi tiết"
            rows={3}
            maxLength={1000}
            required
            placeholder="VD: Đọc lại từ ảnh đồng hồ đính kèm biên bản"
          />
        </Form>
      </div>
    </ResponsiveDialog>
  );
}
