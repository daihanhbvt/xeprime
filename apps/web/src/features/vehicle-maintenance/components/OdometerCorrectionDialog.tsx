'use client';

import { useTranslations } from 'next-intl';
import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App, Form } from 'antd';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  ODOMETER_CORRECTION_REASON_VALUES,
} from '@xeprime/types';
import {
  odometerCorrectionFormSchema, type OdometerCorrectionFormValues, } from '@xeprime/validators';
import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { getErrorCode, getErrorMessage } from '@/services/api-client';
import { correctOdometer } from '../api';
import type { MaintenanceProfile } from '../types';
import styles from './VehicleMaintenanceWorkspace.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';

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
  const fmt = useAppFormat();

  const { message } = App.useApp();
  const t = useTranslations('Maintenance');
  const tCommon = useTranslations('Common');
  const domainLabel = useDomainLabel();
  const reasonOptions = ODOMETER_CORRECTION_REASON_VALUES.map((value) => ({
    value,
    label: domainLabel('odometerCorrectionReason', value),
  }));
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
      message.success(t('odometer.updated'));
      onSaved();
    } catch (err) {
      const code = getErrorCode(err);
      if (code === 'ODOMETER_DECREASE_FORBIDDEN') {
        message.error(t('odometer.decreaseForbidden'));
      } else if (code === 'CONFLICT') {
        message.error(t('odometer.stale'));
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
      title={t('odometer.title')}
      size="sm"
      mobileMode="fullscreen"
      confirmLoading={saving}
      onClose={handleClose}
      onOk={() => void handleSubmit(save)()}
      okText={isDecrease && !canDecrease ? t('odometer.okRequest') : t('odometer.okUpdate')}
      okDisabled={isDecrease && !canDecrease}
      cancelText={tCommon('actions.cancel')}
    >
      <div className={styles.correctionStack}>
        <div className={styles.currentBox}>
          <span className={styles.currentLabel}>{t('odometer.currentLabel')}</span>
          <strong className={styles.currentValue}>{fmt.km(currentKm)}</strong>
        </div>

        <Form component={false} layout="vertical" colon={false}>
          <NumberField
            control={control}
            name="odometerKm"
            label={t('odometer.newKm')}
            placeholder={t('odometer.newKmPlaceholder')}
            addonAfter="km"
            min={0}
            required
          />
          <SelectField
            control={control}
            name="reasonCode"
            label={t('odometer.reason')}
            options={reasonOptions}
            required
          />
          <TextAreaField
            control={control}
            name="reason"
            label={t('odometer.note')}
            placeholder={t('odometer.notePlaceholder')}
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
            message={t('odometer.decreaseAlert', { current: fmt.km(currentKm) })}
            description={
              canDecrease
                ? t('odometer.decreaseAllowed')
                : t('odometer.decreaseBlocked')
            }
          />
        ) : (
          <Alert
            type="info"
            showIcon
            message={t('odometer.auditNote')}
          />
        )}
      </div>
    </ResponsiveDialog>
  );
}
