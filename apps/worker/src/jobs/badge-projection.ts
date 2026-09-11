import {
  clearBadgeSignal,
  computeUserBadges,
  deferBadgeSignal,
  takeBadgeSignals,
  type PrismaClient,
} from '@xeprime/prisma';
import type { BadgeWriter } from '../lib/firestore';

/**
 * Bao nhiêu người được chiếu trong một lượt. Đủ lớn để một trận fan-out (tin nhắn vào gian hàng
 * 30 nhân viên) xong trong một nhịp, đủ nhỏ để một lượt không giữ kết nối DB quá lâu.
 */
const BATCH = 100;

/**
 * Bao nhiêu người được chiếu SONG SONG trong một lô.
 *
 * Tuần tự thì độ trễ của người cuối lô = tổng thời gian của cả lô, và lời hứa "badge đổi trong
 * khoảng ba giây" tan ngay ở gian hàng đông người. Song song hoàn toàn thì một trận fan-out mở
 * 100 kết nối DB cùng lúc và tranh chỗ với chính API đang phục vụ người dùng. Tám là con số vừa:
 * nó nằm dưới kích thước pool mặc định của Prisma, và cắt độ trễ của lô đầy đi gần một bậc.
 */
const CONCURRENCY = 8;

export interface BadgeProjectionResult {
  projected: number;
  failed: number;
}

/**
 * Chiếu huy hiệu Postgres → Firestore: client NGHE con số thay vì HỎI lại mỗi vài chục giây.
 *
 * Chi phí của đường này bám theo SỐ NGƯỜI CÓ VIỆC, không theo số tab đang mở — đó là cả lý do
 * nó tồn tại. Mười nghìn tab mở cùng lúc mà không ai nhắn gì thì job này không làm gì cả.
 *
 * Job này CHỈ chạy khi Firestore bật. Tắt Firestore thì tín hiệu được GIỮ NGUYÊN trong hàng đợi
 * (bảng tối đa một dòng/người nên nó không phình theo số sự kiện), để lúc bật lại worker chiếu
 * đúng những gì đã đổi. Bản trước DỌN tín hiệu trong trường hợp đó, và cái giá là một document
 * Firestore cũ nằm lại: nó sẽ thắng lượt đọc REST đầu tiên của client sau khi bật lại.
 */
export async function projectBadges(
  prisma: PrismaClient,
  writer: BadgeWriter,
): Promise<BadgeProjectionResult> {
  const signals = await takeBadgeSignals(prisma, BATCH);
  if (signals.length === 0) return { projected: 0, failed: 0 };

  let projected = 0;
  let failed = 0;
  let cursor = 0;

  const runOne = async (signal: (typeof signals)[number]): Promise<void> => {
    /*
     * Lỗi của MỘT người không được dừng lô.
     *
     * Tín hiệu lấy ra theo `dirty_at` tăng dần, nên một dòng hỏng vĩnh viễn luôn nằm ở đầu hàng.
     * Ném ra ngoài ở đây thì nó chặn tất cả những người phía sau, mãi mãi; mà chỉ bỏ qua thôi vẫn
     * chưa đủ — từ `BATCH` dòng hỏng trở lên là lô nào cũng chỉ gồm chúng. Nên khi lỗi, dòng đó
     * bị đẩy XUỐNG CUỐI hàng: vẫn bẩn, vẫn được thử lại, nhưng không còn giữ chỗ ưu tiên.
     */
    try {
      const counts = await computeUserBadges(prisma, signal.userId);
      await writer.writeUserBadges(signal.userId, { ...counts, updatedAt: Date.now() });
      /*
       * Xoá theo ĐÚNG số hiệu đã lấy: một sự kiện tới trong lúc đang chiếu đã tăng `revision`,
       * câu xoá không khớp, dòng ở lại cho lượt sau. So bằng mốc thời gian thì hai sự kiện trùng
       * mili-giây sẽ trông như một, và sự kiện thứ hai biến mất cùng badge của người đó.
       */
      await clearBadgeSignal(prisma, signal.userId, signal.revision);
      projected++;
    } catch (err) {
      failed++;
      // Chỉ id người dùng và thông điệp lỗi — không bao giờ là nội dung badge hay object user.
      console.error(`chiếu badge lỗi (user ${signal.userId}):`, errorText(err));
      await deferBadgeSignal(prisma, signal.userId).catch(() => undefined);
    }
  };

  const workers = Array.from({ length: Math.min(CONCURRENCY, signals.length) }, async () => {
    while (cursor < signals.length) {
      const signal = signals[cursor++];
      if (signal) await runOne(signal);
    }
  });
  await Promise.all(workers);

  return { projected, failed };
}

/** Thông điệp lỗi đã cắt gọn — đủ để lần ra nguyên nhân, không kéo theo payload. */
function errorText(err: unknown): string {
  return String((err as Error)?.message ?? err).slice(0, 300);
}
