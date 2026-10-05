'use client';

import { App } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { accountProfileSchema, type AccountProfileValues } from '@xeprime/validators';

import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';

import type { UserProfile } from '../types';
import { useUpdateMyProfile } from './use-account';

function valuesOf(profile: UserProfile): AccountProfileValues {
  return { displayName: profile.displayName, avatarUrl: profile.avatarUrl ?? null };
}

/**
 * Form TÊN + ẢNH ĐẠI DIỆN của tài khoản đang đăng nhập — MỘT định nghĩa cho hai màn: trang tài
 * khoản khách (`AccountView`) và trang Tài khoản & bảo mật của site partner.
 *
 * Hai màn khác bố cục nhưng chung ba thứ mà lệch nhau là một màn gửi lên khác thứ nó hiển thị:
 * schema, giá trị khởi tạo, và thân request (`avatarUrl: null` khi gỡ ảnh — `undefined` nghĩa là
 * "không đụng tới", gửi nó thì nút Xoá ảnh im lặng không làm gì).
 */
export function useAccountProfileForm(
  profile: UserProfile,
  { onSaved }: { onSaved?: () => void } = {},
): {
  form: UseFormReturn<AccountProfileValues>;
  submit: () => Promise<void>;
  /** Về lại giá trị đã lưu. */
  revert: () => void;
  saving: boolean;
} {
  const t = useTranslations('Account');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const update = useUpdateMyProfile();

  const resolver = useValidationResolver<AccountProfileValues>(
    accountProfileSchema,
    'Account.validation',
  );
  const form = useForm<AccountProfileValues>({ resolver, defaultValues: valuesOf(profile) });
  const { reset, handleSubmit } = form;

  // Hồ sơ được refetch (đổi ở tab khác, invalidate sau khi lưu) → nạp lại giá trị vào form,
  // nếu không người dùng sẽ nhìn thấy dữ liệu cũ trong ô nhập.
  useEffect(() => {
    reset({ displayName: profile.displayName, avatarUrl: profile.avatarUrl ?? null });
  }, [profile.displayName, profile.avatarUrl, reset]);

  const submit = handleSubmit((values) => {
    // Enter vẫn submit form khi nút Lưu đang quay — chặn lượt thứ hai ở đây.
    if (update.isPending) return;
    update.mutate(
      { displayName: values.displayName, avatarUrl: values.avatarUrl ?? null },
      {
        onSuccess: () => {
          message.success(t('saved'));
          onSaved?.();
        },
        // Câu lỗi tra từ MÃ (ADR 0012), không hiện `message` tiếng Việt của backend.
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  });

  return {
    form,
    submit,
    revert: () => reset(valuesOf(profile)),
    saving: update.isPending,
  };
}
