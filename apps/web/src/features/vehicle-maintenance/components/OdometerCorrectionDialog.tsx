'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App, Form } from 'antd';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  ODOMETER_CORRECTION_REASON_LABEL,
  ODOMETER_CORRECTION_REASON_VALUES,
  type OdometerCorrectionReason,
} from '@xeprime/types';
import {
  odometerCorrectionFormSchema,
  type OdometerCorrectionFormValues,
} from '@xeprime/validators';
import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { formatKm } from '@/lib/odometer';
import { getErrorCode, getErrorMessage } from '@/services/api-client';
import { correctOdometer } from '../api';
import type { MaintenanceProfile } from '../types';
import styles from './VehicleMaintenanceWorkspace.module.css';

const REASON_OPTIONS = ODOMETER_CORRECTION_REASON_VALUES.map((value) => ({
  value,
  label: ODOMETER_CORRECTION_REASON_LABEL[value as OdometerCorrectionReason],
}));

/**
 * Điều chỉnh KM thủ công (Wave 6 §9.1).
 *
 * Hai điều màn này phải nói thật:
 *  1. Lý do là bắt buộc — không có đường lưu mà không giải thích.
 *  2. Số mới THẤP HƠN số hiện tại là hành động khác hẳn: cảnh báo tại chỗ, và người không có
 *     `vehicles.odometer.decrease` được nói thẳng là cần quản trị viên duyệt, thay vì bấm
 *     Lưu rồi nhận một lỗi khó hiểu.
 */
export function OdometerCorrectionDialog({
  open,
  vehicleId,
  profile,
  canDecrease,
  onClose,
  onSaved,
}: {
  open: boolean;
  vehicleId: string;
  profile: MaintenanceProfile;
  canDecrease: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const defaults = useMemo<OdometerCorrectionFormValues>(
    () => ({ odometerKm: null as unknown as number, reasonCode: 'handover_error', reason: '' }),
    [],
  );
  const { control, handleSubmit, reset } = useForm<OdometerCorrectionFormValues>({
    resolver: yupResolver(odometerCorrectionFormSchema),
    defaultValues: defaults,
  });

  /** Dọn form khi người dùng đóng — là hành động, không phải hiệu ứng đồng bộ. */
  function handleClose() {
    reset(defaults);
    onClose();
  }

  const nextKm = useWatch({ control, name: 'odometerKm' });
  const currentKm = profile.currentOdometerKm;
  const isDecrease =
    currentKm != null && typeof nextKm === 'number' && Number.isFinite(nextKm) && nextKm < currentKm;

  async function save(values: OdometerCorrectionFormValues) {
    setSaving(true);
    try {
      await correctOdometer(vehicleId, {
        odometerKm: values.odometerKm,
        reasonCode: values.reasonCode,
        reason: values.reason,
        // Người dùng đã thấy cảnh báo giảm KM ngay trên form này rồi mới bấm gửi.
        ...(isDecrease ? { confirmDecrease: true } : {}),
        expectedRowVersion: profile.rowVersion > 0 ? profile.rowVersion : undefined,
      });
      message.success('Đã cập nhật số KM');
      onSaved();
    } catch (err) {
      const code = getErrorCode(err);
      if (code === 'ODOMETER_DECREASE_FORBIDDEN') {
        message.error(
          'Giảm KM cần quyền quản trị viên. Hãy liên hệ chủ gian hàng để được cấp quyền hoặc nhờ duyệt thay.',
        );
      } else if (code === 'CONFLICT') {
        message.error('Số KM vừa được người khác cập nhật — đóng hộp thoại và tải lại trang.');
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
      title="Điều chỉnh công số"
      size="sm"
      mobileMode="fullscreen"
      confirmLoading={saving}
      onClose={handleClose}
      onOk={() => void handleSubmit(save)()}
      okText={isDecrease && !canDecrease ? 'Gửi yêu cầu phê duyệt' : 'Cập nhật KM'}
      okDisabled={isDecrease && !canDecrease}
      cancelText="Hủy"
    >
      <div className={styles.correctionStack}>
        <div className={styles.currentBox}>
          <span className={styles.currentLabel}>CHỈ SỐ HIỆN TẠI</span>
          <strong className={styles.currentValue}>{formatKm(currentKm)}</strong>
        </div>

        <Form component={false} layout="vertical" colon={false}>
          <NumberField
            control={control}
            name="odometerKm"
            label="KM mới"
            placeholder="Nhập chỉ số KM hiện trạng"
            addonAfter="km"
            min={0}
            required
          />
          <SelectField
            control={control}
            name="reasonCode"
            label="Lý do điều chỉnh"
            options={REASON_OPTIONS}
            required
          />
          <TextAreaField
            control={control}
            name="reason"
            label="Ghi chú chi tiết"
            placeholder="Nhập lý do điều chỉnh odo chi tiết…"
            rows={3}
            maxLength={1000}
            required
          />
        </Form>

        {isDecrease ? (
          <Alert
            type={canDecrease ? 'warning' : 'error'}
            showIcon
            role="alert"
            message={`KM mới thấp hơn KM hiện tại (${formatKm(currentKm)}).`}
            description={
              canDecrease
                ? 'Thao tác này sẽ được ghi lại kèm người thực hiện và lý do. Số cũ vẫn giữ nguyên trong lịch sử.'
                : 'Hành động này cần quyền quản trị viên. Bạn không thể tự thực hiện giảm KM.'
            }
          />
        ) : (
          <Alert
            type="info"
            showIcon
            message="Mọi điều chỉnh KM đều được ghi vào lịch sử kèm người thực hiện và lý do."
          />
        )}
      </div>
    </ResponsiveDialog>
  );
}
