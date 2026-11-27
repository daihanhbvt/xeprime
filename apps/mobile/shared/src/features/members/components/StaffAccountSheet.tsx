import { yupResolver } from '@hookform/resolvers/yup';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useController, useForm } from 'react-hook-form';
import { XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import {
  DISPLAY_NAME_POLICY,
  STAFF_USERNAME_PATTERN,
  TENANT_ROLE,
  invitableTenantRoles,
  normalizeDisplayName,
  normalizeStaffUsername,
  type TenantRole,
} from '@xeprime/types';
import { buildMobilePhoneSchema, buildPasswordSchema } from '@xeprime/validators';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { InlineAction } from '@/components/ui/InlineAction';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { useAuthSchemaLabels } from '@/features/auth/use-auth-schema-labels';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { space } from '@/theme/tokens';
import { toBranchScopeInput, useBranchScopeOptions } from '../branch-scope';
import { useCreateMemberAccount } from '../hooks/use-members';
import { generateStaffPassword } from '../staff-password';
import { BranchScopePicker } from './BranchScopePicker';
import { StaffCredentials } from './StaffCredentials';

/** Khoảng cách giữa các ô của form (Figma "Filter Form" `24232:114790`: gap 12). */
const FIELD_GAP = 12;

interface FormHandle {
  submit: () => void;
}

interface Created {
  name: string;
  username: string;
  password: string;
}

/**
 * "Thêm nhân viên" — chủ gian hàng CẤP tài khoản (ADR 0087): họ tên, tên đăng nhập, mật khẩu, vai,
 * chi nhánh, SĐT liên hệ. Bản native của web `StaffAccountDialog`; thay cho mời bằng SĐT (đã gỡ —
 * `MEMBER_INVITE_RETIRED`).
 *
 * Tạo xong KHÔNG đóng tấm: mật khẩu chỉ có ở đây, đúng một lần — tấm chuyển sang khối thông tin
 * đăng nhập để chủ sao chép gửi nhân viên, rồi mới bấm "Xong". Vai trong ô chọn lọc theo người tạo
 * (`invitableTenantRoles`): quản lý chỉ cấp được vai Nhân viên; server là chốt thật
 * (`MEMBER_ROLE_NOT_INVITABLE`).
 *
 * Khuôn tấm theo Figma "Mời thành viên" (`24232:114790`, người dùng chốt 26/11/2026 giữ luồng CẤP
 * tài khoản, chỉ lấy giao diện): đầu tấm v2 + vạch, các ô cách 12, chân tấm cố định "Huỷ" + nút vàng.
 */
export function StaffAccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('Members');
  const tActions = useTranslations('Common.actions');
  const [created, setCreated] = useState<Created | null>(null);
  const [pending, setPending] = useState(false);
  const formRef = useRef<FormHandle>(null);
  /*
   * Đóng tấm khi lượt tạo còn đang chạy thì `onSuccess` về SAU — không được ghi `created` lúc đó,
   * không thì lần mở sau hiện tên + mật khẩu của người trước (web dọn khi tấm mở lại).
   */
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  const onCreated = useCallback((next: Created) => {
    if (openRef.current) setCreated(next);
  }, []);

  // Rời khối "đã tạo" phải dọn mật khẩu: không thì lần mở sau còn hiện mật khẩu của người trước.
  function finish() {
    setCreated(null);
    onClose();
  }

  return (
    <BottomSheet
      open={open}
      onClose={finish}
      title={created ? t('staff.created.title') : t('staff.title')}
      {...(created ? {} : { subtitle: t('staff.subtitle') })}
      footer={
        created ? (
          <Button variant="gradient" label={t('staff.created.done')} onPress={finish} />
        ) : (
          <XStack gap={space.sm}>
            <YStack flexShrink={0}>
              <Button
                label={tActions('cancel')}
                variant="secondary"
                disabled={pending}
                onPress={finish}
              />
            </YStack>
            <YStack flexGrow={1} flexShrink={1} flexBasis="auto">
              <Button
                variant="gradient"
                label={t('staff.submit')}
                loading={pending}
                onPress={() => formRef.current?.submit()}
              />
            </YStack>
          </XStack>
        )
      }
    >
      {open ? (
        created ? (
          <StaffCredentials
            name={created.name}
            username={created.username}
            password={created.password}
            body={t('staff.created.body', { name: created.name })}
          />
        ) : (
          // Form chỉ mount khi tấm mở ⇒ mỗi lần mở là một tài khoản mới + một mật khẩu ngẫu nhiên mới.
          <StaffAccountForm ref={formRef} onCreated={onCreated} onPendingChange={setPending} />
        )
      ) : null}
    </BottomSheet>
  );
}

const StaffAccountForm = forwardRef<
  FormHandle,
  {
    onCreated: (created: Created) => void;
    /** Lượt tạo đang chạy - chân tấm (ở tấm cha) khoá nút theo nó. */
    onPendingChange: (pending: boolean) => void;
  }
>(function StaffAccountForm({ onCreated, onPendingChange }, ref) {
  const t = useTranslations('Members');
  const toast = useAppToast();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const authLabels = useAuthSchemaLabels();
  const create = useCreateMemberAccount();
  const { data: me } = useCurrentUser();
  const invitable = invitableTenantRoles(me?.tenant?.roleKey);

  /*
   * Chi nhánh phụ trách — ô LUÔN có giá trị (ADR 0052), nằm TRONG form như web
   * (`StaffAccountDialog` `branchIds` + `.min(1)`): lỗi xoá/hiện như mọi ô khác.
   */
  const branchScope = useBranchScopeOptions();
  const showBranches = branchScope.count > 0;

  // Schema dựng TRONG component: câu lỗi theo ngôn ngữ đang chọn.
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
        contactPhone: buildMobilePhoneSchema(authLabels).defined(),
        branchIds: yup
          .array(yup.string().required())
          .defined()
          .test('branch-required', t('form.errors.branchRequired'), (value) =>
            showBranches ? value.length > 0 : true,
          ),
      }),
    [t, authLabels, invitable, showBranches],
  );
  type FormValues = yup.InferType<typeof schema>;

  const { control, handleSubmit, setValue, getFieldState } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: {
      displayName: '',
      username: '',
      password: generateStaffPassword(),
      // Mặc định là vai thấp nhất mà vẫn làm việc được (Nhân viên) — không phải vai cao nhất.
      roleKey: invitable.includes(TENANT_ROLE.SHOP_STAFF)
        ? TENANT_ROLE.SHOP_STAFF
        : (invitable[0] ?? ''),
      contactPhone: '',
      branchIds: branchScope.defaultSelection,
    },
  });
  const branchField = useController({ control, name: 'branchIds' });

  /*
   * Danh sách chi nhánh tải SAU khi form mount: người bị giới hạn có mặc định = chi nhánh của mình,
   * nên nạp mặc định một lần khi danh sách về — chỉ khi người dùng chưa chạm ô.
   */
  useEffect(() => {
    if (!getFieldState('branchIds').isDirty) {
      setValue('branchIds', branchScope.defaultSelection);
    }
  }, [branchScope.defaultSelection, getFieldState, setValue]);

  const roleOptions = useMemo(
    () =>
      invitable.map((role) => ({
        value: role,
        label: domainLabel('tenantRole', role),
        hint: t(`roleShortHint.${role}`),
      })),
    [domainLabel, invitable, t],
  );

  useEffect(() => {
    onPendingChange(create.isPending);
  }, [create.isPending, onPendingChange]);
  // Rời form (tạo xong / đóng tấm) thì chân tấm không còn "đang tạo".
  useEffect(() => () => onPendingChange(false), [onPendingChange]);

  const submit = handleSubmit((values) => {
    if (create.isPending) return;
    create.mutate(
      {
        displayName: values.displayName,
        username: values.username,
        password: values.password,
        roleKey: values.roleKey as TenantRole,
        ...toBranchScopeInput(showBranches ? values.branchIds : undefined),
        ...(values.contactPhone ? { contactPhone: values.contactPhone } : {}),
      },
      {
        onSuccess: () => {
          toast.showSuccess(t('roster.toast.created'));
          onCreated({
            name: values.displayName,
            username: values.username,
            password: values.password,
          });
        },
        onError: (err) => toast.showError(errorMessage(err)),
      },
    );
  });

  useImperativeHandle(ref, () => ({ submit: () => void submit() }), [submit]);

  return (
    <YStack gap={FIELD_GAP}>
      <TextField
        control={control}
        name="displayName"
        label={t('staff.displayName')}
        placeholder={t('staff.displayNamePlaceholder')}
        required
      />
      <TextField
        control={control}
        name="username"
        label={t('staff.username')}
        placeholder={t('staff.usernamePlaceholder')}
        hint={t('staff.usernameHelp')}
        autoCapitalize="none"
        autoComplete="off"
        required
      />
      <TextField
        control={control}
        name="password"
        label={t('staff.password')}
        placeholder={t('staff.passwordPlaceholder')}
        hint={t('staff.passwordHelp')}
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
        hintInLabel
        keyboardType="phone-pad"
        autoComplete="tel"
      />
    </YStack>
  );
});
