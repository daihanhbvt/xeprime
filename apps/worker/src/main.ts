import { createPrismaClient } from '@xeprime/prisma';
import { HOLIDAY_SYNC_STATUS } from '@xeprime/types';
import {
  FIRESTORE_ENABLED,
  GOOGLE_HOLIDAY_API_KEY,
  GOOGLE_HOLIDAY_CALENDAR_ID,
  HOLIDAY_SYNC_ENABLED,
  assertWorkerEnv,
} from './lib/env';
import { withAdvisoryLock } from './lib/advisory-lock';
import { pumpOutbox } from './jobs/outbox-pump';
import { runRetention } from './jobs/retention';
import { sweepBookingRequestDeadlines } from './jobs/booking-request-deadlines';
import { purgeExpiredOauthStates } from './jobs/oauth-state-cleanup';
import { HOLIDAY_INTERVAL_MS, shouldRunHolidaySync, syncHolidays } from './jobs/holiday-sync';

/**
 * Worker XePrime — mọi việc chạy theo ĐỒNG HỒ, không theo request của người dùng.
 *
 * Bốn nhóm việc, và chúng độc lập với nhau:
 *
 *  1. **Hạn phản hồi yêu cầu thuê** (25/08) — nhắc gian hàng ở phút 20/45 và đóng yêu cầu ở
 *     phút 60. Đây là việc NGHIỆP VỤ LÕI: nó chạy ở mọi cấu hình, kể cả khi chat Firestore tắt.
 *  2. **Đồng bộ ngày lễ Việt Nam** (26/08) — mỗi ngày một lần, từ Google Calendar. Cũng là
 *     việc nghiệp vụ nên KHÔNG phụ thuộc `FIRESTORE_ENABLED`; nó chỉ cần một API key, và
 *     thiếu key thì vòng lặp đơn giản không được đăng ký.
 *  3. **Dọn phiên OAuth dở dang** (26/08, ADR 0019) — mỗi giờ một lần, xoá `oauth_states` và
 *     `native_auth_codes` đã hết hạn. Cũng chạy ở mọi cấu hình.
 *  4. **Đồng bộ chat Postgres → Firestore** (Phase 5, ADR 0009) — chỉ khi `FIRESTORE_ENABLED`.
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
/**
 * Nhịp dọn `oauth_states` (ADR 0019). Hàng sống 10 phút, nên một giờ một lần là quá đủ: đây là
 * việc giữ bảng khỏi phình, không phải việc có hạn chót.
 */
const OAUTH_STATE_INTERVAL_MS = 60 * 60 * 1_000;

const LOCK_PUMP = 4_201;
const LOCK_RETENTION = 4_202;
const LOCK_DEADLINES = 4_203;
const LOCK_HOLIDAYS = 4_204;
const LOCK_OAUTH_STATES = 4_205;

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
    /*
     * Dọn `oauth_states` — ADR 0019. Chạy ở MỌI cấu hình, giống hạn phản hồi: nó là việc dọn dẹp
     * của một bảng mà đăng nhập ghi vào, không liên quan gì tới chat hay ngày lễ.
     */
    loop('dọn phiên OAuth dở dang', LOCK_OAUTH_STATES, OAUTH_STATE_INTERVAL_MS, async () => {
      const purged = await purgeExpiredOauthStates(prisma);
      // Chỉ log khi có việc — mỗi giờ một dòng "0/0" là nhiễu, không phải dấu hiệu sống.
      if (purged.states || purged.nativeCodes) {
        console.log(
          `oauth: dọn ${purged.states} state + ${purged.nativeCodes} one-time code hết hạn`,
        );
      }
    }),
  ];

  /*
   * Ngày lễ là việc NGHIỆP VỤ, không phải tuỳ chọn của chat — nó chạy độc lập với
   * `FIRESTORE_ENABLED`, giống hạn phản hồi ở trên. Thứ duy nhất nó cần là một API key.
   *
   * Thiếu key ⇒ KHÔNG đăng ký vòng lặp, và nói ra đúng MỘT dòng lúc boot. Không đăng ký rồi
   * bỏ qua trong im lặng mỗi 15 phút: người vận hành phải biết vì sao lịch không có ngày lễ,
   * và họ chỉ đọc log lúc khởi động.
   */
  if (HOLIDAY_SYNC_ENABLED) {
    jobs.push(
      loop('đồng bộ ngày lễ', LOCK_HOLIDAYS, HOLIDAY_INTERVAL_MS, async () => {
        // Cổng "mỗi ngày một lần" nằm TRONG job (worker không có cron). Chưa tới lượt thì
        // return ngay — không log, không gọi Google.
        if (!(await shouldRunHolidaySync(prisma, new Date()))) return;

        const result = await syncHolidays(prisma, {
          calendarId: GOOGLE_HOLIDAY_CALENDAR_ID,
          apiKey: GOOGLE_HOLIDAY_API_KEY,
        });

        // Một lượt/ngày nên log cả lượt 0/0/0: ở tần suất này nó là dấu hiệu sống, không phải
        // nhiễu — khác hẳn vòng lặp hạn phản hồi chạy mỗi phút.
        if (result.status === HOLIDAY_SYNC_STATUS.FAILED) {
          console.error(`ngày lễ: đồng bộ thất bại — ${result.errorMessage ?? 'không rõ'}`);
        } else {
          console.log(
            `ngày lễ: ${result.found} sự kiện · thêm ${result.created}, sửa ${result.updated}, xoá ${result.deleted}`,
          );
        }
      }),
    );
  } else {
    console.log(
      'XePrime worker: GOOGLE_HOLIDAY_API_KEY chưa đặt → không đồng bộ ngày lễ. Lịch xe chạy bình thường, chỉ không có lớp ngày lễ.',
    );
  }

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
