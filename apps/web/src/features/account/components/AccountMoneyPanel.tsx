'use client';

import { useCurrentUser } from '@/hooks/use-current-user';
import { BankAccountList } from '@/features/bank-accounts/components/BankAccountList';
import { WalletSummaryCard } from '@/features/wallet/components/WalletSummaryCard';
import { walletHrefFor, walletScopeFor } from '@/features/wallet/wallet-scope';

import styles from './AccountMoneyPanel.module.css';

/**
 * TIỀN trong hồ sơ "Tài khoản của tôi" (16/09/2026).
 *
 * ## Vì sao tiền về đây
 *
 * Trước đợt này, một chủ xe tuyến hoa hồng mở menu và gặp BA màn tiền đứng cạnh nhau — "Tiền cho
 * thuê xe", "Lịch sử thanh toán", "Tài khoản nhận tiền" — cộng thêm "Ví điểm" ở nhánh khách thuê.
 * Không mục nào tự nói mình chứa gì, và người đi tìm tiền của mình phải mở lần lượt để đoán.
 *
 * Nay có MỘT cửa. Thẻ dưới đây trả lời câu hỏi đầu tiên ("XePrime đang nợ tôi bao nhiêu, rút được
 * bao nhiêu"), còn sổ giao dịch và các lệnh rút nằm sau một cú bấm — chúng là thứ người ta mở khi
 * đã có câu trả lời đầu tiên và muốn tra soát.
 *
 * ## Ba con số, không phải một
 *
 * `WalletSummaryCard` tách khả dụng · đang chuyển · tổng nghĩa vụ (ADR 0033 điều 6). Gộp lại
 * thành một con số sẽ làm người dùng hoặc tưởng rút được nhiều hơn thực tế, hoặc tưởng tiền đã
 * biến mất trong lúc chờ chuyển.
 *
 * ## Một ví, và `walletScopeFor` là nơi duy nhất quyết định nó thuộc về ai
 *
 * Chủ xe: ví thuộc TENANT — nhận cả tiền hoàn khi chính họ đi thuê lẫn khoản được nhận khi cho
 * thuê, và giữ nguyên khi nâng lên gói (ADR 0038 điều 2). Khách thuê thuần: ví thuộc `user`.
 * Sổ tài khoản ngân hàng đi theo ĐÚNG chủ ví đó, nếu không thì lệnh chuyển có một đích mà sổ
 * không thấy — chính là lỗi mà `provideRefundAccount` vừa phải sửa.
 */
export function AccountMoneyPanel() {
  const { data: user } = useCurrentUser();

  // Chưa biết mình là ai thì chưa chọn sổ: đoán sai scope nghĩa là hiện "0 điểm" cho người đang
  // có tiền, và đó là câu trả lời tệ nhất cho câu hỏi họ đang hỏi.
  if (!user) return null;

  const scope = walletScopeFor(user);

  return (
    <div className={styles.stack}>
      <WalletSummaryCard scope={scope} href={walletHrefFor(user)} />
      <BankAccountList scope={scope} />
    </div>
  );
}
