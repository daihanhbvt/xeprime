import { yupResolver } from '@hookform/resolvers/yup';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import { SUPPORT_CASE_CATEGORY } from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import {
  SUPPORT_SURFACE,
  useOpenSupportCase,
  useSupportCases,
  useWithdrawAccountDeletion,
} from '@/features/support-cases/hooks/use-support-cases';
import { useErrorMessage } from '@/i18n/use-error-message';

/** Các nhóm dữ liệu bị xử lý — khoá `Account.deleteAccount.items.*`, cùng thứ tự với web. */
export const ACCOUNT_DELETION_ITEMS = ['profile', 'vehicles', 'trips', 'billing'] as const;

export interface AccountDeletionValues {
  acknowledged: boolean;
}

/**
 * Yêu cầu xoá tài khoản đang mở (nếu có) + hai thao tác gửi/rút — bản native của
 * `useAccountDeletionRequest` web. Vẫn là một YÊU CẦU (support case `account_deletion`, nền tảng xử
 * lý tay), không phải nút xoá.
 */
export function useAccountDeletionRequest() {
  const pendingQuery = useSupportCases(SUPPORT_SURFACE.CUSTOMER, {
    category: SUPPORT_CASE_CATEGORY.ACCOUNT_DELETION,
    limit: 1,
  });
  const openCase = useOpenSupportCase(SUPPORT_SURFACE.CUSTOMER);
  const withdraw = useWithdrawAccountDeletion();

  return { pendingQuery, pending: pendingQuery.data?.items[0], openCase, withdraw };
}

/**
 * Biểu mẫu gửi yêu cầu: MỘT ô tick xác nhận bắt buộc, kiểm ngay lúc tick (`onChange`) để nút gửi
 * bật/tắt theo nó — như `useAccountDeletionForm` web. Gửi xong ô tick trả về trống.
 */
export function useAccountDeletionForm(openCase: ReturnType<typeof useOpenSupportCase>) {
  const t = useTranslations('Account.deleteAccount');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();

  const schema = useMemo(
    () =>
      yup.object({
        // `.test` thay vì `.oneOf([true])`: giữ kiểu `boolean` cho form, chỉ đổi luật.
        acknowledged: yup
          .boolean()
          .required(t('acknowledgeRequired'))
          .test('acknowledged', t('acknowledgeRequired'), (value) => value === true),
      }),
    [t],
  );

  const form = useForm<AccountDeletionValues>({
    resolver: yupResolver(schema),
    defaultValues: { acknowledged: false },
    mode: 'onChange',
  });

  const onSubmit = form.handleSubmit(() => {
    if (openCase.isPending) return;
    openCase.mutate(
      {
        category: SUPPORT_CASE_CATEGORY.ACCOUNT_DELETION,
        subject: t('caseSubject'),
        description: t('caseDescription'),
      },
      {
        onSuccess: () => {
          toast.showSuccess(t('submitted'));
          form.reset();
        },
        onError: (err) => toast.showError(errorMessage(err)),
      },
    );
  });

  return { ...form, onSubmit };
}
