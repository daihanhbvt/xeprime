/**
 * Dữ liệu DEMO cho màn Tài chính (`/manage/admin/money`) — chạy QUA API THẬT, không ghi thẳng DB.
 *
 * Vì sao không nằm trong `seed.ts`: một khoản giữ chỗ chỉ đúng khi nó sinh ra từ cả chuỗi
 * yêu cầu → duyệt → tiền về → đơn thuê, và mỗi bước có writer riêng (`BookingHoldsService`,
 * `BookingsService` + chiếm lịch + bảo hiểm, `SepayService`, `HoldSettlementService`,
 * `WalletService`…). Đơn của seed là đơn gian hàng lập tay (`billing_mode` rỗng, không snapshot
 * phí) — treo hold lên chúng là dựng dữ liệu tự mâu thuẫn. Nên script này đóng vai người dùng
 * thật: khách gửi yêu cầu, chủ xe duyệt, "SePay" báo tiền về, khách mở tranh chấp, admin kết
 * luận và chốt tiền, chủ xe rút tiền, admin duyệt/chuyển/từ chối.
 *
 * Kết quả trên màn Tài chính:
 *  - Tiền vào: các khoản tự khớp + vài khoản CHƯA KHỚP (có khoản đã chờ > 24h) + khoản bỏ qua.
 *  - Giữ chỗ chờ chốt: chuyến đã trả tiền, hai chuyến đang tranh chấp.
 *  - Hoàn cho khách: hai khoản hoàn ĐÃ VÀO VÍ ĐIỂM (chủ xe huỷ · admin quyết định hoàn).
 *  - Rút tiền chủ xe: chờ duyệt · đã duyệt · đã chuyển · bị từ chối.
 *
 * KHÔNG có khoản hoàn "chờ chuyển tay": luồng hiện hành tạo tài khoản theo SĐT cho cả khách
 * vãng lai, nên mọi khoản hoàn đều ghi có ví điểm — hàng đợi đó rỗng là đúng sự thật.
 *
 * Yêu cầu: API dev đang chạy (mặc định http://localhost:4000, đổi bằng `DEMO_API_URL`) và đã
 * chạy `pnpm db:seed`. Chạy: `pnpm --filter @xeprime/prisma demo:finance` (thêm `--again` để tạo
 * thêm một lượt). Chỉ cho máy dev: từ chối khi API không phải localhost hoặc DB là production.
 */
import {
  BOOKING_HOLD_OUTCOME,
  BOOKING_HOLD_STATUS,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  CANCELLATION_REASON_CATEGORY,
  SERVICE_TYPE,
  SUPPORT_CASE_CATEGORY,
  SUPPORT_CASE_STATUS,
} from '@xeprime/types';
import {
  DEMO_PASSWORD,
  PLATFORM_ADMIN_EMAIL,
  PLATFORM_ADMIN_PASSWORD,
  assertDevOnly,
  assertSeedTargetIsSafe,
  log,
  prisma,
} from './seed/context';

const API = (process.env.DEMO_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
/** Dấu trên ghi chú yêu cầu — để lần chạy sau biết đã có dữ liệu demo, và để tra lại bằng tay. */
const MARK = '[demo-finance]';
const RUN = Date.now().toString(36);
const LOGIN_RETRY_WAIT_MS = 61_000;

// ── HTTP ──────────────────────────────────────────────────────────────────────

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    what: string,
  ) {
    super(`${what} → HTTP ${status}: ${body.slice(0, 300)}`);
  }
}

/** Một phiên đăng nhập bằng cookie — đúng như trình duyệt của người dùng đó. */
class Session {
  private constructor(
    readonly label: string,
    private readonly cookie: string,
  ) {}

  static async login(identifier: string, password: string): Promise<Session> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
      // Đăng nhập bị hãm 5 lượt/phút/IP — đợi qua cửa sổ rồi thử lại, không coi là lỗi.
      if (res.status === 429) {
        log(`  (chờ hạn mức đăng nhập — ${identifier})`);
        await sleep(LOGIN_RETRY_WAIT_MS);
        continue;
      }
      if (!res.ok) throw new ApiError(res.status, await res.text(), `đăng nhập ${identifier}`);
      const cookie = res.headers
        .getSetCookie()
        .map((c) => c.split(';')[0])
        .join('; ');
      return new Session(identifier, cookie);
    }
    throw new Error(`đăng nhập ${identifier}: vẫn bị hãm sau nhiều lần đợi`);
  }

  async call<T = unknown>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Cookie: this.cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    if (!res.ok) throw new ApiError(res.status, text, `${this.label} ${method} ${path}`);
    if (!text) return undefined as T;
    const json = JSON.parse(text) as { data?: T };
    return (json.data ?? json) as T;
  }
}

const sessions = new Map<string, Session>();

async function as(identifier: string, password = DEMO_PASSWORD): Promise<Session> {
  const cached = sessions.get(identifier);
  if (cached) return cached;
  const session = await Session.login(identifier, password);
  sessions.set(identifier, session);
  return session;
}

const admin = () => as(PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── SePay giả lập ────────────────────────────────────────────────────────────

let transferSeq = 0;

/** `YYYY-MM-DD HH:mm:ss` GIỜ VIỆT NAM — đúng định dạng SePay gửi. */
function vnLocal(at: Date): string {
  return new Date(at.getTime() + 7 * 3_600_000).toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Một lần "tiền về tài khoản" qua đúng webhook SePay mà production dùng — khoá thật, payload
 * thật. Trả `providerTxId` để tra lại dòng `bank_transactions`.
 */
async function bankTransfer(input: {
  amount: number;
  content: string;
  at?: Date;
  gateway?: string;
}): Promise<string> {
  const key = process.env.SEPAY_API_KEY;
  if (!key) throw new Error('Thiếu SEPAY_API_KEY trong .env — không gọi được webhook.');
  transferSeq += 1;
  const id = `demo-fin-${RUN}-${transferSeq}`;
  const res = await fetch(`${API}/sepay/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Apikey ${key}` },
    body: JSON.stringify({
      id,
      gateway: input.gateway ?? 'Vietcombank',
      transactionDate: vnLocal(input.at ?? new Date()),
      accountNumber: process.env.SEPAY_ACCOUNT_NUMBER ?? null,
      content: input.content,
      transferType: 'in',
      transferAmount: input.amount,
      referenceCode: `FT${RUN.toUpperCase()}${String(transferSeq).padStart(3, '0')}`,
    }),
  });
  if (!res.ok) throw new ApiError(res.status, await res.text(), `webhook ${id}`);
  return id;
}

// ── Người và xe ──────────────────────────────────────────────────────────────

interface Customer {
  email: string;
  name: string;
  phone: string;
}

interface OwnerCar {
  email: string;
  tenantId: string;
  vehicleIds: string[];
}

async function loadCustomer(email: string): Promise<Customer> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { displayName: true, phone: true, phoneVerifiedAt: true },
  });
  if (!user?.phone || !user.phoneVerifiedAt) {
    throw new Error(
      `Thiếu tài khoản khách ${email} (hoặc chưa xác thực SĐT) — chạy pnpm db:seed trước.`,
    );
  }
  return { email, name: user.displayName ?? email, phone: user.phone };
}

/** Xe ĐANG CÔNG KHAI, có dịch vụ tự lái, của một chủ xe tuyến hoa hồng. */
async function loadOwner(email: string): Promise<OwnerCar> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  const tenant = user
    ? await prisma.tenant.findFirst({ where: { ownerUserId: user.id }, select: { id: true } })
    : null;
  if (!tenant) throw new Error(`Thiếu chủ xe ${email} — chạy pnpm db:seed trước.`);
  const listings = await prisma.publicListing.findMany({
    where: {
      tenantId: tenant.id,
      status: 'active',
      serviceTypes: { has: SERVICE_TYPE.SELF_DRIVE },
    },
    select: { vehicleId: true },
    orderBy: { vehicleId: 'asc' },
  });
  if (listings.length === 0)
    throw new Error(`Chủ xe ${email} không có xe tự lái nào đang công khai.`);
  return { email, tenantId: tenant.id, vehicleIds: listings.map((l) => l.vehicleId) };
}

// ── Một chuyến đã trả giữ chỗ ────────────────────────────────────────────────

interface PaidTrip {
  requestId: string;
  holdId: string;
  holdCode: string;
  amount: number;
  bookingId: string;
}

/** 09:00 giờ VN của ngày `offset` tính từ hôm nay. */
function vnMorning(offsetDays: number): Date {
  const now = new Date(Date.now() + 7 * 3_600_000);
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays, 2, 0, 0),
  );
}

/** Khung 2 ngày còn TRỐNG trên lịch xe — hỏi đúng endpoint preview mà màn đặt xe dùng. */
async function freeSlot(
  vehicleId: string,
  fromOffset: number,
): Promise<{ pickupAt: Date; returnAt: Date }> {
  for (let offset = fromOffset; offset < fromOffset + 60; offset += 3) {
    const pickupAt = vnMorning(offset);
    const returnAt = vnMorning(offset + 2);
    const res = await fetch(`${API}/public/booking-requests/check-availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vehicleId,
        pickupAt: pickupAt.toISOString(),
        returnAt: returnAt.toISOString(),
      }),
    });
    const json = (await res.json()) as { data?: { available?: boolean } };
    if (res.ok && json.data?.available) return { pickupAt, returnAt };
  }
  throw new Error(`Xe ${vehicleId}: không tìm được khung trống trong 60 ngày tới.`);
}

/**
 * Khách gửi yêu cầu → chủ xe duyệt (nếu xe không "đặt ngay") → tiền giữ chỗ về qua SePay →
 * hệ thống tạo ĐƠN THUÊ. Đúng thứ tự ADR 0044, mỗi bước qua API.
 */
async function paidTrip(
  customer: Customer,
  owner: OwnerCar,
  vehicleId: string,
  fromOffset: number,
  note: string,
): Promise<PaidTrip> {
  const slot = await freeSlot(vehicleId, fromOffset);
  const guest = await as(customer.email);
  const receipt = await guest.call<{ id: string; status: string }>(
    'POST',
    '/public/booking-requests',
    {
      vehicleId,
      customerName: customer.name,
      customerPhone: customer.phone,
      serviceType: SERVICE_TYPE.SELF_DRIVE,
      pickupAt: slot.pickupAt.toISOString(),
      returnAt: slot.returnAt.toISOString(),
      note: `${MARK} ${note}`,
    },
  );

  if (receipt.status === BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL) {
    const host = await as(owner.email);
    await host.call('POST', `/booking-requests/${receipt.id}/approve`, {});
  }

  const hold = await prisma.bookingHold.findUnique({
    where: { bookingRequestId: receipt.id },
    select: { id: true, code: true, amount: true },
  });
  if (!hold) throw new Error(`Yêu cầu ${receipt.id}: duyệt xong mà không có khoản giữ chỗ.`);

  const amount = Number(hold.amount);
  await bankTransfer({
    amount,
    content: `${customer.name.toUpperCase()} chuyen tien giu cho ${hold.code}`,
    gateway: 'Techcombank',
  });

  const paid = await prisma.bookingHold.findUniqueOrThrow({
    where: { id: hold.id },
    select: { status: true, bookingId: true },
  });
  if (paid.status !== BOOKING_HOLD_STATUS.PAID || !paid.bookingId) {
    throw new Error(`Giữ chỗ ${hold.code}: tiền về nhưng chưa thành đơn (status ${paid.status}).`);
  }
  return {
    requestId: receipt.id,
    holdId: hold.id,
    holdCode: hold.code,
    amount,
    bookingId: paid.bookingId,
  };
}

// ── Tranh chấp, chốt tiền, rút tiền ──────────────────────────────────────────

/** Khách mở tranh chấp trên chính đơn của mình — khoản giữ chỗ bị TẠM GIỮ từ lúc này. */
async function openDispute(
  customer: Customer,
  trip: PaidTrip,
  subject: string,
  description: string,
) {
  const session = await as(customer.email);
  return session.call<{ id: string }>('POST', '/me/support/cases', {
    category: SUPPORT_CASE_CATEGORY.DISPUTE,
    subject,
    description,
    bookingId: trip.bookingId,
  });
}

/** Admin nhận xử lý rồi KẾT LUẬN — sau bước này mới chốt được tiền (hai bước tách rời). */
async function resolveDispute(caseId: string, resolution: string) {
  const a = await admin();
  await a.call('POST', `/platform/support/cases/${caseId}/transition`, {
    status: SUPPORT_CASE_STATUS.IN_PROGRESS,
  });
  await a.call('POST', `/platform/support/cases/${caseId}/resolve`, { resolution });
}

async function settle(trip: PaidTrip, outcome: string, note: string) {
  const a = await admin();
  await a.call('POST', `/platform/money/holds/${trip.holdId}/settle`, { outcome, note });
}

async function walletBalance(tenantId: string): Promise<number> {
  const wallet = await prisma.wallet.findUnique({
    where: { ownerTenantId: tenantId },
    select: { balance: true },
  });
  return Number(wallet?.balance ?? 0);
}

/** Phần nghìn tròn của số dư, không dưới sàn rút. */
function portion(balance: number, ratio: number): number {
  return Math.max(10_000, Math.floor((balance * ratio) / 1_000) * 1_000);
}

async function requestWithdrawal(owner: OwnerCar, amount: number) {
  const account = await prisma.bankAccount.findFirst({
    where: { ownerTenantId: owner.tenantId, status: 'active' },
    orderBy: { isDefault: 'desc' },
    select: { id: true },
  });
  if (!account) throw new Error(`Chủ xe ${owner.email} chưa có tài khoản nhận tiền.`);
  const host = await as(owner.email);
  return host.call<{ id: string; code: string }>('POST', '/shop/wallet/withdrawals', {
    amount: String(amount),
    bankAccountId: account.id,
  });
}

// ── Kịch bản ─────────────────────────────────────────────────────────────────

const CUSTOMERS = [
  'khach.an@xeprime.test',
  'khach.binh@xeprime.test',
  'khach.cuong@xeprime.test',
  'khach.dung@xeprime.test',
  'khach.duc@xeprime.test',
] as const;

const OWNERS = [
  'chuxe.phuc@xeprime.test',
  'chuxe.quyen@xeprime.test',
  'chuxe.tuan@xeprime.test',
  'chuxe.khai@xeprime.test',
  'chuxe.son@xeprime.test',
  'chuxe.long@xeprime.test',
  'chuxe.khoa@xeprime.test',
] as const;

async function main(): Promise<void> {
  assertDevOnly('demo:finance');
  assertSeedTargetIsSafe();
  const host = new URL(API).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(`DEMO_API_URL=${API} không phải máy local — script này chỉ chạy trên máy dev.`);
  }

  const existing = await prisma.bookingRequest.count({ where: { note: { startsWith: MARK } } });
  if (existing > 0 && !process.argv.includes('--again')) {
    log(
      `Đã có ${existing} yêu cầu demo của màn Tài chính — bỏ qua. Thêm \`--again\` để tạo thêm một lượt.`,
    );
    return;
  }

  log(`Dữ liệu demo màn Tài chính → ${API}\n`);
  const [an, binh, cuong, dung, duc] = await Promise.all(CUSTOMERS.map(loadCustomer));
  const [phuc, quyen, tuan, khai, son, long, khoa] = await Promise.all(OWNERS.map(loadOwner));
  // Lượt `--again` lùi khung giờ đi xa hơn để không tranh lịch với lượt trước.
  const base = 6 + existing;

  const failures: string[] = [];
  async function step(label: string, run: () => Promise<void>) {
    try {
      await run();
      log(`  ✓ ${label}`);
    } catch (error) {
      failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      log(`  ✗ ${label}`);
    }
  }

  log('Giữ chỗ chờ chốt:');
  await step('chuyến đã trả, đang chờ tới ngày nhận xe', async () => {
    await paidTrip(an!, phuc!, phuc!.vehicleIds[0]!, base, 'Đi công tác Đà Lạt 2 ngày');
  });
  await step('chuyến đang TRANH CHẤP (mới mở)', async () => {
    const trip = await paidTrip(binh!, quyen!, quyen!.vehicleIds[0]!, base + 1, 'Về quê cuối tuần');
    await openDispute(
      binh!,
      trip,
      'Xe giao không đúng mẫu đã đặt',
      'Mình đặt bản số tự động nhưng chủ xe báo chỉ còn bản số sàn. Đề nghị hoàn tiền giữ chỗ.',
    );
  });
  await step('chuyến đang TRANH CHẤP (admin đang xử lý)', async () => {
    const trip = await paidTrip(
      cuong!,
      tuan!,
      tuan!.vehicleIds[0]!,
      base + 2,
      'Đưa gia đình đi biển',
    );
    const dispute = await openDispute(
      cuong!,
      trip,
      'Chủ xe đòi thêm phụ phí ngoài thoả thuận',
      'Chủ xe nhắn yêu cầu thêm 300.000đ phí vệ sinh không có trong điều kiện thuê lúc đặt.',
    );
    const a = await admin();
    await a.call('POST', `/platform/support/cases/${dispute.id}/transition`, {
      status: SUPPORT_CASE_STATUS.IN_PROGRESS,
    });
  });

  log('\nChốt tiền sau tranh chấp + rút tiền chủ xe:');
  await step('khai: kết luận → quyết toán → yêu cầu rút CHỜ DUYỆT', async () => {
    const trip = await paidTrip(
      dung!,
      khai!,
      khai!.vehicleIds[0]!,
      base + 3,
      'Thuê xe đi Vũng Tàu',
    );
    const dispute = await openDispute(
      dung!,
      trip,
      'Khiếu nại thời gian giao xe',
      'Chủ xe báo giao trễ 2 tiếng so với lịch hẹn, mình muốn được giảm giá.',
    );
    await resolveDispute(
      dispute.id,
      'Chủ xe đã thoả thuận lại giờ giao với khách; giữ nguyên chuyến, quyết toán bình thường.',
    );
    await settle(
      trip,
      BOOKING_HOLD_OUTCOME.SETTLED,
      'Tranh chấp đã kết luận — quyết toán theo chuyến.',
    );
    await requestWithdrawal(khai!, portion(await walletBalance(khai!.tenantId), 0.8));
  });
  await step('son: kết luận → quyết toán → yêu cầu rút ĐÃ DUYỆT', async () => {
    const trip = await paidTrip(
      duc!,
      son!,
      son!.vehicleIds[0]!,
      base + 4,
      'Thuê xe đón người thân',
    );
    const dispute = await openDispute(
      duc!,
      trip,
      'Xe có vết xước trước khi nhận',
      'Mình phát hiện vết xước cửa sau, lo bị bắt đền khi trả xe.',
    );
    await resolveDispute(
      dispute.id,
      'Đã đối chiếu ảnh bàn giao: vết xước có từ trước, khách không chịu trách nhiệm.',
    );
    await settle(
      trip,
      BOOKING_HOLD_OUTCOME.SETTLED,
      'Tranh chấp đã kết luận — quyết toán theo chuyến.',
    );
    const w = await requestWithdrawal(son!, portion(await walletBalance(son!.tenantId), 0.7));
    await (await admin()).call('POST', `/platform/money/withdrawals/${w.id}/approve`);
  });
  await step('long: quyết toán → một lệnh ĐÃ CHUYỂN + một lệnh BỊ TỪ CHỐI', async () => {
    const trip = await paidTrip(
      an!,
      long!,
      long!.vehicleIds[0]!,
      base + 5,
      'Thuê xe đi Phan Thiết',
    );
    const dispute = await openDispute(
      an!,
      trip,
      'Hỏi lại điều kiện hoàn cọc',
      'Mình muốn xác nhận lại cọc thế chấp sẽ được trả trong bao lâu sau khi trả xe.',
    );
    await resolveDispute(
      dispute.id,
      'Đã giải thích điều kiện hoàn cọc; không có sai phạm, quyết toán bình thường.',
    );
    await settle(
      trip,
      BOOKING_HOLD_OUTCOME.SETTLED,
      'Tranh chấp đã kết luận — quyết toán theo chuyến.',
    );

    const a = await admin();
    const paidOut = await requestWithdrawal(
      long!,
      portion(await walletBalance(long!.tenantId), 0.5),
    );
    await a.call('POST', `/platform/money/withdrawals/${paidOut.id}/approve`);
    const version = await prisma.withdrawalRequest.findUniqueOrThrow({
      where: { id: paidOut.id },
      select: { rowVersion: true },
    });
    await a.call('POST', `/platform/money/withdrawals/${paidOut.id}/paid`, {
      bankReference: `FT${RUN.toUpperCase()}PAY`,
      rowVersion: version.rowVersion,
    });

    const rejected = await requestWithdrawal(
      long!,
      portion(await walletBalance(long!.tenantId), 0.5),
    );
    await a.call('POST', `/platform/money/withdrawals/${rejected.id}/reject`, {
      reason:
        'Tên chủ tài khoản nhận không khớp tên trên hồ sơ chủ xe — cập nhật tài khoản rồi gửi lại.',
    });
  });

  log('\nHoàn tiền cho khách:');
  await step('chủ xe huỷ chuyến → hoàn khách vào ví điểm', async () => {
    const trip = await paidTrip(binh!, khoa!, khoa!.vehicleIds[0]!, base + 6, 'Thuê xe đi Mũi Né');
    const host = await as(khoa!.email);
    await host.call('POST', `/bookings/${trip.bookingId}/transition`, {
      status: BOOKING_STATUS.CANCELLED,
      reason: 'Xe phát hiện lỗi phanh khi kiểm tra định kỳ, phải đưa đi sửa.',
      reasonCategory: CANCELLATION_REASON_CATEGORY.VEHICLE_UNAVAILABLE,
    });
  });
  await step('admin quyết định hoàn → hoàn khách vào ví điểm', async () => {
    const vehicle = phuc!.vehicleIds[1] ?? phuc!.vehicleIds[0]!;
    const trip = await paidTrip(cuong!, phuc!, vehicle, base + 9, 'Thuê xe cho chuyến đi Huế');
    await settle(
      trip,
      BOOKING_HOLD_OUTCOME.REFUNDED,
      'Khách báo trùng lịch công tác; nền tảng quyết định hoàn toàn bộ.',
    );
  });

  log('\nTiền vào chưa khớp:');
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
  await step('bốn khoản không rút được mã (có khoản đã chờ hơn 2 ngày)', async () => {
    await bankTransfer({
      amount: 2_500_000,
      content: 'NGUYEN VAN AN chuyen tien thue xe',
      at: hoursAgo(52),
    });
    await bankTransfer({
      amount: 1_200_000,
      content: 'TRAN THI BICH CK coc xe',
      at: hoursAgo(27),
      gateway: 'MBBank',
    });
    await bankTransfer({
      amount: 850_000,
      content: 'CT DEN 0939123456 thanh toan',
      at: hoursAgo(5),
      gateway: 'ACB',
    });
    await bankTransfer({
      amount: 3_300_000,
      content: 'CONG TY TNHH VAN TAI MINH PHAT thanh toan',
      at: hoursAgo(0.4),
    });
  });
  await step('một khoản mang mã giữ chỗ không tồn tại', async () => {
    await bankTransfer({
      amount: 450_000,
      content: 'LE MINH TAM giu cho XPH9ZZZ2KQ',
      at: hoursAgo(3),
      gateway: 'VPBank',
    });
  });
  await step('hai khoản đã BỎ QUA (một khoản đã trả lại người gửi)', async () => {
    const a = await admin();
    const returned = await bankTransfer({
      amount: 500_000,
      content: 'CHUYEN NHAM TAI KHOAN',
      at: hoursAgo(30),
    });
    const unrelated = await bankTransfer({
      amount: 15_000,
      content: 'PHI DICH VU NGAN HANG',
      at: hoursAgo(20),
    });
    const rows = await prisma.bankTransaction.findMany({
      where: { providerTxId: { in: [returned, unrelated] } },
      select: { id: true, providerTxId: true },
    });
    const idOf = (providerTxId: string) => rows.find((r) => r.providerTxId === providerTxId)!.id;
    await a.call('POST', `/platform/bank-transactions/${idOf(returned)}/ignore`, {
      note: 'Khách chuyển nhầm tài khoản, đã gọi xác nhận và trả lại.',
      refundReference: `FT${RUN.toUpperCase()}RET`,
    });
    await a.call('POST', `/platform/bank-transactions/${idOf(unrelated)}/ignore`, {
      note: 'Phí dịch vụ ngân hàng hoàn về — không thuộc luồng nào của nền tảng.',
    });
  });

  if (failures.length > 0) {
    log(`\n${failures.length} bước lỗi:`);
    for (const failure of failures) log(`  - ${failure}`);
    process.exitCode = 1;
  } else {
    log('\nXong. Mở /manage/admin/money để xem.');
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err: unknown) => {
    console.error('demo:finance thất bại:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
