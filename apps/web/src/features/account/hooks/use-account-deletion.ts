'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { App } from 'antd';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import * as yup from 'yup';
import {
  CUSTOMER_TRIP_FILTER,
  SUPPORT_CASE_CATEGORY,
  TRIP_ROLE,
  WITHDRAWAL_STATUS_HOLDING_FUNDS,
  type WithdrawalStatus,
} from '@xeprime/types';

import {
  useOpenSupportCase,
  useSupportCases,
  useWithdrawAccountDeletion,
} from '@/features/support-cases/hooks/use-support-cases';
import { SUPPORT_SURFACE } from '@/features/support-cases/types';
import { useTrips } from '@/features/trips/hooks';
import { useWalletSummary, useWithdrawals } from '@/features/wallet/hooks';
import { walletScopeFor } from '@/features/wallet/wallet-scope';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useErrorMessage } from '@/i18n/use-error-message';

/** Nhóm dữ liệu bị xoá/vô hiệu khi yêu cầu được chấp nhận — khoá `Account.deleteAccount.items`. */
export const ACCOUNT_DELETION_ITEMS = ['profile', 'vehicles', 'trips', 'billing'] as const;

interface AccountDeletionValues {
  acknowledged: boolean;
}

/**
 * Yêu cầu xoá tài khoản của CHÍNH người đang đăng nhập — một support case `account_deletion`,
 * nền tảng xử lý tay (không phải nút xoá).
 *
 * Một nguồn cho mọi bề mặt hiện yêu cầu này (khối nhúng của site partner `DeleteAccountView`, hộp
 * thoại của trang Bảo mật tài khoản ở site khách): đọc case đang mở (server giữ tối đa MỘT case
 * loại này còn mở cho mỗi người — danh sách mặc định chỉ trả case còn mở), mở case, rút case.
 */
export function useAccountDeletionRequest() {
  const pendingQuery = useSupportCases(SUPPORT_SURFACE.CUSTOMER, {
    category: SUPPORT_CASE_CATEGORY.ACCOUNT_DELETION,
    limit: 1,
  });
  const openCase = useOpenSupportCase(SUPPORT_SURFACE.CUSTOMER);
  const withdraw = useWithdrawAccountDeletion();

  return {
    pendingQuery,
    pending: pendingQuery.data?.items[0],
    openCase,
    withdraw,
  };
}

/**
 * Form "tôi đã đọc và xác nhận" + lượt gửi case — một bản cho khối nhúng (site partner) và hộp
 * thoại (site khách). Nút gửi chỉ bật khi đã tick: `mode: 'onChange'` kiểm ngay lúc tick.
 * `onSubmitted` chạy sau khi case đã mở (form đã reset).
 */
export function useAccountDeletionForm(
  openCase: ReturnType<typeof useAccountDeletionRequest>['openCase'],
  onSubmitted?: () => void,
) {
  const t = useTranslations('Account.deleteAccount');
  const { message } = App.useApp();
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

  const { control, handleSubmit, reset, formState } = useForm<AccountDeletionValues>({
    resolver: yupResolver(schema),
    defaultValues: { acknowledged: false },
    mode: 'onChange',
  });

  const onSubmit = handleSubmit(() => {
    // Enter vẫn submit khi nút đang quay — chặn lượt thứ hai ở đây.
    if (openCase.isPending) return;
    openCase.mutate(
      {
        category: SUPPORT_CASE_CATEGORY.ACCOUNT_DELETION,
        subject: t('caseSubject'),
        description: t('caseDescription'),
      },
      {
        onSuccess: () => {
          message.success(t('submitted'));
          reset();
          onSubmitted?.();
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  });

  return { control, onSubmit, reset, formState };
}

/**
 * ẢNH HƯỞNG của việc đóng tài khoản: số dư ví điểm, lệnh rút còn giữ tiền, chuyến đi thuê chưa
 * khép. KHÔNG chặn việc gửi yêu cầu (người quyết cuối cùng là con người ở XePrime — ADR 0033); lỗi
 * đọc chỉ thành một dòng "chưa kiểm tra được", không thành rào chắn.
 *
 * Ví thuộc `user` hay tenant do `walletScopeFor` quyết — không đoán lại ở đây. Nhân viên gian hàng
 * không có ví (`null`) ⇒ khối số dư tự ẩn.
 *
 * Chuyến ĐI THUÊ, không phải chuyến cho thuê: đơn của gian hàng thuộc pháp nhân. Trang 1 là đủ —
 * chỉ cần `counts`.
 */
export function useAccountDeletionImpact() {
  const { data: user } = useCurrentUser();
  const scope = walletScopeFor(user);
  const hasWallet = Boolean(user) && scope !== null;
  const wallet = useWalletSummary(scope ?? 'account', { enabled: hasWallet });
  const withdrawals = useWithdrawals(scope ?? 'account', { enabled: hasWallet });
  const renterTrips = useTrips(CUSTOMER_TRIP_FILTER.CURRENT, 1, TRIP_ROLE.RENTER);

  const queries = [wallet, withdrawals, renterTrips];
  const holding = (withdrawals.data ?? []).filter((row) =>
    (WITHDRAWAL_STATUS_HOLDING_FUNDS as readonly string[]).includes(row.status as WithdrawalStatus),
  ).length;
  const openTrips = renterTrips.data?.counts.current ?? 0;
  // Còn nghĩa vụ tiền = còn thứ phải đối soát TRƯỚC khi đóng, không phải sau.
  const hasMoney =
    Number(wallet.data?.available ?? 0) > 0 || Number(wallet.data?.pending ?? 0) > 0 || holding > 0;

  return {
    user,
    hasWallet,
    wallet: wallet.data,
    holding,
    openTrips,
    hasMoney,
    loading: queries.some((q) => q.isLoading),
    failed: queries.some((q) => q.isError),
  };
}
