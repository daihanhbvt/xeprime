/**
 * Dựng module trả về từ `vi.mock('antd', …)`.
 *
 * `vitest.config.ts` gói sẵn antd (`deps.optimizer`) để mỗi file test không phải nạp lại ~1,5s
 * bản CommonJS `antd/lib`. Bản gói sẵn là CJS bọc ESM: mã đang test đọc component qua export
 * `default` của module, nên một mock thiếu `default` làm vỡ cả file ("No default export is defined
 * on the antd mock"). Mọi mock antd đi qua đây để `default` và các export tên luôn là MỘT object.
 *
 * Gọi bằng import động bên trong factory — `vi.mock` được kéo lên trên mọi `import` tĩnh:
 *
 *   vi.mock('antd', async (importOriginal) =>
 *     (await import('@/test-utils/antd-mock')).antdWithApp(importOriginal, () => ({ message })),
 *   );
 */
type Antd = typeof import('antd');

/** Mock antd từ một object tuỳ ý (mock toàn phần). */
export function asAntdModule<T extends object>(mocked: T): T & { default: T } {
  return { ...mocked, default: mocked };
}

/** Mock một phần: antd thật, chỉ thay `App.useApp` (để bắt `message`/`modal`). */
export async function antdWithApp(
  importOriginal: <M = Antd>() => Promise<M>,
  useApp: () => unknown,
): Promise<Antd & { default: Antd }> {
  const actual = await importOriginal<Antd>();
  return asAntdModule({ ...actual, App: Object.assign(actual.App, { useApp }) } as Antd);
}
