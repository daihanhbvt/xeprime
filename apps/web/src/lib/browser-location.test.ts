import { afterEach, describe, expect, it, vi } from 'vitest';
import { BROWSER_LOCATION_ERROR, readBrowserCoords } from './browser-location';

type Outcome = { ok: true; accuracy: number } | { ok: false; code: number };

/** Giả lập `navigator.geolocation` trả lần lượt các kết quả đã cho, ghi lại options mỗi lượt. */
function stubGeolocation(outcomes: Outcome[]) {
  const calls: PositionOptions[] = [];
  const getCurrentPosition = vi.fn(
    (ok: PositionCallback, fail: PositionErrorCallback, options: PositionOptions) => {
      calls.push(options);
      const next = outcomes.shift();
      if (!next) throw new Error('lượt đo ngoài dự kiến');
      if (next.ok) {
        ok({
          coords: { latitude: 21.03, longitude: 105.85, accuracy: next.accuracy },
        } as GeolocationPosition);
      } else {
        fail({ code: next.code } as GeolocationPositionError);
      }
    },
  );
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition },
  });
  return { calls, getCurrentPosition };
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'geolocation');
});

describe('readBrowserCoords', () => {
  it('bắt đầu đo NGAY trong lời gọi (đồng bộ) — Safari gắn hộp hỏi quyền với cú bấm', () => {
    const geo = stubGeolocation([{ ok: true, accuracy: 20 }]);
    void readBrowserCoords();
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(geo.calls[0]?.enableHighAccuracy).toBe(true);
  });

  it('iOS chưa bắt được GPS (POSITION_UNAVAILABLE) ⇒ đo lại một lần ở độ chính xác thấp', async () => {
    const geo = stubGeolocation([
      { ok: false, code: 2 },
      { ok: true, accuracy: 80 },
    ]);
    await expect(readBrowserCoords()).resolves.toMatchObject({ accuracy: 80 });
    expect(geo.calls.map((o) => o.enableHighAccuracy)).toEqual([true, false]);
  });

  it('hết giờ cả hai lượt ⇒ lỗi `timeout`', async () => {
    stubGeolocation([
      { ok: false, code: 3 },
      { ok: false, code: 3 },
    ]);
    await expect(readBrowserCoords()).rejects.toMatchObject({
      code: BROWSER_LOCATION_ERROR.TIMEOUT,
    });
  });

  it('bị từ chối quyền ⇒ KHÔNG đo lại (tránh hộp hỏi lần hai)', async () => {
    const geo = stubGeolocation([{ ok: false, code: 1 }]);
    await expect(readBrowserCoords()).rejects.toMatchObject({
      code: BROWSER_LOCATION_ERROR.DENIED,
    });
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('trình duyệt không có Geolocation ⇒ `unsupported`', async () => {
    Reflect.deleteProperty(navigator, 'geolocation');
    await expect(readBrowserCoords()).rejects.toMatchObject({
      code: BROWSER_LOCATION_ERROR.UNSUPPORTED,
    });
  });
});
