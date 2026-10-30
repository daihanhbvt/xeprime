import { useMemo } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { EXTERNAL_DRIVER_NAME_LENGTH } from '@xeprime/types';
import { buildExternalDriverSchema, type ExternalDriverFormValues } from '@xeprime/validators';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { TextField } from '@/components/ui/TextField';
import { useErrorMessage } from '@/i18n/use-error-message';
import { space } from '@/theme/tokens';
import { useAssignDriver } from '../hooks/use-bookings';

const EMPTY: ExternalDriverFormValues = { name: '', phone: '' };

/**
 * Ghi / sửa tài xế NGOÀI HỆ THỐNG trên một đơn — bản native của web `ExternalDriverDialog`
 * (ADR 0067): tên + SĐT di động, không tài khoản, coi là đã nhận ngay khi lưu. Đơn đang có tài xế
 * liên kết thì người đó bị gỡ và được báo — tấm này nói trước điều đó.
 *
 * Nơi gọi mount CÓ ĐIỀU KIỆN: mỗi lần mở là một form mới (`useForm` chốt mặc định một lần), không
 * mang lượt nhập dở hay lỗi lần trước sang — cùng ý với `reset` mỗi lần mở của web.
 */
export function ExternalDriverSheet({
  bookingId,
  current,
  replacingLinkedName,
  onClose,
}: {
  bookingId: string;
  /** Tài xế ngoài hệ thống đang ghi trên đơn — điền sẵn khi sửa. */
  current: ExternalDriverFormValues | null;
  /** Tên tài xế LIÊN KẾT đang gán (sẽ bị gỡ khi lưu) — `null` khi không có. */
  replacingLinkedName: string | null;
  onClose: () => void;
}) {
  const t = useTranslations('Drivers.booking');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const assign = useAssignDriver(bookingId);

  const schema = useMemo(
    () =>
      buildExternalDriverSchema({
        nameRequired: t('externalForm.nameRequired'),
        nameLength: t('externalForm.nameLength', {
          min: EXTERNAL_DRIVER_NAME_LENGTH.MIN,
          max: EXTERNAL_DRIVER_NAME_LENGTH.MAX,
        }),
        phoneRequired: t('externalForm.phoneRequired'),
        phoneInvalid: t('externalForm.phoneInvalid'),
      }),
    [t],
  );
  const { control, handleSubmit } = useForm<ExternalDriverFormValues>({
    resolver: yupResolver(schema),
    defaultValues: current ?? EMPTY,
  });

  const submit = handleSubmit((values) => {
    if (assign.isPending) return;
    assign.mutate(
      { externalDriver: { name: values.name, phone: values.phone } },
      {
        onSuccess: () => {
          toast.showSuccess(t('externalSaved'));
          onClose();
        },
      },
    );
  });

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={t('externalForm.title')}
      footer={
        <Button
          label={t('externalForm.save')}
          loading={assign.isPending}
          onPress={() => void submit()}
        />
      }
    >
      <YStack gap={space.sm}>
        <Callout tone="info">{t('externalForm.hint')}</Callout>
        {replacingLinkedName ? (
          <Callout
            tone="warning"
            title={t('externalForm.replaceLinked', { name: replacingLinkedName })}
          />
        ) : null}
        {assign.isError ? <Callout tone="danger">{errorMessage(assign.error)}</Callout> : null}
      </YStack>
      <TextField
        control={control}
        name="name"
        label={t('externalForm.name')}
        placeholder={t('externalForm.namePlaceholder')}
        autoComplete="off"
      />
      <TextField
        control={control}
        name="phone"
        label={t('externalForm.phone')}
        placeholder={t('externalForm.phonePlaceholder')}
        keyboardType="phone-pad"
        autoComplete="off"
      />
    </BottomSheet>
  );
}
