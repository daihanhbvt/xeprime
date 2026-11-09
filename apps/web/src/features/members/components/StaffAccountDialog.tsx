'use client';

import { App, Button } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import * as yup from 'yup';
import {
  DISPLAY_NAME_POLICY,
  STAFF_USERNAME_PATTERN,
  invitableTenantRoles,
  normalizeDisplayName,
  normalizeStaffUsername,
  type TenantRole,
} from '@xeprime/types';
import { buildPasswordSchema, buildMobilePhoneSchema } from '@xeprime/validators';
import { SelectField } from '@/components/form/SelectField';
import { TextField } from '@/components/form/TextField';
import { DialogForm } from '@/components/form/DialogForm';
import { DialogHeading } from '@/components/overlay/DialogHeading';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useAuthSchemaLabels } from '@/features/auth/hooks/use-auth-schema-labels';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { ALL_FILTER } from '@/constants/filters';
import { generateStaffPassword } from '../staff-password';
import { useCreateMemberAccount } from '../hooks/use-member-mutations';
import {
  normalizeBranchSelection,
  toBranchScopeInput,
  useBranchScopeOptions,
} from './MemberBranchScopeSelect';
import { RoleOption } from './RoleOption';
import { StaffCredentials } from './StaffCredentials';
import styles from './StaffAccountDialog.module.css';

interface Created {
  name: string;
  username: string;
  password: string;
}

/**
 * "Thêm nhân viên" — chủ gian hàng CẤP tài khoản (ADR 0087): họ tên, tên đăng nhập, mật khẩu, vai,
 * chi nhánh, SĐT liên hệ. Thay cho mời bằng SĐT (ADR 0060 điều 8, đã gỡ).
 *
 * Tạo xong KHÔNG đóng hộp: mật khẩu chỉ có ở đây, đúng một lần — hộp chuyển sang khối thông tin
 * đăng nhập để chủ sao chép gửi nhân viên, rồi mới bấm "Xong". Vai trong ô chọn lọc theo người tạo
 * (`invitableTenantRoles`): quản lý chỉ cấp được vai Nhân viên; server là chốt thật.
 */
export function StaffAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('Members');
  const { message } = App.useApp();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const authLabels = useAuthSchemaLabels();
  const create = useCreateMemberAccount();
  const { data: me } = useCurrentUser();
  const branchScope = useBranchScopeOptions();
  const invitable = invitableTenantRoles(me?.tenant?.roleKey);
  const [created, setCreated] = useState<Created | null>(null);

  // Schema dựng TRONG component: câu lỗi phải theo ngôn ngữ của request.
  const schema = useMemo(
    () =>
      yup.object({
        displayName: yup
          .string()
          .transform((v: string) => normalizeDisplayName(v ?? ''))
          .required(t('staff.errors.displayNameRequired'))
          .min(DISPLAY_NAME_POLICY.MIN_LENGTH, authLabels.nameLength)
          .max(DISPLAY_NAME_POLICY.MAX_LENGTH, authLabels.nameLength)
          .matches(DISPLAY_NAME_POLICY.PATTERN, authLabels.nameInvalid),
        username: yup
          .string()
          .transform((v: string) => normalizeStaffUsername(v ?? ''))
          .required(t('staff.errors.usernameRequired'))
          .matches(STAFF_USERNAME_PATTERN, t('staff.errors.usernameInvalid')),
        password: buildPasswordSchema(authLabels),
        roleKey: yup
          .string()
          .oneOf([...invitable] as string[], t('form.errors.roleRequired'))
          .required(t('form.errors.roleRequired')),
        branchIds: yup
          .array()
          .of(yup.string().defined())
          .min(1, t('form.errors.branchRequired'))
          .defined(),
        contactPhone: buildMobilePhoneSchema(authLabels).defined(),
      }),
    [t, authLabels, invitable],
  );
  type FormValues = yup.InferType<typeof schema>;

  const defaults = (): FormValues => ({
    displayName: '',
    username: '',
    password: generateStaffPassword(),
    // Mặc định là vai thấp nhất mà vẫn làm việc được (Nhân viên) — không phải vai cao nhất.
    roleKey: invitable.includes('shop_staff' as TenantRole) ? 'shop_staff' : (invitable[0] ?? ''),
    branchIds: branchScope.allowAll ? [ALL_FILTER] : branchScope.defaultSelection,
    contactPhone: '',
  });

  const { control, handleSubmit, reset, setValue } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: defaults(),
  });

  // Mỗi lần mở là một tài khoản mới — kèm một mật khẩu ngẫu nhiên mới.
  useEffect(() => {
    if (open) {
      setCreated(null);
      reset(defaults());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ dựng lại khi hộp MỞ
  }, [open]);

  const onSubmit = handleSubmit((values) => {
    if (create.isPending) return;
    create.mutate(
      {
        displayName: values.displayName,
        username: values.username,
        password: values.password,
        roleKey: values.roleKey as TenantRole,
        ...toBranchScopeInput(values.branchIds),
        ...(values.contactPhone ? { contactPhone: values.contactPhone } : {}),
      },
      {
        onSuccess: () => {
          message.success(t('roster.toast.created'));
          setCreated({
            name: values.displayName,
            username: values.username,
            password: values.password,
          });
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  });

  if (created) {
    return (
      <ResponsiveDialog
        title={t('staff.created.title')}
        open={open}
        onClose={onClose}
        size="sm"
        footer={
          <Button type="primary" onClick={onClose}>
            {t('staff.created.done')}
          </Button>
        }
      >
        <StaffCredentials
          name={created.name}
          username={created.username}
          password={created.password}
          body={t('staff.created.body', { name: created.name })}
        />
      </ResponsiveDialog>
    );
  }

  return (
    <ResponsiveDialog
      title={<DialogHeading title={t('staff.title')} hint={t('staff.subtitle')} />}
      open={open}
      onClose={onClose}
      size="sm"
      okText={t('staff.submit')}
      onOk={() => void onSubmit()}
      confirmLoading={create.isPending}
    >
      <DialogForm onSubmit={onSubmit} labelPosition="top">
        <TextField
          control={control}
          name="displayName"
          label={t('staff.displayName')}
          required
          placeholder={t('staff.displayNamePlaceholder')}
        />
        <TextField
          control={control}
          name="username"
          label={t('staff.username')}
          required
          placeholder={t('staff.usernamePlaceholder')}
          help={t('staff.usernameHelp')}
          autoComplete="off"
          normalize={(value) => value.toLowerCase().replace(/\s/g, '')}
        />
        <TextField
          control={control}
          name="password"
          label={t('staff.password')}
          required
          placeholder={t('staff.passwordPlaceholder')}
          help={t('staff.passwordHelp')}
          autoComplete="new-password"
          suffix={
            <Button
              type="link"
              size="small"
              className={styles.generate}
              onClick={() => setValue('password', generateStaffPassword(), { shouldValidate: true })}
            >
              {t('staff.generate')}
            </Button>
          }
        />
        <SelectField
          control={control}
          name="roleKey"
          label={t('form.role')}
          required
          options={invitable.map((role) => ({ value: role, label: domainLabel('tenantRole', role) }))}
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
