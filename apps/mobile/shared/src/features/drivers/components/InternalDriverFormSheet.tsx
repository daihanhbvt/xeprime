import { useMemo } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import { useController, useForm, type Control } from 'react-hook-form';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import {
  EXTERNAL_DRIVER_NAME_LENGTH,
  INTERNAL_DRIVER_NOTE_MAX,
  VN_MOBILE_PHONE_PATTERN,
  compactPhoneInput,
  normalizeVnPhoneInput,
} from '@xeprime/types';
import { Ionicons } from '@/components/icons/Ionicons';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useImageUpload } from '@/components/ui/use-image-upload';
import { uploadsApi } from '@/api/uploads/api';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, iconSize, space } from '@/theme/tokens';
import type { InternalDriver } from '../api';
import { useCreateInternalDriver, useUpdateInternalDriver } from '../hooks/use-internal-drivers';

type DriversTranslate = ReturnType<typeof useTranslations<'Drivers'>>;

/** Native port of web `makeInternalDriverSchema` (`features/drivers/schema.ts`). */
function makeInternalDriverSchema(t: DriversTranslate) {
  return yup.object({
    name: yup
      .string()
      .trim()
      .required(t('internal.form.errors.nameRequired'))
      .min(EXTERNAL_DRIVER_NAME_LENGTH.MIN, t('internal.form.errors.nameShort'))
      .max(EXTERNAL_DRIVER_NAME_LENGTH.MAX)
      .default(''),
    phone: yup
      .string()
      .trim()
      .required(t('form.errors.phoneRequired'))
      .test('vn-mobile', t('form.errors.phoneInvalid'), (v) =>
        VN_MOBILE_PHONE_PATTERN.test(normalizeVnPhoneInput(v ?? '')),
      )
      .default(''),
    note: yup.string().trim().max(INTERNAL_DRIVER_NOTE_MAX).default(''),
    photoUrl: yup.string().nullable().default(null),
  });
}

type InternalDriverFormValues = yup.InferType<ReturnType<typeof makeInternalDriverSchema>>;

const EMPTY: InternalDriverFormValues = { name: '', phone: '', note: '', photoUrl: null };

/**
 * Tấm "Thêm / Sửa tài xế nội bộ" (ADR 0108) — native port of web `InternalDriverModal` +
 * `useInternalDriverForm`: ảnh (tuỳ chọn) · SĐT · họ tên · ghi chú. Sửa tên/SĐT không viết lại các
 * chuyến đã gán (snapshot) — nói rõ khi người này đang có chuyến.
 */
export function InternalDriverFormSheet({
  open,
  driver,
  onClose,
  onSaved,
}: {
  open: boolean;
  driver: InternalDriver | null;
  onClose: () => void;
  /** Sau khi lưu thành công (web `InternalDriverModal.onSaved`) — bộ chọn tài xế chọn luôn người mới. */
  onSaved?: (saved: InternalDriver) => void;
}) {
  const t = useTranslations('Drivers.add.internal');
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      chrome="v2"
      headerDivider
      title={driver ? t('editTitle') : t('title')}
    >
      {open ? (
        <InternalDriverForm
          driver={driver}
          onDone={(saved) => {
            onClose();
            onSaved?.(saved);
          }}
          onCancel={onClose}
        />
      ) : null}
    </BottomSheet>
  );
}

/** Thân form — dùng lại trong tấm "Thêm tài xế mới" (tab Tài xế nội bộ). */
export function InternalDriverForm({
  driver,
  onDone,
  onCancel,
}: {
  driver: InternalDriver | null;
  onDone: (saved: InternalDriver) => void;
  onCancel: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Drivers');
  const tCommon = useTranslations('Common.actions');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const create = useCreateInternalDriver();
  const update = useUpdateInternalDriver();
  const pending = create.isPending || update.isPending;

  const schema = useMemo(() => makeInternalDriverSchema(t), [t]);
  const { control, handleSubmit } = useForm<InternalDriverFormValues>({
    resolver: yupResolver(schema),
    defaultValues: driver
      ? {
          name: driver.name,
          phone: driver.phone,
          note: driver.note ?? '',
          photoUrl: driver.photoUrl ?? null,
        }
      : EMPTY,
  });

  const submit = handleSubmit((values) => {
    if (pending) return;
    const body = {
      name: values.name.trim(),
      phone: compactPhoneInput(values.phone),
      note: values.note.trim() || null,
      photoUrl: values.photoUrl ?? null,
    };
    const done = {
      onSuccess: (saved: InternalDriver) => {
        toast.showSuccess(driver ? t('internal.toast.updated') : t('internal.toast.created'));
        onDone(saved);
      },
      onError: (err: unknown) => toast.showError(errorMessage(err)),
    };
    if (driver) update.mutate({ id: driver.id, body }, done);
    else create.mutate(body, done);
  });

  return (
    <YStack gap={space.md}>
      <DriverPhotoField control={control} disabled={pending} />
      <TextField
        control={control}
        name="phone"
        label={t('add.internal.phone')}
        placeholder={t('add.internal.phonePlaceholder')}
        keyboardType="phone-pad"
        required
      />
      <TextField
        control={control}
        name="name"
        label={t('add.internal.name')}
        placeholder={t('add.internal.namePlaceholder')}
        required
      />
      <TextField
        control={control}
        name="note"
        label={t('add.internal.note')}
        placeholder={t('add.internal.notePlaceholder')}
        multiline
        scrollable
        rows={3}
        maxLength={INTERNAL_DRIVER_NOTE_MAX}
      />
      {driver && driver.activeTripCount > 0 ? (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('internal.form.snapshotNote', { count: driver.activeTripCount })}
        </Text>
      ) : null}
      <XStack gap={12}>
        <Button
          label={tCommon('cancel')}
          variant="outline"
          block={false}
          disabled={pending}
          onPress={onCancel}
        />
        <YStack f={1}>
          <Button
            label={driver ? t('add.internal.save') : t('add.internal.submit')}
            variant="gradient"
            loading={pending}
            onPress={() => void submit()}
          />
        </YStack>
      </XStack>
    </YStack>
  );
}

/**
 * Ảnh đại diện TUỲ CHỌN của tài xế nội bộ — native port of web `DriverPhotoField`: chọn thư viện /
 * chụp, tải lên kho ảnh của bên thuê (`/uploads/driver-photos/presign`), gỡ được.
 */
function DriverPhotoField({
  control,
  disabled,
}: {
  control: Control<InternalDriverFormValues>;
  disabled: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Drivers.add.internal');
  const { field } = useController({ control, name: 'photoUrl' });
  const url = field.value || null;
  const upload = useImageUpload({
    title: t('photo'),
    presign: uploadsApi.driverPhoto,
    onUploaded: (urls) => {
      const next = urls[urls.length - 1];
      if (next) field.onChange(next);
    },
    ...(url ? { onRemove: () => field.onChange(null) } : {}),
  });

  return (
    <XStack ai="center" gap={space.md} accessibilityLabel={t('photo')}>
      <Pressable
        onPress={upload.open}
        disabled={disabled || upload.busy}
        accessibilityRole="button"
        accessibilityLabel={url ? t('photoChange') : t('photoAdd')}
      >
        {url ? (
          <Avatar name="" url={url} size={64} />
        ) : (
          <YStack w={64} h={64} br={32} bg={colors.surfaceMuted} ai="center" jc="center">
            <Ionicons name="camera-outline" size={iconSize.lg} color={colors.placeholder} />
          </YStack>
        )}
      </Pressable>
      <YStack f={1} gap={space.xs}>
        <XStack gap={space.sm} ai="center">
          <Button
            label={url ? t('photoChange') : t('photoAdd')}
            variant="secondary"
            size="sm"
            block={false}
            loading={upload.busy}
            disabled={disabled}
            onPress={upload.open}
          />
          {url && !upload.busy ? (
            <Button
              label={t('photoRemove')}
              variant="ghostDanger"
              size="sm"
              block={false}
              disabled={disabled}
              onPress={() => field.onChange(null)}
            />
          ) : null}
        </XStack>
      </YStack>
      {upload.sheet}
    </XStack>
  );
}
