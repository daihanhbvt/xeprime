import { createPrismaClient } from '@xeprime/prisma';
import { FIRESTORE_ENABLED, assertWorkerEnv } from './lib/env';
import { withAdvisoryLock } from './lib/advisory-lock';
import { pumpOutbox } from './jobs/outbox-pump';
import { runRetention } from './jobs/retention';
import { sweepBookingRequestDeadlines } from './jobs/booking-request-deadlines';

/**
 * Worker XePrime — mọi việc chạy theo ĐỒNG HỒ, không theo request của người dùng.
 *
 * Hai nhóm việc, và chúng độc lập với nhau:
 *
 *  1. **Hạn phản hồi yêu cầu thuê** (25/08) — nhắc gian hàng ở phút 20/45 và đóng yêu cầu ở
 *     phút 60. Đây là việc NGHIỆP VỤ LÕI: nó chạy ở mọi cấu hình, kể cả khi chat Firestore tắt.
 *  2. **Đồng bộ chat Postgres → Firestore** (Phase 5, ADR 0009) — chỉ khi `FIRESTORE_ENABLED`.
 *
 * Ràng buộc chung: idempotent + `pg_try_advisory_lock` chống hai instance chạy chồng nhau.
 * Chạy polling loop (không kéo cả Nest runtime vào worker).
 */
const PUMP_INTERVAL_MS = 2_000;
const RETENTION_INTERVAL_MS = 60 * 60 * 1_000;
/**
 * Nhịp quét hạn phản hồi. Một phút là độ trễ tối đa mà một mốc phải chịu — đủ nhỏ so với cửa
 * sổ 60 phút để "còn 15 phút" vẫn là một câu đúng, đủ lớn để không biến worker thành một vòng
 * lặp bận trên một bảng mà 99% thời gian không có gì để làm (index một phần lo phần còn lại).
 */
const DEADLINE_INTERVAL_MS = 60 * 1_000;

const LOCK_PUMP = 4_201;
const LOCK_RETENTION = 4_202;
const LOCK_DEADLINES = 4_203;

const prisma = createPrismaClient();
let stopping = false;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Vòng lặp chung: giành lock → chạy → ngủ, và một lần lỗi không được giết cả tiến trình. */
async function loop(name: string, lockKey: number, intervalMs: number, run: () => Promise<void>) {
  while (!stopping) {
    try {
      await withAdvisoryLock(prisma, lockKey, run);
    } catch (err) {
      console.error(`${name} lỗi:`, err);
    }
    await sleep(intervalMs);
  }
}

async function main(): Promise<void> {
  assertWorkerEnv();
  await prisma.$connect();

  const jobs: Promise<void>[] = [
    loop('hạn phản hồi yêu cầu thuê', LOCK_DEADLINES, DEADLINE_INTERVAL_MS, async () => {
      const result = await sweepBookingRequestDeadlines(prisma);
      // Chỉ log khi THẬT SỰ có việc: một dòng "0/0/0" mỗi phút sẽ chôn mọi dòng đáng đọc khác.
      if (result.firstReminders || result.finalReminders || result.expired) {
        console.log(
          `yêu cầu thuê: nhắc ${result.firstReminders} + ${result.finalReminders}, quá hạn ${result.expired}`,
        );
      }
    }),
  ];

  /*
   * Chat là TÙY CHỌN — trước đây worker tự kết thúc khi `FIRESTORE_ENABLED=false`, vì lúc đó nó
   * không còn việc gì. Giờ thì còn, nên chỉ hai vòng lặp của chat mới bị tắt.
   */
  if (FIRESTORE_ENABLED) {
    jobs.push(
      loop('outbox pump', LOCK_PUMP, PUMP_INTERVAL_MS, async () => {
        await pumpOutbox(prisma);
      }),
      loop('retention', LOCK_RETENTION, RETENTION_INTERVAL_MS, async () => {
        await runRetention(prisma);
      }),
    );
    console.log('XePrime worker: hạn phản hồi + outbox pump + retention đang chạy.');
  } else {
    console.log(
      'XePrime worker: hạn phản hồi yêu cầu thuê đang chạy. FIRESTORE_ENABLED=false → chat chạy Postgres-only, không đẩy Firestore.',
    );
  }

  await Promise.all(jobs);
  await prisma.$disconnect();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

main().catch(async (err: unknown) => {
  console.error('Worker lỗi:', err);
  await prisma.$disconnect();
  process.exit(1);
});
