import { useLocalSearchParams } from 'expo-router';
import { PartnerBalanceScreen } from '@/features/wallet/PartnerBalanceScreen';
import { BALANCE_PAYOUT_SECTION, BALANCE_SECTION_PARAM } from '@/navigation/routes-base';

/**
 * Số dư của GIAN HÀNG — khoản XePrime phải trả sau mỗi chuyến (ADR 0033 điều 2), kèm tài khoản
 * nhận tiền và thẻ thuế đã khấu trừ (web `PartnerBalanceView`, PR #159).
 *
 * KHÔNG gác bằng `PLAN_FEATURE`: đây là tiền của chính họ. Gói hết hạn vẫn phải xem và rút được —
 * ADR 0027 điều 3. Chỉ CHỦ thấy nội dung; thành viên thấy câu "chỉ chủ sở hữu".
 * `?section=payout` (alias `/manage/bank-accounts`) cuộn tới khối tài khoản nhận tiền.
 */
export default function ManageBalanceRoute() {
  const params = useLocalSearchParams<{ [BALANCE_SECTION_PARAM]?: string }>();
  const section = params[BALANCE_SECTION_PARAM];
  return <PartnerBalanceScreen focusPayout={section === BALANCE_PAYOUT_SECTION} />;
}
