'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { CtaButton } from '@/features/marketplace/components/CtaButton';
import { useWithdrawGate } from '../hooks';
import type { WalletScope } from '../types';
import { WalletSummaryCard } from './WalletSummaryCard';
import { WithdrawDialog } from './WithdrawDialog';
import styles from './WalletView.module.css';

/**
 * Tab "Tài khoản thanh toán" của khu tài khoản KHÁCH (`/account/balance`, Figma `19879:74829`):
 * thẻ số dư có nút Rút cùng hàng con số khả dụng, rồi khối tài khoản nhận tiền (`payout`).
 *
 * Lệnh rút và sổ ví là các dòng của tab "Lịch sử giao dịch" (`GET /account/transactions`), nên
 * không tải ở đây. Trang số dư của site PARTNER có bố cục riêng (hai tab + cột phải) — xem
 * `PartnerBalanceView`; từ 04/11/2026 component này chỉ còn phục vụ khu khách.
 */
export function WalletView({
  scope,
  payout,
}: {
  scope: WalletScope;
  /**
   * Khối "Tài khoản nhận tiền" — đứng NGAY dưới thẻ số dư. Là một slot chứ không phải cờ: trang
   * quyết định id cuộn, tiêu đề và khung của khối đó.
   */
  payout?: ReactNode;
}) {
  const t = useTranslations('Wallet');
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const { canWithdraw, hint } = useWithdrawGate(scope);

  return (
    <div className={styles.page}>
      <WalletSummaryCard
        scope={scope}
        variant="panel"
        action={
          <CtaButton
            variant="neutral"
            disabled={!canWithdraw}
            onClick={() => setWithdrawOpen(true)}
          >
            {t('withdraw.actionLinked')}
          </CtaButton>
        }
        hint={hint}
      />

      {payout}

      <WithdrawDialog scope={scope} open={withdrawOpen} onClose={() => setWithdrawOpen(false)} />
    </div>
  );
}
