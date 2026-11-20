import { yupResolver } from '@hookform/resolvers/yup';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import { buildPasswordSchema } from '@xeprime/validators';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { InlineAction } from '@/components/ui/InlineAction';
import { TextField } from '@/components/ui/TextField';
import { useAuthSchemaLabels } from '@/features/auth/use-auth-schema-labels';
import { useErrorMessage } from '@/i18n/use-error-message';
import { space } from '@/theme/tokens';
import type { MemberRosterItem } from '../api';
import { useResetMemberPassword } from '../hooks/use-members';
import { generateStaffPassword } from '../staff-password';
import { StaffCredentials } from './StaffCredentials';

/**
 * Chủ ĐẶT LẠI mật khẩu cho tài khoản do gian hàng cấp (ADR 0087) — bản native của web
 * `ResetPasswordDialog`. Nhân viên không có SĐT để tự đặt lại bằng OTP. Server đăng xuất họ khỏi mọi
 * thiết bị; mật khẩu mới chỉ hiện một lần ở đây.
 */
export function ResetPasswordSheet({
  member,
  onClose,
}: {
  /** `null` = đóng. Gắn/tháo theo người để mỗi lần mở là form sạch + mật khẩu ngẫu nhiên mới. */
  member: MemberRosterItem | null;
  onClose: () => void;
}) {
  const t = useTranslations('Members');
  const [done, setDone] = useState<string | null>(null);
  const name = member?.displayName ?? member?.username ?? '';

  function finish() {
    setDone(null);
    onClose();
  }

  return (
    <BottomSheet
      open={member !== null}
      onClose={finish}
      title={done ? t('resetPassword.doneTitle') : t('resetPassword.title')}
      {...(done ? {} : { subtitle: t('resetPassword.subtitle', { name }) })}
    >
      {member ? (
        done ? (
          <YStack gap={space.md}>
            <StaffCredentials
              name={name}
              username={member.username ?? null}
              password={done}
              body={t('resetPassword.doneBody', { name })}
            />
            <Button label={t('staff.created.done')} onPress={finish} />
          </YStack>
        ) : (
          <ResetForm key={member.id} member={member} name={name} onDone={finish} onReset={setDone} />
        )
      ) : null}
    </BottomSheet>
  );
}

function ResetForm({
  member,
  name,
  onDone,
  onReset,
}: {
  member: MemberRosterItem;
  name: string;
  onDone: () => void;
  onReset: (password: string) => void;
}) {
  const t = useTranslations('Members');
  const tActions = useTranslations('Common.actions');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const authLabels = useAuthSchemaLabels();
  const reset = useResetMemberPassword();

  const schema = useMemo(
    () => yup.object({ password: buildPasswordSchema(authLabels) }),
    [authLabels],
  );
  type FormValues = yup.InferType<typeof schema>;
  const { control, handleSubmit, setValue } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: { password: generateStaffPassword() },
  });

  const submit = handleSubmit((values) => {
    if (!member.userId || reset.isPending) return;
    reset.mutate(
      { userId: member.userId, password: values.password },
      {
        onSuccess: () => {
          toast.showSuccess(t('roster.toast.passwordReset'));
          onReset(values.password);
        },
        onError: (err) => toast.showError(errorMessage(err)),
      },
    );
  });

  return (
    <YStack gap={space.md}>
      <Callout tone="warning">{t('resetPassword.notice', { name })}</Callout>
      <TextField
        control={control}
        name="password"
        label={t('staff.password')}
        placeholder={t('staff.passwordPlaceholder')}
        autoCapitalize="none"
        autoComplete="new-password"
        required
        suffix={
          <InlineAction
            label={t('staff.generate')}
            onPress={() =>
              setValue('password', generateStaffPassword(), { shouldValidate: true })
            }
          />
        }
      />
      <XStack gap={space.sm}>
        <YStack flexShrink={0}>
          <Button
            label={tActions('close')}
            variant="ghost"
            disabled={reset.isPending}
            onPress={onDone}
          />
        </YStack>
        <YStack flexGrow={1} flexShrink={1} flexBasis="auto">
          <Button
            label={t('resetPassword.submit')}
            icon="key-outline"
            loading={reset.isPending}
            onPress={() => void submit()}
          />
        </YStack>
      </XStack>
    </YStack>
  );
}
