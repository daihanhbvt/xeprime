'use client';

import { Alert, App } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import * as yup from 'yup';
import { TENANT_ROLE, TENANT_ROLE_VALUES } from '@xeprime/types';
import { SelectField } from '@/components/form/SelectField';
import { TextField } from '@/components/form/TextField';
import { DialogForm } from '@/components/form/DialogForm';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { ALL_FILTER } from '@/constants/filters';
import { ASSIGNABLE_ROLES } from '../constants';
import {
  normalizeBranchSelection,
  toBranchScopeInput,
  useBranchScopeOptions,
} from './MemberBranchScopeSelect';
import { useCreateInvite } from '../hooks/use-member-mutations';

/**
 * GỬI LỜI MỜI vào gian hàng — không phải "thêm thành viên".
 *
 * Tên cũ (`AddMemberModal`) mô tả đúng thứ nó từng làm: `POST /members` tạo thẳng một membership
 * `active` cho một email bất kỳ, và người bị thêm chỉ biết khi đăng nhập lần sau. Endpoint đó đã
 * bị gỡ; ở đây chỉ gửi thư, và người được mời mới là người quyết định.
 *
 * Vì vậy hộp thoại nói rõ điều gì sẽ xảy ra tiếp theo: hiện tại người được mời CHƯA vào gian
 * hàng. Không nói ra thì người gửi đóng hộp thoại, không thấy ai trong bảng, và tưởng là lỗi.
 *
 * Remount theo `open` để state form sạch mỗi lần mở.
 */
export function InviteMemberModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('Members');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const invite = useCreateInvite();
  /*
   * Chi nhánh phụ trách giao NGAY TRÊN LỜI MỜI (ADR 0052): người quản lý biết rõ nhân viên mới
   * làm ở đâu ngay lúc mời, và người được mời bước vào đã đúng phạm vi. Ô LUÔN có giá trị —
   * mặc định "Tất cả chi nhánh" — cùng hành vi với ô ở bảng nhân sự. Gian hàng chưa có chi
   * nhánh thì ẩn ô này.
   */
  const branchScope = useBranchScopeOptions();

  // Schema dựng TRONG component: câu lỗi phải theo ngôn ngữ của request, mà module scope chạy
  // một lần cho cả tiến trình và sẽ đóng băng ngôn ngữ đầu tiên ở SSR.
  const schema = useMemo(
    () =>
      yup.object({
        email: yup
          .string()
          .trim()
          .required(t('form.errors.emailRequired'))
          .email(t('form.errors.emailInvalid')),
        roleKey: yup
          .string()
          .oneOf(TENANT_ROLE_VALUES.filter((r) => r !== TENANT_ROLE.SHOP_OWNER))
          .required(t('form.errors.roleRequired')),
        // Bắt buộc và không bao giờ rỗng: mặc định là ["all"], normalize giữ bất biến đó.
        branchIds: yup.array().of(yup.string().defined()).min(1, t('form.errors.branchRequired')).defined(),
      }),
    [t],
  );

  type FormValues = yup.InferType<typeof schema>;

  const { control, handleSubmit, setValue, getValues } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: { email: '', roleKey: TENANT_ROLE.SHOP_STAFF, branchIds: [ALL_FILTER] },
  });

  /*
   * Người mời bị GIỚI HẠN chi nhánh (ADR 0052) không cấp được "Tất cả" — backend trả
   * `BRANCH_SCOPE_EXCEEDED`. Mặc định của họ là toàn bộ chi nhánh mình phụ trách, điền khi danh
   * sách chi nhánh tải xong. Chỉ thay đúng giá trị mặc định ban đầu, không đè lên lựa chọn tay.
   */
  const limitedDefault = branchScope.allowAll ? null : branchScope.defaultSelection.join(',');
  useEffect(() => {
    if (!limitedDefault) return;
    const current = getValues('branchIds');
    if (current.length === 1 && current[0] === ALL_FILTER) {
      setValue('branchIds', limitedDefault.split(','));
    }
  }, [limitedDefault, getValues, setValue]);

  const roleOptions = ASSIGNABLE_ROLES.map((role) => ({
    value: role,
    label: domainLabel('tenantRole', role),
  }));

  const onSubmit = handleSubmit((values) => {
    invite.mutate(
      { email: values.email.trim(), roleKey: values.roleKey, ...toBranchScopeInput(values.branchIds) },
      {
        /*
         * Lời mời đã tạo, nhưng thư có thể KHÔNG gửi được (SMTP hỏng) — server nói thẳng qua
         * `emailSent`. Báo "Đã gửi lời mời" trong trường hợp đó là nói dối người gửi và bắt họ
         * chờ một lá thư không tồn tại; cảnh báo ở lại lâu hơn toast vì nó cần hành động tiếp.
         */
        onSuccess: (created) => {
          if (created.emailSent) {
            message.success(t('toast.invited'));
          } else {
            message.warning(t('toast.invitedNoEmail'), 8);
          }
          onClose();
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  });

  return (
    <ResponsiveDialog
      title={t('form.title')}
      open={open}
      onClose={onClose}
      size="sm"
      okText={tCommon('actions.send')}
      onOk={() => void onSubmit()}
      confirmLoading={invite.isPending}
    >
      <DialogForm onSubmit={onSubmit} labelWidth="sm">
        <Alert type="info" showIcon title={t('form.notice')} />
        <TextField
          control={control}
          name="email"
          label={t('form.email')}
          type="email"
          placeholder={t('form.emailPlaceholder')}
        />
        <SelectField
          control={control}
          name="roleKey"
          label={t('form.role')}
          options={roleOptions}
        />
        {branchScope.count > 0 ? (
          <SelectField
            control={control}
            name="branchIds"
            mode="multiple"
            required
            label={t('form.branches')}
            options={branchScope.options}
            loading={branchScope.isLoading}
            help={t(branchScope.allowAll ? 'form.branchesHelp' : 'form.branchesHelpLimited')}
            // Giữ bất biến "không bao giờ rỗng": bấm "Tất cả" thì chỉ còn nó, gỡ hết thì nó quay lại.
            onAfterChange={(value) => {
              if (Array.isArray(value)) {
                setValue('branchIds', normalizeBranchSelection(value, branchScope.allowAll));
              }
            }}
          />
        ) : null}
      </DialogForm>
    </ResponsiveDialog>
  );
}
