/**
 * Nền chung của seed: client, chế độ chạy, chốt an toàn, đồng hồ và bộ sinh ID tất định.
 *
 * Tách khỏi các bước seed vì đây là thứ MỌI bước đều chạm và không bước nào được phép định
 * nghĩa lại theo cách riêng — nhất là `seedId`: hai bước sinh ID khác cách nhau thì seed hết
 * idempotent mà không ai thấy cho tới lần chạy thứ hai.
 */
import { createHash } from 'node:crypto';
import { encodeTime } from 'ulid';
import { createPrismaClient } from '../index';

export const prisma = createPrismaClient();

/**
 * `system` = CHỈ dữ liệu nền bắt buộc để app chạy (permission, role hệ thống, danh mục thu/chi,
 *            gói dịch vụ). Chạy được ở MỌI môi trường, kể cả production.
 * `demo`   = thêm gian hàng/xe/đơn/sổ sách mẫu — mặc định, dùng cho máy dev và môi trường demo.
 */
export const SEED_MODE: 'system' | 'demo' = process.env.SEED_MODE === 'system' ? 'system' : 'demo';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export const BCRYPT_ROUNDS = 12;

/** Mật khẩu mẫu cho máy dev. Production BẮT BUỘC truyền env — xem `assertSeedTargetIsSafe`. */
export const DEFAULT_DEV_PASSWORD = 'Abcd1234';
export const PLATFORM_ADMIN_EMAIL = (process.env.PLATFORM_ADMIN_EMAIL ?? 'admin@xeprime.vn')
  .trim()
  .toLowerCase();
export const PLATFORM_ADMIN_PASSWORD = process.env.PLATFORM_ADMIN_PASSWORD ?? DEFAULT_DEV_PASSWORD;
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? DEFAULT_DEV_PASSWORD;

/**
 * Chặn hai tai nạn kinh điển trước khi ghi bất cứ dòng nào:
 *  1. đổ gian hàng demo + tài khoản `@xeprime.test` vào database production;
 *  2. tạo tài khoản platform admin production với mật khẩu mẫu.
 *
 * Không có cờ "force": muốn dữ liệu nền ở production thì chạy `SEED_MODE=system` — đó là cách
 * đúng, không phải cách vòng.
 */
export function assertSeedTargetIsSafe(): void {
  if (!IS_PRODUCTION) return;

  if (SEED_MODE === 'demo') {
    throw new Error(
      'NODE_ENV=production: từ chối seed dữ liệu DEMO. Dùng SEED_MODE=system nếu chỉ cần ' +
        'permission/role/danh mục/gói dịch vụ.',
    );
  }
  if (!process.env.PLATFORM_ADMIN_PASSWORD) {
    throw new Error(
      'NODE_ENV=production: PLATFORM_ADMIN_PASSWORD là bắt buộc — không dùng mật khẩu mẫu.',
    );
  }
  if (PLATFORM_ADMIN_PASSWORD === DEFAULT_DEV_PASSWORD) {
    throw new Error('NODE_ENV=production: PLATFORM_ADMIN_PASSWORD vẫn là mật khẩu mẫu.');
  }
}

// ---------------------------------------------------------------------------
// ID tất định
// ---------------------------------------------------------------------------

/**
 * Mốc thời gian CỐ ĐỊNH cho 10 ký tự đầu của mọi ULID do seed sinh.
 *
 * Hai tác dụng: id seed sắp xếp ổn định giữa các lần chạy (ULID sắp theo thời gian nên
 * `ORDER BY id` không nhảy loạn), và nhìn tiền tố là biết ngay bản ghi do seed tạo chứ không
 * phải do người dùng thật tạo.
 */
const SEED_ULID_TIME = encodeTime(Date.UTC(2026, 7, 21), 10);
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * ULID hợp lệ sinh TẤT ĐỊNH từ một khoá nghiệp vụ (`'shop1:vehicle:12'`).
 *
 * Vì sao cần: phần lớn bảng con (tài xế, phiếu thu, biên bản bàn giao, ghi chú khách…) KHÔNG
 * có khoá tự nhiên để upsert. Không có id tất định thì seed chạy lại chỉ còn hai lựa chọn —
 * nhân bản dữ liệu, hoặc xoá sạch rồi tạo lại. Cái sau nghe an toàn nhưng nó xoá luôn thứ
 * người dev vừa sửa tay để thử. Id suy từ khoá cho phép `upsert` thật sự.
 */
export function seedId(key: string): string {
  const digest = createHash('sha256').update(key).digest();
  let tail = '';
  for (let i = 0; i < 16; i += 1) tail += CROCKFORD[digest[i]! % 32];
  return SEED_ULID_TIME + tail;
}

// ---------------------------------------------------------------------------
// Đồng hồ
// ---------------------------------------------------------------------------

/**
 * Mốc 00:00 UTC của hôm nay. Lịch demo neo vào ĐÂY chứ không vào ngày cố định: màn Lịch và
 * Dashboard phải có đơn đang chạy/sắp tới ở bất kỳ ngày nào người ta mở máy lên chạy seed.
 */
export const TODAY = (() => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
})();

/** Ngày lệch `days` so với hôm nay, đặt giờ UTC cho trước (giờ VN = UTC+7). */
export function daysFromToday(days: number, hourUtc = 3): Date {
  const d = new Date(TODAY);
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d;
}

/** Chỉ phần NGÀY (cột `@db.Date`) — lệch `days` so với hôm nay. */
export function dateOnlyFromToday(days: number): Date {
  const d = new Date(TODAY);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// ---------------------------------------------------------------------------
// Tiện ích nhỏ
// ---------------------------------------------------------------------------

/** Ảnh Unsplash ghim theo photo id — card/gallery có ảnh thật và ổn định giữa các lần seed. */
export function photo(id: string): string {
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1200&q=70`;
}

/** Lấy phần tử theo chỉ số vòng lặp — thay cho random, để dữ liệu sinh ra lặp lại được. */
export function pick<T>(list: readonly T[], index: number): T {
  return list[((index % list.length) + list.length) % list.length]!;
}

export function log(message: string): void {
  console.log(message);
}
