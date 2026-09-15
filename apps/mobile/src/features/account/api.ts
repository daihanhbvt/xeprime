// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export { accountApi, CONTACT_CHANNEL } from '@/api/account/api';
export type {
  ContactChannel,
  SendEmailOtpInput,
  SendOtpResult,
  SendPhoneOtpInput,
  UpdateProfileInput,
  UserProfile,
  VerifyEmailInput,
  VerifyPhoneInput,
} from '@/api/account/api';
