import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrismaClient } from '@xeprime/prisma';
import { createAdvisoryLocks, type AdvisoryLockRunner } from '../src/lib/advisory-lock';

/**
 * Advisory lock chạy trên PostgreSQL THẬT.
 *
 * Thứ được khoá ở đây là bất biến mà bản trước KHÔNG có: lệnh nhả khoá phải chạy trên ĐÚNG
 * session đã giành nó. Bản cũ dùng `prisma.$queryRaw` hai lần, và Prisma không hứa hai lệnh đi
 * qua cùng một kết nối vật lý — khi nó rơi vào hai kết nối khác nhau thì `pg_advisory_unlock`
 * trả `false` trong im lặng và job đó không bao giờ chạy lại nữa trên tiến trình này.
 *
 * Vì vậy test không chỉ kiểm "chỉ một bên chạy": nó soi thẳng `pg_locks` để chắc chắn khoá đã
 * BIẾN MẤT sau mỗi lượt — thành công lẫn thất bại.
 *
 * Chạy: pnpm db:up && pnpm --filter @xeprime/worker test
 */
const prisma = createPrismaClient();

/** Key riêng cho test, nằm ngoài dải 4_201–4_209 mà worker thật dùng. */
const TEST_KEY = 4_291;

let dbAvailable = false;
let locks: AdvisoryLockRunner;
let other: AdvisoryLockRunner;

/** Số session đang giữ advisory lock với key này — 0 nghĩa là đã nhả sạch. */
async function heldCount(key: number): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*)::bigint AS n
    FROM pg_locks
    WHERE locktype = 'advisory' AND classid = 0 AND objid = ${key} AND granted
  `;
  return Number(rows[0]?.n ?? 0);
}

before(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }
  const url = process.env.DATABASE_URL as string;
  // Hai runner = hai pool riêng = hai "instance worker" đứng cạnh nhau.
  locks = createAdvisoryLocks(url, { max: 4 });
  other = createAdvisoryLocks(url, { max: 4 });
});

after(async () => {
  await locks?.close().catch(() => undefined);
  await other?.close().catch(() => undefined);
  await prisma.$disconnect();
});

test('hai instance cạnh tranh: chỉ MỘT chạy callback', async () => {
  if (!dbAvailable) return;

  let ran = 0;
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });

  // Bên A giành khoá và giữ cho tới khi test cho phép nhả.
  const first = locks.run(TEST_KEY, async () => {
    ran++;
    await held;
  });

  // Đợi A chắc chắn đã giành được rồi mới cho B thử.
  await new Promise((resolve) => setTimeout(resolve, 100));
  const secondRan = await other.run(TEST_KEY, async () => {
    ran++;
  });

  release();
  const firstRan = await first;

  assert.equal(firstRan, true, 'bên giành được khoá phải chạy');
  assert.equal(secondRan, false, 'bên thua phải bỏ lượt, không chạy chồng');
  assert.equal(ran, 1);
});

test('nhả khoá sau khi xong — soi thẳng pg_locks', async () => {
  if (!dbAvailable) return;

  await locks.run(TEST_KEY, async () => undefined);
  assert.equal(await heldCount(TEST_KEY), 0, 'khoá phải biến mất khỏi pg_locks sau lượt thành công');

  // Và bên kia giành được ngay lượt sau — bằng chứng ở tầng hành vi.
  assert.equal(await other.run(TEST_KEY, async () => undefined), true);
});

test('callback ném lỗi: lỗi được ném lên NHƯNG khoá vẫn nhả', async () => {
  if (!dbAvailable) return;

  await assert.rejects(
    () => locks.run(TEST_KEY, async () => Promise.reject(new Error('job hỏng'))),
    /job hỏng/,
  );

  assert.equal(await heldCount(TEST_KEY), 0, 'khoá phải nhả cả khi job ném lỗi');
  assert.equal(await other.run(TEST_KEY, async () => undefined), true);
});

test('đóng runner nhả mọi khoá còn lại của nó', async () => {
  if (!dbAvailable) return;

  const temporary = createAdvisoryLocks(process.env.DATABASE_URL as string, { max: 2 });
  await temporary.run(TEST_KEY, async () => undefined);
  await temporary.close();

  assert.equal(await heldCount(TEST_KEY), 0);
});
