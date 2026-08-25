import { API_ERROR_CODE } from '@xeprime/types';
import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from './client';
import { CLIENT_ERROR_CODE } from './errors';
import { anonymousAuthTransport, bearerAuthTransport } from './transport';
import type { FetchLike } from './http';

const BASE_URL = 'http://localhost:4000';

const UNAUTHORIZED = {
  status: 401,
  body: { error: { code: API_ERROR_CODE.UNAUTHENTICATED, message: 'x' } },
};

function sequence(...responses: Array<{ status: number; body?: unknown }>) {
  let index = 0;
  const fetchImpl: FetchLike = () => {
    const next = responses[Math.min(index, responses.length - 1)]!;
    index += 1;
    return Promise.resolve({
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      text: () => Promise.resolve(next.body === undefined ? '' : JSON.stringify(next.body)),
    });
  };
  return { fetch: fetchImpl, count: () => index };
}

/**
 * App chỉ biết token hết hạn theo ĐỒNG HỒ MÁY. Server từ chối sớm hơn thế (đồng hồ lệch, đổi mật
 * khẩu, đăng xuất từ thiết bị khác, admin khoá) thì 401 là tin duy nhất client nhận được.
 */
describe('onUnauthorized — gửi lại đúng một lần', () => {
  it('làm mới được danh tính thì request đi lại và thành công', async () => {
    const seq = sequence(UNAUTHORIZED, { status: 200, body: { data: { id: 'u1' } } });
    const onUnauthorized = vi.fn().mockResolvedValue(true);

    const result = await createApiClient({
      baseUrl: BASE_URL,
      transport: anonymousAuthTransport(),
      fetch: seq.fetch,
      onUnauthorized,
    }).get('/vehicles');

    expect(result).toEqual({ id: 'u1' });
    expect(seq.count()).toBe(2);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('không làm mới được thì ném 401 lên, không gửi lại', async () => {
    const seq = sequence(UNAUTHORIZED);

    await expect(
      createApiClient({
        baseUrl: BASE_URL,
        transport: anonymousAuthTransport(),
        fetch: seq.fetch,
        onUnauthorized: () => false,
      }).get('/vehicles'),
    ).rejects.toMatchObject({ status: 401 });

    expect(seq.count()).toBe(1);
  });

  /** Lần gửi lại không gọi lại hook — đó là thứ chặn vòng lặp. */
  it('lần gửi lại cũng 401 thì dừng, không lặp vô hạn', async () => {
    const seq = sequence(UNAUTHORIZED);
    const onUnauthorized = vi.fn().mockResolvedValue(true);

    await expect(
      createApiClient({
        baseUrl: BASE_URL,
        transport: anonymousAuthTransport(),
        fetch: seq.fetch,
        onUnauthorized,
      }).get('/vehicles'),
    ).rejects.toMatchObject({ status: 401 });

    expect(seq.count()).toBe(2);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('gửi lại dùng danh tính MỚI, không phải cái vừa bị từ chối', async () => {
    const seen: Array<string | undefined> = [];
    let token = 'cu';
    const capture: FetchLike = (_url, init) => {
      seen.push(init?.headers?.Authorization);
      const first = seen.length === 1;
      return Promise.resolve({
        ok: !first,
        status: first ? 401 : 200,
        text: () => Promise.resolve(first ? JSON.stringify(UNAUTHORIZED.body) : '{"data":1}'),
      });
    };

    await createApiClient({
      baseUrl: BASE_URL,
      transport: bearerAuthTransport(() => token),
      fetch: capture,
      onUnauthorized: () => {
        token = 'moi';
        return true;
      },
    }).get('/vehicles');

    expect(seen).toEqual(['Bearer cu', 'Bearer moi']);
  });

  it('lỗi khác 401 không kích hoạt hook', async () => {
    const onUnauthorized = vi.fn();
    const seq = sequence({
      status: 500,
      body: { error: { code: API_ERROR_CODE.INTERNAL_ERROR, message: 'x' } },
    });

    await expect(
      createApiClient({
        baseUrl: BASE_URL,
        transport: anonymousAuthTransport(),
        fetch: seq.fetch,
        onUnauthorized,
      }).get('/vehicles'),
    ).rejects.toMatchObject({ status: 500 });

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  // Mất mạng không phải mất phiên — hook chỉ dành cho câu trả lời THẬT của server.
  it('lỗi mạng không kích hoạt hook', async () => {
    const onUnauthorized = vi.fn();

    await expect(
      createApiClient({
        baseUrl: BASE_URL,
        transport: anonymousAuthTransport(),
        fetch: () => Promise.reject(new TypeError('Network request failed')),
        onUnauthorized,
      }).get('/vehicles'),
    ).rejects.toMatchObject({ code: CLIENT_ERROR_CODE.NETWORK_ERROR });

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('client không cắm hook thì 401 đi thẳng lên như cũ', async () => {
    const seq = sequence(UNAUTHORIZED);

    await expect(
      createApiClient({
        baseUrl: BASE_URL,
        transport: anonymousAuthTransport(),
        fetch: seq.fetch,
      }).get('/vehicles'),
    ).rejects.toMatchObject({ status: 401 });

    expect(seq.count()).toBe(1);
  });
});
