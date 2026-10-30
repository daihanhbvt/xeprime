import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import { ASSIGNABLE_TENANT_ROLES, TENANT_ROLE } from '@xeprime/types';
import { buildRequiredPhoneSchema } from '@xeprime/validators';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useCopy } from '@/hooks/use-copy';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, space } from '@/theme/tokens';
import type { CreateInviteResult } from '../api';
import { useCreateInvite } from '../hooks/use-members';
import { toBranchScopeInput, useBranchScopeOptions } from '../branch-scope';
import { BranchScopePicker } from './BranchScopePicker';

/**
 * GỬI LỜI MỜI vào gian hàng — không phải "thêm thành viên". Bản native của `InviteMemberModal`.
 *
 * `POST /members` đã bị gỡ ở backend: nó tạo thẳng một membership `active` cho một email bất kỳ,
 * tức thêm người vào gian hàng mà không hỏi họ. Ở đây chỉ TẠO LỜI MỜI, và người được mời mới là
 * người quyết định — nên tấm trượt nói rõ điều sẽ xảy ra tiếp theo.
 *
 * Từ ADR 0060 lời mời đi bằng SỐ ĐIỆN THOẠI và không gửi thư: tạo xong, tấm trượt KHÔNG đóng mà
 * chuyển sang màn "sao chép liên kết" — liên kết chỉ có ở phản hồi tạo, đúng một lần. Người mời
 * chép rồi tự gửi qua Zalo/tin nhắn, xong mới bấm "Xong".
 */
export function InviteMemberSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('Members');
  /** Lời mời vừa tạo — có mặt ⇒ tấm trượt chuyển sang màn "sao chép liên kết". */
  const [created, setCreated] = useState<CreateInviteResult | null>(null);

  // Rời màn "đã tạo" phải dọn kết quả: không thì lần mở sau vẫn hiện liên kết của lời mời trước
  // và người mời gửi nhầm link cũ cho người mới. Form tự sạch vì chỉ mount khi `open`.
  function finish() {
    setCreated(null);
    onClose();
  }

  return (
    <BottomSheet
      open={open}
      onClose={finish}
      title={created ? t('created.title') : t('form.title')}
    >
      {open ? (
        created ? (
          <InviteCreated created={created} onDone={finish} />
        ) : (
          <InviteForm onDone={finish} onCreated={setCreated} />
        )
      ) : null}
    </BottomSheet>
  );
}

/** Message là MÃ — `useValidationResolver` tra `Members.form.errors.*`, cùng khoá với web. */
const invitePhoneSchema = yup.object({
  phone: buildRequiredPhoneSchema({ required: 'phoneRequired', invalid: 'phoneInvalid' }),
  roleKey: yup
    .string()
    .oneOf([...ASSIGNABLE_TENANT_ROLES])
    .required('roleRequired')
    .default(TENANT_ROLE.SHOP_STAFF),
});
type InvitePhoneValues = yup.InferType<typeof invitePhoneSchema>;

function InviteCreated({ created, onDone }: { created: CreateInviteResult; onDone: () => void }) {
  const colors = useColors();
  const t = useTranslations('Members.created');
  const copy = useCopy();

  return (
    <YStack gap={space.md}>
      <Text col={colors.text} fos={fontSize.body}>
        {t('body', { phone: created.phone ?? '' })}
      </Text>
      <YStack gap={space.xs}>
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('linkLabel')}
        </Text>
        <Text col={colors.text} fos={fontSize.bodySm} selectable>
          {created.inviteUrl}
        </Text>
      </YStack>
      <Button
        label={t('copy')}
        icon="copy-outline"
        variant="secondary"
        onPress={() => void copy(created.inviteUrl)}
      />
      <Callout tone="info">{t('safety')}</Callout>
      <Button label={t('done')} onPress={onDone} />
    </YStack>
  );
}

function InviteForm({
  onDone,
  onCreated,
}: {
  onDone: () => void;
  onCreated: (created: CreateInviteResult) => void;
}) {
  const t = useTranslations('Members.form');
  const tActions = useTranslations('Common.actions');
  const toast = useAppToast();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const invite = useCreateInvite();
  /*
   * Chi nhánh phụ trách giao NGAY TRÊN LỜI MỜI (ADR 0052). Ô LUÔN có giá trị — mặc định "Tất cả
   * chi nhánh"; gian hàng chưa có chi nhánh thì ẩn. Giữ ngoài RHF; luật "ít nhất một" kiểm ở
   * `submit` như schema web.
   */
  const branchScope = useBranchScopeOptions();
  // `null` = chưa chạm: giá trị là mặc định SUY RA ("Tất cả", hoặc toàn bộ chi nhánh của người
  // mời bị GIỚI HẠN — họ không cấp được "Tất cả"). Suy lúc render nên danh sách chi nhánh tải
  // xong là mặc định đúng ngay, không đè lên lựa chọn tay.
  const [picked, setPicked] = useState<string[] | null>(null);
  const branches = picked ?? branchScope.defaultSelection;
  const [branchError, setBranchError] = useState(false);
  const showBranches = branchScope.count > 0;

  const resolver = useValidationResolver<InvitePhoneValues>(
    invitePhoneSchema,
    'Members.form.errors',
  );
  const { control, handleSubmit } = useForm<InvitePhoneValues>({
    resolver,
    defaultValues: { phone: '', roleKey: TENANT_ROLE.SHOP_STAFF },
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
    if (invite.isPending) return;
    if (showBranches && branches.length === 0) {
      setBranchError(true);
      return;
    }
    invite.mutate(
      {
        phone: values.phone.trim(),
        roleKey: values.roleKey,
        ...toBranchScopeInput(showBranches ? branches : undefined),
      },
      {
        // KHÔNG đóng: liên kết chỉ có ở phản hồi này, đóng là mất.
        onSuccess: (created) => onCreated(created),
        onError: (err) => toast.showError(errorMessage(err)),
      },
    );
  });

  return (
    <YStack gap={space.md}>
      <Callout tone="info">{t('noticePhone')}</Callout>

      <TextField
        control={control}
        name="phone"
        label={t('phone')}
        placeholder={t('phonePlaceholder')}
        keyboardType="phone-pad"
        autoComplete="tel"
        required
      />
      <SelectField
        control={control}
        name="roleKey"
        label={t('role')}
        options={roleOptions}
        required
      />
      {showBranches ? (
        <BranchScopePicker
          label={t('branches')}
          required
          value={branches}
          options={branchScope.options}
          allowAll={branchScope.allowAll}
          hint={t(branchScope.allowAll ? 'branchesHelp' : 'branchesHelpLimited')}
          {...(branchError && branches.length === 0 ? { error: t('errors.branchRequired') } : {})}
          onChange={(next) => {
            setPicked(next);
            setBranchError(false);
          }}
        />
      ) : null}

      <XStack gap={space.sm}>
        {/*
          Lối thoát bên TRÁI, hành động chính bên PHẢI — xếp dọc thì hàng dưới đọc ra là một
          bước tiếp theo chứ không phải một lựa chọn thay thế.
        
          "Đóng" co vừa chữ, nút chính lấy phần còn lại — xem luật ở `Button.tsx`. Chia đôi thì
          nửa hàng bên trái bỏ trống quá nửa cho một từ bốn chữ, còn nút chính thiếu chỗ.
        */}
        <YStack flexShrink={0}>
          <Button
            label={tActions('close')}
            variant="ghost"
            disabled={invite.isPending}
            onPress={onDone}
          />
        </YStack>
        <YStack f={1}>
          <Button
            label={t('submit')}
            icon="send-outline"
            loading={invite.isPending}
            onPress={() => void submit()}
          />
        </YStack>
      </XStack>
    </YStack>
  );
}
