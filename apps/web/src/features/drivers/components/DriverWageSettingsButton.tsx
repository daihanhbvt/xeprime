'use client';

import { ReloadOutlined, WalletOutlined } from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App, Button, Skeleton, Tooltip } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import * as yup from 'yup';
import { MONEY_STEP_VND, PERMISSION } from '@xeprime/types';
import { DialogForm } from '@/components/form/DialogForm';
import { NumberField } from '@/components/form/NumberField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useDriverWageSettings, useUpdateDriverWageSettings } from '../hooks/use-drivers';
import type { DriverWageSettings } from '../types';
import styles from './DriverWageSettingsButton.module.css';

/**
 * Tiền công tài xế/ngày — MỨC CHUNG của gian hàng (ADR 0075): một số cho mọi xe, tự điền khi gán
 * tài xế (× số ngày của chuyến) và sửa được cho từng chuyến; hộp gán/sửa cũng đổi được mức này
 * ("chuyến này và các chuyến gán sau"). XePrime chỉ ghi nhận: chủ xe trả trực tiếp cho tài xế. Đổi
 * số này không viết lại các chuyến đã gán.
 *
 * Design màn Tài xế (04/11/2026) không vẽ chỗ cho nó — chốt cùng ngày: một nút viền cạnh "Mời tài
 * xế mới", lời giải thích nằm ở tooltip. Chưa đặt thì nút mang sắc cảnh báo (gán tay phải nhập
 * số, xe "Đặt ngay" không tự gán tài xế) và KHÔNG có số nào được gán sẵn: mức gợi ý của nền tảng
 * chỉ hiện trong lời nhắc và một nút điền nhanh trong hộp nhập.
 */
export function DriverWageSettingsButton() {
  const t = useTranslations('Drivers.wage.settings');
  const tCommon = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const { has } = usePermissions();
  const settings = useDriverWageSettings();
  const [editing, setEditing] = useState(false);
  const canManage = has(PERMISSION.DRIVER_MANAGE);

  if (settings.isLoading) return <Skeleton.Button active size="large" className={styles.skeleton} />;
  if (settings.isError || !settings.data) {
    return (
      <Tooltip title={t('loadError')}>
        <Button size="large" icon={<ReloadOutlined />} onClick={() => void settings.refetch()}>
          {tCommon('retry')}
        </Button>
      </Tooltip>
    );
  }

  const data = settings.data;
  const label = data.dailyWage
    ? t('button', { amount: fmt.money(data.dailyWage) })
    : canManage
      ? t('unsetButton')
      : t('unset');
  const tooltip = data.dailyWage
    ? t('hint')
    : t('unsetHint', { suggested: fmt.money(data.suggestedDaily) });

  return (
    <>
      <Tooltip title={tooltip}>
        {canManage ? (
          <Button
            size="large"
            icon={<WalletOutlined />}
            {...(data.dailyWage ? {} : { color: 'orange' as const, variant: 'outlined' as const })}
            onClick={() => setEditing(true)}
          >
            {label}
          </Button>
        ) : (
          // Chỉ xem: cùng dáng nút nhưng không bấm được — số vẫn đọc được, lời giải thích vẫn ở tooltip.
          <span className={data.dailyWage ? styles.readOnly : cx(styles.readOnly, styles.readOnlyUnset)} tabIndex={0}>
            <WalletOutlined aria-hidden />
            {label}
          </span>
        )}
      </Tooltip>
      {/* Dựng có điều kiện: mỗi lần mở là một form mới với số đang lưu. */}
      {editing ? <DriverWageSettingsDialog settings={data} onClose={() => setEditing(false)} /> : null}
    </>
  );
}

function DriverWageSettingsDialog({
  settings,
  onClose,
}: {
  settings: DriverWageSettings;
  onClose: () => void;
}) {
  const t = useTranslations('Drivers.wage.settings');
  const fmt = useAppFormat();
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const save = useUpdateDriverWageSettings();
  const min = Number(settings.wageDaily.min);
  const max = Number(settings.wageDaily.max);
  const rangeValues = { min: fmt.money(settings.wageDaily.min), max: fmt.money(settings.wageDaily.max) };

  // Schema dựng trong component: câu lỗi theo ngôn ngữ của request, khoảng theo chính sách hiện hành.
  const schema = useMemo(
    () =>
      yup.object({
        dailyWage: yup
          .number()
          .typeError(t('errors.required'))
          .required(t('errors.required'))
          .min(min, t('errors.range', rangeValues))
          .max(max, t('errors.range', rangeValues))
          .test('step', t('errors.step'), (v) => v == null || v % MONEY_STEP_VND === 0),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rangeValues dẫn xuất từ min/max
    [t, min, max],
  );
  type Values = yup.InferType<typeof schema>;
  const { control, handleSubmit, reset, setValue } = useForm<Values>({
    resolver: yupResolver(schema),
    defaultValues: { dailyWage: settings.dailyWage ? Number(settings.dailyWage) : undefined },
  });
  useEffect(() => {
    reset({ dailyWage: settings.dailyWage ? Number(settings.dailyWage) : undefined });
  }, [settings.dailyWage, reset]);

  function submit(values: Values) {
    if (save.isPending) return;
    save.mutate(
      { dailyWage: String(values.dailyWage) },
      {
        onSuccess: () => {
          message.success(t('saved'));
          onClose();
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  function clear() {
    if (save.isPending) return;
    save.mutate(
      { dailyWage: null },
      {
        onSuccess: () => {
          message.success(t('cleared'));
          onClose();
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  return (
    <ResponsiveDialog
      title={t('dialogTitle')}
      open
      onClose={onClose}
      size="sm"
      onOk={() => void handleSubmit(submit)()}
      confirmLoading={save.isPending}
    >
      <DialogForm className={styles.form} onSubmit={(e) => void handleSubmit(submit)(e)}>
        <NumberField
          control={control}
          name="dailyWage"
          label={t('field')}
          money
          min={0}
          required
          placeholder={t('placeholder', { amount: fmt.count(Number(settings.suggestedDaily)) })}
          help={t('range', rangeValues)}
        />
        {settings.dailyWage ? null : (
          <Button
            type="link"
            className={styles.linkAction}
            onClick={() =>
              setValue('dailyWage', Number(settings.suggestedDaily), { shouldValidate: true, shouldDirty: true })
            }
          >
            {t('useSuggested', { amount: fmt.money(settings.suggestedDaily) })}
          </Button>
        )}
        <Alert type="info" showIcon title={t('appliesNext')} />
        {settings.dailyWage ? (
          <Button type="link" danger className={styles.linkAction} onClick={clear} disabled={save.isPending}>
            {t('clear')}
          </Button>
        ) : null}
      </DialogForm>
    </ResponsiveDialog>
  );
}
