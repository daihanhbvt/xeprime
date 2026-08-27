import { createPrismaClient } from '@xeprime/prisma';
import { HOLIDAY_SYNC_STATUS, HOLIDAY_SYNC_TRIGGER } from '@xeprime/types';
import {
  GOOGLE_HOLIDAY_API_KEY,
  GOOGLE_HOLIDAY_CALENDAR_ID,
  HOLIDAY_SYNC_ENABLED,
} from '../lib/env';
import { syncHolidays } from '../jobs/holiday-sync';

/**
 * Chạy đồng bộ ngày lễ NGAY, bất kể giờ giấc — `pnpm --filter @xeprime/worker holidays:sync`.
 *
 * Vì sao là script CLI chứ không phải một nút trong `/manage/admin`:
 *
 *  - repo chưa có khu "cấu hình hệ thống" nào ở phần quản trị nền tảng. Dựng một màn hình chỉ
 *    để chứa một cái nút là một scope lớn hơn cả tính năng ngày lễ;
 *  - `public_holidays` là dữ liệu TOÀN NỀN TẢNG, không thuộc tenant nào. Một endpoint GHI cho
 *    nó sẽ kéo theo một permission mới + `@PlatformOnly` + tài liệu Swagger + test — tất cả để
 *    phục vụ một thao tác mà người vận hành làm vài lần trong đời hệ thống (lúc cắm key, lúc
 *    Google đổi lịch giữa năm).
 *
 * Khác vòng lặp nền đúng hai chỗ: BỎ QUA cổng giờ/ngày (`shouldRunHolidaySync`), và ghi
 * `trigger = manual` để đọc `holiday_sync_runs` sau này còn phân biệt được sự cố nền với lần
 * ai đó đang thử cấu hình.
 */
async function main(): Promise<void> {
  if (!HOLIDAY_SYNC_ENABLED) {
    console.error(
      'GOOGLE_HOLIDAY_API_KEY chưa được đặt — không có gì để đồng bộ.\n' +
        'Tạo API key đã bật Google Calendar API rồi đặt vào .env (xem .env.example).',
    );
    process.exitCode = 1;
    return;
  }

  const prisma = createPrismaClient();
  try {
    console.log(`Đồng bộ ngày lễ từ lịch: ${GOOGLE_HOLIDAY_CALENDAR_ID}`);

    const result = await syncHolidays(prisma, {
      calendarId: GOOGLE_HOLIDAY_CALENDAR_ID,
      apiKey: GOOGLE_HOLIDAY_API_KEY,
      trigger: HOLIDAY_SYNC_TRIGGER.MANUAL,
    });

    if (result.status === HOLIDAY_SYNC_STATUS.FAILED) {
      // `errorMessage` đã đi qua `redactSecrets` trong job — an toàn để in ra.
      console.error(`Đồng bộ THẤT BẠI: ${result.errorMessage ?? 'không rõ nguyên nhân'}`);
      console.error('Dữ liệu ngày lễ đang có KHÔNG bị thay đổi.');
      process.exitCode = 1;
      return;
    }

    console.log(
      `Xong: tìm thấy ${result.found} · thêm ${result.created} · sửa ${result.updated} · xoá ${result.deleted}`,
    );
    if (result.skipped > 0) {
      console.warn(`${result.skipped} event bị bỏ qua vì không có ngày/tên dùng được.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('Đồng bộ ngày lễ lỗi:', err);
  process.exit(1);
});
