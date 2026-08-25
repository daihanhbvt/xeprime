/**
 * Dựng phần VẬN HÀNH của một gian hàng: sổ khách, đơn thuê, lịch, bàn giao, tiền và đánh giá.
 *
 * Hai luật xuyên suốt file này, cả hai đều là ràng buộc THẬT của hệ thống chứ không phải quy
 * ước của seed:
 *
 *  1. Lịch xe do `vehicle_occupancies` giữ và có exclusion constraint (ADR 0006). Mỗi chiếc xe
 *     vì thế được chia CỬA SỔ THỜI GIAN rời nhau: đơn đã xong nằm ở quá khứ (không giữ chỗ),
 *     đơn đang/sắp chạy ở [-2, +12], khoá xe ở [+19, +21], bảo dưỡng ở [+23, +26].
 *
 *  2. Tiền đi đúng đường của `PaymentsService`: mỗi lần thu sinh MỘT phiếu thu đã duyệt, và
 *     CHỈ tiền thuê mới cộng vào `paid_amount` — tiền cọc là tài sản giữ hộ, cộng vào đó sẽ
 *     làm công nợ tụt giả.
 */
import {
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  CONTRACT_STATUS,
  CUSTOMER_DOCUMENT_STATUS,
  CUSTOMER_DOCUMENT_TYPE,
  FUEL_LEVEL,
  FUEL_TYPE,
  HANDOVER_CONDITION,
  HANDOVER_STATUS,
  HANDOVER_TYPE,
  IDENTITY_VERIFY_METHOD,
  LONG_TERM_PICKUP_WINDOW_DAYS,
  ODOMETER_SOURCE,
  PAYMENT_KIND,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  PICKUP_PREFERENCE,
  RECEIPT_SOURCE,
  RECEIPT_STATUS,
  RECEIPT_TYPE,
  REFUND_METHOD,
  REVIEW_STATUS,
  ROUTE_TYPE,
  SERVICE_TYPE,
  SURCHARGE_CATEGORY,
  TENANT_CUSTOMER_NOTE_TYPE,
  TENANT_CUSTOMER_RISK_LEVEL,
  TENANT_CUSTOMER_SOURCE,
  VEHICLE_TYPE,
  longTermReturnAt,
  normalizeVnPhone,
} from '@xeprime/types';
import type { Prisma } from '../index';
import type { CustomerAccounts } from './accounts';
import { dateOnlyFromToday, daysFromToday, pick, prisma, seedId } from './context';
import type { VehicleUnit } from './shop-fleet';
import type { ShopSpec } from './shops';

/** Cọc tiền mặt theo loại xe — khớp chính sách gian hàng dựng ở `shop.ts`. */
const CAR_DEPOSIT = 5_000_000;

/** Khách vãng lai của sổ khách — tên và SĐT cố định để chạy lại seed ra đúng danh sách cũ. */
const WALK_IN_CUSTOMERS = [
  { name: 'Đỗ Thanh Sơn', phone: '0911000001' },
  { name: 'Vũ Thị Hồng', phone: '0911000002' },
  { name: 'Bùi Quang Huy', phone: '0911000003' },
  { name: 'Trịnh Mỹ Linh', phone: '0911000004' },
  { name: 'Cao Văn Lâm', phone: '0911000005' },
  { name: 'Lý Thu Hà', phone: '0911000006' },
  { name: 'Đinh Bá Tùng', phone: '0911000007' },
  { name: 'Hồ Ngọc Yến', phone: '0911000008' },
  { name: 'Mai Đức Thắng', phone: '0911000009' },
  { name: 'Phan Kim Chi', phone: '0911000010' },
] as const;

export interface ShopCustomer {
  id: string;
  name: string;
  phone: string;
  /** Tài khoản khách trên nền tảng, nếu hồ sơ này gắn với một tài khoản. */
  userId: string | null;
  blocked: boolean;
}

interface OperationsDeps {
  tenantId: string;
  ownerUserId: string;
  staffUserId: string;
  customers: CustomerAccounts;
  financeCategoryIds: ReadonlyMap<string, string>;
  /** `full` mới dựng bàn giao + ảnh hiện trạng + giấy tờ khách. */
  full: boolean;
}

// ---------------------------------------------------------------------------
// Sổ khách của gian hàng
// ---------------------------------------------------------------------------

/**
 * Sổ khách: trước hết là các TÀI KHOẢN khách trên nền tảng (để "lịch sử thuê của tôi" có dữ
 * liệu), sau đó tới khách vãng lai do gian hàng tự nhập.
 *
 * Cùng một người thuê ở hai gian hàng là HAI hồ sơ độc lập — mức rủi ro và ghi chú của gian
 * hàng này không rò sang gian hàng kia. Vì vậy `blocked` dưới đây chỉ chặn ở đúng gian hàng
 * đặt cờ, và seed dựng đúng như thế.
 */
export async function buildCustomers(
  spec: ShopSpec,
  deps: OperationsDeps,
): Promise<ShopCustomer[]> {
  if (spec.customerCount === 0) return [];

  const accountList = [...deps.customers.entries()];
  const result: ShopCustomer[] = [];

  for (let i = 0; i < spec.customerCount; i += 1) {
    const fromAccount = i < accountList.length ? accountList[i]! : null;
    const walkIn = WALK_IN_CUSTOMERS[(i - accountList.length) % WALK_IN_CUSTOMERS.length]!;

    const name = fromAccount ? fromAccount[1].name : walkIn.name;
    const phone = fromAccount ? fromAccount[1].phone : walkIn.phone;
    const userId = fromAccount ? fromAccount[1].userId : null;
    const normalizedPhone = normalizeVnPhone(phone);

    // Khách `duc` bị chặn — chỉ ở gian hàng lớn, nơi có đủ lịch sử để lý do đó có nghĩa.
    const blocked = spec.key === 'saigon' && fromAccount?.[0] === 'duc';
    const watchlist = !blocked && i === 2;
    const riskLevel = blocked
      ? TENANT_CUSTOMER_RISK_LEVEL.BLOCKED
      : watchlist
        ? TENANT_CUSTOMER_RISK_LEVEL.WATCHLIST
        : TENANT_CUSTOMER_RISK_LEVEL.NORMAL;

    const fields = {
      customerUserId: userId,
      fullName: name,
      phone,
      email: null,
      address: null,
      source: userId ? TENANT_CUSTOMER_SOURCE.MARKETPLACE : TENANT_CUSTOMER_SOURCE.MANUAL,
      riskLevel,
      // CHECK ở DB: mức rủi ro khác `normal` BẮT BUỘC có lý do. Đúng vậy — một cái cờ chặn
      // khách mà không ai biết vì sao là thứ không nên tồn tại.
      riskReason: blocked
        ? 'Trả xe trễ 2 ngày không báo, hư hỏng không bồi thường (đơn DH-0007).'
        : watchlist
          ? 'Từng huỷ đơn sát giờ nhận xe 2 lần.'
          : null,
    };

    const id = seedId(`${spec.key}:customer:${normalizedPhone}`);
    await prisma.tenantCustomer.upsert({
      where: {
        tenantId_normalizedPhone: { tenantId: deps.tenantId, normalizedPhone },
      },
      update: fields,
      create: {
        id,
        tenantId: deps.tenantId,
        normalizedPhone,
        createdBy: deps.ownerUserId,
        ...fields,
      },
    });
    const row = await prisma.tenantCustomer.findUniqueOrThrow({
      where: { tenantId_normalizedPhone: { tenantId: deps.tenantId, normalizedPhone } },
      select: { id: true },
    });

    if (fields.riskReason) {
      const noteId = seedId(`${spec.key}:customer-note:${normalizedPhone}`);
      await prisma.tenantCustomerNote.upsert({
        where: { id: noteId },
        update: {},
        create: {
          id: noteId,
          tenantId: deps.tenantId,
          tenantCustomerId: row.id,
          noteType: TENANT_CUSTOMER_NOTE_TYPE.RISK,
          body: fields.riskReason,
          createdBy: deps.ownerUserId,
        },
      });
    }

    // Giấy tờ khách: chỉ gian hàng làm đầy đủ mới có, và chỉ một phần khách đã đối chiếu —
    // "chưa đối chiếu" cũng là trạng thái phải nhìn thấy được trên màn hình.
    if (deps.full && i < 4) {
      const docId = seedId(`${spec.key}:customer-doc:${normalizedPhone}`);
      const verified = i % 2 === 0;
      await prisma.tenantCustomerDocument.upsert({
        where: { id: docId },
        update: {},
        create: {
          id: docId,
          tenantId: deps.tenantId,
          tenantCustomerId: row.id,
          documentType: CUSTOMER_DOCUMENT_TYPE.CITIZEN_ID,
          objectKey: `tenants/${deps.tenantId}/customers/${row.id}/documents/${docId}.jpg`,
          originalName: `CCCD - ${name}.jpg`,
          mimeType: 'image/jpeg',
          sizeBytes: 320_000,
          status: CUSTOMER_DOCUMENT_STATUS.READY,
          expiresAt: dateOnlyFromToday(1200),
          uploadedBy: deps.ownerUserId,
          completedAt: daysFromToday(-30, 4),
          verifiedAt: verified ? daysFromToday(-30, 5) : null,
          verifiedByUserId: verified ? deps.ownerUserId : null,
          verifyMethod: verified ? IDENTITY_VERIFY_METHOD.IN_PERSON : null,
          verifyNote: verified ? 'Đối chiếu bản gốc khi giao xe.' : null,
        },
      });
    }

    result.push({ id: row.id, name, phone, userId, blocked });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Đơn thuê
// ---------------------------------------------------------------------------

interface PlannedBooking {
  key: string;
  unit: VehicleUnit;
  status: string;
  serviceType: string;
  pickupAt: Date;
  returnAt: Date;
  longTermPackageMonths: number | null;
  customer: ShopCustomer;
}

/** Trạng thái GIỮ CHỖ trên lịch (ADR 0006) — đơn đã xong/huỷ không chiếm khoảng nào. */
const OCCUPYING: readonly string[] = [
  BOOKING_STATUS.RESERVED,
  BOOKING_STATUS.CONFIRMED,
  BOOKING_STATUS.ACTIVE,
];

/** Xe giữ hợp đồng dài hạn: chỉ số chia 7 dư 3, trong số xe có đăng dịch vụ dài hạn. */
function isLongTermHold(unit: VehicleUnit): boolean {
  return unit.serviceTypes.includes(SERVICE_TYPE.LONG_TERM) && unit.index % 7 === 3;
}

function serviceTypeFor(unit: VehicleUnit, seq: number): string {
  if (isLongTermHold(unit)) return SERVICE_TYPE.LONG_TERM;
  if (!unit.serviceTypes.includes(SERVICE_TYPE.SELF_DRIVE)) return SERVICE_TYPE.WITH_DRIVER;
  if (unit.serviceTypes.includes(SERVICE_TYPE.WITH_DRIVER) && seq % 2 === 0) {
    return SERVICE_TYPE.WITH_DRIVER;
  }
  return SERVICE_TYPE.SELF_DRIVE;
}

/**
 * Lịch đơn của cả đội xe. Cửa sổ thời gian được chia sẵn để không chiếc nào có hai khoảng
 * chồng nhau — xem ghi chú đầu file.
 */
function planBookings(units: readonly VehicleUnit[], customers: readonly ShopCustomer[]): PlannedBooking[] {
  const plans: PlannedBooking[] = [];
  const pickCustomer = (n: number): ShopCustomer => customers[n % customers.length]!;

  for (const unit of units) {
    const i = unit.index;

    if (isLongTermHold(unit)) {
      const pickupAt = daysFromToday(-20, 3);
      plans.push({
        key: `lt:${unit.code}`,
        unit,
        status: BOOKING_STATUS.ACTIVE,
        serviceType: SERVICE_TYPE.LONG_TERM,
        pickupAt,
        // Ngày trả tính bằng THÁNG LỊCH (ADR 0011) — không nhân 3 × 30 ngày.
        returnAt: longTermReturnAt(pickupAt, 3),
        longTermPackageMonths: 3,
        customer: pickCustomer(i + 1),
      });
      continue;
    }

    // Đơn đã hoàn tất trong quá khứ — nuôi lịch sử, doanh thu và đánh giá.
    plans.push({
      key: `past1:${unit.code}`,
      unit,
      status: BOOKING_STATUS.COMPLETED,
      serviceType: serviceTypeFor(unit, i),
      pickupAt: daysFromToday(-28 + (i % 8), 3),
      returnAt: daysFromToday(-25 + (i % 8), 5),
      longTermPackageMonths: null,
      customer: pickCustomer(i),
    });
    if (i % 4 === 0) {
      plans.push({
        key: `past2:${unit.code}`,
        unit,
        status: BOOKING_STATUS.COMPLETED,
        serviceType: serviceTypeFor(unit, i + 1),
        pickupAt: daysFromToday(-13 + (i % 3), 3),
        returnAt: daysFromToday(-10 + (i % 3), 5),
        longTermPackageMonths: null,
        customer: pickCustomer(i + 2),
      });
    }

    const upcoming = [
      { status: BOOKING_STATUS.ACTIVE, from: -1, to: 2 },
      { status: BOOKING_STATUS.CONFIRMED, from: 4, to: 7 },
      { status: BOOKING_STATUS.RESERVED, from: 9, to: 12 },
      { status: BOOKING_STATUS.CANCELLED, from: 5, to: 8 },
      null, // xe rảnh — phải có xe không vướng đơn nào để thử đặt mới
    ][i % 5];
    if (upcoming) {
      plans.push({
        key: `next:${unit.code}`,
        unit,
        status: upcoming.status,
        serviceType: serviceTypeFor(unit, i + 3),
        pickupAt: daysFromToday(upcoming.from, 3),
        returnAt: daysFromToday(upcoming.to, 5),
        longTermPackageMonths: null,
        customer: pickCustomer(i + 3),
      });
    }
  }

  return plans;
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000));
}

interface BookingMoney {
  baseAmount: number;
  deliveryFee: number;
  discountAmount: number;
  totalAmount: number;
  depositAmount: number;
}

function computeMoney(plan: PlannedBooking): BookingMoney {
  const { unit } = plan;
  const days = daysBetween(plan.pickupAt, plan.returnAt);

  let baseAmount: number;
  if (plan.serviceType === SERVICE_TYPE.LONG_TERM) {
    // Gói dài hạn tính theo GÓI: giá tháng × số tháng lịch (ADR 0011), không theo số ngày.
    const monthly = Math.round(unit.weekday * 30 * 0.7);
    baseAmount = monthly * (plan.longTermPackageMonths ?? 1);
  } else if (plan.serviceType === SERVICE_TYPE.WITH_DRIVER) {
    baseAmount = Math.round((unit.weekday + 600_000) / 50_000) * 50_000 * days;
  } else {
    baseAmount = unit.weekday * days;
  }

  const deliveryFee = unit.index % 4 === 0 ? 50_000 : 0;
  const discountAmount = unit.index % 5 === 0 ? Math.round((baseAmount * 10) / 100) : 0;
  const depositAmount = unit.spec.vehicleType === VEHICLE_TYPE.MOTORBIKE ? 0 : CAR_DEPOSIT;

  return {
    baseAmount,
    deliveryFee,
    discountAmount,
    totalAmount: baseAmount + deliveryFee - discountAmount,
    depositAmount,
  };
}

const vnd = (n: number): string => String(n);

/** Snapshot giá dạng `manual` — đúng hình thù đơn do gian hàng tự lập (policy = null). */
function priceSnapshot(plan: PlannedBooking, money: BookingMoney): Prisma.InputJsonObject {
  const days = daysBetween(plan.pickupAt, plan.returnAt);
  const rows: Prisma.InputJsonValue[] = [
    {
      key: 'base',
      label: 'Tiền thuê',
      sublabel:
        plan.serviceType === SERVICE_TYPE.LONG_TERM
          ? `Gói ${plan.longTermPackageMonths} tháng`
          : `${days} ngày × ${plan.unit.weekday.toLocaleString('vi-VN')}đ/ngày`,
      amount: vnd(money.baseAmount),
    },
  ];
  if (money.discountAmount > 0) {
    rows.push({ key: 'discount', label: 'Giảm giá', amount: vnd(-money.discountAmount) });
  }
  if (money.deliveryFee > 0) {
    rows.push({ key: 'delivery', label: 'Phí giao nhận', amount: vnd(money.deliveryFee) });
  }
  return {
    calculatedAt: plan.pickupAt.toISOString(),
    source: 'manual',
    currency: 'VND',
    ...(plan.serviceType === SERVICE_TYPE.LONG_TERM ? {} : { days }),
    rows,
    totalAmount: vnd(money.totalAmount),
    depositAmount: vnd(money.depositAmount),
    policy: null,
  };
}

export interface BookingResult {
  id: string;
  code: string;
  plan: PlannedBooking;
  money: BookingMoney;
}

export async function buildBookings(
  spec: ShopSpec,
  deps: OperationsDeps,
  units: readonly VehicleUnit[],
  customers: readonly ShopCustomer[],
  driverIds: readonly string[],
): Promise<BookingResult[]> {
  if (customers.length === 0) return [];

  const plans = planBookings(units, customers);
  const results: BookingResult[] = [];

  /*
   * Gỡ tài xế khỏi MỌI đơn của gian hàng trước khi gán lại.
   *
   * Không phải dọn dẹp cho gọn — đây là điều kiện để seed chạy lại được vào một NGÀY KHÁC.
   * Mốc thời gian của đơn neo vào ngày chạy seed, còn vòng lặp dưới đây upsert từng đơn một.
   * Giữa chừng vòng lặp, đơn vừa nhận ngày MỚI phải sống chung với đơn chưa tới lượt còn giữ
   * ngày CŨ; hai đơn của cùng một tài xế chồng giờ nhau ở đúng khoảnh khắc đó là đủ để
   * `bookings_driver_schedule_excl` bắn, dù trạng thái cuối cùng hoàn toàn hợp lệ.
   *
   * Gỡ trước rồi gán lại nghĩa là vòng lặp luôn viết lên một lịch tài xế TRỐNG. Cùng lý do
   * `vehicle_occupancies` bị xoá-dựng-lại ở `shop.ts` — khác ở chỗ đơn thì KHÔNG xoá: lịch sử
   * thuê là dữ liệu demo có giá trị, chỉ mỗi mối nối tài xế là thứ dựng lại được.
   */
  await prisma.booking.updateMany({
    where: { tenantId: deps.tenantId, driverId: { not: null } },
    data: { driverId: null },
  });

  for (const [n, plan] of plans.entries()) {
    const code = `DH-${String(n + 1).padStart(4, '0')}`;
    const bookingId = seedId(`${spec.key}:booking:${code}`);
    const money = computeMoney(plan);
    const withDriver = plan.serviceType === SERVICE_TYPE.WITH_DRIVER;
    // Tài xế chỉ gán cho đơn CÓ TÀI XẾ. Exclusion constraint `bookings_driver_schedule_excl`
    // cấm một tài xế nhận hai đơn chồng giờ, nên đơn còn giữ chỗ mới gán — đơn đã xong/huỷ
    // để trống, khỏi đụng ràng buộc vì lịch sử.
    const driverId =
      withDriver && driverIds.length > 0 && OCCUPYING.includes(plan.status)
        ? driverIds[plan.unit.index % driverIds.length]!
        : null;

    const fields = {
      vehicleId: plan.unit.id,
      customerName: plan.customer.name,
      customerPhone: plan.customer.phone,
      tenantCustomerId: plan.customer.id,
      status: plan.status,
      serviceType: plan.serviceType,
      routeType: withDriver ? pick([ROUTE_TYPE.IN_CITY, ROUTE_TYPE.INTER_CITY, ROUTE_TYPE.INTER_CITY_ONE_WAY], plan.unit.index) : null,
      pickupAddress: withDriver ? `${spec.profile.address} (đón tại sảnh)` : null,
      destination: withDriver ? pick(['Vũng Tàu', 'Đà Lạt', 'Phan Thiết', 'Nội thành'], plan.unit.index) : null,
      longTermPackageMonths: plan.longTermPackageMonths,
      pickupAt: plan.pickupAt,
      returnAt: plan.returnAt,
      actualPickupAt: plan.status === BOOKING_STATUS.COMPLETED ? plan.pickupAt : null,
      actualReturnAt: plan.status === BOOKING_STATUS.COMPLETED ? plan.returnAt : null,
      baseAmount: money.baseAmount,
      deliveryFee: money.deliveryFee,
      discountAmount: money.discountAmount,
      totalAmount: money.totalAmount,
      depositAmount: money.depositAmount,
      priceSnapshot: priceSnapshot(plan, money),
      driverId,
      note: null,
    };

    await prisma.booking.upsert({
      where: { tenantId_code: { tenantId: deps.tenantId, code } },
      // `paidAmount` KHÔNG nằm ở đây: nó là hệ quả của các lần thu, và `buildMoney` bên dưới
      // là nơi duy nhất cộng nó — đúng như `PaymentsService` trong app.
      update: fields,
      create: {
        id: bookingId,
        tenantId: deps.tenantId,
        code,
        createdBy: deps.staffUserId,
        paidAmount: 0,
        ...fields,
      },
    });

    if (OCCUPYING.includes(plan.status)) {
      await prisma.vehicleOccupancy.create({
        data: {
          id: seedId(`${spec.key}:occ:booking:${code}`),
          tenantId: deps.tenantId,
          vehicleId: plan.unit.id,
          sourceType: 'booking',
          sourceId: bookingId,
          startAt: plan.pickupAt,
          endAt: plan.returnAt,
        },
      });
    }

    results.push({ id: bookingId, code, plan, money });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Hợp đồng
// ---------------------------------------------------------------------------

export async function buildContracts(
  spec: ShopSpec,
  deps: OperationsDeps,
  bookings: readonly BookingResult[],
): Promise<number> {
  let count = 0;
  for (const b of bookings) {
    if (b.plan.status !== BOOKING_STATUS.COMPLETED && b.plan.status !== BOOKING_STATUS.ACTIVE) {
      continue;
    }
    const contractNo = `HD-${b.code.replace('DH-', '')}`;
    await prisma.contract.upsert({
      where: { bookingId: b.id },
      update: {},
      create: {
        id: seedId(`${spec.key}:contract:${b.code}`),
        tenantId: deps.tenantId,
        bookingId: b.id,
        contractNo,
        status: CONTRACT_STATUS.SIGNED,
        signedAt: b.plan.pickupAt,
        createdBy: deps.staffUserId,
        // Bản ĐÔNG CỨNG khách/xe/thời gian lúc lập — đơn sửa sau không đổi hợp đồng đã in.
        snapshotJson: {
          customer: { name: b.plan.customer.name, phone: b.plan.customer.phone },
          vehicle: {
            code: b.plan.unit.code,
            name: `${b.plan.unit.spec.model} ${b.plan.unit.year}`,
            plateNumber: b.plan.unit.plate,
          },
          period: { pickupAt: b.plan.pickupAt.toISOString(), returnAt: b.plan.returnAt.toISOString() },
          amounts: {
            totalAmount: vnd(b.money.totalAmount),
            depositAmount: vnd(b.money.depositAmount),
          },
        },
      },
    });
    count += 1;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Bàn giao xe + lịch sử KM
// ---------------------------------------------------------------------------

/**
 * Biên bản giao và nhận xe cho các đơn đã chạy.
 *
 * Đây là nơi DUY NHẤT số KM đọc từ đồng hồ đi vào hệ thống, nên mỗi biên bản XÁC NHẬN có KM
 * đều kèm một bản ghi `vehicle_odometer_readings` thật và trỏ tới nó — không có biên bản nào
 * mang số KM mồ côi.
 *
 * Một đơn cố ý để trạng thái "thiếu KM trả": biên bản vẫn xác nhận được để giữ bằng chứng ảnh
 * và tình trạng xe, nhưng KM có thẩm quyền không bị đụng tới. Đó là một task vận hành thật và
 * nó cần có mặt trong dữ liệu demo.
 */
export async function buildHandovers(
  spec: ShopSpec,
  deps: OperationsDeps,
  bookings: readonly BookingResult[],
): Promise<number> {
  if (!deps.full) return 0;

  let count = 0;
  for (const b of bookings) {
    const isCompleted = b.plan.status === BOOKING_STATUS.COMPLETED;
    const isActive = b.plan.status === BOOKING_STATUS.ACTIVE;
    if (!isCompleted && !isActive) continue;

    const unit = b.plan.unit;
    const isElectric = unit.spec.fuelType === FUEL_TYPE.ELECTRIC;
    const startKm = 18_000 + unit.index * 2_450;
    const tripKm = 120 + (unit.index % 7) * 45;

    // ── Giao xe ────────────────────────────────────────────────────────────
    const pickupReadingId = seedId(`${spec.key}:odo:${b.code}:pickup`);
    await prisma.vehicleOdometerReading.upsert({
      where: { id: pickupReadingId },
      update: {},
      create: {
        id: pickupReadingId,
        tenantId: deps.tenantId,
        vehicleId: unit.id,
        odometerKm: startKm,
        previousKm: null,
        source: ODOMETER_SOURCE.BOOKING_PICKUP,
        sourceRefId: b.id,
        recordedAt: b.plan.pickupAt,
        recordedBy: deps.staffUserId,
      },
    });
    await prisma.vehicleHandover.upsert({
      where: { id: seedId(`${spec.key}:handover:${b.code}:pickup`) },
      update: {},
      create: {
        id: seedId(`${spec.key}:handover:${b.code}:pickup`),
        tenantId: deps.tenantId,
        bookingId: b.id,
        vehicleId: unit.id,
        type: HANDOVER_TYPE.PICKUP,
        status: HANDOVER_STATUS.CONFIRMED,
        odometerKm: startKm,
        odometerReadingId: pickupReadingId,
        odometerMissing: false,
        fuelLevel: isElectric ? null : FUEL_LEVEL.FULL,
        batteryPercent: isElectric ? 100 : null,
        condition: HANDOVER_CONDITION.NORMAL,
        conditionNote: 'Xe sạch, đủ đồ nghề, không vết xước mới.',
        confirmedAt: b.plan.pickupAt,
        confirmedBy: deps.staffUserId,
        occurredAt: b.plan.pickupAt,
        createdBy: deps.staffUserId,
      },
    });
    count += 1;

    if (!isCompleted) continue;

    // ── Nhận xe trả ────────────────────────────────────────────────────────
    // Cứ 9 đơn có 1 đơn thiếu KM trả. `odometer_missing` và `odometer_km` phải NHẤT QUÁN —
    // CHECK `vh_missing_km_consistent` ở DB từ chối biên bản xác nhận mà hai thứ đó lệch nhau.
    const missingKm = unit.index % 9 === 4;
    const returnKm = startKm + tripKm;
    const returnReadingId = seedId(`${spec.key}:odo:${b.code}:return`);
    if (!missingKm) {
      await prisma.vehicleOdometerReading.upsert({
        where: { id: returnReadingId },
        update: {},
        create: {
          id: returnReadingId,
          tenantId: deps.tenantId,
          vehicleId: unit.id,
          odometerKm: returnKm,
          previousKm: startKm,
          source: ODOMETER_SOURCE.BOOKING_RETURN,
          sourceRefId: b.id,
          recordedAt: b.plan.returnAt,
          recordedBy: deps.staffUserId,
        },
      });
    }
    const attention = unit.index % 6 === 1;
    await prisma.vehicleHandover.upsert({
      where: { id: seedId(`${spec.key}:handover:${b.code}:return`) },
      update: {},
      create: {
        id: seedId(`${spec.key}:handover:${b.code}:return`),
        tenantId: deps.tenantId,
        bookingId: b.id,
        vehicleId: unit.id,
        type: HANDOVER_TYPE.RETURN,
        status: HANDOVER_STATUS.CONFIRMED,
        odometerKm: missingKm ? null : returnKm,
        odometerReadingId: missingKm ? null : returnReadingId,
        odometerMissing: missingKm,
        fuelLevel: isElectric ? null : FUEL_LEVEL.THREE_QUARTER,
        batteryPercent: isElectric ? 62 : null,
        condition: attention ? HANDOVER_CONDITION.ATTENTION : HANDOVER_CONDITION.NORMAL,
        conditionNote: attention ? 'Có vết xước nhẹ cản sau, đã chụp ảnh.' : 'Xe về đủ đồ, không sự cố.',
        damageNote: attention ? 'Xước cản sau khoảng 8cm.' : null,
        notes: missingKm ? 'Nhân viên quên ghi số KM lúc nhận xe — chờ bổ sung.' : null,
        confirmedAt: b.plan.returnAt,
        confirmedBy: deps.staffUserId,
        occurredAt: b.plan.returnAt,
        createdBy: deps.staffUserId,
      },
    });
    count += 1;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Tiền: thu tiền thuê, thu cọc, phát sinh, hoàn cọc, phiếu tay
// ---------------------------------------------------------------------------

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Số phiếu theo đúng khuôn `genReceiptNo` của app: PT/PC + ngày VN + 8 ký tự cuối của id. */
function receiptNo(type: string, occurredAt: Date, id: string): string {
  const prefix = type === RECEIPT_TYPE.INCOME ? 'PT' : 'PC';
  const vn = new Date(occurredAt.getTime() + VN_OFFSET_MS);
  const ymd =
    `${vn.getUTCFullYear()}` +
    `${String(vn.getUTCMonth() + 1).padStart(2, '0')}` +
    `${String(vn.getUTCDate()).padStart(2, '0')}`;
  return `${prefix}-${ymd}-${id.slice(-8).toUpperCase()}`;
}

interface ReceiptInput {
  key: string;
  type: string;
  categoryName: string;
  amount: number;
  paymentMethod: string;
  source: string;
  sourceRefId: string | null;
  occurredAt: Date;
  description: string;
  bookingId?: string | null;
  vehicleId?: string | null;
  tenantCustomerId?: string | null;
}

async function upsertReceipt(
  spec: ShopSpec,
  deps: OperationsDeps,
  input: ReceiptInput,
): Promise<string> {
  const id = seedId(`${spec.key}:receipt:${input.key}`);
  const fields = {
    receiptNo: receiptNo(input.type, input.occurredAt, id),
    type: input.type,
    categoryId: deps.financeCategoryIds.get(input.categoryName) ?? null,
    bookingId: input.bookingId ?? null,
    vehicleId: input.vehicleId ?? null,
    tenantCustomerId: input.tenantCustomerId ?? null,
    amount: input.amount,
    paymentMethod: input.paymentMethod,
    description: input.description,
    source: input.source,
    sourceRefId: input.sourceRefId,
    occurredAt: input.occurredAt,
    status: RECEIPT_STATUS.APPROVED,
    requestedBy: deps.staffUserId,
    approvedBy: deps.ownerUserId,
    approvedAt: input.occurredAt,
  };
  await prisma.receipt.upsert({
    where: { id },
    update: fields,
    create: { id, tenantId: deps.tenantId, ...fields },
  });
  return id;
}

export interface MoneySummary {
  payments: number;
  receipts: number;
  surcharges: number;
  settlements: number;
}

export async function buildMoney(
  spec: ShopSpec,
  deps: OperationsDeps,
  bookings: readonly BookingResult[],
): Promise<MoneySummary> {
  const summary: MoneySummary = { payments: 0, receipts: 0, surcharges: 0, settlements: 0 };

  for (const b of bookings) {
    const { status } = b.plan;
    if (status === BOOKING_STATUS.RESERVED || status === BOOKING_STATUS.CANCELLED) continue;

    const method = pick(
      [PAYMENT_METHOD.BANK_TRANSFER, PAYMENT_METHOD.CASH, PAYMENT_METHOD.QR],
      b.plan.unit.index,
    );

    // ── Thu cọc ────────────────────────────────────────────────────────────
    if (b.money.depositAmount > 0) {
      const paymentId = seedId(`${spec.key}:payment:${b.code}:deposit`);
      const receiptId = await upsertReceipt(spec, deps, {
        key: `${b.code}:deposit`,
        type: RECEIPT_TYPE.INCOME,
        categoryName: 'Tiền cọc',
        amount: b.money.depositAmount,
        paymentMethod: method,
        source: RECEIPT_SOURCE.DEPOSIT,
        sourceRefId: paymentId,
        occurredAt: b.plan.pickupAt,
        description: `Thu cọc đơn ${b.code}`,
        bookingId: b.id,
        vehicleId: b.plan.unit.id,
        tenantCustomerId: b.plan.customer.id,
      });
      await prisma.payment.upsert({
        where: { id: paymentId },
        update: {},
        create: {
          id: paymentId,
          tenantId: deps.tenantId,
          bookingId: b.id,
          receiptId,
          payerUserId: b.plan.customer.userId,
          amount: b.money.depositAmount,
          kind: PAYMENT_KIND.DEPOSIT,
          method,
          status: PAYMENT_STATUS.SUCCEEDED,
          paidAt: b.plan.pickupAt,
        },
      });
      summary.payments += 1;
      summary.receipts += 1;
    }

    // ── Thu tiền thuê ──────────────────────────────────────────────────────
    // Đơn đang chạy chỉ thu một nửa: công nợ phải là số thật để màn /manage/debts có việc.
    const rentalPaid =
      status === BOOKING_STATUS.COMPLETED
        ? b.money.totalAmount
        : status === BOOKING_STATUS.ACTIVE
          ? Math.round(b.money.totalAmount / 2 / 1000) * 1000
          : 0;

    if (rentalPaid > 0) {
      const paymentId = seedId(`${spec.key}:payment:${b.code}:rental`);
      const paidAt = status === BOOKING_STATUS.COMPLETED ? b.plan.returnAt : b.plan.pickupAt;
      const receiptId = await upsertReceipt(spec, deps, {
        key: `${b.code}:rental`,
        type: RECEIPT_TYPE.INCOME,
        categoryName: 'Thanh toán đơn',
        amount: rentalPaid,
        paymentMethod: method,
        source: RECEIPT_SOURCE.PAYMENT,
        sourceRefId: paymentId,
        occurredAt: paidAt,
        description: `Thu tiền đơn ${b.code}`,
        bookingId: b.id,
        vehicleId: b.plan.unit.id,
        tenantCustomerId: b.plan.customer.id,
      });
      await prisma.payment.upsert({
        where: { id: paymentId },
        update: {},
        create: {
          id: paymentId,
          tenantId: deps.tenantId,
          bookingId: b.id,
          receiptId,
          payerUserId: b.plan.customer.userId,
          amount: rentalPaid,
          kind: PAYMENT_KIND.RENTAL,
          method,
          status: PAYMENT_STATUS.SUCCEEDED,
          paidAt,
        },
      });
      summary.payments += 1;
      summary.receipts += 1;
    }

    // `paid_amount` ghi bằng giá trị CHỐT thay vì `increment`: seed chạy lại nhiều lần, cộng
    // dồn sẽ thổi số lên mỗi lần chạy. Giá trị chốt luôn bằng tổng các lần thu tiền THUÊ ở trên.
    await prisma.booking.update({ where: { id: b.id }, data: { paidAmount: rentalPaid } });

    if (status !== BOOKING_STATUS.COMPLETED) continue;

    // ── Phát sinh cuối chuyến ──────────────────────────────────────────────
    const hasSurcharge = b.plan.unit.index % 6 === 1;
    let surchargeTotal = 0;
    if (hasSurcharge) {
      const amount = 300_000;
      const surchargeId = seedId(`${spec.key}:surcharge:${b.code}`);
      await prisma.bookingSurcharge.upsert({
        where: { id: surchargeId },
        update: {},
        create: {
          id: surchargeId,
          tenantId: deps.tenantId,
          bookingId: b.id,
          category: SURCHARGE_CATEGORY.DAMAGE,
          amount,
          reason: 'Xước cản sau, trừ vào tiền cọc theo thoả thuận.',
          createdBy: deps.staffUserId,
        },
      });
      surchargeTotal = amount;
      summary.surcharges += 1;
    }

    // ── Hoàn cọc ───────────────────────────────────────────────────────────
    if (b.money.depositAmount > 0) {
      const refundAmount = b.money.depositAmount - surchargeTotal;
      const settlementId = seedId(`${spec.key}:settlement:${b.code}`);
      const refundedAt = daysFromToday(
        Math.round((b.plan.returnAt.getTime() - daysFromToday(0).getTime()) / 86_400_000) + 1,
        6,
      );
      await prisma.bookingDepositSettlement.upsert({
        where: { bookingId: b.id },
        update: {},
        create: {
          id: settlementId,
          tenantId: deps.tenantId,
          bookingId: b.id,
          depositReceived: b.money.depositAmount,
          surchargeTotal,
          refundAmount,
          refundMethod: REFUND_METHOD.BANK_TRANSFER,
          refundedAt,
          reference: `HOANCOC-${b.code}`,
          note: surchargeTotal > 0 ? 'Đã trừ phát sinh va quẹt.' : null,
          recordedBy: deps.ownerUserId,
        },
      });
      if (refundAmount > 0) {
        await upsertReceipt(spec, deps, {
          key: `${b.code}:refund`,
          type: RECEIPT_TYPE.EXPENSE,
          categoryName: 'Hoàn cọc',
          amount: refundAmount,
          paymentMethod: PAYMENT_METHOD.BANK_TRANSFER,
          source: RECEIPT_SOURCE.DEPOSIT_REFUND,
          sourceRefId: settlementId,
          occurredAt: refundedAt,
          description: `Hoàn cọc đơn ${b.code}`,
          bookingId: b.id,
          vehicleId: b.plan.unit.id,
          tenantCustomerId: b.plan.customer.id,
        });
        summary.receipts += 1;
      }
      summary.settlements += 1;
    }
  }

  // ── Phiếu chi cho bảo dưỡng đã hoàn tất ──────────────────────────────────
  const maintenanceRecords = await prisma.vehicleMaintenanceRecord.findMany({
    where: { tenantId: deps.tenantId, completedAt: { not: null }, cost: { not: null } },
    select: { id: true, vehicleId: true, cost: true, completedAt: true },
  });
  for (const record of maintenanceRecords) {
    await upsertReceipt(spec, deps, {
      key: `maintenance:${record.id}`,
      type: RECEIPT_TYPE.EXPENSE,
      categoryName: 'Bảo dưỡng/Thay nhớt',
      amount: Number(record.cost),
      paymentMethod: PAYMENT_METHOD.CASH,
      source: RECEIPT_SOURCE.MAINTENANCE,
      sourceRefId: record.id,
      occurredAt: record.completedAt!,
      description: 'Chi phí bảo dưỡng định kỳ',
      vehicleId: record.vehicleId,
    });
    summary.receipts += 1;
  }

  // ── Vài phiếu NHẬP TAY ───────────────────────────────────────────────────
  // Sổ thu chi thật không chỉ có phiếu tự động: rửa xe, đổ xăng, tiền quảng cáo đều gõ tay.
  const manual: ReadonlyArray<{ type: string; category: string; amount: number; desc: string; day: number }> = [
    { type: RECEIPT_TYPE.EXPENSE, category: 'Rửa xe', amount: 450_000, desc: 'Rửa xe cả đội cuối tuần', day: -7 },
    { type: RECEIPT_TYPE.EXPENSE, category: 'Đổ xăng', amount: 2_800_000, desc: 'Đổ xăng đội xe', day: -5 },
    { type: RECEIPT_TYPE.EXPENSE, category: 'Chi phí marketing', amount: 3_000_000, desc: 'Quảng cáo Facebook tháng này', day: -14 },
    { type: RECEIPT_TYPE.EXPENSE, category: 'Chi phí văn phòng', amount: 1_200_000, desc: 'Văn phòng phẩm và nước uống', day: -20 },
    { type: RECEIPT_TYPE.INCOME, category: 'Phí quá giờ', amount: 350_000, desc: 'Khách trả xe trễ 3 giờ', day: -9 },
    { type: RECEIPT_TYPE.INCOME, category: 'Thu khác', amount: 500_000, desc: 'Bán lại lốp cũ', day: -16 },
  ];
  for (const [i, m] of manual.entries()) {
    await upsertReceipt(spec, deps, {
      key: `manual:${i}`,
      type: m.type,
      categoryName: m.category,
      amount: m.amount,
      paymentMethod: PAYMENT_METHOD.CASH,
      source: RECEIPT_SOURCE.MANUAL,
      sourceRefId: null,
      occurredAt: daysFromToday(m.day, 8),
      description: m.desc,
    });
    summary.receipts += 1;
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Đánh giá
// ---------------------------------------------------------------------------

const REVIEW_COMMENTS = [
  'Xe sạch, giao đúng giờ, chủ xe nhiệt tình. Sẽ thuê lại.',
  'Thủ tục nhanh, xe mới, chạy êm. Giá hợp lý so với mặt bằng chung.',
  'Nhìn chung ổn, chỉ là xe hơi bụi lúc nhận. Chủ xe hỗ trợ tốt.',
  'Đi Đà Lạt 3 ngày rất thoải mái, xe khoẻ, máy lạnh mát.',
  'Giao xe tận nơi đúng hẹn, xăng đầy bình. Rất hài lòng.',
  'Xe ổn nhưng nhận hơi trễ 30 phút so với hẹn.',
] as const;

export async function buildReviews(
  spec: ShopSpec,
  deps: OperationsDeps,
  bookings: readonly BookingResult[],
): Promise<number> {
  let count = 0;
  for (const b of bookings) {
    // Chỉ đơn ĐÃ HOÀN TẤT mới đánh giá được, và người đánh giá phải là một TÀI KHOẢN thật —
    // khách vãng lai không có chỗ đăng nhập để viết đánh giá.
    if (b.plan.status !== BOOKING_STATUS.COMPLETED) continue;
    if (!b.plan.customer.userId) continue;
    if (b.plan.unit.index % 3 === 2) continue; // không phải chuyến nào khách cũng đánh giá

    const rating = 5 - (b.plan.unit.index % 3 === 1 ? 1 : 0);
    await prisma.review.upsert({
      where: { bookingId: b.id },
      update: { rating, status: REVIEW_STATUS.PUBLISHED },
      create: {
        id: seedId(`${spec.key}:review:${b.code}`),
        tenantId: deps.tenantId,
        vehicleId: b.plan.unit.id,
        bookingId: b.id,
        customerId: b.plan.customer.userId,
        rating,
        comment: pick(REVIEW_COMMENTS, b.plan.unit.index),
        status: REVIEW_STATUS.PUBLISHED,
      },
    });
    count += 1;
  }

  // Rating gian hàng — cùng công thức `ReviewService.recomputeTenantRating`.
  const agg = await prisma.review.aggregate({
    where: { tenantId: deps.tenantId, status: REVIEW_STATUS.PUBLISHED, deletedAt: null },
    _avg: { rating: true },
    _count: { _all: true },
  });
  await prisma.tenant.update({
    where: { id: deps.tenantId },
    data: {
      ratingAvg: Math.round((agg._avg.rating ?? 0) * 100) / 100,
      ratingCount: agg._count._all,
    },
  });

  return count;
}

// ---------------------------------------------------------------------------
// Yêu cầu đặt xe từ marketplace
// ---------------------------------------------------------------------------

/**
 * Bốn ca của luồng yêu cầu: chờ duyệt, dài hạn theo gói, bị từ chối, và đã chuyển thành đơn.
 *
 * Yêu cầu chờ duyệt KHÔNG giữ chỗ trên lịch — nhiều khách được phép cùng hỏi một xe cùng khung
 * giờ. Chỉ khi gian hàng duyệt mới sinh `Booking` và mới giữ chỗ.
 */
export async function buildBookingRequests(
  spec: ShopSpec,
  deps: OperationsDeps,
  units: readonly VehicleUnit[],
  customers: readonly ShopCustomer[],
  bookings: readonly BookingResult[],
): Promise<number> {
  const publicUnits = units.filter((u) => u.approved);
  if (publicUnits.length === 0 || customers.length === 0) return 0;

  const selfDrive = publicUnits.find((u) => u.serviceTypes.includes(SERVICE_TYPE.SELF_DRIVE));
  const longTerm = publicUnits.find((u) => u.serviceTypes.includes(SERVICE_TYPE.LONG_TERM));
  let count = 0;

  if (selfDrive) {
    const customer = customers[0]!;
    const id = seedId(`${spec.key}:request:pending`);
    await prisma.bookingRequest.upsert({
      where: { id },
      update: {},
      create: {
        id,
        tenantId: deps.tenantId,
        vehicleId: selfDrive.id,
        status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerUserId: customer.userId,
        tenantCustomerId: customer.id,
        serviceType: SERVICE_TYPE.SELF_DRIVE,
        pickupAt: daysFromToday(15, 3),
        returnAt: daysFromToday(17, 5),
        deliveryRequested: true,
        deliveryAddress: '25 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh',
        note: 'Cho mình xin xe màu sáng nếu còn nhé.',
      },
    });
    count += 1;

    const rejectedId = seedId(`${spec.key}:request:rejected`);
    const other = customers[1] ?? customer;
    await prisma.bookingRequest.upsert({
      where: { id: rejectedId },
      update: {},
      create: {
        id: rejectedId,
        tenantId: deps.tenantId,
        vehicleId: selfDrive.id,
        status: BOOKING_REQUEST_STATUS.REJECTED_BY_HOST,
        customerName: other.name,
        customerPhone: other.phone,
        customerUserId: other.userId,
        tenantCustomerId: other.id,
        serviceType: SERVICE_TYPE.SELF_DRIVE,
        pickupAt: daysFromToday(-6, 3),
        returnAt: daysFromToday(-4, 5),
        rejectReason: 'Xe đã có khách đặt trước trong khoảng thời gian này.',
        decidedBy: deps.ownerUserId,
        decidedAt: daysFromToday(-8, 4),
      },
    });
    count += 1;
  }

  if (longTerm) {
    const customer = customers[1] ?? customers[0]!;
    const id = seedId(`${spec.key}:request:long-term`);
    // Dài hạn theo GÓI: khách chỉ nêu NGUYỆN VỌNG ngày nhận, chưa có lịch chính xác — nên
    // `pickupAt`/`returnAt` để NULL và gian hàng chốt giờ khi duyệt (ADR 0011).
    // Khoảng nhận linh hoạt do SERVER tính: từ ngày mai tới hết ngày thứ 7.
    await prisma.bookingRequest.upsert({
      where: { id },
      update: {},
      create: {
        id,
        tenantId: deps.tenantId,
        vehicleId: longTerm.id,
        status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerUserId: customer.userId,
        tenantCustomerId: customer.id,
        serviceType: SERVICE_TYPE.LONG_TERM,
        longTermPackageMonths: 6,
        pickupPreference: PICKUP_PREFERENCE.WITHIN_7_DAYS,
        pickupWindowStartDate: dateOnlyFromToday(1),
        pickupWindowEndDate: dateOnlyFromToday(LONG_TERM_PICKUP_WINDOW_DAYS),
        note: 'Thuê cho nhân viên đi làm, cần xuất hoá đơn theo tháng.',
      },
    });
    count += 1;
  }

  // Yêu cầu đã DUYỆT và đã thành đơn — nối `bookingId` để mở được đơn từ yêu cầu.
  const converted = bookings.find((b) => b.plan.status === BOOKING_STATUS.CONFIRMED);
  if (converted) {
    const id = seedId(`${spec.key}:request:converted`);
    await prisma.bookingRequest.upsert({
      where: { id },
      update: {},
      create: {
        id,
        tenantId: deps.tenantId,
        vehicleId: converted.plan.unit.id,
        status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
        customerName: converted.plan.customer.name,
        customerPhone: converted.plan.customer.phone,
        customerUserId: converted.plan.customer.userId,
        tenantCustomerId: converted.plan.customer.id,
        serviceType: converted.plan.serviceType,
        routeType:
          converted.plan.serviceType === SERVICE_TYPE.WITH_DRIVER ? ROUTE_TYPE.IN_CITY : null,
        pickupAt: converted.plan.pickupAt,
        returnAt: converted.plan.returnAt,
        bookingId: converted.id,
        decidedBy: deps.ownerUserId,
        decidedAt: daysFromToday(-1, 4),
      },
    });
    count += 1;
  }

  return count;
}
