// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export { paymentsApi } from '@/api/payments/api';
export { settlementApi } from '@/api/settlement/api';

export type { Payment, RecordPaymentInput } from '@/api/payments/api';
export type {
  BookingSettlement,
  BookingSurcharge,
  CorrectRefundInput,
  DepositRefund,
  OvertimeSuggestion,
  RecordRefundInput,
  SaveSurchargeInput,
} from '@/api/settlement/api';
