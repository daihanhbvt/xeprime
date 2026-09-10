import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { DRIVER_TYPE, DRIVER_TYPE_VALUES } from '@xeprime/types';
import { driverFormSchema, type DriverFormValues } from '@xeprime/validators';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { DateField } from '@/components/ui/DateField';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { space } from '@/theme/tokens';
import type { Driver } from '../api';
import { useCreateDriver, useUpdateDriver } from '../hooks/use-drivers';

const EMPTY: DriverFormValues = {
  name: '',
  phone: '',
  driverType: DRIVER_TYPE.STAFF,
  licenseNo: '',
  licenseExpiresAt: null,
  idNo: '',
  note: '',
};

function toValues(driver: Driver): DriverFormValues {
  return {
    name: driver.name,
    phone: driver.phone,
    driverType: driver.driverType,
    licenseNo: driver.licenseNo ?? '',
    licenseExpiresAt: driver.licenseExpiresAt ?? null,
    idNo: driver.idNo ?? '',
    note: driver.note ?? '',
  };
}

/**
 * Hồ sơ tài xế — MỘT tấm trượt cho cả thêm lẫn sửa (bản native của `DriverFormModal`).
 *
 * Đổi trạng thái hoạt động và xoá nằm ở hàng thao tác của THẺ, không nhét vào form: chúng là
 * hành động vòng đời đi bằng endpoint riêng, và trộn vào form nghĩa là một lần bấm Lưu vô tình
 * bật lại một tài xế vừa bị ngừng.
 */
export function DriverFormSheet({
  open,
  driver,
  onClose,
}: {
  open: boolean;
  /** `null` = thêm mới; có giá trị = sửa hồ sơ đó. */
  driver: Driver | null;
  onClose: () => void;
}) {
  const t = useTranslations('Drivers.form');

  return (
    <BottomSheet open={open} onClose={onClose} title={driver ? t('titleEdit') : t('titleCreate')}>
      {open ? <DriverForm key={driver?.id ?? 'new'} driver={driver} onDone={onClose} /> : null}
    </BottomSheet>
  );
}

function DriverForm({ driver, onDone }: { driver: Driver | null; onDone: () => void }) {
  const t = useTranslations('Drivers');
  const tForm = useTranslations('Drivers.form');
  const tActions = useTranslations('Common.actions');
  const toast = useAppToast();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const create = useCreateDriver();
  const update = useUpdateDriver();
  const saving = create.isPending || update.isPending;

  const resolver = useValidationResolver<DriverFormValues>(driverFormSchema, 'Drivers.form.errors');
  const { control, handleSubmit } = useForm<DriverFormValues>({
    resolver,
    defaultValues: driver ? toValues(driver) : EMPTY,
  });

  const typeOptions = useMemo(
    () => DRIVER_TYPE_VALUES.map((value) => ({ value, label: domainLabel('driverType', value) })),
    [domainLabel],
  );

  const submit = handleSubmit((values) => {
    const body = {
      name: values.name.trim(),
      phone: values.phone.trim(),
      driverType: values.driverType,
      licenseNo: values.licenseNo.trim() || null,
      licenseExpiresAt: values.licenseExpiresAt || null,
      idNo: values.idNo.trim() || null,
      note: values.note.trim() || null,
    };
    const done = {
      onSuccess: () => {
        toast.showSuccess(driver ? t('toast.updated') : t('toast.created'));
        onDone();
      },
      onError: (err: unknown) => toast.showError(errorMessage(err)),
    };
    if (driver) update.mutate({ id: driver.id, body }, done);
    else create.mutate(body, done);
  });

  return (
    <YStack gap={space.md}>
      <TextField
        control={control}
        name="name"
        label={tForm('name')}
        placeholder={tForm('namePlaceholder')}
        required
      />
      <TextField
        control={control}
        name="phone"
        label={tForm('phone')}
        placeholder={tForm('phonePlaceholder')}
        keyboardType="phone-pad"
        autoComplete="tel"
        required
      />
      <SelectField
        control={control}
        name="driverType"
        label={tForm('type')}
        options={typeOptions}
      />
      <TextField control={control} name="licenseNo" label={tForm('licenseNo')} />
      <DateField
        control={control}
        name="licenseExpiresAt"
        label={tForm('licenseExpiresAt')}
        hint={tForm('licenseExpiresAtPlaceholder')}
      />
      <TextField control={control} name="idNo" label={tForm('idNo')} />
      <TextField control={control} name="note" label={tForm('note')} multiline rows={3} />

      <Button
        label={driver ? tActions('save') : tActions('add')}
        loading={saving}
        onPress={() => void submit()}
      />
      <Button label={tActions('close')} variant="ghost" disabled={saving} onPress={onDone} />
    </YStack>
  );
}
