import { yupResolver } from '@hookform/resolvers/yup';
import { useMemo } from 'react';
import { useController, useForm } from 'react-hook-form';
import { XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import {
  ASSIGNABLE_TENANT_ROLES,
  DISPLAY_NAME_POLICY,
  normalizeDisplayName,
  type TenantRole,
} from '@xeprime/types';
import { buildMobilePhoneSchema } from '@xeprime/validators';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { useAuthSchemaLabels } from '@/features/auth/use-auth-schema-labels';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { space } from '@/theme/tokens';
import type { MemberRosterItem, UpdateMemberRoleInput } from '../api';
import { toBranchScopeInput, toBranchSelection, useBranchScopeOptions } from '../branch-scope';
import { useUpdateMemberRole } from '../hooks/use-members';
import { BranchScopePicker } from './BranchScopePicker';

const sameSet = (a: readonly string[], b: readonly string[]) =>
  [...a].sort().join(',') === [...b].sort().join(',');

/**
 * "Chỉnh sửa" một thành viên (ADR 0086 điều 7 · ADR 0087) — bản native của web `MemberEditDialog`:
 * vai, chi nhánh phụ trách, SĐT liên hệ — và HỌ TÊN khi tài khoản do gian hàng cấp (tài khoản tự
 * đăng ký thì tên là của chính chủ; server từ chối bằng `MEMBER_ACCOUNT_NOT_MANAGED`).
 *
 * Chỉ gửi trường THẬT SỰ đổi: backend hiểu trường vắng mặt là giữ nguyên, và gửi lại giá trị đang có
 * trong cache là mở cửa cho lost-update theo chiều MỞ QUYỀN (xem `UpdateMemberRoleDto`).
 */
export function MemberEditSheet({
  member,
  onClose,
}: {
  /** `null` = đóng. Gắn/tháo theo người để không mang lựa chọn của người trước sang người sau. */
  member: MemberRosterItem | null;
  onClose: () => void;
}) {
  const t = useTranslations('Members');
  const name = member?.displayName ?? member?.nickname ?? '';

  return (
    <BottomSheet
      open={member !== null}
      onClose={onClose}
      title={t('edit.title')}
      subtitle={t('edit.subtitle', { name })}
    >
      {member ? <EditForm key={member.id} member={member} onDone={onClose} /> : null}
    </BottomSheet>
  );
}

function EditForm({ member, onDone }: { member: MemberRosterItem; onDone: () => void }) {
  const t = useTranslations('Members');
  const tActions = useTranslations('Common.actions');
  const toast = useAppToast();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const authLabels = useAuthSchemaLabels();
  const update = useUpdateMemberRole();
  const managed = member.managedAccount;

  const branchScope = useBranchScopeOptions();
  const saved = useMemo(() => toBranchSelection(member.branchIds), [member.branchIds]);
  const showBranches = branchScope.count > 0;

  const schema = useMemo(
    () =>
      yup.object({
        displayName: yup
          .string()
          .transform((v: string) => normalizeDisplayName(v ?? ''))
          .defined()
          .test('display-name', authLabels.nameLength ?? '', (value) =>
            !managed
              ? true
              : value.length >= DISPLAY_NAME_POLICY.MIN_LENGTH &&
                value.length <= DISPLAY_NAME_POLICY.MAX_LENGTH,
          )
          .test(
            'display-name-chars',
            authLabels.nameInvalid ?? '',
            (value) => !managed || DISPLAY_NAME_POLICY.PATTERN.test(value),
          ),
        roleKey: yup
          .string()
          .oneOf([...ASSIGNABLE_TENANT_ROLES] as string[], t('form.errors.roleRequired'))
          .required(t('form.errors.roleRequired')),
        contactPhone: buildMobilePhoneSchema(authLabels).defined(),
        // Trong form như web `MemberEditDialog` (`branchIds` + `.min(1)`).
        branchIds: yup
          .array(yup.string().required())
          .defined()
          .test('branch-required', t('form.errors.branchRequired'), (value) =>
            showBranches ? value.length > 0 : true,
          ),
      }),
    [t, authLabels, managed, showBranches],
  );
  type FormValues = yup.InferType<typeof schema>;

  const { control, handleSubmit } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: {
      displayName: member.displayName ?? '',
      roleKey: member.roleKey,
      contactPhone: member.contactPhone ?? '',
      branchIds: saved,
    },
  });
  const branchField = useController({ control, name: 'branchIds' });

  const roleOptions = useMemo(
    () =>
      ASSIGNABLE_TENANT_ROLES.map((role) => ({
        value: role,
        label: domainLabel('tenantRole', role),
        hint: t(`roleShortHint.${role}`),
      })),
    [domainLabel, t],
  );

  const submit = handleSubmit((values) => {
    if (!member.userId || update.isPending) return;
    const patch: UpdateMemberRoleInput = {};
    if (values.roleKey !== member.roleKey) patch.roleKey = values.roleKey as TenantRole;
    if (showBranches && !sameSet(values.branchIds, saved)) {
      Object.assign(patch, toBranchScopeInput(values.branchIds));
    }
    if (managed && values.displayName !== (member.displayName ?? '')) {
      patch.displayName = values.displayName;
    }
    if (values.contactPhone !== (member.contactPhone ?? '')) {
      patch.contactPhone = values.contactPhone || null;
    }
    if (Object.keys(patch).length === 0) {
      toast.showInfo(t('edit.noChange'));
      return;
    }
    update.mutate(
      { userId: member.userId, ...patch },
      {
        onSuccess: () => {
          toast.showSuccess(t('roster.toast.saved'));
          onDone();
        },
        onError: (err) => toast.showError(errorMessage(err)),
      },
    );
  });

  return (
    <YStack gap={space.md}>
      {managed ? (
        <TextField
          control={control}
          name="displayName"
          label={t('staff.displayName')}
          placeholder={t('staff.displayNamePlaceholder')}
          required
        />
      ) : null}
      <SelectField
        control={control}
        name="roleKey"
        label={t('form.role')}
        options={roleOptions}
        required
      />
      {showBranches ? (
        <BranchScopePicker
          label={t('form.branches')}
          required
          value={branchField.field.value}
          options={branchScope.options}
          allowAll={branchScope.allowAll}
          hint={t(branchScope.allowAll ? 'form.branchesHelp' : 'form.branchesHelpLimited')}
          {...(branchField.fieldState.error?.message
            ? { error: branchField.fieldState.error.message }
            : {})}
          onChange={(next) => branchField.field.onChange(next)}
        />
      ) : null}
      <TextField
        control={control}
        name="contactPhone"
        label={t('staff.contactPhone')}
        placeholder={t('staff.contactPhonePlaceholder')}
        hint={t('staff.contactPhoneHelp')}
        keyboardType="phone-pad"
        autoComplete="tel"
      />
      <XStack gap={space.sm}>
        <YStack flexShrink={0}>
          <Button
            label={tActions('close')}
            variant="ghost"
            disabled={update.isPending}
            onPress={onDone}
          />
        </YStack>
        <YStack flexGrow={1} flexShrink={1} flexBasis="auto">
          <Button
            label={t('edit.submit')}
            icon="checkmark-outline"
            loading={update.isPending}
            onPress={() => void submit()}
          />
        </YStack>
      </XStack>
    </YStack>
  );
}
