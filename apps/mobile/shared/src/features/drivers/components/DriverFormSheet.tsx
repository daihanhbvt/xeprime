import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { ActivityIndicator } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import {
  DRIVER_ROSTER_KIND,
  DRIVER_TYPE,
  DRIVER_TYPE_VALUES,
  VN_MOBILE_PHONE_PATTERN,
  compactPhoneInput,
  normalizeVnPhoneInput,
  type DriverRosterKind,
} from '@xeprime/types';
import {
  editDriverSchema,
  inviteDriverSchema,
  type EditDriverValues,
  type InviteDriverValues,
} from '@xeprime/validators';
import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { FIELD_V2, FieldLabel } from '@/components/ui/Field';
import { SelectField } from '@/components/ui/SelectField';
import { SheetConfirmFooter } from '@/components/ui/SheetConfirmFooter';
import { TextControl } from '@/components/ui/TextControl';
import { TextField } from '@/components/ui/TextField';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';
import type { Driver } from '../api';
import { useDriverAccountLookup, useInviteDriver, useUpdateDriver } from '../hooks/use-drivers';
import { InternalDriverForm } from './InternalDriverFormSheet';

/** Chờ người dùng ngừng gõ rồi mới tra tài khoản (web `LOOKUP_DEBOUNCE_MS`). */
const LOOKUP_DEBOUNCE_MS = 400;
/** Figma ô "Thông tin tài xế": ảnh tài khoản 24. */
const ACCOUNT_AVATAR = 24;

/**
 * Hộp mời mới (Figma `23737:46392`, web 25/11/2026) KHÔNG có ô tên: tên lưu là tên tài khoản tra
 * được. `name` chỉ còn mang tên cũ khi MỜI LẠI một liên kết đã đóng — ghi đè luật bắt buộc của
 * schema chung, đúng như web `makeInviteDriverSchema`.
 */
const inviteFormSchema = inviteDriverSchema.shape({
  name: yup.string().trim().max(255).default(''),
});

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
 * Tấm "Thêm tài xế mới" — native port of web `AddDriverModal` (25/11/2026): hai tab "Mời tài xế"
 * (tài khoản khách đã xác minh, ADR 0063) và "Tài xế nội bộ" (danh bạ không tài khoản, ADR 0108).
 * MỜI LẠI một liên kết đã đóng thì chỉ có form mời, không có tab.
 */
export function AddDriverSheet({
  open,
  onClose,
  prefill,
}: {
  open: boolean;
  onClose: () => void;
  prefill?: InviteDriverValues | null;
}) {
  const t = useTranslations('Drivers');
  const [tab, setTab] = useState<DriverRosterKind>(DRIVER_ROSTER_KIND.LINKED);
  /* Chân tấm cố định (Figma "Footer cố định") gọi lượt gửi của form đang hiện qua ref. */
  const submitRef = useRef<() => void>(NOOP);
  const [saving, setSaving] = useState(false);
  const close = () => {
    setTab(DRIVER_ROSTER_KIND.LINKED);
    onClose();
  };
  const active = prefill ? DRIVER_ROSTER_KIND.LINKED : tab;
  const linked = active === DRIVER_ROSTER_KIND.LINKED;
  const tabs = useMemo(
    () => [
      { key: DRIVER_ROSTER_KIND.LINKED, label: t('add.tabs.invite') },
      { key: DRIVER_ROSTER_KIND.INTERNAL, label: t('add.tabs.internal') },
    ],
    [t],
  );
  return (
    <BottomSheet
      open={open}
      onClose={close}
      chrome="v2"
      headerDivider
      title={prefill ? t('form.titleReinvite') : t('add.title')}
      /* Figma `24512:118654`: phụ đề chỉ có ở lượt MỜI (tài xế nội bộ không gửi gì cho XePrime). */
      {...(linked ? { subtitle: t('app.invite.subtitle') } : {})}
      footer={
        <SheetConfirmFooter
          backLabel={t('app.invite.cancel')}
          onBack={close}
          confirmLabel={linked ? t('add.invite.submit') : t('add.internal.submit')}
          onConfirm={() => submitRef.current()}
          tone="primary"
          loading={saving}
        />
      }
    >
      {/* Mount theo `open`: mỗi lần mở là một form mới, lỗi của lần trước không ở lại. */}
      {open ? (
        <YStack gap={space.md}>
          {prefill ? null : (
            <SegmentedTabs<DriverRosterKind> items={tabs} value={active} onChange={setTab} />
          )}
          {linked ? (
            <InviteForm
              onDone={close}
              defaults={prefill ?? EMPTY_INVITE}
              submitRef={submitRef}
              onSaving={setSaving}
            />
          ) : (
            <InternalDriverForm
              driver={null}
              onDone={close}
              onCancel={close}
              submitRef={submitRef}
              onSaving={setSaving}
            />
          )}
        </YStack>
      ) : null}
    </BottomSheet>
  );
}

const NOOP = () => undefined;

/**
 * MỜI tài xế bằng SĐT (ADR 0063) — bản native của `InviteDriverModal`. Tài xế là TÀI KHOẢN KHÁCH
 * đã xác minh; chưa có thì server trả `DRIVER_ACCOUNT_NOT_FOUND` và câu lỗi hiện NGAY trong tấm
 * (không chỉ toast) — nó nói rõ việc cần làm: nhờ tài xế đăng ký bằng đúng số đó.
 */
function InviteForm({
  onDone,
  defaults,
  submitRef,
  onSaving,
}: {
  onDone: () => void;
  defaults: InviteDriverValues;
  /** Chân tấm cố định của `AddDriverSheet` gọi lượt gửi qua ref này. */
  submitRef: MutableRefObject<() => void>;
  onSaving: (saving: boolean) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Drivers');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const invite = useInviteDriver();
  const typeOptions = useTypeOptions();

  const resolver = useValidationResolver<InviteDriverValues>(
    inviteFormSchema,
    'Drivers.form.errors',
  );
  const { control, handleSubmit } = useForm<InviteDriverValues>({
    resolver,
    defaultValues: defaults,
  });

  // Tra tài khoản khi SĐT đủ dạng di động VN (web `useInviteDriverForm`).
  const typed = useWatch({ control, name: 'phone' }) ?? '';
  const normalized = normalizeVnPhoneInput(compactPhoneInput(typed));
  const debounced = useDebouncedValue(
    VN_MOBILE_PHONE_PATTERN.test(normalized) ? normalized : null,
    LOOKUP_DEBOUNCE_MS,
  );
  const lookup = useDriverAccountLookup(debounced);
  const account = lookup.data?.found ? lookup.data : null;

  const submit = handleSubmit((values) => {
    if (invite.isPending) return;
    invite.mutate(
      {
        phone: values.phone.trim(),
        ...(values.name.trim() ? { name: values.name.trim() } : {}),
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

  useEffect(() => {
    submitRef.current = () => void submit();
  });
  useEffect(() => {
    onSaving(invite.isPending);
    return () => onSaving(false);
  }, [invite.isPending, onSaving]);

  /* Một chữ trong câu "Lưu ý" (Figma `24512:118931`): mỗi `Text` lồng khai lại đủ kiểu chữ. */
  const hintRun = (color: string) => (chunks: ReactNode) => (
    <Text col={color} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.semibold}>
      {chunks}
    </Text>
  );

  return (
    <YStack gap={space.md}>
      {invite.isError ? <Callout tone="danger">{errorMessage(invite.error)}</Callout> : null}
      {/* Figma không vẽ dấu * - luật bắt buộc vẫn ở schema (người dùng chốt 27/11/2026). */}
      <TextField
        control={control}
        name="phone"
        label={t('form.phone')}
        placeholder={t('form.phonePlaceholder')}
        keyboardType="phone-pad"
        autoComplete="tel"
      />
      <AccountLookupBox
        phone={debounced}
        loading={lookup.isFetching}
        failed={lookup.isError}
        account={account}
      />
      <SelectField control={control} name="driverType" label={t('form.type')} options={typeOptions} />
      <TextField
        control={control}
        name="note"
        label={t('form.note')}
        placeholder={t('form.notePlaceholder')}
        multiline scrollable
        rows={3}
      />
      {/* Figma `24512:118929`: nền `status/information-low`, không viền/icon; tiêu đề xanh 14 medium. */}
      <YStack p={NOTE_PAD} gap={NOTE_GAP} br={radius.control} bg={colors.infoLow}>
        <Text col={colors.infoStrong} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.medium}>
          {t('form.hintTitle')}
        </Text>
        <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
          {t.rich('form.inviteHintRich', {
            b: hintRun(colors.textMuted),
            link: hintRun(colors.infoStrong),
          })}
        </Text>
      </YStack>
    </YStack>
  );
}

/** Figma khối "Lưu ý": đệm 12, tiêu đề ↔ thân 4. */
const NOTE_PAD = 12;
const NOTE_GAP = 4;

/** SỬA một liên kết — SĐT không đổi được (mời lại là một liên kết mới). Bản native `EditDriverModal`. */
/**
 * Ô "Thông tin tài xế" của hộp mời — tên + ảnh tài khoản khách tra theo SĐT (web
 * `useInviteDriverForm.accountBox`): gợi ý nhập SĐT · đang tra · lỗi tra (vẫn mời được) · tìm thấy
 * (kèm cảnh báo đã liên kết) · không có tài khoản đã xác minh.
 */
function AccountLookupBox({
  phone,
  loading,
  failed,
  account,
}: {
  phone: string | null;
  loading: boolean;
  failed: boolean;
  account: { displayName?: string | null; avatarUrl?: string | null; alreadyLinked: boolean } | null;
}) {
  const colors = useColors();
  const t = useTranslations('Drivers.add.invite');
  // Figma `24612:140769`: ô chỉ đọc nền `bg/gray-50`, chữ 14/20; gợi ý `text/gray/very-low`.
  const hint = (text: string, tone: string = colors.textPlaceholder) => (
    <Text f={1} col={tone} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
      {text}
    </Text>
  );
  let body;
  if (!phone) body = hint(t('accountPlaceholder'));
  else if (loading)
    body = (
      <>
        <ActivityIndicator size="small" color={colors.primaryActive} />
        {hint(t('lookingUp'))}
      </>
    );
  else if (failed) body = hint(t('lookupError'));
  else if (account)
    body = (
      <>
        <Avatar name={account.displayName ?? ''} url={account.avatarUrl ?? null} size={ACCOUNT_AVATAR} />
        {/* Tên `text/gray/medium` rồi SĐT `text/gray/very-low` cùng một dòng, cách hai khoảng trắng. */}
        <Text f={1} col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} numberOfLines={1}>
          {account.displayName}
          <Text col={colors.textPlaceholder} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
            {`  ${phone}`}
          </Text>
        </Text>
      </>
    );
  else body = hint(t('notFound'), colors.danger);

  return (
    <YStack gap={FIELD_V2.labelGap} accessibilityLiveRegion="polite">
      <FieldLabel label={t('account')} />
      <XStack
        minHeight={FIELD_V2.height}
        px={FIELD_V2.padX}
        py={space.sm}
        ai="center"
        gap={space.sm}
        br={radius.control}
        bw={1}
        bc={colors.borderInput}
        bg={colors.background}
      >
        {body}
      </XStack>
      {account?.alreadyLinked ? hint(t('alreadyLinked'), colors.warningStrong) : null}
    </YStack>
  );
}

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
      {/* SĐT là định danh tài khoản liên kết - hiện như một ô KHOÁ cùng cỡ các ô khác (người dùng 28/11/2026). */}
      <TextControl label={t('form.phone')} value={driver.phone} onChangeText={() => undefined} editable={false} />
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
