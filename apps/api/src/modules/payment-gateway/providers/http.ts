import type { PaymentGatewayProvider } from '@xeprime/types';
import { PaymentProviderError } from './gateway-adapter';

/**
 * MoMo đòi timeout tối thiểu 30 giây cho cả API tạo phiên lẫn API truy vấn (developers.momo.vn —
 * One-Time Payments · Check Transaction Status). Dùng chung cho VNPAY cho đơn giản: một cổng chậm
 * hơn chừng đó là cổng đang hỏng, không phải đang bận.
 */
export const PROVIDER_HTTP_TIMEOUT_MS = 30_000;

/**
 * POST JSON sang cổng, trả về object JSON của phản hồi.
 *
 * Mọi thất bại (mạng, timeout, HTTP lỗi, thân không phải JSON object) thành `PaymentProviderError`
 * mang một mã ngắn — KHÔNG mang thân request (có chữ ký) hay phản hồi thô vào thông điệp lỗi, vì
 * thông điệp lỗi đi vào log.
 *
 * Không bao giờ được gọi bên trong một transaction DB: một cổng treo 30 giây là một transaction
 * giữ khoá 30 giây.
 */
export async function postProviderJson(
  provider: PaymentGatewayProvider,
  url: string,
  body: unknown,
  timeoutMs: number = PROVIDER_HTTP_TIMEOUT_MS,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut =
      error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    throw new PaymentProviderError(provider, timedOut ? 'timeout' : 'network');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await response.text());
  } catch {
    throw new PaymentProviderError(provider, `http_${response.status}_not_json`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new PaymentProviderError(provider, `http_${response.status}_not_object`);
  }
  const json = parsed as Record<string, unknown>;
  if (!response.ok) {
    // Cổng trả lỗi kèm mã nghiệp vụ trong thân (MoMo `resultCode`) — giữ mã đó, bỏ phần còn lại.
    const code = json['resultCode'] ?? json['vnp_ResponseCode'];
    throw new PaymentProviderError(
      provider,
      `http_${response.status}${code !== undefined ? `_result_${String(code)}` : ''}`,
    );
  }
  return json;
}

/** Đọc một trường của payload ngoài thành chuỗi — số được giữ nguyên chữ số, thiếu là chuỗi rỗng. */
export function fieldText(raw: Record<string, unknown>, key: string): string {
  const value = raw[key];
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'bigint') return value.toString();
  return '';
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
