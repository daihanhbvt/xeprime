import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  BILLING_MODE,
  BOOKING_REQUEST_STATUS,
  HOLD_REFUND_REASON,
  MEMBERSHIP_STATUS,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
  WALLET_OWNER_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { BankAccountsService } from '../src/modules/bank-accounts/bank-accounts.service';
import { CustomerTripsService } from '../src/modules/customer-trips/customer-trips.service';
import { HoldSettlementService } from '../src/modules/holds/hold-settlement.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import { ReceiptsService } from '../src/modules/finance/receipts.service';
import { SettlementService } from '../src/modules/bookings/settlement/settlement.service';
import { VehicleContractsService } from '../src/modules/vehicles/vehicle-contracts.service';
import { WalletService } from '../src/modules/wallet/wallet.service';
import type { R2Service } from '../src/modules/storage/r2.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  makeBookingHoldsService,
  makeBookingsService,
  makeCustomersService,
  makeNotificationService,
  makePricingService,
} from './helpers/service-factory';
import { releaseWalletObligations } from './helpers/wallet-cleanup';
import { giveTenantPlan } from './helpers/billing-fixture';

/**
 * SỔ TÀI KHOẢN NGÂN HÀNG ĐI THEO CHỦ VÍ — lỗi tiền, sửa 16/09/2026.
 *
 * ## Ca thật mà spec này dựng lại
 *
 * Một người đi thuê xe của người khác TRƯỚC khi họ mở gian hàng. Chuyến đó huỷ, sinh một khoản
 * hoàn đang chờ họ khai số tài khoản. Trong lúc đó họ mở gian hàng — và migration hợp nhất ví
 * (`20260915120000_wallet_owner_unification`) chuyển ví CÙNG VỚI mọi tài khoản ngân hàng đang
 * dùng của họ sang tenant.
 *
 * Bản trước của `provideRefundAccount` đóng đinh `{ type: USER, userId }`. Sau khi đổi chủ, sổ
 * scope `user` của họ RỖNG, nên:
 *
 *   · `resolveForPayout` không thấy tài khoản nào ⇒ màn khai hiện danh sách trống;
 *   · mỗi lần khai lại đẻ thêm một bản ghi `user` mới — tách đôi đúng cái sổ vừa hợp nhất;
 *   · và không bản nào trong số đó hiện ở `/manage/balance` hay ở màn rút tiền của họ.
 *
 * Khoản hoàn vẫn tới được đích (họ gõ tay số tài khoản), nên đây không phải mất tiền — nhưng nó
 * là hai sổ cho một người, đúng thứ ADR 0038 điều 2 xoá bỏ.
 *
 * ## Điều được khoá
 *
 * Chủ sở hữu sổ đi qua `resolveRefundWalletOwner` — CÙNG hàm mà ví dùng, và cùng luật chọn tenant
 * với migration (membership `active` + `shop_owner`, cũ nhất trước). Hai bên không thể chỉ vào hai
 * sổ khác nhau.
 *
 * Nửa còn lại cũng phải đúng: KHÁCH THUÊ THUẦN giữ nguyên sổ `user`. Nếu không, mọi khách của
 * sàn mất đường khai tài khoản nhận hoàn.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const notifications = makeNotificationService(asService);
const pricing = makePricingService(asService);
const receipts = new ReceiptsService(asService, audit);
const settlement = new SettlementService(asService, audit, pricing, notifications, receipts);
const bookings = makeBookingsService(asService, {
  occupancy: new OccupancyService(asService),
  audit,
  notifications,
  customers: makeCustomersService(asService, audit),
});
const fakeR2 = {
  privateEnabled: true,
  async presignPrivateDownload() {
    return { downloadUrl: 'https://r2.local/signed-get', expiresIn: 120 };
  },
};
const bankAccounts = new BankAccountsService(asService);
const trips = new CustomerTripsService(
  asService,
  settlement,
  pricing,
  bookings,
  makeBookingHoldsService(asService),
  new VehicleContractsService(asService, fakeR2 as unknown as R2Service, audit),
  new HoldSettlementService(asService, audit, notifications, new WalletService(asService)),
  bankAccounts,
  notifications,
  audit,
);

let dbAvailable = false;
/** Chủ xe: sở hữu `ownTenantId`, và cũng là KHÁCH của một chuyến ở gara khác. */
let ownerId: string;
/** Khách thuê thuần — nửa đối chứng. */
let renterId: string;
let ownTenantId: string;
let hostTenantId: string;
let vehicleId: string;
/** Chính sách phí đang hiệu lực — hold bắt buộc tham chiếu một bản có thật. */
let feePolicyId: string;

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
  renterId = newId();
  ownTenantId = newId();
  hostTenantId = newId();
  vehicleId = newId();
  feePolicyId = (
    await prisma.feePolicy.findFirstOrThrow({ orderBy: { createdAt: 'desc' }, select: { id: true } })
  ).id;

  await prisma.user.createMany({
    data: [
      { id: ownerId, displayName: 'Chủ xe Minh', email: `own-${ownerId}@xeprime.test` },
      { id: renterId, displayName: 'Khách Lan', email: `ren-${renterId}@xeprime.test` },
    ],
  });

  for (const [id, name, owner] of [
    [ownTenantId, 'Gara của Minh', ownerId],
    [hostTenantId, 'Gara cho thuê', renterId],
  ] as const) {
    await prisma.tenant.create({
      data: {
        id,
        code: `TEST-${id.slice(-8)}`,
        slug: `test-${id.toLowerCase().slice(-8)}`,
        name,
        status: TENANT_STATUS.ACTIVE,
        ownerUserId: owner,
      },
    });
    /*
     * Gian hàng test = gian hàng TUYẾN GÓI. Không phải trang trí: từ 15/09/2026 một tenant
     * không có thuê bao hiệu lực bị coi là Owner Lite và chỉ đăng được
     * `OWNER_LITE_VEHICLE_LIMIT` xe (ADR 0038). Fixture nào dựng đội xe lớn bằng
     * `prisma.tenant.create` trần đang mô tả một trạng thái sản phẩm không cho phép tồn tại —
     * `registerShop` luôn gán gói trong cùng transaction.
     */
    await giveTenantPlan(prisma, id, { billingMode: BILLING_MODE.PACKAGE });
  }

  // Minh là CHỦ gian hàng của mình — điều kiện duy nhất khiến ví (và sổ ngân hàng) thuộc tenant.
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId: ownTenantId,
      userId: ownerId,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
  });

  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      tenantId: hostTenantId,
      code: 'R1',
      name: 'Xe đi thuê',
      vehicleType: VEHICLE_TYPE.CAR,
      publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await releaseWalletObligations(prisma, {
      tenantIds: [ownTenantId, hostTenantId],
      userIds: [ownerId, renterId],
    });
    await prisma.tenant.deleteMany({ where: { id: { in: [ownTenantId, hostTenantId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, renterId] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

/**
 * Một chuyến ĐI THUÊ đã huỷ, còn một khoản hoàn `pending` chờ khai tài khoản.
 *
 * Dựng thẳng bằng Prisma chứ không đi qua luồng đặt xe: bài kiểm ở đây là "khoản hoàn nhận đích
 * từ SỔ NÀO", không phải vòng đời của một hold — thứ đã có spec riêng.
 */
async function seedPendingRefund(customerUserId: string): Promise<{ requestId: string }> {
  const requestId = newId();
  const holdId = newId();

  await prisma.bookingRequest.create({
    data: {
      id: requestId,
      tenantId: hostTenantId,
      vehicleId,
      customerUserId,
      customerName: 'Khách',
      customerPhone: `09${String(Date.now()).slice(-8)}`,
      status: BOOKING_REQUEST_STATUS.CANCELLED_BY_CUSTOMER,
      // Bắt buộc ở schema — hạn phản hồi của gian hàng; đã qua từ lâu với một chuyến đã huỷ.
      respondBy: new Date('2026-08-30T02:00:00.000Z'),
      pickupAt: new Date('2026-09-01T02:00:00.000Z'),
      returnAt: new Date('2026-09-03T02:00:00.000Z'),
    },
  });

  await prisma.bookingHold.create({
    data: {
      id: holdId,
      code: `XPH${holdId.slice(-8)}`,
      tenantId: hostTenantId,
      bookingRequestId: requestId,
      customerUserId,
      vehicleId,
      amount: new Prisma.Decimal('500000'),
      paidAmount: new Prisma.Decimal('500000'),
      depositAmount: new Prisma.Decimal('500000'),
      /*
       * Bốn cột bắt buộc còn lại là SNAPSHOT của một hold thật (ADR 0024). Ở đây chúng chỉ cần
       * hợp lệ về kiểu: bài kiểm là chọn SỔ nào, không phải phép phân bổ — thứ đã có spec riêng.
       */
      feePolicyId: feePolicyId,
      allocationJson: [],
      priceSnapshotJson: {},
      scheduleJson: {},
      freeCancelUntil: new Date('2026-08-31T02:00:00.000Z'),
      expiresAt: new Date('2026-08-31T04:00:00.000Z'),
    },
  });

  await prisma.holdRefund.create({
    data: {
      id: newId(),
      holdId,
      tenantId: hostTenantId,
      customerUserId,
      amount: new Prisma.Decimal('500000'),
      reason: HOLD_REFUND_REASON.EARLY_CANCEL,
    },
  });

  return { requestId };
}

/** Khoản hoàn của một chuyến — đích đã khai nằm ở đây. */
function refundOf(requestId: string) {
  return prisma.holdRefund.findFirstOrThrow({
    where: { hold: { bookingRequestId: requestId } },
    select: { bankCode: true, bankAccountNumber: true, bankAccountName: true },
  });
}

describe('Chủ xe khai tài khoản nhận hoàn — đọc sổ TENANT', () => {
  maybe('chọn tài khoản ĐÃ LƯU của gian hàng thì khai được', async () => {
    const saved = await bankAccounts.create(
      { type: WALLET_OWNER_TYPE.TENANT, tenantId: ownTenantId },
      { bankCode: 'VCB', accountNumber: '0011000123456', accountName: 'NGUYEN VAN MINH' },
    );
    const { requestId } = await seedPendingRefund(ownerId);

    await trips.provideRefundAccount(ownerId, requestId, { bankAccountId: saved.id });

    expect(await refundOf(requestId)).toEqual({
      bankCode: 'VCB',
      bankAccountNumber: '0011000123456',
      bankAccountName: 'NGUYEN VAN MINH',
    });
  });

  /*
   * Đây là chính lỗi cũ, nhìn từ phía ngược lại: một bản ghi scope `user` của cùng người đó KHÔNG
   * được coi là sổ của họ nữa. Nếu nó được chấp nhận thì hai sổ song song lại sống tiếp.
   */
  maybe('tài khoản scope USER của CHÍNH họ bị từ chối — sổ đó không còn là sổ của họ', async () => {
    const stray = await bankAccounts.create(
      { type: WALLET_OWNER_TYPE.USER, userId: ownerId },
      { bankCode: 'TCB', accountNumber: '19001234567', accountName: 'NGUYEN VAN MINH' },
    );
    const { requestId } = await seedPendingRefund(ownerId);

    await expect(
      trips.provideRefundAccount(ownerId, requestId, { bankAccountId: stray.id }),
    ).rejects.toThrow();
  });

  /*
   * Khai MỚI phải rơi vào sổ TENANT. Đây là nửa làm cho lần sau không phải gõ lại — và là nửa mà
   * bản cũ làm sai âm thầm: nó lưu vào sổ `user`, nơi không màn nào của họ đọc tới.
   */
  maybe('khai MỚI thì lưu vào sổ TENANT, không đẻ bản ghi USER', async () => {
    const { requestId } = await seedPendingRefund(ownerId);

    await trips.provideRefundAccount(ownerId, requestId, {
      bankCode: 'ACB',
      accountNumber: '  9704 0011 2233  ',
      accountName: 'Nguyen Van Minh',
    });

    const tenantBook = await bankAccounts.list({
      type: WALLET_OWNER_TYPE.TENANT,
      tenantId: ownTenantId,
    });
    expect(tenantBook.some((a) => a.bankCode === 'ACB')).toBe(true);

    const userBook = await bankAccounts.list({ type: WALLET_OWNER_TYPE.USER, userId: ownerId });
    expect(userBook.some((a) => a.bankCode === 'ACB')).toBe(false);

    // …và khoản hoàn vẫn nhận đúng đích, với số đã chuẩn hoá (bỏ khoảng trắng).
    expect((await refundOf(requestId)).bankAccountNumber).toBe('970400112233');
  });
});

describe('BẢO TOÀN — khách thuê thuần vẫn dùng sổ USER', () => {
  /*
   * Nửa này quan trọng ngang nửa trên: `resolveRefundWalletOwner` chỉ đổi sổ cho người SỞ HỮU một
   * tenant. Nếu nó đổi cho tất cả thì mọi khách của sàn mất đường khai tài khoản nhận hoàn — và
   * đó chính là chỗ luồng hoàn tiền từng tắc.
   */
  maybe('chọn tài khoản đã lưu scope USER thì khai được', async () => {
    const saved = await bankAccounts.create(
      { type: WALLET_OWNER_TYPE.USER, userId: renterId },
      { bankCode: 'MB', accountNumber: '0909090909', accountName: 'TRAN THI LAN' },
    );
    const { requestId } = await seedPendingRefund(renterId);

    await trips.provideRefundAccount(renterId, requestId, { bankAccountId: saved.id });

    expect((await refundOf(requestId)).bankAccountNumber).toBe('0909090909');
  });

  maybe('khai MỚI lưu vào sổ USER của họ', async () => {
    const { requestId } = await seedPendingRefund(renterId);

    await trips.provideRefundAccount(renterId, requestId, {
      bankCode: 'BIDV',
      accountNumber: '31010001234',
      accountName: 'Tran Thi Lan',
    });

    const userBook = await bankAccounts.list({ type: WALLET_OWNER_TYPE.USER, userId: renterId });
    expect(userBook.some((a) => a.bankCode === 'BIDV')).toBe(true);
  });
});
