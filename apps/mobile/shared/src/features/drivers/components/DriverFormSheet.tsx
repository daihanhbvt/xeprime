import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { DRIVER_TYPE, DRIVER_TYPE_VALUES } from '@xeprime/types';
import {
  editDriverSchema,
  inviteDriverSchema,
  type EditDriverValues,
  type InviteDriverValues,
} from '@xeprime/validators';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, space } from '@/theme/tokens';
import type { Driver } from '../api';
import { useInviteDriver, useUpdateDriver } from '../hooks/use-drivers';

const EMPTY_INVITE: InviteDriverValues = {
  phone: '',
  name: '',
  driverType: DRIVER_TYPE.STAFF,
  note: '',
};

function useTypeOptions() {
  const domainLabel = useDomainLabel();
  return useMemo(
    () => DRIVER_TYPE_VALUES.map((value) => ({ value, label: domainLabel('driverType', value) })),
    [domainLabel],
  );
}

/**
 * Hàng nút cuối form theo khuôn thanh đặt xe của app KHÁCH: hai nút chia đều, lối thoát `outline`
 * bên TRÁI, hành động chính `gradient` bên PHẢI (người dùng chốt 10/11/2026).
 */
function FormActions({
  saving,
  submitLabel,
  onClose,
  onSubmit,
}: {
  saving: boolean;
  submitLabel: string;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const tApp = useTranslations('Drivers.app.invite');
  // Figma "Thêm tài xế mới" `24512:117959`: "Hủy" viền vừa chữ bên trái, nút chính vàng trải phần còn lại.
  return (
    <XStack gap={12}>
      <Button label={tApp('cancel')} variant="outline" block={false} disabled={saving} onPress={onClose} />
      <YStack f={1}>
        <Button label={submitLabel} variant="gradient" loading={saving} onPress={onSubmit} />
      </YStack>
    </XStack>
  );
}

/**
 * MỜI tài xế bằng SĐT (ADR 0063) — bản native của `InviteDriverModal`. Tài xế là TÀI KHOẢN KHÁCH
 * đã xác minh; chưa có thì server trả `DRIVER_ACCOUNT_NOT_FOUND` và câu lỗi hiện NGAY trong tấm
 * (không chỉ toast) — nó nói rõ việc cần làm: nhờ tài xế đăng ký bằng đúng số đó.
 */
export function InviteDriverSheet({
  open,
  onClose,
  prefill,
}: {
  open: boolean;
  onClose: () => void;
  /** "Mời lại" một liên kết đã đóng — điền sẵn SĐT/tên/loại/ghi chú của liên kết cũ. */
  prefill?: InviteDriverValues | null;
}) {
  const t = useTranslations('Drivers.form');
  const tApp = useTranslations('Drivers.app.invite');
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      chrome="v2"
      headerDivider
      title={prefill ? t('titleReinvite') : tApp('title')}
      subtitle={tApp('subtitle')}
    >
      {/* Mount theo `open`: mỗi lần mở là một form mới, lỗi của lần mời trước không ở lại. */}
      {open ? <InviteForm onDone={onClose} defaults={prefill ?? EMPTY_INVITE} /> : null}
    </BottomSheet>
  );
}

function InviteForm({ onDone, defaults }: { onDone: () => void; defaults: InviteDriverValues }) {
  const t = useTranslations('Drivers');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const invite = useInviteDriver();
  const typeOptions = useTypeOptions();

  const resolver = useValidationResolver<InviteDriverValues>(
    inviteDriverSchema,
    'Drivers.form.errors',
  );
  const { control, handleSubmit } = useForm<InviteDriverValues>({
    resolver,
    defaultValues: defaults,
  });

  const submit = handleSubmit((values) => {
    if (invite.isPending) return;
    invite.mutate(
      {
        phone: values.phone.trim(),
        name: values.name.trim(),
        driverType: values.driverType,
        ...(values.note.trim() ? { note: values.note.trim() } : {}),
      },
      {
        onSuccess: () => {
          toast.showSuccess(t('toast.invited'));
          onDone();
        },
      },
    );
  });

  return (
    <YStack gap={space.md}>
      {invite.isError ? <Callout tone="danger">{errorMessage(invite.error)}</Callout> : null}
      <TextField
        control={control}
        name="phone"
        label={t('form.phone')}
        placeholder={t('form.phonePlaceholder')}
        keyboardType="phone-pad"
        autoComplete="tel"
        required
      />
      <TextField
        control={control}
        name="name"
        label={t('form.name')}
        placeholder={t('form.namePlaceholder')}
        required
      />
      <SelectField
        control={control}
        name="driverType"
        label={t('form.type')}
        required
        options={typeOptions}
      />
      <TextField
        control={control}
        name="note"
        label={t('form.note')}
        placeholder={t('form.notePlaceholder')}
        multiline scrollable
        rows={3}
      />
      {/* Khối "Lưu ý" cuối form như web `InviteDriverModal` (tiêu đề + mô tả). */}
      <Callout title={t('form.hintTitle')}>{t('form.inviteHint')}</Callout>
      <FormActions
        saving={invite.isPending}
        submitLabel={t('app.invite.submit')}
        onClose={onDone}
        onSubmit={() => void submit()}
      />
    </YStack>
  );
}

/** SỬA một liên kết — SĐT không đổi được (mời lại là một liên kết mới). Bản native `EditDriverModal`. */
export function EditDriverSheet({
  driver,
  onClose,
}: {
  driver: Driver | null;
  onClose: () => void;
}) {
  const t = useTranslations('Drivers.form');
  return (
    <BottomSheet open={driver !== null} onClose={onClose} chrome="v2" headerDivider title={t('titleEdit')}>
      {driver ? <EditForm key={driver.id} driver={driver} onDone={onClose} /> : null}
    </BottomSheet>
  );
}

function EditForm({ driver, onDone }: { driver: Driver; onDone: () => void }) {
  const colors = useColors();
  const t = useTranslations('Drivers');
  const tActions = useTranslations('Common.actions');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const update = useUpdateDriver();
  const typeOptions = useTypeOptions();

  const resolver = useValidationResolver<EditDriverValues>(editDriverSchema, 'Drivers.form.errors');
  const { control, handleSubmit } = useForm<EditDriverValues>({
    resolver,
    defaultValues: { name: driver.name, driverType: driver.driverType, note: driver.note ?? '' },
  });

  const submit = handleSubmit((values) => {
    if (update.isPending) return;
    update.mutate(
      {
        id: driver.id,
        body: {
          name: values.name.trim(),
          driverType: values.driverType,
          note: values.note.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast.showSuccess(t('toast.updated'));
          onDone();
        },
      },
    );
  });

  return (
    <YStack gap={space.md}>
      {update.isError ? <Callout tone="danger">{errorMessage(update.error)}</Callout> : null}
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {driver.phone}
      </Text>
      <TextField
        control={control}
        name="name"
        label={t('form.name')}
        placeholder={t('form.namePlaceholder')}
        required
      />
      <SelectField
        control={control}
        name="driverType"
        label={t('form.type')}
        required
        options={typeOptions}
      />
      <TextField control={control} name="note" label={t('form.note')} multiline scrollable rows={3} />
      <FormActions
        saving={update.isPending}
        submitLabel={tActions('save')}
        onClose={onDone}
        onSubmit={() => void submit()}
      />
    </YStack>
  );
}
