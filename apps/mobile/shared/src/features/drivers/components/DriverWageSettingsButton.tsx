import { useMemo, useState } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import { MONEY_STEP_VND, PERMISSION } from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { IconSquareButton } from '@/components/ui/IconSquareButton';
import { LineIcon } from '@/components/icons/LineIcon';
import { InfoHint } from '@/components/ui/InfoHint';
import { useColors } from '@/theme/ThemeProvider';
import { iconSize } from '@/theme/tokens';
import { InlineAction } from '@/components/ui/InlineAction';
import { MoneyField } from '@/components/ui/MoneyField';
import { SkeletonText } from '@/components/ui/Skeleton';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import type { DriverWageSettings } from '../api';
import { useDriverWageSettings, useUpdateDriverWageSettings } from '../hooks/use-drivers';

/**
 * Mức tiền công/ngày CHUNG (ADR 0075) — NÚT viền ở hàng tiêu đề cạnh "Mời tài xế", đúng web
 * `DriverWageSettingsButton` (ledger §3.7 #9): "Tiền công: 400.000đ/ngày"; chưa đặt thì sắc cảnh
 * báo ("Đặt tiền công/ngày"). Native không có tooltip nên lời giải thích nằm ở nhãn trợ năng
 * và trong tấm sửa. Chỉ xem (thiếu `drivers.manage`) ⇒ nút không bấm được nhưng số vẫn đọc được.
 */
export function DriverWageSettingsButton({ iconOnly = false }: { iconOnly?: boolean } = {}) {
  const t = useTranslations('Drivers.wage.settings');
  const tCommon = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const colors = useColors();
  const permissions = usePermissions();
  const settings = useDriverWageSettings();
  const [editing, setEditing] = useState(false);
  const canManage = permissions.has(PERMISSION.DRIVER_MANAGE);

  if (settings.isLoading) return iconOnly ? null : <SkeletonText lines={1} />;
  if (settings.isError || !settings.data) {
    return (
      <Button
        label={tCommon('retry')}
        icon="refresh-outline"
        variant="outline"
        size="sm"
        block={false}
        accessibilityLabel={`${t('loadError')} ${tCommon('retry')}`}
        onPress={() => void settings.refetch()}
      />
    );
  }

  const data = settings.data;
  const label = data.dailyWage
    ? t('button', { amount: fmt.money(data.dailyWage) })
    : canManage
      ? t('unsetButton')
      : t('unset');
  const hint = data.dailyWage
    ? t('hint')
    : t('unsetHint', { suggested: fmt.money(data.suggestedDaily) });

  if (iconOnly) {
    return (
      <>
        <IconSquareButton
          label={`${label}. ${hint}`}
          {...(canManage ? {} : { disabled: true })}
          onPress={() => setEditing(true)}
        >
          <LineIcon name="wallet" size={iconSize.lg} color={colors.text} />
        </IconSquareButton>
        {editing ? <DriverWageSettingsSheet settings={data} onClose={() => setEditing(false)} /> : null}
      </>
    );
  }

  return (
    <>
      <Button
        label={label}
        lineIcon="wallet"
        variant={data.dailyWage ? 'secondary' : 'outline'}
        size="sm"
        block={false}
        disabled={!canManage}
        accessibilityLabel={`${label}. ${hint}`}
        onPress={() => setEditing(true)}
      />
      {/* Dựng có điều kiện: mỗi lần mở là một form mới với số đang lưu. */}
      {editing ? (
        <DriverWageSettingsSheet settings={data} onClose={() => setEditing(false)} />
      ) : null}
    </>
  );
}

function DriverWageSettingsSheet({
  settings,
  onClose,
}: {
  settings: DriverWageSettings;
  onClose: () => void;
}) {
  const t = useTranslations('Drivers.wage.settings');
  const tCommon = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const save = useUpdateDriverWageSettings();
  const min = Number(settings.wageDaily.min);
  const max = Number(settings.wageDaily.max);

  const schema = useMemo(() => {
    const range = { min: fmt.money(String(min)), max: fmt.money(String(max)) };
    return yup.object({
      dailyWage: yup
        .number()
        .typeError(t('errors.required'))
        .required(t('errors.required'))
        .min(min, t('errors.range', range))
        .max(max, t('errors.range', range))
        .test('step', t('errors.step'), (v) => v == null || v % MONEY_STEP_VND === 0),
    });
  }, [t, fmt, min, max]);
  type Values = yup.InferType<typeof schema>;
  const { control, handleSubmit, setValue } = useForm<Values>({
    resolver: yupResolver(schema),
    defaultValues: { dailyWage: settings.dailyWage ? Number(settings.dailyWage) : undefined },
  });

  const submit = handleSubmit((values) => {
    if (save.isPending) return;
    save.mutate(
      { dailyWage: String(values.dailyWage) },
      {
        onSuccess: () => {
          toast.showSuccess(t('saved'));
          onClose();
        },
        onError: (err) => toast.showError(errorMessage(err)),
      },
    );
  });

  function clear() {
    if (save.isPending) return;
    save.mutate(
      { dailyWage: null },
      {
        onSuccess: () => {
          toast.showSuccess(t('cleared'));
          onClose();
        },
        onError: (err) => toast.showError(errorMessage(err)),
      },
    );
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={t('dialogTitle')}
      // "Áp dụng cho các lượt gán sau…" nằm trong ⓘ cạnh tiêu đề (người dùng 28/11/2026).
      titleAdornment={<InfoHint content={t('appliesNext')} label={t('dialogTitle')} />}
      footer={
        <Button
          variant="gradient"
          label={tCommon('save')}
          loading={save.isPending}
          onPress={() => void submit()}
        />
      }
    >
      <MoneyField
        control={control}
        name="dailyWage"
        label={t('field')}
        required
        placeholder={t('placeholder', { amount: fmt.count(Number(settings.suggestedDaily)) })}
        hint={t('range', {
          min: fmt.money(settings.wageDaily.min),
          max: fmt.money(settings.wageDaily.max),
        })}
      />
      {settings.dailyWage ? null : (
        <InlineAction
          label={t('useSuggested', { amount: fmt.money(settings.suggestedDaily) })}
          onPress={() =>
            setValue('dailyWage', Number(settings.suggestedDaily), {
              shouldValidate: true,
              shouldDirty: true,
            })
          }
        />
      )}
      {settings.dailyWage ? (
        <Button
          label={t('clear')}
          variant="ghostDanger"
          disabled={save.isPending}
          onPress={clear}
        />
      ) : null}
    </BottomSheet>
  );
}
