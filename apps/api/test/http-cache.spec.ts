import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { API_ERROR_CODE } from '@xeprime/types';
import { lastValueFrom, of, throwError } from 'rxjs';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { HttpCacheInterceptor, PublicCache } from '../src/common/http-cache';

/**
 * Hợp đồng của tầng cache HTTP: `s-maxage` CHỈ được dán lên response THÀNH CÔNG.
 *
 * Đây là lý do `@PublicCache` là interceptor chứ không phải `@Header(...)`: Nest set custom
 * header trước khi handler chạy, nên `@Header` dán cache lên cả lỗi — một cú 500 thoáng qua sẽ
 * được CDN giữ làm bản "tốt" suốt TTL. Spec này khoá cả hai phía của hợp đồng đó, không cần DB.
 *
 * Chạy: pnpm --filter @xeprime/api test -- test/http-cache.spec.ts
 */

class FakeController {
  @PublicCache(30)
  cached(): string {
    return 'ok';
  }

  plain(): string {
    return 'ok';
  }
}

/** ExecutionContext tối thiểu: handler + class cho Reflector, response cho setHeader. */
function contextFor(
  handler: (typeof FakeController.prototype)['cached' | 'plain'],
): { context: ExecutionContext; setHeader: jest.Mock } {
  const setHeader = jest.fn();
  const context = {
    getHandler: () => handler,
    getClass: () => FakeController,
    switchToHttp: () => ({ getResponse: () => ({ setHeader }) }),
  } as unknown as ExecutionContext;
  return { context, setHeader };
}

const next = (result: 'ok' | 'boom'): CallHandler =>
  ({
    handle: () => (result === 'ok' ? of('data') : throwError(() => new Error('db down'))),
  }) as CallHandler;

describe('HttpCacheInterceptor + @PublicCache', () => {
  const interceptor = new HttpCacheInterceptor(new Reflector());

  it('handler thành công: set đúng chuỗi Cache-Control public/s-maxage/swr', async () => {
    const { context, setHeader } = contextFor(FakeController.prototype.cached);
    await lastValueFrom(interceptor.intercept(context, next('ok')));

    expect(setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=0, s-maxage=30, stale-while-revalidate=60',
    );
  });

  it('handler ném lỗi: KHÔNG set header — lỗi không bao giờ được cache dùng chung', async () => {
    const { context, setHeader } = contextFor(FakeController.prototype.cached);
    await expect(lastValueFrom(interceptor.intercept(context, next('boom')))).rejects.toThrow(
      'db down',
    );

    expect(setHeader).not.toHaveBeenCalled();
  });

  it('route không gắn @PublicCache: không đụng gì tới response', async () => {
    const { context, setHeader } = contextFor(FakeController.prototype.plain);
    await lastValueFrom(interceptor.intercept(context, next('ok')));

    expect(setHeader).not.toHaveBeenCalled();
  });
});

describe('AllExceptionsFilter — response lỗi luôn no-store', () => {
  it('ép Cache-Control: no-store trước khi trả body lỗi', () => {
    const setHeader = jest.fn();
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ setHeader, status }) }),
    } as never;

    new AllExceptionsFilter(true).catch(
      new NotFoundException({ code: API_ERROR_CODE.NOT_FOUND, message: 'không thấy' }),
      host,
    );

    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      error: { code: API_ERROR_CODE.NOT_FOUND, message: 'không thấy' },
    });
  });
});
