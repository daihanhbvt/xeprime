'use client';

import { EditOutlined, WalletOutlined } from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App, Button, Skeleton } from 'antd';
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
import { useErrorMessage } from '@/i18n/use-error-message';
import { useDriverWageSettings, useUpdateDriverWageSettings } from '../hooks/use-drivers';
import type { DriverWageSettings } from '../types';
import styles from './DriverWageSettingsCard.module.css';

/**
 * Tiền công tài xế/ngày — MỨC CHUNG của gian hàng (ADR 0075): một số cho mọi xe, tự điền khi gán
 * tài xế (× số ngày của chuyến) và sửa được cho từng chuyến; hộp gán/sửa cũng đổi được mức này
 * ("chuyến này và các chuyến gán sau"). XePrime chỉ ghi nhận: chủ xe trả trực tiếp cho tài xế. Đổi
 * số này không viết lại các chuyến đã gán.
 *
 * Chưa đặt thì KHÔNG có số nào được gán sẵn: mức gợi ý của nền tảng chỉ hiện làm lời nhắc (và một
 * nút điền nhanh trong hộp nhập).
 */
export function DriverWageSettingsCard() {
  const t = useTranslations('Drivers.wage.settings');
  const tCommon = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const { has } = usePermissions();
  const settings = useDriverWageSettings();
  const [editing, setEditing] = useState(false);
  const canManage = has(PERMISSION.DRIVER_MANAGE);

  if (settings.isLoading) {
    return (
      <section className={styles.card}>
        <Skeleton active paragraph={{ rows: 1 }} />
      </section>
    );
  }
  if (settings.isError || !settings.data) {
    return (
      <Alert
        className={styles.card}
        type="error"
        showIcon
        title={t('loadError')}
        action={
          <Button size="small" onClick={() => void settings.refetch()}>
            {tCommon('retry')}
          </Button>
        }
      />
    );
  }

  const data = settings.data;
  return (
    <section className={styles.card} aria-label={t('title')}>
      <span className={styles.icon} aria-hidden>
        <WalletOutlined />
      </span>
      <div className={styles.body}>
        <span className={styles.label}>{t('title')}</span>
        <span className={data.dailyWage ? styles.value : styles.unset}>
          {data.dailyWage ? t('perDay', { amount: fmt.money(data.dailyWage) }) : t('unset')}
        </span>
        <span className={styles.hint}>
          {data.dailyWage
            ? t('hint')
            : t('unsetHint', { suggested: fmt.money(data.suggestedDaily) })}
        </span>
      </div>
      {canManage ? (
        <Button
          icon={<EditOutlined />}
          type={data.dailyWage ? 'default' : 'primary'}
          onClick={() => setEditing(true)}
        >
          {data.dailyWage ? t('edit') : t('set')}
        </Button>
      ) : null}
      {/* Dựng có điều kiện: mỗi lần mở là một form mới với số đang lưu. */}
      {editing ? <DriverWageSettingsDialog settings={data} onClose={() => setEditing(false)} /> : null}
    </section>
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
