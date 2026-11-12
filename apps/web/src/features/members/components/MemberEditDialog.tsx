'use client';

import { App } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import * as yup from 'yup';
import {
  ASSIGNABLE_TENANT_ROLES,
  DISPLAY_NAME_POLICY,
  normalizeDisplayName,
  type TenantRole,
} from '@xeprime/types';
import { buildMobilePhoneSchema } from '@xeprime/validators';
import { DialogForm } from '@/components/form/DialogForm';
import { SelectField } from '@/components/form/SelectField';
import { TextField } from '@/components/form/TextField';
import { DialogHeading } from '@/components/overlay/DialogHeading';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useAuthSchemaLabels } from '@/features/auth/hooks/use-auth-schema-labels';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useUpdateMemberRole } from '../hooks/use-member-mutations';
import type { MemberRosterItem, UpdateMemberRoleInput } from '../types';
import {
  normalizeBranchSelection,
  toBranchScopeInput,
  toBranchSelection,
  useBranchScopeOptions,
} from './MemberBranchScopeSelect';
import { RoleOption } from './RoleOption';

const sameSet = (a: readonly string[], b: readonly string[]) =>
  [...a].sort().join(',') === [...b].sort().join(',');

/**
 * Hộp "Chỉnh sửa" một thành viên (ADR 0086 điều 7 · ADR 0087): vai, chi nhánh phụ trách, SĐT liên hệ
 * — và HỌ TÊN khi tài khoản do gian hàng cấp (tài khoản tự đăng ký thì tên là của chính chủ).
 *
 * Chỉ gửi trường THẬT SỰ đổi: backend hiểu trường vắng mặt là giữ nguyên, và gửi lại giá trị đang
 * có trong cache là mở cửa cho lost-update theo chiều MỞ QUYỀN (xem `UpdateMemberRoleDto`).
 */
export function MemberEditDialog({
  member,
  onClose,
}: {
  member: MemberRosterItem | null;
  onClose: () => void;
}) {
  const t = useTranslations('Members');
  const { message } = App.useApp();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const authLabels = useAuthSchemaLabels();
  const update = useUpdateMemberRole();
  const branchScope = useBranchScopeOptions();
  const managed = Boolean(member?.managedAccount);

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
          .test('display-name-chars', authLabels.nameInvalid ?? '', (value) =>
            !managed || DISPLAY_NAME_POLICY.PATTERN.test(value),
          ),
        roleKey: yup
          .string()
          .oneOf([...ASSIGNABLE_TENANT_ROLES] as string[], t('form.errors.roleRequired'))
          .required(t('form.errors.roleRequired')),
        branchIds: yup
          .array()
          .of(yup.string().defined())
          .min(1, t('form.errors.branchRequired'))
          .defined(),
        contactPhone: buildMobilePhoneSchema(authLabels).defined(),
      }),
    [t, authLabels, managed],
  );
  type FormValues = yup.InferType<typeof schema>;

  const { control, handleSubmit, reset, setValue } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: { displayName: '', roleKey: '', branchIds: [], contactPhone: '' },
  });

  // Mỗi thành viên một form sạch — không mang lựa chọn của người trước sang người sau.
  useEffect(() => {
    if (member) {
      reset({
        displayName: member.displayName ?? '',
        roleKey: member.roleKey,
        branchIds: toBranchSelection(member.branchIds),
        contactPhone: member.contactPhone ?? '',
      });
    }
  }, [member, reset]);

  const onSubmit = handleSubmit((values) => {
    if (!member?.userId || update.isPending) return;
    const patch: UpdateMemberRoleInput = {};
    if (values.roleKey !== member.roleKey) patch.roleKey = values.roleKey as TenantRole;
    if (!sameSet(values.branchIds, toBranchSelection(member.branchIds))) {
      Object.assign(patch, toBranchScopeInput(values.branchIds));
    }
    if (managed && values.displayName !== (member.displayName ?? '')) {
      patch.displayName = values.displayName;
    }
    if (values.contactPhone !== (member.contactPhone ?? '')) {
      patch.contactPhone = values.contactPhone || null;
    }
    if (Object.keys(patch).length === 0) {
      message.info(t('edit.noChange'));
      return;
    }
    update.mutate(
      { userId: member.userId, ...patch },
      {
        onSuccess: () => {
          message.success(t('roster.toast.saved'));
          onClose();
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  });

  const name = member?.displayName ?? member?.nickname ?? '';

  return (
    <ResponsiveDialog
      title={<DialogHeading title={t('edit.title')} hint={t('edit.subtitle', { name })} />}
      open={Boolean(member)}
      onClose={onClose}
      size="sm"
      okText={t('edit.submit')}
      onOk={() => void onSubmit()}
      confirmLoading={update.isPending}
    >
      <DialogForm onSubmit={onSubmit} labelPosition="top">
        {managed ? (
          <TextField
            control={control}
            name="displayName"
            label={t('staff.displayName')}
            required
            placeholder={t('staff.displayNamePlaceholder')}
          />
        ) : null}
        <SelectField
          control={control}
          name="roleKey"
          label={t('form.role')}
          required
          options={ASSIGNABLE_TENANT_ROLES.map((role) => ({
            value: role,
            label: domainLabel('tenantRole', role),
          }))}
          renderOption={(option) => <RoleOption value={option.value} label={option.label} />}
        />
        {branchScope.count > 0 ? (
          <SelectField
            control={control}
            name="branchIds"
            mode="multiple"
            label={t('form.branches')}
            options={branchScope.options}
            loading={branchScope.isLoading}
            help={t(branchScope.allowAll ? 'form.branchesHelp' : 'form.branchesHelpLimited')}
            onAfterChange={(value) => {
              if (Array.isArray(value)) {
                setValue('branchIds', normalizeBranchSelection(value, branchScope.allowAll));
              }
            }}
          />
        ) : null}
        <TextField
          control={control}
          name="contactPhone"
          label={t('staff.contactPhone')}
          type="tel"
          placeholder={t('staff.contactPhonePlaceholder')}
          help={t('staff.contactPhoneHelp')}
        />
      </DialogForm>
    </ResponsiveDialog>
  );
}
