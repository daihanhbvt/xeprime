import { HttpException } from '@nestjs/common';
import { API_ERROR_CODE } from '@xeprime/types';

/**
 * Hỏng ở một chặng của luồng OAuth — ADR 0019.
 *
 * KHÔNG kế thừa `HttpException`: hai route `/auth/social/*` là điều hướng trình duyệt, nên lỗi
 * ở đó phải thành `302 …?authError=<mã>` chứ không phải một body JSON. Dùng exception của Nest
 * ở đây là mời exception filter toàn cục trả JSON và đưa người dùng tới một trang trắng chứa
 * `{"error":…}` ngay giữa lúc họ đang đăng nhập.
 *
 * `detail` chỉ để ghi log phía server. Nó KHÔNG bao giờ ra tới client — thông điệp mà provider
 * trả về có thể chứa cả tham số của request, và client chỉ cần biết MÃ (ADR 0012).
 */
export class SocialAuthFailure extends Error {
  readonly code: string;

  constructor(code: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'SocialAuthFailure';
    this.code = code;
  }
}

/**
 * Rút mã lỗi ổn định ra khỏi bất kỳ thứ gì bị ném trong luồng OAuth.
 *
 * Ba nguồn: `SocialAuthFailure` (chặng OAuth), `HttpException` do `AuthService` ném (`CONFLICT`
 * khi email đã có tài khoản, `ACCOUNT_LOCKED` khi tài khoản bị khoá — hai mã này web ĐÃ có bản
 * dịch), và lỗi lạ. Lỗi lạ quy về `SOCIAL_EXCHANGE_FAILED` thay vì rò ra ngoài: một
 * `TypeError` hiện lên màn đăng nhập không nói gì cho người dùng và nói quá nhiều cho người khác.
 */
export function socialErrorCode(error: unknown): string {
  if (error instanceof SocialAuthFailure) return error.code;

  if (error instanceof HttpException) {
    const body = error.getResponse();
    if (typeof body === 'object' && body !== null && 'code' in body) {
      const { code } = body as { code?: unknown };
      if (typeof code === 'string') return code;
    }
  }

  return API_ERROR_CODE.SOCIAL_EXCHANGE_FAILED;
}
