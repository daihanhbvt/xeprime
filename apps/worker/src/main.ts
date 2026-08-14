import { createPrismaClient } from '@xeprime/prisma';
import { FIRESTORE_ENABLED, assertWorkerEnv } from './lib/env';
import { withAdvisoryLock } from './lib/advisory-lock';
import { pumpOutbox } from './jobs/outbox-pump';
import { runRetention } from './jobs/retention';

/**
 * Worker XePrime (Phase 5) — đồng bộ chat Postgres → Firestore (ADR 0009).
 *
 * Ràng buộc (xem ghi chú lịch sử): idempotent + `pg_try_advisory_lock` chống chạy song song.
 * Chạy polling loop (không kéo cả Nest runtime vào worker): pump outbox nhịp nhanh, retention
 * nhịp giờ. FIRESTORE_ENABLED=false → chat chạy Postgres-only, worker không có việc.
 */
const PUMP_INTERVAL_MS = 2_000;
const RETENTION_INTERVAL_MS = 60 * 60 * 1_000;
const LOCK_PUMP = 4_201;
const LOCK_RETENTION = 4_202;

const prisma = createPrismaClient();
let stopping = false;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function pumpLoop(): Promise<void> {
  while (!stopping) {
    try {
      await withAdvisoryLock(prisma, LOCK_PUMP, async () => {
        await pumpOutbox(prisma);
      });
    } catch (err) {
      console.error('outbox pump lỗi:', err);
    }
    await sleep(PUMP_INTERVAL_MS);
  }
}

async function retentionLoop(): Promise<void> {
  while (!stopping) {
    try {
      await withAdvisoryLock(prisma, LOCK_RETENTION, async () => {
        await runRetention(prisma);
      });
    } catch (err) {
      console.error('retention lỗi:', err);
    }
    await sleep(RETENTION_INTERVAL_MS);
  }
}

async function main(): Promise<void> {
  assertWorkerEnv();
  await prisma.$connect();

  if (!FIRESTORE_ENABLED) {
    console.log(
      'XePrime worker: FIRESTORE_ENABLED=false → chat chạy Postgres-only, không đẩy Firestore. Kết thúc.',
    );
    await prisma.$disconnect();
    return;
  }

  console.log('XePrime worker: outbox pump + retention đang chạy.');
  await Promise.all([pumpLoop(), retentionLoop()]);
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
