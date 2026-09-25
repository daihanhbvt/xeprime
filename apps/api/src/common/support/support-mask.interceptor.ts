import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { SUPPORT_CAPABILITY } from '@xeprime/types';
import { map, type Observable } from 'rxjs';
import { maskEmail, maskPhone } from '../mask';
import type { RequestContext } from '../types/request-context';
import { SupportRequestStore } from './support-request.store';

/**
 * Che dữ liệu cá nhân trong MỌI response trả cho một phiên hỗ trợ gian hàng (ADR 0050 §11).
 *
 * Vì sao ở tầng interceptor chứ không ở từng service: Đợt 2A mở hàng chục endpoint đọc có sẵn cho
 * phiên, và chúng trả PII thô (SĐT/email khách, số giấy tờ tài xế, MST chủ gian hàng) vì người đọc
 * vốn là chính gian hàng. Che ở từng mapper là để sót mapper thứ n+1 — che theo TÊN TRƯỜNG ở cửa ra
 * thì một endpoint mới mở cho phiên mặc định đã được che. Shape giữ nguyên (chuỗi bị che vẫn là
 * chuỗi, trường nullable thành null) để các màn dùng lại không phải biết gì.
 *
 * Ngoài phiên (`req.tenant.support` vắng) interceptor không làm gì — người của gian hàng thấy đúng
 * như trước. Không có đường "bỏ che" qua phiên: xem PII đầy đủ vẫn là thao tác NỀN TẢNG riêng
 * (`platform.customers.view_pii`, có audit từng lần).
 */

/** SĐT: `phone`, `customerPhone`, `normalizedPhone`, `ownerPhone`… */
const PHONE_KEY = /phone$/i;
/** Email: `email`, `customerEmail`, `invitedEmail`… */
const EMAIL_KEY = /email$/i;
/** Số định danh / pháp lý — giữ 2 ký tự cuối. */
const IDENTIFIER_KEYS = new Set([
  'idNo',
  'idNumber',
  'licenseNo',
  'documentNumber',
  'taxCode',
  'businessLicenseNo',
  'bankAccountNo',
  'bankAccountNumber',
]);
/** Địa chỉ NHÀ của khách — chỉ có nghĩa là PII trong response của sổ khách. */
const CUSTOMER_ADDRESS_KEYS = new Set(['address', 'location']);
/** Tổng công nợ ở thẻ tổng hợp sổ khách — công nợ không mở trong phiên. */
const CUSTOMER_DEBT_KEYS = new Set(['totalDebt', 'debtCustomers']);
/**
 * Lý do rủi ro gian hàng tự ghi về khách — cùng loại với ghi chú khách (sổ RIÊNG của gian hàng, ADR
 * 0050 §10). Mức rủi ro (`riskLevel`) vẫn hiện: đó là nhãn, không phải lời bình.
 */
const CUSTOMER_PRIVATE_KEYS = new Set(['riskReason']);

export function maskIdentifier(value: string): string {
  if (value.length <= 2) return '*'.repeat(value.length);
  return `${'*'.repeat(value.length - 2)}${value.slice(-2)}`;
}

export function maskSupportPayload(value: unknown, opts: { customerScope: boolean }): unknown {
  if (Array.isArray(value)) return value.map((item) => maskSupportPayload(item, opts));
  if (value === null || typeof value !== 'object') return value;
  // Giá trị có dạng JSON riêng (`Prisma.Decimal`, `Date`, `Buffer`) là LÁ: đi vào nó sẽ biến tiền thành
  // `{ s, e, d }` và `ResponseInterceptor` không còn nhận ra để ép về chuỗi (ADR 0007).
  if (typeof (value as { toJSON?: unknown }).toJSON === 'function') return value;

  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'string' && PHONE_KEY.test(key)) out[key] = maskPhone(raw);
    else if (typeof raw === 'string' && EMAIL_KEY.test(key)) out[key] = maskEmail(raw);
    else if (typeof raw === 'string' && IDENTIFIER_KEYS.has(key)) out[key] = maskIdentifier(raw);
    else if (opts.customerScope && CUSTOMER_ADDRESS_KEYS.has(key)) out[key] = null;
    else if (opts.customerScope && CUSTOMER_DEBT_KEYS.has(key)) out[key] = null;
    else if (opts.customerScope && CUSTOMER_PRIVATE_KEYS.has(key)) out[key] = null;
    else out[key] = maskSupportPayload(raw, opts);
  }
  return out;
}

@Injectable()
export class SupportMaskInterceptor implements NestInterceptor {
  constructor(private readonly store: SupportRequestStore) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<RequestContext>();
    if (!req.tenant?.support) return next.handle();
    // Endpoint của sổ khách (capability nó khai, guard ghi vào store): địa chỉ nhà + tổng công nợ
    // cũng bị lược, không chỉ liên hệ.
    const capability = this.store.state()?.capability ?? '';
    const customerScope = capability.split(',').includes(SUPPORT_CAPABILITY.CUSTOMER_VIEW_MASKED);
    return next.handle().pipe(map((body) => maskSupportPayload(body, { customerScope })));
  }
}
