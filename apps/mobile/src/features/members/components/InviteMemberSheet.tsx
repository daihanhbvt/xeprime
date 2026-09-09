import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { ASSIGNABLE_TENANT_ROLES, TENANT_ROLE } from '@xeprime/types';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { space } from '@/theme/tokens';
import { inviteMemberSchema, type InviteMemberValues } from '@xeprime/validators';
import { useCreateInvite } from '../hooks/use-members';

/**
 * GỬI LỜI MỜI vào gian hàng — không phải "thêm thành viên".
 *
 * `POST /members` đã bị gỡ ở backend: nó tạo thẳng một membership `active` cho một email bất kỳ,
 * tức thêm người vào gian hàng mà không hỏi họ. Ở đây chỉ gửi thư, và người được mời mới là
 * người quyết định — nên tấm trượt nói rõ điều sẽ xảy ra tiếp theo, nếu không người gửi đóng nó
 * lại, không thấy ai trong danh sách, và tưởng là lỗi.
 */
export function InviteMemberSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('Members.form');

  return (
    <BottomSheet open={open} onClose={onClose} title={t('title')}>
      {open ? <InviteForm onDone={onClose} /> : null}
    </BottomSheet>
  );
}

function InviteForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations('Members.form');
  const tToast = useTranslations('Members.toast');
  const tActions = useTranslations('Common.actions');
  const toast = useAppToast();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const invite = useCreateInvite();

  const resolver = useValidationResolver<InviteMemberValues>(
    inviteMemberSchema,
    'Members.form.errors',
  );
  const { control, handleSubmit } = useForm<InviteMemberValues>({
    resolver,
    defaultValues: { email: '', roleKey: TENANT_ROLE.SHOP_STAFF },
  });

  const roleOptions = useMemo(
    () =>
      ASSIGNABLE_TENANT_ROLES.map((role) => ({
        value: role,
        label: domainLabel('tenantRole', role),
      })),
    [domainLabel],
  );

  const submit = handleSubmit((values) => {
    invite.mutate(
      { email: values.email.trim(), roleKey: values.roleKey },
      {
        /*
         * Lời mời đã tạo, nhưng thư có thể KHÔNG gửi được (SMTP hỏng) — server nói thẳng qua
         * `emailSent`. Báo "Đã gửi lời mời" trong trường hợp đó là nói dối người gửi và bắt họ
         * chờ một lá thư không tồn tại.
         */
        onSuccess: (created) => {
          if (created.emailSent) toast.showSuccess(tToast('invited'));
          else toast.showInfo(tToast('invitedNoEmail'));
          onDone();
        },
        onError: (err) => toast.showError(errorMessage(err)),
      },
    );
  });

  return (
    <YStack gap={space.md}>
      <Callout tone="info">{t('notice')}</Callout>

      <TextField
        control={control}
        name="email"
        label={t('email')}
        placeholder={t('emailPlaceholder')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        required
      />
      <SelectField
        control={control}
        name="roleKey"
        label={t('role')}
        options={roleOptions}
        required
      />

      <Button label={tActions('send')} loading={invite.isPending} onPress={() => void submit()} />
      <Button
        label={tActions('close')}
        variant="ghost"
        disabled={invite.isPending}
        onPress={onDone}
      />
    </YStack>
  );
}
