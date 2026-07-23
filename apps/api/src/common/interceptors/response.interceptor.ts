import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import { map, type Observable } from 'rxjs';

/**
 * Bọc mọi response thành `{ data, meta }` (CLAUDE.md mục 9) và chuẩn hoá kiểu dữ liệu
 * không JSON-safe.
 *
 * `Prisma.Decimal` là chỗ dễ sai nhất: JSON.stringify ra `"123.45"` ở một số phiên bản và
 * `{ s, e, d }` ở phiên bản khác. Ép về string ngay tại đây để hợp đồng API ổn định —
 * ADR 0007 quy định tiền đi qua JSON dưới dạng string.
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((payload) => wrap(normalize(payload))));
  }
}

function wrap(payload: unknown): unknown {
  // Handler đã tự trả đúng envelope thì giữ nguyên, tránh bọc hai lần.
  if (payload !== null && typeof payload === 'object' && ('data' in payload || 'error' in payload)) {
    return payload;
  }
  return { data: payload };
}

function normalize(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (Prisma.Decimal.isDecimal(value)) {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(normalize);
  }

  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = normalize(v);
    }
    return out;
  }

  return value;
}
