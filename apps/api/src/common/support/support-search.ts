import { phoneLookupVariants } from '../phone';
import { currentSupportScope } from './support-request.store';

/**
 * Luật tìm kiếm trên cột PII trong một phiên hỗ trợ gian hàng (ADR 0050 §11).
 *
 * `SupportMaskInterceptor` che SĐT/email/số giấy tờ ở RESPONSE — nhưng một ô tìm kiếm so
 * `LIKE '%…%'` trên chính các cột đó biến việc che thành đảo ngược được: SĐT che còn 3+3 số, bốn
 * số ẩn dò ra trong vài chục lượt `?q=`; email và số GPLX dò được từng ký tự. Nên trong phiên:
 *
 *  - SĐT chỉ khớp khi gõ ĐỦ số (≥ 10 chữ số) và so BẰNG trên mọi dạng lưu (`phoneLookupVariants`);
 *  - email chỉ khớp nguyên văn (không phân biệt hoa thường);
 *  - số giấy tờ (GPLX, CCCD…) không bao giờ là điều kiện tìm.
 *
 * Tìm theo tên/mã đơn/biển số giữ nguyên. Trường hợp chính đáng — "khách đọc số của họ cho tôi" —
 * vẫn chạy vì đó là khớp đủ số. Ngoài phiên helper không đổi gì: ô tìm kiếm của gian hàng vẫn
 * tìm gần đúng như trước.
 */
export interface PiiSearch {
  /** `true` ⇒ request thường: cột PII được so gần đúng như cũ. */
  readonly substring: boolean;
  /** Trong phiên: các dạng lưu của một SĐT gõ đủ số, để so `in`. Rỗng ⇒ không so SĐT. */
  readonly phones: readonly string[];
  /** Trong phiên: email gõ nguyên văn (chữ thường), hoặc `null` ⇒ không so email. */
  readonly email: string | null;
}

const MIN_EXACT_PHONE_DIGITS = 10;

export function piiSearch(raw: string): PiiSearch {
  if (!currentSupportScope()) return { substring: true, phones: [], email: null };
  const q = raw.trim();
  const digits = q.replace(/\D/g, '');
  const looksLikePhone = digits.length >= MIN_EXACT_PHONE_DIGITS && /^[\d\s+().-]+$/.test(q);
  const looksLikeEmail = /^[^\s@]+@[^\s@]+$/.test(q);
  return {
    substring: false,
    phones: looksLikePhone ? phoneLookupVariants(q) : [],
    email: looksLikeEmail ? q.toLowerCase() : null,
  };
}
