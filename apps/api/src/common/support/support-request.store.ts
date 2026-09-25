import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { SupportScope } from '../types/request-context';

/**
 * Ngữ cảnh phiên hỗ trợ của REQUEST đang chạy (ADR 0050) — đọc được từ bất kỳ đâu trong cây gọi
 * mà không phải luồn tham số qua mọi service.
 *
 * Người đọc chính là `AuditService`: mọi dòng audit ghi trong một phiên hỗ trợ phải mang
 * `actorScope = platform` + id phiên + capability, KỂ CẢ những dòng mà service hiện có vẫn ghi
 * `actorScope: 'tenant'` (bảo dưỡng, đổi chi nhánh…). Sửa từng chỗ gọi là để sót chỗ thứ n+1;
 * đặt luật ở chính cửa ghi audit thì không còn đường nào ghi admin thành người của gian hàng.
 *
 * Store là object MUTABLE được tạo ở middleware cho MỌI request, rồi `TenantScopeGuard` điền
 * vào khi nó xác minh xong phiên. Không dùng `enterWith` trong guard: guard là một hàm async
 * được `await`, ngữ cảnh nó vào sẽ không chảy ngược về nơi gọi.
 */
export interface SupportRequestState {
  support: SupportScope | null;
  /** Capability endpoint đang chạy đã đòi (nhiều cái thì nối bằng dấu phẩy) — `audit_logs.support_capability`. */
  capability: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

const storage = new AsyncLocalStorage<SupportRequestState>();

/**
 * Đọc phiên của request hiện tại KHÔNG qua DI — cho helper thuần (vd. `support-search.ts`) mà
 * service gọi ở giữa một phép dựng câu truy vấn. Cùng nguồn với `SupportRequestStore.current()`.
 */
export function currentSupportScope(): SupportScope | null {
  return storage.getStore()?.support ?? null;
}

@Injectable()
export class SupportRequestStore {
  /** `null` ngoài một request HTTP (worker, seed, test gọi thẳng service). */
  state(): SupportRequestState | null {
    return storage.getStore() ?? null;
  }

  /** Phiên hỗ trợ của request hiện tại — `null` khi đây là thao tác thường. */
  current(): SupportScope | null {
    return storage.getStore()?.support ?? null;
  }

  /** Chỉ `TenantScopeGuard` gọi, sau khi đã xác minh phiên. */
  bind(support: SupportScope, capability: string | null): void {
    const state = storage.getStore();
    // Không có store nghĩa là middleware không chạy — thà từ chối còn hơn để audit ghi sai phía.
    if (!state) throw new Error('SupportRequestStore: request chưa đi qua SupportRequestMiddleware');
    state.support = support;
    state.capability = capability;
  }

  /** Chạy `fn` trong một store mới — cho test và cho middleware. */
  run<T>(state: SupportRequestState, fn: () => T): T {
    return storage.run(state, fn);
  }
}

@Injectable()
export class SupportRequestMiddleware implements NestMiddleware {
  constructor(private readonly store: SupportRequestStore) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const userAgent = req.headers['user-agent'];
    this.store.run(
      {
        support: null,
        capability: null,
        ipAddress: req.ip ?? null,
        userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 1000) : null,
      },
      next,
    );
  }
}
