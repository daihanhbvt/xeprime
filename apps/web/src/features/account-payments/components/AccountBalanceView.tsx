'use client';

import { useSearchParams } from 'next/navigation';

import { BALANCE_PAYOUT_DOM_ID, BALANCE_PAYOUT_SECTION, SECTION_PARAM } from '@/constants/routes';
import { BankAccountList } from '@/features/bank-accounts/components/BankAccountList';
import { WalletView } from '@/features/wallet/components/WalletView';
import { useWalletSummary } from '@/features/wallet/hooks';
import { useScrollToSection } from '@/hooks/use-scroll-to-section';

import styles from './AccountBalanceView.module.css';
import { PayoutNotes } from './PayoutNotes';

/**
 * Tab "Tài khoản thanh toán" của mục Quản lý thanh toán — design Account / Balance (Figma
 * `19879:74829`): thẻ số dư có nút "Rút về ngân hàng liên kết", rồi NGAY dưới là tài khoản nhận
 * tiền (thẻ chi tiết + khối lưu ý), sau đó các lệnh rút và sổ ví.
 *
 * Trước đây "Số dư của tôi" và "Tài khoản nhận tiền" là hai trang: rút tiền và nơi tiền về là MỘT
 * việc, nên người bấm "Rút" mà chưa có tài khoản phải thấy chỗ khai trên cùng màn — cùng bố cục
 * với trang số dư của site partner (`PartnerBalanceView`), khác DÁNG (`appearance="account"`).
 *
 * `?section=payout` cuộn tới khối tài khoản nhận tiền — đích của đường cũ `/account/bank-accounts`.
 * Ví của TÀI KHOẢN KHÁCH (ADR 0053 điều 8), nên scope luôn là `account`.
 */
export function AccountBalanceView() {
  const payoutInUrl = useSearchParams().get(SECTION_PARAM) === BALANCE_PAYOUT_SECTION;
  /*
   * Chỉ cuộn khi thẻ số dư phía trên ĐÃ có dữ liệu: lúc nó còn là khung chờ, khối nhận tiền nằm cao
   * hơn chỗ cuối cùng của nó, và cú cuộn đặt người dùng lơ lửng phía trên đích. Chưa sẵn sàng thì đích
   * là chuỗi rỗng — đổi sang id thật là lệnh cuộn (`useScrollToSection`). Cùng khoá cache với thẻ số
   * dư, không thêm request.
   */
  const summary = useWalletSummary('account');
  useScrollToSection(payoutInUrl && summary.isSuccess ? BALANCE_PAYOUT_DOM_ID : '', payoutInUrl);

  return (
    <WalletView
      scope="account"
      appearance="account"
      payout={
        <BankAccountList
          scope="account"
          appearance="account"
          id={BALANCE_PAYOUT_DOM_ID}
          className={styles.payout}
          footer={<PayoutNotes maxBusinessDays={summary.data?.maxBusinessDays} />}
        />
      }
    />
  );
}
