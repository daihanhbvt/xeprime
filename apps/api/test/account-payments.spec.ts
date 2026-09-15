import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  BOOKING_STATUS,
  PAYMENT_KIND,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  TENANT_STATUS,
} from '@xeprime/types';
import { AccountPaymentsService } from '../src/modules/payments/account-payments.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * "Tiền của các chuyến đã thuê" — bề mặt KHÁCH của `payments` (PROMPT 5), trên PostgreSQL THẬT.
 *
 * Điều quan trọng nhất spec này khoá là **RANH GIỚI ĐỌC**: một khách chỉ thấy khoản của chuyến
 * CHÍNH MÌNH thuê. Ranh giới đó nằm ở `booking.bookingRequest.customerUserId`, và nó phải đúng
 * ở CẢ danh sách lẫn CẢ phép tổng — tổng là chỗ dễ quên nhất vì nó không trả về dòng nào để ai
 * đó nhận ra con số đang gồm tiền của người khác.
 *
 * Luật thứ hai: `totals` chỉ cộng khoản `succeeded`. `pending` chưa phải tiền đã trả, và cộng nó
 * vào là nói với khách rằng họ đã trả nhiều hơn thực tế — con số họ mang đi tranh luận với shop.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const payments = new AccountPaymentsService(asService);

const RUN = newId().slice(-8).toLowerCase();
let dbAvailable = false;
let ownerId: string;
let meId: string;
let otherId: string;
let tenantId: string;
let vehicleId: string;
let myBookingId: string;
let otherBookingId: string;
let seq = 0;

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

/** Một chuyến của `customerUserId` — yêu cầu + đơn, vì ranh giới đọc đi qua yêu cầu. */
async function makeTrip(customerUserId: string): Promise<string> {
  seq += 1;
  const requestId = newId();
  const bookingId = newId();

  await prisma.booking.create({
    data: {
      id: bookingId,
      tenantId,
      vehicleId,
      code: `DHAP${seq}${RUN.slice(0, 3).toUpperCase()}`,
      customerName: 'Khách',
      customerPhone: `0933${String(100000 + seq).slice(-6)}`,
      status: BOOKING_STATUS.COMPLETED,
      pickupAt: new Date(Date.now() - 5 * 86400_000),
      returnAt: new Date(Date.now() - 3 * 86400_000),
      baseAmount: new Prisma.Decimal(1_000_000),
      totalAmount: new Prisma.Decimal(1_000_000),
    },
  });
  await prisma.bookingRequest.create({
    data: {
      id: requestId,
      tenantId,
      vehicleId,
      bookingId,
      customerUserId,
      customerName: 'Khách',
      customerPhone: `0933${String(100000 + seq).slice(-6)}`,
      status: 'converted_to_booking',
      pickupAt: new Date(Date.now() - 5 * 86400_000),
      returnAt: new Date(Date.now() - 3 * 86400_000),
      respondBy: new Date(Date.now() - 6 * 86400_000),
    },
  });
  return bookingId;
}

async function pay(
  bookingId: string,
  amount: number,
  opts: { kind?: string; status?: string; paidAt?: Date | null } = {},
) {
  seq += 1;
  await prisma.payment.create({
    data: {
      id: newId(),
      tenantId,
      bookingId,
      amount: new Prisma.Decimal(amount),
      method: PAYMENT_METHOD.CASH,
      kind: opts.kind ?? PAYMENT_KIND.RENTAL,
      status: opts.status ?? PAYMENT_STATUS.SUCCEEDED,
      paidAt: opts.paidAt === undefined ? new Date() : opts.paidAt,
    },
  });
}

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }
  ownerId = newId();
  meId = newId();
  otherId = newId();
  tenantId = newId();
  vehicleId = newId();

  await prisma.user.createMany({
    data: [
      { id: ownerId, displayName: 'Chủ xe', email: `ap-own-${RUN}@xeprime.test` },
      { id: meId, displayName: 'Tôi', email: `ap-me-${RUN}@xeprime.test` },
      { id: otherId, displayName: 'Người khác', email: `ap-other-${RUN}@xeprime.test` },
    ],
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: `PayShop-${RUN}`,
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      tenantId,
      code: `XE${vehicleId.slice(-5)}`,
      name: 'Xe thanh toán',
      vehicleType: 'car',
      createdBy: ownerId,
    },
  });

  myBookingId = await makeTrip(meId);
  otherBookingId = await makeTrip(otherId);
});

afterEach(async () => {
  if (!dbAvailable) return;
  await prisma.payment.deleteMany({ where: { tenantId } });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.payment.deleteMany({ where: { tenantId } });
    await prisma.bookingRequest.deleteMany({ where: { tenantId } });
    await prisma.booking.deleteMany({ where: { tenantId } });
    await prisma.tenantCustomer.deleteMany({ where: { tenantId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, meId, otherId] } } });
  }
  await prisma.$disconnect();
});

describe('Ranh giới đọc — chỉ chuyến của CHÍNH mình', () => {
  maybe('không thấy khoản của chuyến người khác, ở CẢ danh sách lẫn CẢ tổng', async () => {
    await pay(myBookingId, 300_000);
    await pay(otherBookingId, 900_000);

    const mine = await payments.list(meId, {});
    expect(mine.data).toHaveLength(1);
    expect(mine.data[0]!.bookingId).toBe(myBookingId);
    expect(mine.data[0]!.amount).toBe('300000');
    /*
     * Tổng là chỗ dễ quên ranh giới nhất: nó không trả về dòng nào để ai đó nhận ra con số đang
     * gồm tiền của người khác. 900.000 của chuyến kia KHÔNG được lọt vào đây.
     */
    expect(mine.meta.totals.paidTotal).toBe('300000');
    expect(mine.meta.totals.tripCount).toBe(1);

    const theirs = await payments.list(otherId, {});
    expect(theirs.data).toHaveLength(1);
    expect(theirs.meta.totals.paidTotal).toBe('900000');
  });

  /**
   * PHONG BÌ — phép kiểm này tồn tại vì một BUG ĐÃ XẢY RA trên `/account/payments`.
   *
   * Bản đầu trả `{ data, meta, totals }`, ba khoá ngang hàng. `ResponseInterceptor` cho qua (nó
   * chỉ kiểm "có `data` không") nên HTTP trả đúng ba khoá — nhưng client dùng `apiGet` lấy
   * `result.data`, tức nhận về MẢNG, và `totals` bốc hơi trên đường về. Màn nổ
   * `Cannot read properties of undefined (reading 'paidTotal')`.
   *
   * Không test nào bắt được: mọi test ở file này gọi thẳng service, nơi phong bì chưa tồn tại;
   * còn `apiGet<AccountPaymentPage>` thì đã tự KHẲNG ĐỊNH với TypeScript rằng phần trong phong bì
   * là cả trang, nên typecheck cũng im.
   *
   * Cách chặn ở đây là khoá đúng điều kiện đã bị vi phạm: service KHÔNG được trả khoá nào ngoài
   * `data` và `meta`. Mọi thứ kèm theo đi trong `meta` (như `BookingRequestPageMetaDto` đã làm).
   */
  maybe('BẤT BIẾN: chỉ có `data` và `meta` ở tầng ngoài — mọi thứ khác đi trong `meta`', async () => {
    const res = await payments.list(meId, {});

    expect(Object.keys(res).sort()).toEqual(['data', 'meta']);
    // Và `totals` phải thật sự ở trong `meta`, không phải chỉ "không ở ngoài".
    expect(res.meta.totals).toBeDefined();
    expect(res.meta.totals.paidTotal).toBeDefined();
    expect(res.meta).toMatchObject({ page: 1, limit: expect.any(Number) });
  });

  maybe('người chưa thuê gì thấy danh sách rỗng và tổng 0, không phải lỗi', async () => {
    const empty = await payments.list(ownerId, {});
    expect(empty.data).toEqual([]);
    expect(empty.meta.total).toBe(0);
    expect(empty.meta.totals.paidTotal).toBe('0');
    expect(empty.meta.totals.tripCount).toBe(0);
  });

  /**
   * Đơn gian hàng TỰ LẬP không có `booking_request`, nên không có `customerUserId` nào gắn với
   * nó — và đúng như vậy: không có tài khoản khách nào để mà đọc. Nó phải không lọt vào bất kỳ
   * danh sách nào, kể cả của chủ gian hàng.
   */
  maybe('đơn gian hàng tự lập (không có yêu cầu) không lọt vào danh sách của ai', async () => {
    seq += 1;
    const directId = newId();
    await prisma.booking.create({
      data: {
        id: directId,
        tenantId,
        vehicleId,
        code: `DHAPD${seq}${RUN.slice(0, 3).toUpperCase()}`,
        customerName: 'Khách quầy',
        status: BOOKING_STATUS.COMPLETED,
        pickupAt: new Date(Date.now() - 2 * 86400_000),
        returnAt: new Date(Date.now() - 86400_000),
        baseAmount: new Prisma.Decimal(500_000),
        totalAmount: new Prisma.Decimal(500_000),
      },
    });
    await pay(directId, 500_000);

    for (const userId of [meId, otherId, ownerId]) {
      const res = await payments.list(userId, {});
      expect(res.data.some((r) => r.bookingId === directId)).toBe(false);
    }

    await prisma.payment.deleteMany({ where: { bookingId: directId } });
    await prisma.booking.deleteMany({ where: { id: directId } });
  });
});

describe('Tổng chỉ cộng khoản ĐÃ TRẢ', () => {
  maybe('`pending` / `failed` / `refunded` không vào `paidTotal` nhưng VẪN hiện trong danh sách', async () => {
    await pay(myBookingId, 100_000, { status: PAYMENT_STATUS.SUCCEEDED });
    await pay(myBookingId, 200_000, { status: PAYMENT_STATUS.PENDING, paidAt: null });
    await pay(myBookingId, 400_000, { status: PAYMENT_STATUS.FAILED, paidAt: null });
    await pay(myBookingId, 800_000, { status: PAYMENT_STATUS.REFUNDED });

    const res = await payments.list(meId, {});
    // Bốn dòng đều hiện: khách phải thấy khoản đang xử lý và khoản hỏng, nếu không họ không biết
    // vì sao số tiền không khớp.
    expect(res.data).toHaveLength(4);
    // Nhưng chỉ `succeeded` là tiền đã trả.
    expect(res.meta.totals.paidTotal).toBe('100000');
  });

  maybe('tách tiền thuê và tiền cọc — hai loại tiền có số phận khác nhau', async () => {
    await pay(myBookingId, 700_000, { kind: PAYMENT_KIND.RENTAL });
    await pay(myBookingId, 300_000, { kind: PAYMENT_KIND.DEPOSIT });

    const res = await payments.list(meId, {});
    expect(res.meta.totals.rentalTotal).toBe('700000');
    // Cọc sẽ được hoàn khi trả xe — gộp nó vào "đã trả" mà không tách là làm khách tưởng mất luôn.
    expect(res.meta.totals.depositTotal).toBe('300000');
    expect(res.meta.totals.paidTotal).toBe('1000000');
  });

  maybe('lọc theo loại chỉ đổi DANH SÁCH, không đổi tổng', async () => {
    await pay(myBookingId, 700_000, { kind: PAYMENT_KIND.RENTAL });
    await pay(myBookingId, 300_000, { kind: PAYMENT_KIND.DEPOSIT });

    const onlyDeposit = await payments.list(meId, { kind: PAYMENT_KIND.DEPOSIT });
    expect(onlyDeposit.data).toHaveLength(1);
    expect(onlyDeposit.data[0]!.kind).toBe(PAYMENT_KIND.DEPOSIT);
    /*
     * Tổng KHÔNG theo bộ lọc: nó là "tôi đã trả bao nhiêu cho các chuyến của mình", và đổi theo
     * ô lọc sẽ làm con số ở đầu màn nhảy mỗi lần người dùng thu hẹp danh sách.
     */
    expect(onlyDeposit.meta.totals.paidTotal).toBe('1000000');
  });

  maybe('một chuyến trả nhiều lần vẫn là MỘT chuyến', async () => {
    await pay(myBookingId, 100_000);
    await pay(myBookingId, 200_000);
    await pay(myBookingId, 300_000);

    const res = await payments.list(meId, {});
    expect(res.data).toHaveLength(3);
    expect(res.meta.totals.tripCount).toBe(1);
    expect(res.meta.totals.paidTotal).toBe('600000');
  });
});

describe('Phân trang SERVER-SIDE', () => {
  maybe('trang 2 trả đúng phần còn lại, và tổng không đổi theo trang', async () => {
    for (let i = 0; i < 5; i += 1) await pay(myBookingId, 100_000);

    const page1 = await payments.list(meId, { page: 1, limit: 2 });
    const page2 = await payments.list(meId, { page: 2, limit: 2 });
    const page3 = await payments.list(meId, { page: 3, limit: 2 });

    expect(page1.data).toHaveLength(2);
    expect(page2.data).toHaveLength(2);
    expect(page3.data).toHaveLength(1);
    expect(page1.meta.total).toBe(5);
    expect(page1.meta.hasNext).toBe(true);
    expect(page3.meta.hasNext).toBe(false);

    // Không dòng nào xuất hiện ở hai trang — thứ tự phải xác định, kể cả khi cùng mốc thời gian.
    const ids = [...page1.data, ...page2.data, ...page3.data].map((r) => r.id);
    expect(new Set(ids).size).toBe(5);

    // Tổng là của CẢ danh sách, không phải của trang đang xem.
    expect(page2.meta.totals.paidTotal).toBe('500000');
  });

  maybe('khoản CHỜ XỬ LÝ nằm ở đầu, không tụt xuống trang cuối', async () => {
    await pay(myBookingId, 100_000, { paidAt: new Date(Date.now() - 10 * 86400_000) });
    await pay(myBookingId, 200_000, { status: PAYMENT_STATUS.PENDING, paidAt: null });

    const res = await payments.list(meId, {});
    /*
     * Khoản `pending` chưa có `paid_at`. Nếu NULL bị sắp xuống cuối thì thứ khách đang chờ lại
     * ở trang cuối cùng — đúng thứ họ mở màn này để tìm.
     */
    expect(res.data[0]!.status).toBe(PAYMENT_STATUS.PENDING);
  });
});
