'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import * as yup from 'yup';
import { API_ERROR_CODE } from '@xeprime/types';
import { PASSWORD_MIN, PASSWORD_RULES, buildPasswordSchema } from '@xeprime/validators';

import { useCurrentUser } from '@/hooks/use-current-user';
import { useErrorMessage } from '@/i18n/use-error-message';
import { getErrorCode } from '@/services/api-client';
import { changePassword, setPassword } from '@/services/auth.service';
import { queryKeys } from '@/services/query-keys';

import { useAuthSchemaLabels } from './use-auth-schema-labels';

export interface ChangePasswordValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/** Một dòng của bảng "Yêu cầu mật khẩu" - nhãn đã dịch, `met` tính theo ô đang gõ. */
export interface PasswordRequirement {
  key: string;
  label: string;
  met: boolean;
}

/** Số nấc của thanh độ mạnh (design trang Tài khoản partner `24131:71731`). */
export const PASSWORD_STRENGTH_STEPS = 4;
/** Dài từ chừng này trở lên thì cộng một nấc - cùng nấc với một ký tự đặc biệt. */
const STRONG_LENGTH = 12;
const SPECIAL_CHAR = /[^\p{L}\p{N}]/u;

/**
 * Độ mạnh 0…4 của mật khẩu đang gõ - CHỈ để hiển thị, không phải luật. Luật là `PASSWORD_RULES`
 * (dùng chung với server); độ mạnh = số luật đạt, cộng một nấc khi dài ≥ 12 HOẶC có ký tự đặc
 * biệt, và không bao giờ lên nấc cao nhất khi còn luật chưa đạt.
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
 * Form ĐỔI / ĐẶT LẦN ĐẦU mật khẩu của khu tài khoản - một nguồn cho mọi dáng hiển thị (trang Bảo
 * mật site khách, trang Tài khoản & bảo mật site partner, trang bảo mật admin).
 *
 * Phân nhánh theo `MeDto.hasPassword`:
 *  - đã có → hỏi mật khẩu hiện tại, `POST /auth/password/change`; sai mật khẩu cũ là lỗi TRÊN Ô
 *    (`CURRENT_PASSWORD_INCORRECT`), trùng mật khẩu cũ cũng vậy (`PASSWORD_UNCHANGED`);
 *  - chưa có (tài khoản Google/Facebook) → không hỏi mật khẩu cũ, `POST /auth/password/set`.
 *
 * Bảng yêu cầu tick theo `PASSWORD_RULES` - cùng nguồn với schema, nên bảng nói đạt thì submit
 * không thể đỏ vì luật mật khẩu. Thành công: reset form + làm mới `auth.me` để `hasPassword` đảo.
 */
export function useChangePasswordForm({ onSuccess }: { onSuccess: (note: string) => void }) {
  const t = useTranslations('Account.changePassword');
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const labels = useAuthSchemaLabels();
  const { data: user } = useCurrentUser();
  // Chưa nạp người dùng thì mặc định "đã có mật khẩu" - nhánh đòi thêm bằng chứng, an toàn hơn.
  const hasPassword = user?.hasPassword ?? true;
  const [formError, setFormError] = useState<string | null>(null);

  const schema = useMemo(
    () =>
      yup.object({
        // MỘT schema cho cả hai nhánh, chỉ đổi LUẬT: hai schema khác nhau làm kiểu suy ra của
        // `yupResolver` thành hợp của hai shape và form mất bảo chứng khoá.
        currentPassword: yup
          .string()
          .defined()
          .test(
            'currentRequired',
            labels.passwordRequired,
            (value) => !hasPassword || Boolean(value),
          ),
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
        ? changePassword(values.currentPassword, values.newPassword)
        : setPassword(values.newPassword),
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
    // Enter vẫn submit form khi nút đang quay - chặn lượt thứ hai ở đây.
    if (save.isPending) return;
    setFormError(null);
    save.mutate(values);
  });

  /*
   * Nhãn từng luật đi qua bảng tra `Record` đầy đủ: thêm một luật vào `PASSWORD_RULES` mà quên
   * viết nhãn thì đỏ ngay lúc biên dịch, thay vì lặng lẽ rơi xuống một nhánh mặc định.
   */
  const ruleLabels: Record<(typeof PASSWORD_RULES)[number]['key'], string> = {
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
