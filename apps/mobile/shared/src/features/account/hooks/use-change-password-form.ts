import { yupResolver } from '@hookform/resolvers/yup';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import { API_ERROR_CODE } from '@xeprime/types';
import { getErrorCode } from '@xeprime/api-client';
import { PASSWORD_MIN, PASSWORD_RULES, buildPasswordSchema, type PasswordRuleKey } from '@xeprime/validators';
import { changeAccountPassword, setAccountPassword } from '@/features/auth/api';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { useAuthSchemaLabels } from '@/features/auth/use-auth-schema-labels';
import { useErrorMessage } from '@/i18n/use-error-message';
import { queryKeys } from '@/queries/query-keys';

export interface ChangePasswordValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/** Một dòng của bảng yêu cầu mật khẩu - nhãn đã dịch, `met` tính theo ô đang gõ. */
export interface PasswordRequirement {
  key: string;
  label: string;
  met: boolean;
}

/** Số nấc của thanh độ mạnh (Figma `24231:108953`: bốn đoạn). */
export const PASSWORD_STRENGTH_STEPS = 4;
const STRONG_LENGTH = 12;
const SPECIAL_CHAR = /[^\p{L}\p{N}]/u;

/**
 * Độ mạnh 0…4 của mật khẩu đang gõ - CHỈ để nhìn, không phải luật (bản native của web
 * `passwordStrength`). Luật là `PASSWORD_RULES`; chưa đạt đủ luật thì không bao giờ lên nấc cuối.
 */
export function passwordStrength(password: string): number {
  if (!password) return 0;
  const met = PASSWORD_RULES.filter((rule) => rule.test(password)).length;
  const bonus = password.length >= STRONG_LENGTH || SPECIAL_CHAR.test(password) ? 1 : 0;
  const score = met + bonus;
  if (met < PASSWORD_RULES.length) return Math.min(score, PASSWORD_STRENGTH_STEPS - 1);
  return Math.min(score, PASSWORD_STRENGTH_STEPS);
}

/**
 * Đổi / đặt lần đầu mật khẩu của tài khoản đang đăng nhập - bản native của web
 * `useChangePasswordForm`, dùng chung cho màn `ChangePasswordScreen` (app khách) và form ngay trên
 * trang "Tài khoản và bảo mật" của app Partner.
 *
 *  - Đã có mật khẩu → hỏi mật khẩu hiện tại, `POST /auth/password/change`; sai mật khẩu cũ là lỗi
 *    TRÊN Ô (`CURRENT_PASSWORD_INCORRECT`), trùng mật khẩu cũ cũng vậy (`PASSWORD_UNCHANGED`).
 *  - Chưa có (tài khoản OTP / mạng xã hội) → `POST /auth/password/set`.
 *
 * Phiên chưa về thì mặc định "đã có mật khẩu" - nhánh AN TOÀN hơn (đòi thêm bằng chứng).
 */
export function useChangePasswordForm({ onSuccess }: { onSuccess: (note: string) => void }) {
  const t = useTranslations('Account.changePassword');
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const labels = useAuthSchemaLabels();
  const { data: user } = useCurrentUser();
  const hasPassword = user?.hasPassword ?? true;
  const [formError, setFormError] = useState<string | null>(null);

  const schema = useMemo(
    () =>
      yup.object({
        // MỘT schema cho cả hai nhánh, chỉ đổi LUẬT - hai schema làm kiểu suy ra của resolver thành hợp hai shape.
        currentPassword: yup
          .string()
          .defined()
          .test('currentRequired', labels.passwordRequired, (value) => !hasPassword || Boolean(value)),
        newPassword: buildPasswordSchema(labels).test(
          'notSameAsCurrent',
          t('unchanged'),
          function notSameAsCurrent(value) {
            const current = (this.parent as ChangePasswordValues).currentPassword;
            return !hasPassword || !current || value !== current;
          },
        ),
        confirmPassword: yup
          .string()
          .required(labels.confirmRequired)
          .oneOf([yup.ref('newPassword')], labels.confirmMismatch),
      }),
    [hasPassword, labels, t],
  );

  const form = useForm<ChangePasswordValues>({
    resolver: yupResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });
  const { control, handleSubmit, reset, setError } = form;
  const newPassword = useWatch({ control, name: 'newPassword' }) ?? '';
  const currentPassword = useWatch({ control, name: 'currentPassword' }) ?? '';

  const save = useMutation({
    mutationFn: (values: ChangePasswordValues) =>
      hasPassword
        ? changeAccountPassword(values.currentPassword, values.newPassword)
        : setAccountPassword(values.newPassword),
    onSuccess: () => {
      onSuccess(hasPassword ? t('success') : t('successFirstTime'));
      reset();
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
    },
    onError: (err) => {
      if (getErrorCode(err) === API_ERROR_CODE.CURRENT_PASSWORD_INCORRECT) {
        setError('currentPassword', { type: 'server', message: errorMessage(err) });
        return;
      }
      if (getErrorCode(err) === API_ERROR_CODE.PASSWORD_UNCHANGED) {
        setError('newPassword', { type: 'server', message: errorMessage(err) });
        return;
      }
      setFormError(errorMessage(err));
    },
  });

  const onSubmit = handleSubmit((values) => {
    if (save.isPending) return;
    setFormError(null);
    save.mutate(values);
  });

  // `Record` đầy đủ: thêm một luật vào `PASSWORD_RULES` mà quên nhãn thì đỏ ngay lúc biên dịch.
  const ruleLabels: Record<PasswordRuleKey, string> = {
    passwordTooShort: t('requirements.passwordTooShort', { min: PASSWORD_MIN }),
    passwordNeedsLetter: t('requirements.passwordNeedsLetter'),
    passwordNeedsDigit: t('requirements.passwordNeedsDigit'),
  };
  const requirements: PasswordRequirement[] = [
    ...PASSWORD_RULES.map((rule) => ({
      key: rule.key as string,
      label: ruleLabels[rule.key],
      met: rule.test(newPassword),
    })),
    // Chỉ khi đã có mật khẩu: lần đặt đầu không có gì để trùng (luật `PASSWORD_UNCHANGED` của server).
    ...(hasPassword
      ? [
          {
            key: 'notSameAsCurrent',
            label: t('requirements.notSameAsCurrent'),
            met: Boolean(newPassword) && newPassword !== currentPassword,
          },
        ]
      : []),
  ];

  return {
    form,
    onSubmit,
    hasPassword,
    managedAccount: Boolean(user?.managedAccount),
    formError,
    saving: save.isPending,
    requirements,
    strength: passwordStrength(newPassword),
  };
}
