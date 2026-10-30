import {
  backfillBadgeSignals,
  createInsurancePartner,
  createPrismaClient,
  oldestBadgeSignalAgeMs,
} from '@xeprime/prisma';
import { HOLIDAY_SYNC_STATUS } from '@xeprime/types';
import {
  APP_ENV,
  FIRESTORE_ENABLED,
  GOOGLE_HOLIDAY_API_KEY,
  GOOGLE_HOLIDAY_CALENDAR_ID,
  HOLIDAY_SYNC_ENABLED,
  INSURANCE_PARTNER,
  PUSH_ENABLED,
  assertWorkerEnv,
  requireEnv,
} from './lib/env';
import { createAdvisoryLocks } from './lib/advisory-lock';
import { RecentEventCounter, WorkerHealth, startHealthServer } from './lib/health';
import { firestoreBadgeWriter } from './lib/firestore';
import { pumpOutbox } from './jobs/outbox-pump';
import { projectBadges } from './jobs/badge-projection';
import { runRetention } from './jobs/retention';
import { sweepBookingRequestDeadlines } from './jobs/booking-request-deadlines';
import {
  sweepDriverAssignmentExpiry,
  sweepDriverMissingAlerts,
} from './jobs/driver-assignment-expiry';
import { sweepSubscriptionLifecycle } from './jobs/subscription-lifecycle';
import { sweepBookingHoldExpiry } from './jobs/booking-hold-expiry';
import { sweepHandoverOverdue } from './jobs/handover-overdue';
import { sweepInsuranceIssue } from './jobs/insurance-issue';
import { purgeExpiredOauthStates } from './jobs/oauth-state-cleanup';
import { purgeExpiredGeoCache } from './jobs/geo-cache-cleanup';
import { refreshListingRanks } from './jobs/listing-rank-refresh';
import { dispatchPushDeliveries } from './jobs/push-dispatch';
import { HOLIDAY_INTERVAL_MS, shouldRunHolidaySync, syncHolidays } from './jobs/holiday-sync';

/**
 * Worker XePrime — mọi việc chạy theo ĐỒNG HỒ, không theo request của người dùng.
 *
 * Tám nhóm việc, và chúng độc lập với nhau:
 *
 *  1. **Hạn phản hồi yêu cầu thuê** (25/08) — nhắc gian hàng ở phút 20/45 và đóng yêu cầu ở
 *     phút 60. Đây là việc NGHIỆP VỤ LÕI: nó chạy ở mọi cấu hình, kể cả khi chat Firestore tắt.
 *  2. **Đồng bộ ngày lễ Việt Nam** (26/08) — mỗi ngày một lần, từ Google Calendar. Cũng là
 *     việc nghiệp vụ nên KHÔNG phụ thuộc `FIRESTORE_ENABLED`; nó chỉ cần một API key, và
 *     thiếu key thì vòng lặp đơn giản không được đăng ký.
 *  3. **Dọn phiên OAuth dở dang** (26/08, ADR 0019) — mỗi giờ một lần, xoá `oauth_states` và
 *     `native_auth_codes` đã hết hạn. Cũng chạy ở mọi cấu hình.
 *  4. **Đẩy thông báo qua FCM** (10/09) — chỉ khi `PUSH_ENABLED`. API xếp hàng vào
 *     `push_deliveries` trong cùng transaction với nghiệp vụ; ở đây mới gọi ra Google. Đó là
 *     lý do đặt xe không hỏng khi Firebase hỏng.
 *  5. **Đồng bộ chat Postgres → Firestore** (Phase 5, ADR 0009) — chỉ khi `FIRESTORE_ENABLED`.
 *  6. **Chiếu huy hiệu** (11/09, ADR 0034) — đẩy số chưa đọc sang `user_badges/{uid}` để client
 *     NGHE thay vì hỏi lại mỗi vài chục giây. CHỈ khi `FIRESTORE_ENABLED`: tắt thì tín hiệu được
 *     GIỮ trong `user_badge_signals` (một dòng/người, không phình theo sự kiện) để bật lại là
 *     chiếu đúng những gì đã đổi — dọn chúng đi sẽ để lại document cũ thắng lượt đọc REST đầu tiên.
 *  7. **Xếp hạng chợ xe** (22/09/2026) — tính lại `public_listings.rank_score` để khối "Xe phù
 *     hợp với bạn" xếp đúng thứ tự. Việc nghiệp vụ, chạy ở mọi cấu hình; xem
 *     `jobs/listing-rank-refresh.ts` để biết vì sao nó cần nhịp đồng hồ thay vì chỉ cần sự kiện.
 *  8. **Dọn cache bản đồ** (14/10/2026, ADR 0061) — xoá toạ độ/quãng đường đã tra quá hạn cache
 *     để hai bảng không phình vô hạn. Chạy ở mọi cấu hình.
 *
 * Ràng buộc chung: idempotent + advisory lock chống hai instance chạy chồng nhau. Chạy polling
 * loop (không kéo cả Nest runtime vào worker), và có endpoint `/health` nội bộ để Docker và
 * `deploy.sh` biết tiến trình này còn LÀM VIỆC chứ không chỉ còn sống.
 */
const PUMP_INTERVAL_MS = 2_000;
const RETENTION_INTERVAL_MS = 60 * 60 * 1_000;
/**
 * Nhịp quét hạn phản hồi. Một phút là độ trễ tối đa mà một mốc phải chịu — đủ nhỏ so với cửa
 * sổ ngắn nhất (15 phút, ADR 0066) để "còn 15 phút" vẫn là một câu đúng, đủ lớn để không biến
 * worker thành một vòng lặp bận trên một bảng mà 99% thời gian không có gì để làm (index một phần lo phần còn lại).
 */
const DEADLINE_INTERVAL_MS = 60 * 1_000;
/**
 * Nhịp dọn `oauth_states` (ADR 0019). Hàng sống 10 phút, nên một giờ một lần là quá đủ: đây là
 * việc giữ bảng khỏi phình, không phải việc có hạn chót.
 */
const OAUTH_STATE_INTERVAL_MS = 60 * 60 * 1_000;
/**
 * Nhịp vòng đời gói (ADR 0015 điều 10). Mốc của nó tính bằng NGÀY (nhắc trước 7 ngày, ân hạn
 * theo ngày) nên một giờ một lần là dư độ mịn; job idempotent, chạy lại ra 0 dòng.
 */
const SUBSCRIPTION_LIFECYCLE_INTERVAL_MS = 60 * 60 * 1_000;

const LOCK_PUMP = 4_201;
const LOCK_RETENTION = 4_202;
const LOCK_DEADLINES = 4_203;
const LOCK_HOLIDAYS = 4_204;
const LOCK_OAUTH_STATES = 4_205;
const LOCK_SUBSCRIPTION_LIFECYCLE = 4_206;
const LOCK_HOLD_EXPIRY = 4_207;
/** Phase 7 — phát hành bảo hiểm chuyến. Lock RIÊNG: nó gọi ra ngoài, không được chặn việc khác. */
const LOCK_INSURANCE_ISSUE = 4_210;
const INSURANCE_ISSUE_INTERVAL_MS = 60_000;
/**
 * Hold nhắc và hết hạn theo phút; một phút một nhịp là đủ mịn cho cả hai mốc nhắc (còn 60 và
 * 15 phút — ADR 0044 điều 3) và job chạy lại ra 0 dòng.
 */
const HOLD_EXPIRY_INTERVAL_MS = 60_000;

const LOCK_PUSH = 4_208;
/**
 * Nhịp đẩy thông báo. Năm giây là độ trễ tối đa giữa "tin nhắn tới server" và "máy rung" — chậm
 * hơn thì chat không còn giống realtime, nhanh hơn thì đây thành một vòng lặp bận trên một bảng
 * mà phần lớn thời gian rỗng (index một phần lo phần còn lại).
 */
const PUSH_INTERVAL_MS = 5_000;

/**
 * Cửa sổ đếm thông báo hỏng vì CẤU HÌNH nhà cung cấp (`provider_auth`). Một lượt trong giờ qua
 * là đủ để báo `degraded`: lỗi này không bao giờ lẻ tẻ — khoá APNs thiếu/thu hồi thì MỌI thông
 * báo tới iOS đều mất, và không lần thử lại nào cứu được. Trước số đo này, push iOS trên staging
 * hỏng 100% suốt nhiều ngày trong khi `/health` vẫn báo `ok`.
 *
 * `degraded` chứ không `unhealthy`: cổng deploy không được khoá vì một cấu hình nằm ngoài mã
 * nguồn (xem `HealthStatus`).
 */
const PUSH_CONFIG_FAILURE_WINDOW_MS = 60 * 60 * 1_000;

const LOCK_BADGES = 4_209;

/**
 * Xếp hạng lại chợ xe. Sáu giờ một nhịp, không phải một phút: thành phần duy nhất cần nhịp này
 * là ĐỘ MỚI (phai theo hằng số 30 ngày) và SỐ CHUYẾN — cả hai đo bằng ngày, nên một nhịp mịn
 * hơn chỉ tạo ra cùng một con số và một lần ghi lại toàn bảng. Mọi thay đổi cần thấy ngay (duyệt
 * xe, sửa giá, đánh giá mới) đã được `ListingsService` ghi trong chính transaction của nó.
 */
const LOCK_LISTING_RANK = 4_211;
const LISTING_RANK_INTERVAL_MS = 6 * 60 * 60 * 1_000;
/**
 * Dọn cache bản đồ (ADR 0061). Hạn tính bằng NGÀY nên một giờ một nhịp là dư độ mịn; nhịp
 * thưa hơn thì một bản ghi quá hạn chặn lượt ghi sẵn gợi ý mới lâu hơn cần thiết.
 */
const LOCK_GEO_CACHE = 4_212;
const GEO_CACHE_INTERVAL_MS = 60 * 60 * 1_000;
/**
 * Nhịp chiếu huy hiệu. Ba giây là độ trễ tối đa giữa "có tin/thông báo mới" và "con số trên
 * chuông đổi" — đủ nhanh để badge còn giống realtime, và rẻ hơn hẳn thứ nó thay thế: trước đây
 * mỗi TAB đang mở tự hỏi lại mỗi 8–30 giây, giờ chi phí bám theo số người thật sự có việc. Lô
 * rỗng là một câu SELECT trên index `dirty_at`, không phải một vòng lặp bận.
 */
const BADGE_INTERVAL_MS = 3_000;

/**
 * Hàng đợi huy hiệu trễ quá bấy nhiêu thì coi là HỎNG, không phải bận.
 *
 * Một phút là hơn hai mươi lượt chiếu: đủ để phân biệt "đang tiêu hoá một trận fan-out" với
 * "không ai tiêu hoá nữa". Đây là số đo quan trọng hơn cả "vòng lặp có chạy không" — vòng lặp
 * vẫn chạy đều mà không đuổi kịp thì badge vẫn đứng im.
 */
const BADGE_LAG_UNHEALTHY_MS = 60_000;

/**
 * Trần thời gian NGHỈ khi Firestore hỏng liên tục.
 *
 * Không có nó thì một sự cố Firestore biến vòng lặp 3 giây thành một máy bơm: mỗi lượt lấy 100
 * tín hiệu, chạy ~300 truy vấn để tính lại, thất bại cả 100, rồi đẩy tất cả xuống cuối hàng — và
 * lặp lại vô hạn. Cái giá không nằm ở Firestore (nó đang hỏng sẵn) mà ở Postgres, đúng lúc hệ
 * thống đang cần Postgres nhất.
 *
 * Chỉ nghỉ khi TOÀN BỘ lô hỏng: một dòng lỗi lẻ là chuyện của riêng dòng đó (nó đã bị đẩy xuống
 * cuối hàng), không phải lý do để cả hàng đợi chậm lại.
 */
const BADGE_COOLDOWN_MAX_MS = 60_000;

/**
 * Số vòng lặp TỐI ĐA worker có thể đăng ký (đếm ở `main()`: 4 luôn chạy + push + ngày lễ + 3 của
 * Firestore). Khai ra để pool khoá biết nó phải đủ chỗ — thêm vòng lặp thứ 10 mà quên nới pool
 * sẽ là một lỗi lúc KHỞI ĐỘNG, không phải một vòng lặp treo im lặng.
 */
const MAX_LOOPS = 9;

const prisma = createPrismaClient();
const health = new WorkerHealth();
const locks = createAdvisoryLocks(requireEnv('DATABASE_URL'), {
  max: MAX_LOOPS + 3,
  loops: MAX_LOOPS,
});

let stopping = false;
let healthServer: import('node:http').Server | null = null;
/** Nghỉ sau một lô chiếu huy hiệu hỏng TOÀN BỘ — xem `BADGE_COOLDOWN_MAX_MS`. */
let badgeCooldownUntil = 0;
let badgeFailStreak = 0;
/** Các lượt `sleep` đang chờ — dừng worker là đánh thức hết, không đợi hết nhịp. */
const sleepers = new Set<() => void>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done(): void {
      clearTimeout(timer);
      sleepers.delete(done);
      resolve();
    }
    sleepers.add(done);
  });
}

/**
 * Vòng lặp chung: giành lock → chạy → ngủ, và một lần lỗi không được giết cả tiến trình.
 *
 * `staleAfterMs` là ngưỡng im lặng để health check coi vòng lặp này là hỏng. Mặc định gấp năm
 * nhịp (tối thiểu một phút): đủ rộng để một lượt chạy chậm không thành báo động giả, đủ hẹp để
 * một vòng lặp treo bị phát hiện trong vài phút thay vì vài giờ.
 */
function loop(
  name: string,
  lockKey: number,
  intervalMs: number,
  run: () => Promise<void>,
  opts: { critical?: boolean } = {},
): Promise<void> {
  health.register(name, {
    critical: opts.critical ?? false,
    staleAfterMs: Math.max(intervalMs * 5, 60_000),
  });

  return (async () => {
    while (!stopping) {
      try {
        await locks.run(lockKey, run);
        /*
         * KHÔNG giành được khoá cũng tính là thành công: instance khác đang làm việc đó, và
         * đánh dấu nó "hỏng" sẽ biến một rolling deploy bình thường thành một cảnh báo.
         */
        health.markSuccess(name);
      } catch (err) {
        health.markFailure(name, err);
        console.error(`${name} lỗi:`, err);
      }
      if (stopping) break;
      await sleep(intervalMs);
    }
  })();
}

async function main(): Promise<void> {
  assertWorkerEnv();
  /*
   * Adapter bảo hiểm chọn MỘT lần lúc boot (ADR 0064). Ném ở đây — trước khi nối DB — khi cấu
   * hình sai (`mic_mock` ở production, giá trị lạ): process manager thấy worker chết ngay.
   */
  const insurancePartner = createInsurancePartner(INSURANCE_PARTNER, {
    appEnv: APP_ENV,
    logger: { warn: (message, meta) => console.warn(message, meta ?? '') },
  });
  if (insurancePartner.configured) {
    console.warn(
      'bảo hiểm: INSURANCE_PARTNER=mic_mock — GCN GIẢ LẬP (TEST-…), không có hiệu lực thật',
    );
  }
  await prisma.$connect();
  healthServer = startHealthServer(health);

  const jobs: Promise<void>[] = [
    loop(
      'hạn phản hồi yêu cầu thuê',
      LOCK_DEADLINES,
      DEADLINE_INTERVAL_MS,
      async () => {
        const result = await sweepBookingRequestDeadlines(prisma);
        // Chỉ log khi THẬT SỰ có việc: một dòng "0/0/0" mỗi phút sẽ chôn mọi dòng đáng đọc khác.
        if (result.firstReminders || result.finalReminders || result.expired) {
          console.log(
            `yêu cầu thuê: nhắc ${result.firstReminders} + ${result.finalReminders}, quá hạn ${result.expired}`,
          );
        }
        /*
         * Hạn tài xế trả lời lượt gán (ADR 0066) — cùng họ "hạn phản hồi", cùng nhịp một phút (hạn
         * ngắn nhất là 15′), nên chạy chung vòng lặp + khoá thay vì giành thêm một chỗ trong pool.
         */
        const drivers = await sweepDriverAssignmentExpiry(prisma);
        if (drivers.expired) {
          console.log(`tài xế: trả ${drivers.expired} lượt gán quá hạn trả lời về bên thuê`);
        }
        // Nhắc khẩn chuyến sắp nhận chưa có ai phủ (ADR 0067) — cùng họ tài xế, cùng nhịp/khoá. Chạy
        // SAU phép trả lượt quá hạn: đơn vừa bị trả lượt trong cửa sổ đã được đánh dấu "đã báo" cùng
        // lúc (`markDriverMissingAlertCovered` — tin hết hạn đã đòi gán lại), không nhận tin thứ hai.
        const missing = await sweepDriverMissingAlerts(prisma);
        if (missing.alerted) {
          console.log(`tài xế: nhắc khẩn ${missing.alerted} chuyến sắp nhận chưa có tài xế`);
        }
      },
      { critical: true },
    ),
    /*
     * Dọn `oauth_states` — ADR 0019. Chạy ở MỌI cấu hình, giống hạn phản hồi: nó là việc dọn dẹp
     * của một bảng mà đăng nhập ghi vào, không liên quan gì tới chat hay ngày lễ.
     */
    /*
     * Vòng đời gói (W2 — ADR 0015/0020/0026): nhắc hạn, chuyển tuyến hoa hồng khi hết ân hạn
     * (KHÔNG gỡ xe khỏi chợ), void hoá đơn quá hạn, chào gói khi tiêu hết lượt miễn phí.
     * Việc nghiệp vụ lõi — chạy ở mọi cấu hình.
     */
    loop(
      'vòng đời gói',
      LOCK_SUBSCRIPTION_LIFECYCLE,
      SUBSCRIPTION_LIFECYCLE_INTERVAL_MS,
      async () => {
        const result = await sweepSubscriptionLifecycle(prisma);
        if (
          result.renewalReminders ||
          result.expiryNotices ||
          result.lapsed ||
          result.invoicesVoided ||
          result.freeTripOffers ||
          result.graceGuides
        ) {
          console.log(
            `vòng đời gói: nhắc ${result.renewalReminders}, hết hạn ${result.expiryNotices}, ` +
              `chuyển tuyến ${result.lapsed}, void hoá đơn ${result.invoicesVoided}, chào gói ${result.freeTripOffers}, email ân hạn ${result.graceGuides}`,
          );
        }
      },
    ),
    /*
     * Tiền giữ chỗ (R3 — ADR 0028 · ADR 0044 điều 3): nhắc khách ở mốc còn 60 và 15 phút, rồi khi
     * quá hạn thì lật `expired`, yêu cầu `hold_expired`, nhả lịch và báo hai bên. KHÔNG còn nhánh
     * tự gia hạn. Việc nghiệp vụ lõi — chạy ở mọi cấu hình.
     */
    loop(
      'nhắc + hết hạn giữ chỗ',
      LOCK_HOLD_EXPIRY,
      HOLD_EXPIRY_INTERVAL_MS,
      async () => {
        const result = await sweepBookingHoldExpiry(prisma);
        const reminders = result.firstReminders + result.finalReminders;
        if (result.expired || reminders) {
          console.log(`giữ chỗ: nhắc ${reminders}, hết hạn ${result.expired}`);
        }
        /*
         * Chống treo đơn ở mốc bàn giao (ADR 0066, lớp 3) — cùng nhịp phút, cùng loại việc "tiền
         * của một chuyến theo đồng hồ", nên đi chung vòng lặp thay vì chiếm thêm một khoá + một
         * chỗ trong pool. Idempotent bằng cột claim `handover_overdue_at`.
         */
        const overdue = await sweepHandoverOverdue(prisma);
        if (overdue.flagged) {
          console.log(`bàn giao: ${overdue.flagged} chuyến quá ân hạn — đã mở case xác minh`);
        }
      },
      { critical: true },
    ),
    /*
     * Phát hành bảo hiểm chuyến (Phase 7 — ADR 0032 điều 4). Nhịp 60 giây: chuyến vừa bàn giao
     * thì hợp đồng nên có trong vòng một phút, và nhanh hơn nữa cũng không giúp gì vì mốc phát
     * hành là lúc bàn giao chứ không phải lúc đặt.
     *
     * KHÔNG `critical`: với `INSURANCE_PARTNER=none` lượt nào cũng ra `failed`, và một job "hỏng
     * theo thiết kế" mà bị đánh dấu critical sẽ làm health check của worker đỏ vĩnh viễn.
     */
    loop('phát hành bảo hiểm', LOCK_INSURANCE_ISSUE, INSURANCE_ISSUE_INTERVAL_MS, async () => {
      const result = await sweepInsuranceIssue(prisma, insurancePartner);
      if (result.claimed) {
        console.log(
          `bảo hiểm: xử lý ${result.claimed}, cấp ${result.issued}, lỗi ${result.failed}`,
        );
      }
    }),
    loop('xếp hạng chợ xe', LOCK_LISTING_RANK, LISTING_RANK_INTERVAL_MS, async () => {
      const changed = await refreshListingRanks(prisma);
      // Chỉ log khi có dòng đổi — sáu giờ một dòng "0" là nhiễu, không phải dấu hiệu sống.
      if (changed) console.log(`xếp hạng chợ: cập nhật ${changed} xe`);
    }),
    loop('dọn phiên OAuth dở dang', LOCK_OAUTH_STATES, OAUTH_STATE_INTERVAL_MS, async () => {
      const purged = await purgeExpiredOauthStates(prisma);
      // Chỉ log khi có việc — mỗi giờ một dòng "0/0" là nhiễu, không phải dấu hiệu sống.
      if (purged.states || purged.nativeCodes || purged.webSessions || purged.loginThrottles) {
        console.log(
          `đăng nhập: dọn ${purged.states} state + ${purged.nativeCodes} one-time code + ` +
            `${purged.webSessions} phiên web hết hạn + ${purged.loginThrottles} bộ đếm sai đã nguội`,
        );
      }
    }),
    loop('dọn cache bản đồ', LOCK_GEO_CACHE, GEO_CACHE_INTERVAL_MS, async () => {
      const purged = await purgeExpiredGeoCache(prisma);
      if (purged.geocodes || purged.routes) {
        console.log(
          `bản đồ: xoá ${purged.geocodes} địa chỉ + ${purged.routes} quãng đường quá hạn cache`,
        );
      }
    }),
  ];

  /*
   * Thông báo đẩy (10/09/2026) — ĐỘC LẬP với `FIRESTORE_ENABLED`: hai tính năng dùng chung một
   * Firebase project nhưng bật/tắt riêng, và cấu hình của giai đoạn này là push bật còn chat
   * realtime tắt.
   *
   * Tắt ⇒ KHÔNG đăng ký vòng lặp, và nói ra đúng một dòng lúc boot. Đăng ký rồi bỏ qua trong im
   * lặng nghĩa là `push_deliveries` chất đống mà không ai biết vì sao máy không rung.
   */
  if (PUSH_ENABLED) {
    const pushConfigFailures = new RecentEventCounter(PUSH_CONFIG_FAILURE_WINDOW_MS);
    health.limitGauge('pushConfigFailures1h', 0);
    health.setGauge('pushConfigFailures1h', 0);

    jobs.push(
      loop(
        'đẩy thông báo',
        LOCK_PUSH,
        PUSH_INTERVAL_MS,
        async () => {
          const result = await dispatchPushDeliveries(prisma);
          // Chỉ log khi có việc — một dòng "0/0/0" mỗi 5 giây sẽ chôn mọi dòng đáng đọc khác.
          if (result.sent || result.retried || result.failed || result.expired) {
            console.log(
              `push: gửi ${result.sent}, thử lại ${result.retried}, hỏng ${result.failed}, ` +
                `quá hạn ${result.expired}, tắt ${result.devicesDisabled} thiết bị`,
            );
          }

          pushConfigFailures.record(result.providerAuthFailed);
          health.setGauge('pushConfigFailures1h', pushConfigFailures.total());
          if (result.providerAuthFailed > 0) {
            console.error(
              `push: ${result.providerAuthFailed} thông báo MẤT vì nhà cung cấp từ chối xác thực ` +
                '(provider_auth) — không phải lỗi thiết bị, thử lại không cứu được. Kiểm khoá APNs ' +
                '(.p8) của từng app iOS ở Firebase Console → Cloud Messaging, hoặc quyền của service account.',
            );
          }
        },
        { critical: true },
      ),
    );
  } else {
    console.log(
      'XePrime worker: PUSH_ENABLED=false → không gửi thông báo đẩy. Hộp thư in-app chạy bình thường.',
    );
  }

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
   * không còn việc gì. Giờ thì còn, nên chỉ ba vòng lặp của Firestore mới bị tắt.
   */
  if (FIRESTORE_ENABLED) {
    health.limitGauge('badgeQueueLagMs', BADGE_LAG_UNHEALTHY_MS);

    jobs.push(
      loop(
        'outbox pump',
        LOCK_PUMP,
        PUMP_INTERVAL_MS,
        async () => {
          await pumpOutbox(prisma);
        },
        { critical: true },
      ),
      loop('retention', LOCK_RETENTION, RETENTION_INTERVAL_MS, async () => {
        const trimmed = await runRetention(prisma);
        if (trimmed > 0) console.log(`retention: dọn ${trimmed} tin cũ khỏi Firestore`);
      }),
      loop(
        'chiếu huy hiệu',
        LOCK_BADGES,
        BADGE_INTERVAL_MS,
        async () => {
          /*
           * Đang trong quãng nghỉ sau một lô hỏng toàn bộ. Trả về NGAY (và không giữ khoá):
           * nghỉ bằng `sleep` ngay tại đây sẽ giữ advisory lock suốt quãng đó và chặn cả instance
           * khác đang khoẻ hơn.
           */
          if (Date.now() < badgeCooldownUntil) return;

          const result = await projectBadges(prisma, firestoreBadgeWriter);

          if (result.failed && result.projected === 0) {
            badgeFailStreak += 1;
            const cooldown = Math.min(
              BADGE_INTERVAL_MS * 2 ** badgeFailStreak,
              BADGE_COOLDOWN_MAX_MS,
            );
            badgeCooldownUntil = Date.now() + cooldown;
            console.error(
              `badge: cả lô ${result.failed} người đều hỏng — nghỉ ${Math.round(cooldown / 1000)}s ` +
                'trước khi thử lại (nhiều khả năng Firestore đang lỗi).',
            );
          } else {
            badgeFailStreak = 0;
            // Chỉ log khi có LỖI: một dòng mỗi 3 giây cho việc chạy trơn sẽ chôn mọi dòng đáng đọc.
            if (result.failed) {
              console.error(`badge: chiếu ${result.projected}, lỗi ${result.failed}`);
            }
          }

          /*
           * Đo độ trễ hàng đợi SAU mỗi lượt. Đây là thứ phân biệt "đang bận" với "đã đứng": vòng
           * lặp vẫn báo thành công đều đặn kể cả khi nó không bao giờ đuổi kịp.
           */
          const lagMs = await oldestBadgeSignalAgeMs(prisma);
          health.setGauge('badgeQueueLagMs', lagMs);
          if (lagMs !== null && lagMs > BADGE_LAG_UNHEALTHY_MS) {
            console.error(
              `badge: hàng đợi trễ ${Math.round(lagMs / 1000)}s — huy hiệu đang đứng im ` +
                'với người dùng. Kiểm Firestore và log lỗi phía trên.',
            );
          }
        },
        { critical: true },
      ),
    );

    /*
     * Backfill MỘT LƯỢT lúc khởi động, không phải một bước deploy bằng tay.
     *
     * Nó xếp hàng chiếu lại cho những người đang có gì đó để hiện — đúng hai tình huống cần:
     * lần rollout đầu tiên, và lần bật lại sau một quãng `FIRESTORE_ENABLED=false`. Idempotent,
     * bám theo số người đang có việc dở chứ không theo tổng tài khoản, nên chạy lại mỗi lần
     * khởi động là chấp nhận được — và nó gỡ hẳn một bước thủ công có thể bị quên.
     */
    void backfillBadgeSignals(prisma)
      .then((count) => {
        if (count > 0) console.log(`badge: xếp hàng chiếu lại ${count} người (backfill lúc boot)`);
      })
      .catch((err: unknown) => {
        console.error('badge: backfill lỗi (không chặn worker):', err);
      });

    console.log(
      'XePrime worker: outbox pump + retention + CHIẾU HUY HIỆU đang chạy (FIRESTORE_ENABLED=true).',
    );
  } else {
    console.log(
      'XePrime worker: FIRESTORE_ENABLED=false → chat chạy Postgres-only và KHÔNG chiếu huy hiệu. ' +
        'Tín hiệu trong `user_badge_signals` được GIỮ LẠI (một dòng/người) để chiếu khi bật lại; ' +
        'huy hiệu phía client chạy bằng REST cho tới lúc đó.',
    );
  }

  await Promise.all(jobs);
}

/**
 * Dừng có trật tự: đánh thức mọi lượt `sleep` để vòng lặp thoát ngay thay vì đợi hết nhịp (có
 * nhịp dài một giờ), rồi đóng pool khoá — Postgres nhả mọi advisory lock khi session đóng.
 */
async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  for (const wake of [...sleepers]) wake();
  healthServer?.close();
  await locks.close().catch(() => undefined);
  await prisma.$disconnect().catch(() => undefined);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void shutdown();
  });
}

main()
  .then(shutdown)
  .catch(async (err: unknown) => {
    console.error('Worker lỗi:', err);
    await shutdown();
    process.exit(1);
  });
