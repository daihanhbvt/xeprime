import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  BILLING_MODE,
  BOOKING_REQUEST_STATUS,
  FEE_POLICY_STATUS,
  HOLD_REFUND_REASON,
  MEMBERSHIP_STATUS,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
  WALLET_OWNER_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { CancellationsService } from '../src/modules/cancellations/cancellations.service';
import { InsuranceReadService } from '../src/modules/insurance/insurance-read.service';
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
 * SỔ TÀI KHOẢN NHẬN HOÀN THUỘC TÀI KHOẢN KHÁCH ĐÃ ĐẶT — ADR 0053 (thay luật "đi theo chủ ví" của
 * ADR 0038 điều 2).
 *
 * ## Ca thật
 *
 * Minh có HAI tài khoản cùng số điện thoại: tài khoản đối tác ở site partner (chủ "Gara của Minh")
 * và tài khoản khách ở xeprime.vn — tài khoản khách đi thuê xe của gara khác. Chuyến đó huỷ, sinh
 * một khoản hoàn đang chờ khai số tài khoản.
 *
 * ## Điều được khoá
 *
 *   · khoản hoàn của tài khoản KHÁCH đọc và ghi SỔ USER của chính tài khoản đó;
 *   · sổ của gian hàng Minh (tài khoản khác, realm khác) KHÔNG dùng được ở đây — tiền và vận hành
 *     hai realm tách biệt;
 *   · khách thuê thuần giữ nguyên đường cũ.
 *
 * Chủ sở hữu sổ đi qua `resolveRefundWalletOwner` — CÙNG hàm mà ví dùng, nên ví và sổ ngân hàng
 * không thể chỉ vào hai nơi khác nhau.
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
  new CancellationsService(),
  new InsuranceReadService(asService),
);

let dbAvailable = false;
/** Minh — tài khoản ĐỐI TÁC, chủ `ownTenantId`. */
let partnerId: string;
/** Minh — tài khoản KHÁCH cùng số điện thoại, đi thuê ở gara khác. */
let minhCustomerId: string;
/** Khách thuê thuần — nửa đối chứng. */
let renterId: string;
/** Chủ gara cho thuê — tài khoản đối tác khác. */
let hostOwnerId: string;
let ownTenantId: string;
let hostTenantId: string;
let vehicleId: string;
/**
 * Chính sách phí RIÊNG của spec — hold bắt buộc tham chiếu một bản có thật.
 *
 * Không mượn "bản mới tạo gần nhất": đó thường là policy riêng của một spec khác đang chạy song
 * song trên cùng DB, và hold của spec này giữ FK tới nó làm `afterAll` của spec kia xoá policy
 * thất bại (`booking_holds_fee_policy_id_fkey`).
 */
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

  partnerId = newId();
  minhCustomerId = newId();
  renterId = newId();
  hostOwnerId = newId();
  ownTenantId = newId();
  hostTenantId = newId();
  vehicleId = newId();
  feePolicyId = newId();
  await prisma.feePolicy.create({
    data: {
      id: feePolicyId,
      version: 800 + Math.floor(Math.random() * 90),
      status: FEE_POLICY_STATUS.ARCHIVED, // không đụng bản `active` toàn sàn của spec khác
      name: `Policy refund ${feePolicyId.slice(-6)}`,
      serviceFeePercent: new Prisma.Decimal(10),
      holdMinAmount: new Prisma.Decimal(20_000),
      holdPaymentWindowMinutes: 120,
      freeCancelHours: 4,
    },
  });

  const minhPhone = `8497${String(Date.now()).slice(-7)}`;
  await prisma.user.createMany({
    data: [
      {
        id: partnerId,
        realm: ACCOUNT_REALM.PARTNER,
        phone: minhPhone,
        displayName: 'Chủ xe Minh',
        email: `own-${partnerId}@xeprime.test`,
      },
      {
        id: minhCustomerId,
        realm: ACCOUNT_REALM.CUSTOMER,
        phone: minhPhone,
        displayName: 'Minh đi thuê',
        email: `own-${partnerId}@xeprime.test`,
      },
      {
        realm: ACCOUNT_REALM.CUSTOMER,
        id: renterId,
        displayName: 'Khách Lan',
        email: `ren-${renterId}@xeprime.test`,
      },
      {
        id: hostOwnerId,
        realm: ACCOUNT_REALM.PARTNER,
        displayName: 'Chủ gara',
        email: `host-${hostOwnerId}@xeprime.test`,
      },
    ],
  });

  for (const [id, name, owner] of [
    [ownTenantId, 'Gara của Minh', partnerId],
    [hostTenantId, 'Gara cho thuê', hostOwnerId],
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
    await prisma.tenantMembership.create({
      data: {
        id: newId(),
        tenantId: id,
        userId: owner,
        roleKey: TENANT_ROLE.SHOP_OWNER,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
    });
    await giveTenantPlan(prisma, id, { billingMode: BILLING_MODE.PACKAGE });
  }

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
    const userIds = [partnerId, minhCustomerId, renterId, hostOwnerId];
    await releaseWalletObligations(prisma, {
      tenantIds: [ownTenantId, hostTenantId],
      userIds,
    });
    await prisma.tenant.deleteMany({ where: { id: { in: [ownTenantId, hostTenantId] } } });
    // Sau tenant: hold đi theo tenant (cascade) và là thứ duy nhất giữ FK tới policy.
    await prisma.feePolicy.deleteMany({ where: { id: feePolicyId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
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
      depositRequired: true,
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

describe('Tài khoản KHÁCH của một chủ xe khai tài khoản nhận hoàn — sổ USER của chính nó', () => {
  maybe('chọn tài khoản đã lưu ở sổ USER của tài khoản khách thì khai được', async () => {
    const saved = await bankAccounts.create(
      { type: WALLET_OWNER_TYPE.USER, userId: minhCustomerId },
      { bankCode: 'VCB', accountNumber: '0011000123456', accountName: 'NGUYEN VAN MINH' },
    );
    const { requestId } = await seedPendingRefund(minhCustomerId);

    await trips.provideRefundAccount(minhCustomerId, requestId, { bankAccountId: saved.id });

    expect(await refundOf(requestId)).toEqual({
      bankCode: 'VCB',
      bankAccountNumber: '0011000123456',
      bankAccountName: 'NGUYEN VAN MINH',
    });
  });

  /*
   * Ranh giới realm của TIỀN: sổ ngân hàng của gian hàng Minh thuộc tài khoản đối tác — một tài
   * khoản khác. Nhận nó ở đây là để tiền hoàn của khách chảy vào sổ của một realm khác.
   */
  maybe('tài khoản đã lưu của GIAN HÀNG cùng người bị từ chối', async () => {
    const shopAccount = await bankAccounts.create(
      { type: WALLET_OWNER_TYPE.TENANT, tenantId: ownTenantId },
      { bankCode: 'TCB', accountNumber: '19001234567', accountName: 'NGUYEN VAN MINH' },
    );
    const { requestId } = await seedPendingRefund(minhCustomerId);

    await expect(
      trips.provideRefundAccount(minhCustomerId, requestId, { bankAccountId: shopAccount.id }),
    ).rejects.toThrow();
  });

  maybe('khai MỚI lưu vào sổ USER của tài khoản khách, không chạm sổ gian hàng', async () => {
    const { requestId } = await seedPendingRefund(minhCustomerId);

    await trips.provideRefundAccount(minhCustomerId, requestId, {
      bankCode: 'ACB',
      accountNumber: '  9704 0011 2233  ',
      accountName: 'Nguyen Van Minh',
    });

    const userBook = await bankAccounts.list({
      type: WALLET_OWNER_TYPE.USER,
      userId: minhCustomerId,
    });
    expect(userBook.some((a) => a.bankCode === 'ACB')).toBe(true);

    const tenantBook = await bankAccounts.list({
      type: WALLET_OWNER_TYPE.TENANT,
      tenantId: ownTenantId,
    });
    expect(tenantBook.some((a) => a.bankCode === 'ACB')).toBe(false);

    // …và khoản hoàn vẫn nhận đúng đích, với số đã chuẩn hoá (bỏ khoảng trắng).
    expect((await refundOf(requestId)).bankAccountNumber).toBe('970400112233');
  });
});

describe('BẢO TOÀN — khách thuê thuần vẫn dùng sổ USER', () => {
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
