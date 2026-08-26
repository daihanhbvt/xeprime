import { newId, type Prisma, type PrismaClient } from '@xeprime/prisma';
import {
  holidaySyncWindow,
  normalizeGoogleHolidayEvents,
  planHolidaySync,
  type ExistingHolidayRow,
  type GoogleCalendarEventLike,
  type NormalizedHoliday,
} from '@xeprime/domain';
import {
  HOLIDAY_SOURCE,
  HOLIDAY_SYNC_STATUS,
  HOLIDAY_SYNC_TRIGGER,
  type HolidaySyncTrigger,
} from '@xeprime/types';
import { recordSystemAudit } from '../lib/notify';
import {
  fetchHolidayEvents,
  type FetchHolidayEventsParams,
  type HolidayEventFetcher,
} from '../lib/google-calendar';

/**
 * Đồng bộ lịch nghỉ lễ Việt Nam: Google Calendar → `public_holidays`.
 *
 * Ba bảo đảm, và thứ tự các bước dưới đây tồn tại chỉ để giữ chúng:
 *
 *  1. **Google hỏng thì dữ liệu cũ NGUYÊN VẸN.** Lấy dữ liệu về TRƯỚC, ghi SAU. Một lượt fail
 *     chỉ để lại một dòng `holiday_sync_runs.failed` — bảng ngày lễ không bị chạm tới, và
 *     `GET /holidays` vẫn trả bản đồng bộ gần nhất. Đây là lý do bước 2 không nằm trong
 *     transaction ghi.
 *  2. **Chạy lại an toàn.** Diff bằng hàm thuần (`planHolidaySync`) so từng trường, nên lượt
 *     thứ hai với dữ liệu y hệt cho 0/0/0. Không có `deleteAll` + `insertAll` ở đây: cách đó
 *     cũng "đúng" nhưng biến mỗi lượt đồng bộ thành một khoảng vài chục mili giây mà bảng rỗng.
 *  3. **Toàn bộ phần ghi nằm trong MỘT transaction.** Xoá được mà tạo không được sẽ để lại
 *     một lịch nghỉ lễ khuyết, và cuốn sổ thì báo `success`.
 *
 * Ngày lễ CHỈ là thông tin hiển thị: job này không đụng `vehicle_occupancies`, không đổi giá,
 * không chạm booking. Nếu có ngày nó cần làm những việc đó thì đó là một tính năng khác.
 */

/**
 * Nhịp quét. Worker không có cron nên cổng "mỗi ngày một lần" nằm trong chính job
 * (`shouldRunHolidaySync`) — 15 phút chỉ là tần suất HỎI, không phải tần suất gọi Google.
 */
export const HOLIDAY_INTERVAL_MS = 15 * 60 * 1_000;

/** Giờ địa phương sớm nhất được phép đồng bộ trong ngày. */
export const HOLIDAY_SYNC_START_HOUR_VN = 6;

/** UTC+7 cố định, không DST — đủ để đọc ra giờ và ngày local mà không kéo dayjs vào worker. */
const VN_OFFSET_MS = 7 * 60 * 60 * 1_000;

export interface HolidaySyncResult {
  readonly status: (typeof HOLIDAY_SYNC_STATUS)[keyof typeof HOLIDAY_SYNC_STATUS];
  readonly found: number;
  readonly created: number;
  readonly updated: number;
  readonly deleted: number;
  /** Số event Google trả về nhưng không dùng được — caller log, không nuốt im lặng. */
  readonly skipped: number;
  readonly errorMessage?: string;
}

export interface HolidaySyncDeps {
  readonly calendarId: string;
  readonly apiKey: string;
  /** Bơm được để test chạy KHÔNG cần mạng. Mặc định là client Google thật. */
  readonly fetchEvents?: HolidayEventFetcher;
  readonly now?: Date;
  readonly trigger?: HolidaySyncTrigger;
}

/** Mốc thời gian VN của một `Date`, dạng đọc được từng phần. */
function vnParts(now: Date): { dayKey: string; hour: number } {
  const shifted = new Date(now.getTime() + VN_OFFSET_MS);
  return { dayKey: shifted.toISOString().slice(0, 10), hour: shifted.getUTCHours() };
}

/** 00:00 giờ VN của ngày chứa `now`, trả về mốc tuyệt đối (UTC) để so với cột timestamptz. */
function startOfVnDay(now: Date): Date {
  const { dayKey } = vnParts(now);
  return new Date(new Date(`${dayKey}T00:00:00.000Z`).getTime() - VN_OFFSET_MS);
}

/**
 * Cổng chạy mỗi ngày một lần — thay cho cron mà worker cố ý không có.
 *
 * Hai điều kiện, và cả hai đều đọc từ DB/đồng hồ chứ không từ bộ nhớ tiến trình: worker restart
 * hoặc chạy hai instance vẫn không đồng bộ hai lần trong một ngày.
 *
 *   (a) đã qua 06:00 giờ VN — Google cập nhật lịch nghỉ lễ theo múi giờ của họ, và hỏi lúc nửa
 *       đêm chỉ để nhận lại đúng dữ liệu của hôm qua;
 *   (b) hôm nay chưa có lượt `success` nào.
 *
 * Không thoả ⇒ `false`, và caller return NGAY: không log, không gọi Google. Một dòng log mỗi 15
 * phút nói "chưa tới giờ" sẽ chôn mọi dòng đáng đọc khác (cùng lý do với job hạn phản hồi).
 */
export async function shouldRunHolidaySync(prisma: PrismaClient, now: Date): Promise<boolean> {
  if (vnParts(now).hour < HOLIDAY_SYNC_START_HOUR_VN) return false;

  const succeededToday = await prisma.holidaySyncRun.findFirst({
    where: { status: HOLIDAY_SYNC_STATUS.SUCCESS, startedAt: { gte: startOfVnDay(now) } },
    select: { id: true },
  });

  return succeededToday === null;
}

/**
 * Cắt bí mật khỏi thông điệp lỗi TRƯỚC khi nó vào DB hay log.
 *
 * Lỗi mạng của Node hay kèm nguyên URL đã gọi, và URL đó mang `key=...` trong query string.
 * Ghi thẳng vào `holiday_sync_runs.error_message` là tự tay chép API key vào một bảng mà sau
 * này ai đó sẽ mở ra xem để tìm nguyên nhân sự cố.
 *
 * Hai lớp có chủ đích: cắt theo hình `?key=`/`&key=`, RỒI cắt chính chuỗi key ở bất cứ đâu nó
 * còn xuất hiện (Google in key vào thân thông điệp trong vài mã lỗi). Lớp thứ hai có thể cắt
 * lố nếu key ngắn bất thường — một key vài ký tự sẽ khớp cả những chữ vô hại. Chấp nhận: một
 * thông điệp lỗi bị che thừa vẫn đọc được, còn một key lọt ra thì không lấy lại được.
 */
export function redactSecrets(message: string, apiKey: string): string {
  const withoutQueryKey = message.replace(/([?&]key=)[^&\s]*/gi, '$1[đã che]');
  if (!apiKey) return withoutQueryKey;
  return withoutQueryKey.split(apiKey).join('[đã che]');
}

/** Cột ngày trần: `YYYY-MM-DD` → giá trị ghi vào `@db.Date` (nửa đêm UTC). */
function toDateOnly(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

/** Cột `@db.Date` → `YYYY-MM-DD`. */
function fromDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function createRow(
  holiday: NormalizedHoliday,
  syncedAt: Date,
): Prisma.PublicHolidayCreateManyInput {
  return {
    id: newId(),
    googleEventId: holiday.googleEventId,
    startDate: toDateOnly(holiday.startDate),
    endDate: toDateOnly(holiday.endDate),
    name: holiday.name,
    description: holiday.description,
    eventType: holiday.eventType,
    source: HOLIDAY_SOURCE.GOOGLE_CALENDAR,
    googleUpdatedAt: holiday.googleUpdatedAt ? new Date(holiday.googleUpdatedAt) : null,
    syncedAt,
  };
}

/**
 * Một lượt đồng bộ.
 *
 * KHÔNG kiểm cổng giờ/ngày — đó là việc của caller (`shouldRunHolidaySync`), và tách ra chính
 * là thứ cho phép script thủ công chạy bất kể giờ giấc mà không phải nhân đôi logic.
 *
 * KHÔNG ném ra ngoài: mọi lỗi trở thành một dòng `holiday_sync_runs.failed` + `status` trong
 * kết quả trả về. Một sự cố của Google không được phép giết vòng lặp worker.
 */
export async function syncHolidays(
  prisma: PrismaClient,
  deps: HolidaySyncDeps,
): Promise<HolidaySyncResult> {
  const now = deps.now ?? new Date();
  const trigger = deps.trigger ?? HOLIDAY_SYNC_TRIGGER.SCHEDULED;
  const fetchEvents = deps.fetchEvents ?? fetchHolidayEvents;
  const window = holidaySyncWindow(now);

  // 1. Mở sổ TRƯỚC khi gọi ra ngoài: một lượt chết giữa chừng phải để lại dấu vết, chứ không
  //    biến mất như thể nó chưa từng chạy.
  const runId = newId();
  await prisma.holidaySyncRun.create({
    data: { id: runId, startedAt: now, status: HOLIDAY_SYNC_STATUS.FAILED, trigger },
  });

  // 2. Gọi Google. Hỏng ở đây thì KHÔNG chạm `public_holidays` — đó là toàn bộ lý do bước này
  //    đứng riêng, ngoài mọi transaction ghi.
  const params: FetchHolidayEventsParams = {
    calendarId: deps.calendarId,
    apiKey: deps.apiKey,
    timeMin: window.timeMin,
    timeMax: window.timeMax,
  };

  let rawEvents: readonly GoogleCalendarEventLike[];
  try {
    rawEvents = await fetchEvents(params);
  } catch (err) {
    const message = redactSecrets(err instanceof Error ? err.message : String(err), deps.apiKey);
    await prisma.holidaySyncRun.update({
      where: { id: runId },
      data: {
        finishedAt: new Date(),
        status: HOLIDAY_SYNC_STATUS.FAILED,
        errorMessage: message.slice(0, 2_000),
      },
    });
    return {
      status: HOLIDAY_SYNC_STATUS.FAILED,
      found: 0,
      created: 0,
      updated: 0,
      deleted: 0,
      skipped: 0,
      errorMessage: message,
    };
  }

  // 3. Chuẩn hoá bằng hàm THUẦN — bẫy `end.date` end-exclusive nằm ở đó, không ở đây.
  const normalized = normalizeGoogleHolidayEvents(rawEvents);

  /*
   * 4. Đọc dòng đang có rồi tính diff.
   *
   * HAI vế `OR`, và vế thứ hai được viết bằng máu:
   *
   *   (a) mọi dòng GIAO với cửa sổ — cần để phát hiện dòng Google đã gỡ (chúng không còn xuất
   *       hiện trong kết quả, nên chỉ có cách nhận ra qua khoảng ngày);
   *   (b) mọi dòng mang một `google_event_id` mà Google VỪA trả về, kể cả khi nó nằm ngoài cửa sổ.
   *
   * Vì sao (b) là bắt buộc: `timeMin`/`timeMax` của Google lọc theo mốc thời gian, còn cửa sổ ở
   * đây là ngày trần — hai phép lọc KHÔNG trùng nhau ở biên. Một ngày lễ 31/12/2024 có
   * `end.date = 2025-01-01`, đủ để overlap `timeMin` và được Google trả về, nhưng dòng lưu lại
   * mang `end_date = 2024-12-31` nên nằm NGOÀI cửa sổ. Thiếu vế (b) thì lượt sau không thấy nó
   * trong `existing`, coi như sự kiện mới, và `createMany` chết vì unique `google_event_id`.
   * Đúng lỗi này đã xảy ra ở lần đồng bộ thật thứ hai (26/08/2026).
   *
   * Vế (b) KHÔNG mở đường cho việc xoá nhầm: dòng vào `existing` theo (b) đều đang có mặt trong
   * kết quả Google, nên `planHolidaySync` luôn xếp chúng vào `stillPresent`.
   */
  const fetchedEventIds = [
    ...normalized.holidays.map((h) => h.googleEventId),
    ...normalized.cancelledEventIds,
  ];

  const rows = await prisma.publicHoliday.findMany({
    where: {
      OR: [
        {
          startDate: { lte: toDateOnly(window.toDate) },
          endDate: { gte: toDateOnly(window.fromDate) },
        },
        ...(fetchedEventIds.length > 0 ? [{ googleEventId: { in: fetchedEventIds } }] : []),
      ],
    },
    select: {
      id: true,
      googleEventId: true,
      startDate: true,
      endDate: true,
      name: true,
      description: true,
      eventType: true,
      source: true,
      googleUpdatedAt: true,
    },
  });

  const existing: ExistingHolidayRow[] = rows.map((row) => ({
    id: row.id,
    googleEventId: row.googleEventId,
    startDate: fromDateOnly(row.startDate),
    endDate: fromDateOnly(row.endDate),
    name: row.name,
    description: row.description,
    eventType: row.eventType,
    source: row.source,
    googleUpdatedAt: row.googleUpdatedAt?.toISOString() ?? null,
  }));

  const plan = planHolidaySync(existing, normalized);
  const syncedAt = new Date();

  // 5. Toàn bộ phần ghi + đóng sổ trong MỘT transaction.
  try {
    await prisma.$transaction(async (tx) => {
      if (plan.toDelete.length > 0) {
        await tx.publicHoliday.deleteMany({ where: { id: { in: [...plan.toDelete] } } });
      }
      if (plan.toCreate.length > 0) {
        await tx.publicHoliday.createMany({
          data: plan.toCreate.map((holiday) => createRow(holiday, syncedAt)),
        });
      }
      for (const update of plan.toUpdate) {
        await tx.publicHoliday.update({
          where: { id: update.id },
          data: {
            startDate: toDateOnly(update.changes.startDate),
            endDate: toDateOnly(update.changes.endDate),
            name: update.changes.name,
            description: update.changes.description,
            eventType: update.changes.eventType,
            googleUpdatedAt: update.changes.googleUpdatedAt
              ? new Date(update.changes.googleUpdatedAt)
              : null,
            syncedAt,
          },
        });
      }

      await tx.holidaySyncRun.update({
        where: { id: runId },
        data: {
          finishedAt: new Date(),
          status: HOLIDAY_SYNC_STATUS.SUCCESS,
          eventsFound: normalized.holidays.length,
          eventsCreated: plan.toCreate.length,
          eventsUpdated: plan.toUpdate.length,
          eventsDeleted: plan.toDelete.length,
        },
      });

      /*
       * Audit CHỈ khi có thay đổi thật. Một dòng `holiday.sync` mỗi ngày nói "0/0/0" sẽ làm
       * `audit_logs` — cuốn sổ dùng để truy ai đã làm gì — dày thêm 365 dòng/năm mà không kể
       * được điều gì. Ghi trong CÙNG transaction để không có thay đổi nào không có vết.
       */
      if (plan.toCreate.length + plan.toUpdate.length + plan.toDelete.length > 0) {
        await recordSystemAudit(tx, {
          action: 'holiday.sync',
          targetType: 'holiday_sync_run',
          targetId: runId,
          after: {
            trigger,
            window: { from: window.fromDate, to: window.toDate },
            found: normalized.holidays.length,
            created: plan.toCreate.length,
            updated: plan.toUpdate.length,
            deleted: plan.toDelete.length,
          },
        });
      }
    });
  } catch (err) {
    /*
     * Lỗi ở phần GHI (vi phạm ràng buộc, mất kết nối giữa transaction) từng thoát ra ngoài và
     * để lại một dòng `holiday_sync_runs` treo lơ lửng: `status='failed'` nhưng `finished_at`
     * rỗng, tức là "không ai biết lượt này kết thúc chưa". Hàm này hứa KHÔNG ném — và lời hứa
     * đó chỉ đúng nếu cả hai đường hỏng (gọi Google, ghi DB) đều đóng sổ tử tế.
     *
     * Transaction đã rollback nên `public_holidays` vẫn nguyên vẹn; chỉ dòng nhật ký là cần
     * cập nhật, và nó nằm NGOÀI transaction vừa hỏng nên ghi được.
     */
    const message = redactSecrets(err instanceof Error ? err.message : String(err), deps.apiKey);
    await prisma.holidaySyncRun.update({
      where: { id: runId },
      data: {
        finishedAt: new Date(),
        status: HOLIDAY_SYNC_STATUS.FAILED,
        errorMessage: message.slice(0, 2_000),
      },
    });
    return {
      status: HOLIDAY_SYNC_STATUS.FAILED,
      found: normalized.holidays.length,
      created: 0,
      updated: 0,
      deleted: 0,
      skipped: normalized.skipped.length,
      errorMessage: message,
    };
  }

  return {
    status: HOLIDAY_SYNC_STATUS.SUCCESS,
    found: normalized.holidays.length,
    created: plan.toCreate.length,
    updated: plan.toUpdate.length,
    deleted: plan.toDelete.length,
    skipped: normalized.skipped.length,
  };
}
