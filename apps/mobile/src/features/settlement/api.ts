// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export { settlementApi, paymentsApi } from '@xeprime/api-client';

export type {
  BookingSettlement,
  BookingSurcharge,
  CorrectRefundInput,
  DepositRefund,
  OvertimeSuggestion,
  Payment,
  RecordPaymentInput,
  RecordRefundInput,
  SaveSurchargeInput,
} from '@xeprime/api-client';
