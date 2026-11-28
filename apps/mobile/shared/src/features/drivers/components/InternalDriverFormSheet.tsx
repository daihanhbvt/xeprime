import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import { useController, useForm, type Control } from 'react-hook-form';
import { ActivityIndicator, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import {
  EXTERNAL_DRIVER_NAME_LENGTH,
  IMAGE_UPLOAD_MAX_BYTES,
  INTERNAL_DRIVER_NOTE_MAX,
  VN_MOBILE_PHONE_PATTERN,
  compactPhoneInput,
  normalizeVnPhoneInput,
} from '@xeprime/types';
import { LineIcon } from '@/components/icons/LineIcon';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SheetConfirmFooter } from '@/components/ui/SheetConfirmFooter';
import { TextField } from '@/components/ui/TextField';
import { useImageUpload } from '@/components/ui/use-image-upload';
import { uploadsApi } from '@/api/uploads/api';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space, typeScale } from '@/theme/tokens';
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
  const tCommon = useTranslations('Common.actions');
  /* Chân tấm cố định (khuôn "Thêm tài xế mới") gọi lượt gửi của form qua ref. */
  const submitRef = useRef<() => void>(NOOP);
  const [saving, setSaving] = useState(false);
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      chrome="v2"
      headerDivider
      title={driver ? t('editTitle') : t('title')}
      footer={
        <SheetConfirmFooter
          backLabel={tCommon('cancel')}
          onBack={onClose}
          confirmLabel={driver ? t('save') : t('submit')}
          onConfirm={() => submitRef.current()}
          tone="primary"
          loading={saving}
        />
      }
    >
      {open ? (
        <InternalDriverForm
          driver={driver}
          onDone={(saved) => {
            onClose();
            onSaved?.(saved);
          }}
          onCancel={onClose}
          submitRef={submitRef}
          onSaving={setSaving}
        />
      ) : null}
    </BottomSheet>
  );
}

const NOOP = () => undefined;

/**
 * Thân form — dùng lại trong tấm "Thêm tài xế mới" (tab Tài xế nội bộ). Có `submitRef` thì nút nằm
 * ở CHÂN TẤM cố định của nơi gọi; không có thì form tự vẽ hàng nút cuối.
 */
export function InternalDriverForm({
  driver,
  onDone,
  onCancel,
  submitRef,
  onSaving,
}: {
  driver: InternalDriver | null;
  onDone: (saved: InternalDriver) => void;
  onCancel: () => void;
  submitRef?: MutableRefObject<() => void>;
  onSaving?: (saving: boolean) => void;
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

  useEffect(() => {
    if (submitRef) submitRef.current = () => void submit();
  });
  useEffect(() => {
    onSaving?.(pending);
    return () => onSaving?.(false);
  }, [pending, onSaving]);

  return (
    <YStack gap={space.md}>
      <DriverPhotoField control={control} disabled={pending} />
      <TextField
        control={control}
        name="phone"
        label={t('add.internal.phone')}
        placeholder={t('add.internal.phonePlaceholder')}
        keyboardType="phone-pad"
      />
      <TextField
        control={control}
        name="name"
        label={t('add.internal.name')}
        placeholder={t('add.internal.namePlaceholder')}
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
      {submitRef ? null : (
        <SheetConfirmFooter
          backLabel={tCommon('cancel')}
          onBack={onCancel}
          confirmLabel={driver ? t('add.internal.save') : t('add.internal.submit')}
          onConfirm={() => void submit()}
          tone="primary"
          loading={pending}
        />
      )}
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

  /*
   * Bản app (người dùng 28/11/2026): ảnh tròn ở GIỮA đầu form - trống thì viền đứt + máy ảnh, có ảnh
   * thì huy hiệu máy ảnh vàng ở góc. Chạm ảnh mở tấm chọn ảnh (thư viện / chụp / xoá ảnh).
   */
  return (
    <YStack ai="center" gap={space.sm} accessibilityLabel={t('photo')}>
      <Pressable
        onPress={upload.open}
        disabled={disabled || upload.busy}
        accessibilityRole="button"
        accessibilityLabel={url ? t('photoChange') : t('photoAdd')}
      >
        <YStack w={PHOTO} h={PHOTO}>
          {url ? (
            <Avatar name="" url={url} size={PHOTO} />
          ) : (
            <YStack
              w={PHOTO}
              h={PHOTO}
              br={radius.pill}
              bw={1}
              borderStyle="dashed"
              bc={colors.borderInput}
              bg={colors.background}
              ai="center"
              jc="center"
            >
              <LineIcon name="camera" size={iconSize.lg} color={colors.placeholder} />
            </YStack>
          )}
          {url || upload.busy ? (
            <YStack
              position="absolute"
              right={0}
              bottom={0}
              w={BADGE}
              h={BADGE}
              br={radius.pill}
              bg={colors.primary}
              bw={2}
              bc={colors.surface}
              ai="center"
              jc="center"
            >
              {upload.busy ? (
                <ActivityIndicator size="small" color={colors.surface} />
              ) : (
                <LineIcon name="camera" size={iconSize.sm} color={colors.surface} />
              )}
            </YStack>
          ) : null}
        </YStack>
      </Pressable>
      <YStack ai="center" gap={2}>
        <Text col={colors.text} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.medium}>
          {url ? t('photoChange') : t('photoAdd')}
        </Text>
        <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} ta="center">
          {t('photoHint', { maxMb: PHOTO_MAX_MB })}
        </Text>
      </YStack>
      {upload.sheet}
    </YStack>
  );
}

const PHOTO = 88;
const BADGE = 28;
const PHOTO_MAX_MB = Math.round(IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024));
