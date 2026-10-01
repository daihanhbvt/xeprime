import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BRANCH_STATUS,
  HANDOVER_STATUS,
  HANDOVER_TYPE,
  MEMBERSHIP_BRANCH_SCOPE,
  OCCUPANCY_SOURCE_TYPE,
  PAYMENT_METHOD,
  RECEIPT_STATUS,
  RECEIPT_TYPE,
  TENANT_STATUS,
  VEHICLE_BLOCK_REASON,
  VEHICLE_TYPE,
} from '@xeprime/types';
import 'reflect-metadata';
import { ForbiddenException, NotFoundException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  BRANCH_SCOPED_KEY,
  BRANCH_SCOPED_RESOURCE,
  type BranchScopedResource,
} from '../src/common/decorators';
import { BranchScopeGuard } from '../src/common/guards/branch-scope.guard';
import { assertWithinActorScope } from '../src/modules/members/member-branch-scope';
import { AuditService } from '../src/modules/audit/audit.service';
import { CalendarController } from '../src/modules/calendar/calendar.controller';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import { BulkDayService } from '../src/modules/calendar/bulk-day.service';
import { HandoversService } from '../src/modules/bookings/handovers/handovers.service';
import { ReceiptsService } from '../src/modules/finance/receipts.service';
import { FinanceOverviewService } from '../src/modules/finance/finance-overview.service';
import { MaintenanceService } from '../src/modules/vehicles/maintenance/maintenance.service';
import { OdometerService } from '../src/modules/vehicles/maintenance/odometer.service';

import { VehicleContractsService } from '../src/modules/vehicles/vehicle-contracts.service';
import type { R2Service } from '../src/modules/storage/r2.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { TenantContext } from '../src/common/types/request-context';
import {
  makeBookingsService,
  makeCustomersService,
  makeNotificationService,
  makePricingService,
  makeVehiclesService,
} from './helpers/service-factory';

/**
 * Bộ lọc chi nhánh theo từng màn — ADR 0052, trên PostgreSQL THẬT.
 *
 * Ba điều được khoá, theo đúng thứ tự quan trọng:
 *
 * 1. **`branchId` chỉ THU HẸP, không bao giờ mở rộng** (ADR 0052 điều 9). Chi nhánh của gian hàng
 *    KHÁC gửi vào phải cho danh sách RỖNG — không phải 403, và tuyệt đối không phải dữ liệu của
 *    gian hàng đó. Đây là điều duy nhất trong cả đợt mà sai thì thành lỗi bảo mật.
 *
 * 2. **Con số tổng hợp khớp với bảng nó đứng cạnh** (ADR 0052 điều 3). `fleet-summary.total` phải
 *    bằng số xe của `/vehicles` cùng `branchId`, và `/maintenance/summary.total` bằng của
 *    `/maintenance`. Chính đẳng thức này là luận điểm của ADR: trước đó dải chỉ số ghi "40 xe"
 *    ngay trên một bảng 4 dòng.
 *
 * 3. **`/calendar/events` thực sự lọc.** Nó từng trả về cả lịch — và TÊN KHÁCH — của chi nhánh
 *    khác, vô hình trên màn hình vì lưới chỉ vẽ những hàng nó đang hiện.
 *
 * Và một điều nữa, dễ hỏng âm thầm: hàng đợi "Thiếu KM trả" là TAB THỨ TƯ của màn Bảo dưỡng nhưng
 * đọc một endpoint khác — ba tab lọc còn tab thứ tư hiện cả gian hàng là thứ không ai phát hiện
 * bằng mắt.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

const fakeR2 = {
  async presignPrivateUpload() {
    return { uploadUrl: 'https://r2.local/put', fileId: newId(), expiresIn: 120 };
  },
  async headPrivate() {
    return { size: 1024, contentType: 'application/pdf' };
  },
  async presignPrivateDownload() {
    return { downloadUrl: 'https://r2.local/get', expiresIn: 120 };
  },
};

const audit = new AuditService(asService);
const occupancy = new OccupancyService(asService);
const pricing = makePricingService(asService);
const calendar = new CalendarController(asService, occupancy, pricing);
const vehicles = makeVehiclesService(asService);
const files = new VehicleContractsService(asService, fakeR2 as unknown as R2Service, audit);
const odometer = new OdometerService(asService, audit);
const maintenance = new MaintenanceService(
  asService,
  occupancy,
  odometer,
  files,
  audit,
  new ReceiptsService(asService, audit),
);
const bookings = makeBookingsService(asService, {
  occupancy,
  audit,
  notifications: makeNotificationService(asService),
  customers: makeCustomersService(asService, audit),
});
const handovers = new HandoversService(asService, bookings, odometer, maintenance, files, audit);
const receipts = new ReceiptsService(asService, audit);
const finance = new FinanceOverviewService(asService);

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let otherTenantId: string;
/** Hai chi nhánh cùng gian hàng + một chi nhánh của gian hàng KHÁC (ca rò dữ liệu). */
let q5Id: string;
let ninhKieuId: string;
let foreignBranchId: string;
/** Hai xe Quận 5, một xe Ninh Kiều — số lệch nhau để không ca nào trùng kết quả ca khác. */
let q5CarId: string;
let q5BikeId: string;
let nkCarId: string;

const HOUR = 3600_000;
const inHours = (h: number) => new Date(Date.now() + h * HOUR);
const tenant = () => ({ tenantId }) as TenantContext;
const range = (over: Record<string, unknown> = {}) =>
  ({ startAt: inHours(-24), endAt: inHours(7 * 24), ...over }) as never;

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
  tenantId = newId();
  otherTenantId = newId();
  await prisma.user.create({
    data: { id: ownerId, displayName: 'Chủ chi nhánh', email: `br-${ownerId}@xeprime.test` },
  });
  for (const id of [tenantId, otherTenantId]) {
    await prisma.tenant.create({
      data: {
        id,
        code: `T-${id.slice(-8)}`,
        slug: `t-${id.toLowerCase().slice(-10)}`,
        name: 'Shop chi nhánh',
        status: TENANT_STATUS.ACTIVE,
        ownerUserId: ownerId,
      },
    });
  }

  q5Id = newId();
  ninhKieuId = newId();
  foreignBranchId = newId();
  await prisma.tenantBranch.createMany({
    data: [
      { id: q5Id, tenantId, code: 'CN-Q5', name: 'Quận 5', status: BRANCH_STATUS.ACTIVE, isDefault: true },
      { id: ninhKieuId, tenantId, code: 'CN-NK', name: 'Ninh Kiều', status: BRANCH_STATUS.ACTIVE },
      {
        id: foreignBranchId,
        tenantId: otherTenantId,
        code: 'CN-X',
        name: 'Chi nhánh gian hàng khác',
        status: BRANCH_STATUS.ACTIVE,
        isDefault: true,
      },
    ],
  });

  q5CarId = newId();
  q5BikeId = newId();
  nkCarId = newId();
  await prisma.vehicle.createMany({
    data: [
      { id: q5CarId, tenantId, branchId: q5Id, code: 'BR-Q5-1', name: 'Vios Quận 5', vehicleType: VEHICLE_TYPE.CAR },
      { id: q5BikeId, tenantId, branchId: q5Id, code: 'BR-Q5-2', name: 'Vision Quận 5', vehicleType: VEHICLE_TYPE.MOTORBIKE },
      { id: nkCarId, tenantId, branchId: ninhKieuId, code: 'BR-NK-1', name: 'Innova Ninh Kiều', vehicleType: VEHICLE_TYPE.CAR },
    ],
  });

  // Mỗi xe một khoảng bận, để `/calendar/events` có gì để lọc.
  await prisma.vehicleOccupancy.createMany({
    data: [q5CarId, q5BikeId, nkCarId].map((vehicleId) => ({
      id: newId(),
      tenantId,
      vehicleId,
      sourceType: OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE,
      sourceId: newId(),
      startAt: inHours(2),
      endAt: inHours(26),
    })),
  });

  /*
   * Phiếu thu chi: BA phiếu gắn xe (2 Quận 5 + 1 Ninh Kiều) và HAI phiếu không gắn xe.
   *
   * Hai phiếu cuối mô phỏng khoản KHÔNG thuộc chiếc xe nào (thuê mặt bằng, marketing). Từ
   * 01/10/2026 chúng vẫn phải quy về một chi nhánh (`receipts.branch_id`, ADR 0052) — CHECK
   * `receipts_manual_needs_branch_or_vehicle` cấm phiếu tay vô chủ. Nhờ vậy tổng của từng chi
   * nhánh CỘNG LẠI ĐÚNG BẰNG tổng gian hàng, không còn phần chênh phải giải thích.
   */
  await prisma.receipt.createMany({
    data: [
      { receiptNo: 'PT-BF-Q5A', vehicleId: q5CarId, branchId: null, amount: '1000000' },
      { receiptNo: 'PT-BF-Q5B', vehicleId: q5BikeId, branchId: null, amount: '2000000' },
      { receiptNo: 'PT-BF-NKA', vehicleId: nkCarId, branchId: null, amount: '3000000' },
      { receiptNo: 'PT-BF-Q5C', vehicleId: null, branchId: q5Id, amount: '4000000' },
      { receiptNo: 'PT-BF-NKB', vehicleId: null, branchId: ninhKieuId, amount: '5000000' },
    ].map((r) => ({
      id: newId(),
      tenantId,
      type: RECEIPT_TYPE.EXPENSE,
      paymentMethod: PAYMENT_METHOD.CASH,
      status: RECEIPT_STATUS.APPROVED,
      occurredAt: inHours(-2),
      ...r,
    })),
  });
});

/**
 * Dọn theo ĐÚNG thứ tự phụ thuộc, và dọn cho cả tenant chứ không theo từng id đã tạo.
 *
 * `bookings.vehicle_id` là FK cứng: xoá xe trước là `bookings_vehicle_id_fkey`. Và một ca hỏng
 * giữa chừng sẽ để lại bản ghi mà danh sách id cục bộ không biết tới — nên quét theo `tenantId`.
 */
afterAll(async () => {
  if (dbAvailable) {
    await prisma.receipt.deleteMany({ where: { tenantId } });
    await prisma.vehicleHandover.deleteMany({ where: { tenantId } });
    await prisma.vehicleOccupancy.deleteMany({ where: { tenantId } });
    await prisma.booking.deleteMany({ where: { tenantId } });
    await prisma.tenantCustomer.deleteMany({ where: { tenantId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.tenantBranch.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('branchId chỉ THU HẸP — không bao giờ là đường ra khỏi gian hàng (ADR 0052 điều 9)', () => {
  maybe('/vehicles: chi nhánh của gian hàng KHÁC → rỗng, không lỗi, không rò dữ liệu', async () => {
    const page = await vehicles.list(tenantId, { branchId: foreignBranchId } as never, null);

    expect(page.data).toEqual([]);
    expect(page.meta.total).toBe(0);
  });

  maybe('/vehicles/fleet-summary: chi nhánh gian hàng khác → mọi ô bằng 0', async () => {
    const summary = await vehicles.fleetSummary(tenantId, foreignBranchId, null);

    expect(summary.total).toBe(0);
  });

  maybe('/calendar/events: chi nhánh gian hàng khác → không sự kiện nào', async () => {
    const events = await calendar.events(tenant(), range({ branchId: foreignBranchId }));

    expect(events).toEqual([]);
  });

  maybe('/maintenance: chi nhánh gian hàng khác → rỗng', async () => {
    const board = await maintenance.board(tenantId, { branchId: foreignBranchId } as never, {
      canViewFinance: true,
    } as never, null);

    expect(board.data).toEqual([]);
  });
});

describe('/vehicles + fleet-summary — dải chỉ số PHẢI khớp bảng nó đứng trên (điều 3)', () => {
  maybe('không lọc: đủ cả ba xe, và tổng khớp', async () => {
    const page = await vehicles.list(tenantId, {} as never, null);
    const summary = await vehicles.fleetSummary(tenantId, undefined, null);

    expect(page.meta.total).toBe(3);
    expect(summary.total).toBe(page.meta.total);
  });

  maybe('lọc Quận 5: hai xe, và dải chỉ số nói ĐÚNG hai — không phải ba', async () => {
    const page = await vehicles.list(tenantId, { branchId: q5Id } as never, null);
    const summary = await vehicles.fleetSummary(tenantId, q5Id, null);

    expect(page.data.map((v) => v.id).sort()).toEqual([q5CarId, q5BikeId].sort());
    expect(summary.total).toBe(2);
    expect(summary.total).toBe(page.meta.total);
  });

  maybe('lọc Ninh Kiều: một xe, tổng khớp', async () => {
    const page = await vehicles.list(tenantId, { branchId: ninhKieuId } as never, null);
    const summary = await vehicles.fleetSummary(tenantId, ninhKieuId, null);

    expect(page.data.map((v) => v.id)).toEqual([nkCarId]);
    expect(summary.total).toBe(1);
  });

  maybe('tổng hai chi nhánh bằng tổng khi không lọc — không xe nào rơi ra ngoài', async () => {
    const [all, q5, nk] = await Promise.all([
      vehicles.fleetSummary(tenantId, undefined, null),
      vehicles.fleetSummary(tenantId, q5Id, null),
      vehicles.fleetSummary(tenantId, ninhKieuId, null),
    ]);

    expect(q5.total + nk.total).toBe(all.total);
  });
});

describe('/calendar — events lọc theo chi nhánh của XE (điều 3 phần "Bối cảnh")', () => {
  maybe('không lọc: sự kiện của cả ba xe', async () => {
    const events = await calendar.events(tenant(), range());

    expect(new Set(events.map((e) => e.resourceId))).toEqual(
      new Set([q5CarId, q5BikeId, nkCarId]),
    );
  });

  /**
   * Ca hồi quy CHÍNH của ADR: trước đây `/calendar/events` bỏ qua `branchId`, nên phản hồi mang
   * cả lịch của chi nhánh khác — vô hình trên lưới (nó chỉ vẽ hàng đang hiện) nhưng vẫn đi trên
   * dây, kèm `customerName` của những chuyến đó.
   */
  maybe('lọc Ninh Kiều: CHỈ sự kiện của xe Ninh Kiều đi trên dây', async () => {
    const events = await calendar.events(tenant(), range({ branchId: ninhKieuId }));

    expect(events.map((e) => e.resourceId)).toEqual([nkCarId]);
  });

  maybe('hàng xe (`resources`) và sự kiện nói CÙNG một phạm vi', async () => {
    const [rows, events] = await Promise.all([
      calendar.resources(tenant(), range({ branchId: q5Id })),
      calendar.events(tenant(), range({ branchId: q5Id })),
    ]);
    const rowIds = new Set(rows.map((r) => r.id));

    expect(rowIds.size).toBe(2);
    // Không sự kiện nào trỏ tới một hàng không tồn tại trên lưới.
    expect(events.every((e) => rowIds.has(e.resourceId))).toBe(true);
  });
});

describe('/maintenance — bảng, dải đếm và tab thứ tư cùng một phạm vi (điều 3 & 4)', () => {
  const scope = { canViewFinance: true } as never;

  maybe('lọc Quận 5: bảng hai dòng, và summary.total nói đúng hai', async () => {
    const board = await maintenance.board(tenantId, { branchId: q5Id } as never, scope, null);
    const summary = await maintenance.boardSummary(tenantId, {
      canViewHandovers: false,
      branchId: q5Id,
    }, null);

    expect(board.meta.total).toBe(2);
    expect(summary.total).toBe(board.meta.total);
  });

  maybe('lọc Ninh Kiều: một dòng, summary khớp', async () => {
    const board = await maintenance.board(tenantId, { branchId: ninhKieuId } as never, scope, null);
    const summary = await maintenance.boardSummary(tenantId, {
      canViewHandovers: false,
      branchId: ninhKieuId,
    }, null);

    expect(board.data.map((r) => r.vehicleId)).toEqual([nkCarId]);
    expect(summary.total).toBe(1);
  });

  /**
   * Tab "Thiếu KM trả" đọc `GET /handovers/missing-odometer` — một endpoint khác với ba tab kia.
   * Nó phải nhận CÙNG `branchId`, nếu không người dùng lọc Ninh Kiều rồi đổi tab và bất ngờ thấy
   * việc của cả gian hàng.
   */
  maybe('tab "Thiếu KM trả" lọc theo cùng chi nhánh với ba tab còn lại', async () => {
    const bookingId = newId();
    const customerId = newId();
    await prisma.tenantCustomer.create({
      data: {
        id: customerId,
        tenantId,
        fullName: 'Khách KM',
        phone: '0900000111',
        normalizedPhone: '84900000111',
      },
    });
    await prisma.booking.create({
      data: {
        id: bookingId,
        tenantId,
        vehicleId: nkCarId,
        code: `BK-${bookingId.slice(-6)}`,
        customerName: 'Khách KM',
        customerPhone: '0900000111',
        pickupAt: inHours(-48),
        returnAt: inHours(-2),
      },
    });
    await prisma.vehicleHandover.create({
      data: {
        id: newId(),
        tenantId,
        bookingId,
        vehicleId: nkCarId,
        type: HANDOVER_TYPE.RETURN,
        status: HANDOVER_STATUS.CONFIRMED,
        // CHECK `vh_confirmed_has_actor`: biên bản `confirmed` BẮT BUỘC có cả mốc lẫn người xác
        // nhận — DB không cho ghi một biên bản đã xác nhận mà không biết ai xác nhận.
        confirmedAt: inHours(-2),
        confirmedBy: ownerId,
        odometerMissing: true,
      },
    });

    const [nk, q5] = await Promise.all([
      handovers.missingOdometerQueue(tenantId, { branchId: ninhKieuId }, null),
      handovers.missingOdometerQueue(tenantId, { branchId: q5Id }, null),
    ]);

    expect(nk.meta.total).toBe(1);
    // Biên bản thuộc xe Ninh Kiều — lọc Quận 5 KHÔNG được thấy nó.
    expect(q5.meta.total).toBe(0);

    // Và phép đếm ở dải tab phải nói đúng điều đó, cùng một con số.
    const summary = await maintenance.boardSummary(tenantId, {
      canViewHandovers: true,
      branchId: ninhKieuId,
    }, null);
    expect(summary.missingReturnKm).toBe(1);

    const q5Summary = await maintenance.boardSummary(tenantId, {
      canViewHandovers: true,
      branchId: q5Id,
    }, null);
    expect(q5Summary.missingReturnKm).toBe(0);

    await prisma.vehicleHandover.deleteMany({ where: { bookingId } });
    await prisma.booking.deleteMany({ where: { id: bookingId } });
    await prisma.tenantCustomer.deleteMany({ where: { id: customerId } });
  });
});

/**
 * Tiền — ADR 0052 "Mở rộng tiếp theo".
 *
 * Hai luật khác nhau, và sự khác nhau đó là toàn bộ lý do sổ thu chi khó hơn công nợ:
 *
 *  - **Công nợ**: `bookings.vehicle_id` NOT NULL ⇒ không dòng nào vô chủ ⇒ tổng các chi nhánh
 *    ĐÚNG BẰNG tổng gian hàng. Lọc không giấu mất khoản nào.
 *  - **Sổ thu chi**: `receipts.vehicle_id` NULLABLE, nhưng từ 01/10/2026 phiếu tay không gắn xe
 *    PHẢI mang `branch_id` (ADR 0052) ⇒ cũng khép kín. `meta.unassignedCount` vẫn còn như một
 *    cái lưới cho dữ liệu CŨ: nó phải là 0 trên dữ liệu mới, và khác 0 là dấu hiệu có hàng chưa
 *    backfill — một con số nói lên điều gì đó, không phải một con số trang trí.
 */
describe('Tiền — công nợ và sổ thu chi đều khép kín theo chi nhánh', () => {
  const debtQuery = (branchId?: string) => ({ branchId, page: 1, limit: 100 }) as never;
  const receiptQuery = (branchId?: string) => ({ branchId, page: 1, limit: 100 }) as never;

  maybe('Công nợ: tổng HAI chi nhánh = tổng gian hàng, không dòng nào rơi ra', async () => {
    const [all, q5, nk] = await Promise.all([
      finance.debts(tenantId, debtQuery(), null),
      finance.debts(tenantId, debtQuery(q5Id), null),
      finance.debts(tenantId, debtQuery(ninhKieuId), null),
    ]);

    expect(q5.meta.total + nk.meta.total).toBe(all.meta.total);
  });

  maybe('Công nợ: chi nhánh của gian hàng khác → rỗng', async () => {
    const res = await finance.debts(tenantId, debtQuery(foreignBranchId), null);
    expect(res.meta.total).toBe(0);
  });

  maybe('Sổ thu chi: tổng các chi nhánh = tổng gian hàng, không còn khoản vô chủ', async () => {
    const [all, q5, nk] = await Promise.all([
      receipts.list(tenantId, receiptQuery(), null),
      receipts.list(tenantId, receiptQuery(q5Id), null),
      receipts.list(tenantId, receiptQuery(ninhKieuId), null),
    ]);

    // Mọi phiếu đều quy được về một chi nhánh ⇒ không còn phần chung nào để bỏ lại.
    expect(all.meta.unassignedCount).toBe(0);
    expect(q5.meta.unassignedCount).toBe(0);
    expect(nk.meta.unassignedCount).toBe(0);
    // Và đây là bất biến người dùng thật sự kiểm: cộng từng chi nhánh ra đúng tổng gian hàng.
    expect(q5.meta.total + nk.meta.total).toBe(all.meta.total);
  });

  maybe('Sổ thu chi: chi nhánh gian hàng khác → rỗng, nhưng vẫn báo đúng số khoản chung', async () => {
    const res = await receipts.list(tenantId, receiptQuery(foreignBranchId), null);

    expect(res.meta.total).toBe(0);
    // Lọc vào hư không vẫn phải nói ra phần chung — nếu không, màn hình trống trơn trông như
    // gian hàng không có giao dịch nào.
    // Số khoản chung là CON SỐ THẬT của gian hàng — không phụ thuộc chi nhánh xin vào đâu.
    const mine = await receipts.list(tenantId, receiptQuery(q5Id), null);
    expect(res.meta.unassignedCount).toBe(mine.meta.unassignedCount);
  });
});

/** Gợi nhớ: quyền xem chi nhánh là một trục KHÁC, không phải thứ `branchId` thay thế. */
describe('branchId không phải cơ chế phân quyền', () => {
  maybe('lọc chi nhánh không cần quyền nào ngoài quyền xem chính danh sách', async () => {
    // `branches.view` gác việc ĐỌC danh sách chi nhánh (để dựng ô chọn), không gác việc lọc.
    const page = await vehicles.list(tenantId, { branchId: q5Id } as never, null);
    expect(page.meta.total).toBe(2);
  });
});

/**
 * Sổ thu chi có HAI bộ lọc cùng là `OR` ở tầng Prisma: phạm vi chi nhánh và ô tìm kiếm.
 *
 * Spread cả hai vào cùng một object `where` thì vế sau IM LẶNG ghi đè vế trước — truy vấn vẫn
 * chạy, TypeScript vẫn xanh, và một nhân viên bị giới hạn chi nhánh chỉ cần gõ một chữ vào ô tìm
 * là thấy phiếu của mọi chi nhánh. Lỗi này đã xảy ra thật (01/10/2026). Bài test đo bằng DỮ LIỆU,
 * so khớp ĐÚNG TẬP số phiếu — không chỉ so tổng, để không thể đúng nhờ may.
 */
describe('Sổ thu chi — lọc chi nhánh và ô tìm kiếm phải CÙNG áp (ADR 0052)', () => {
  const search = (branchId: string | undefined, q: string) =>
    ({ branchId, q, page: 1, limit: 100 }) as never;
  const numbersOf = (res: { data: readonly { receiptNo: string | null }[] }) =>
    res.data.map((r) => r.receiptNo).sort();

  maybe('lọc chi nhánh + gõ tìm kiếm = GIAO hai tập, không phải bỏ một vế', async () => {
    const [byBranch, byQuery, both] = await Promise.all([
      receipts.list(tenantId, search(q5Id, ''), null),
      receipts.list(tenantId, search(undefined, 'PT-BF-'), null),
      receipts.list(tenantId, search(q5Id, 'PT-BF-'), null),
    ]);

    expect(numbersOf(byQuery)).toEqual(['PT-BF-NKA', 'PT-BF-NKB', 'PT-BF-Q5A', 'PT-BF-Q5B', 'PT-BF-Q5C']);
    expect(numbersOf(byBranch)).toEqual(['PT-BF-Q5A', 'PT-BF-Q5B', 'PT-BF-Q5C']);
    // Giao = đúng vế chi nhánh, KHÔNG phải cả 5 dòng mà ô tìm kiếm khớp.
    expect(numbersOf(both)).toEqual(['PT-BF-Q5A', 'PT-BF-Q5B', 'PT-BF-Q5C']);
  });

  maybe('người bị GIỚI HẠN gõ tìm kiếm vẫn không thấy chi nhánh ngoài phạm vi', async () => {
    const [limited, all] = await Promise.all([
      receipts.list(tenantId, search(undefined, 'PT-BF-'), [ninhKieuId]),
      receipts.list(tenantId, search(undefined, 'PT-BF-'), null),
    ]);

    expect(numbersOf(all)).toHaveLength(5);
    // Ninh Kiều có đúng hai phiếu: một gắn xe, một gắn thẳng chi nhánh.
    expect(numbersOf(limited)).toEqual(['PT-BF-NKA', 'PT-BF-NKB']);
  });

  maybe('ô tìm kiếm không mở được đường ra khỏi phạm vi, kể cả khi gõ đúng số phiếu', async () => {
    const limited = await receipts.list(tenantId, search(undefined, 'PT-BF-Q5A'), [ninhKieuId]);
    expect(limited.meta.total).toBe(0);
  });
});

/**
 * Route THEO ID (ADR 0052): danh sách đã thu hẹp trong `where`, nhưng `GET /bookings/:id`,
 * `PATCH /vehicles/:id`… chỉ khoá `{ id, tenantId }`. `BranchScopeGuard` là nửa còn lại — chạy
 * thẳng guard trên dữ liệu thật, không mock phép tra chi nhánh.
 */
describe('BranchScopeGuard — tài nguyên ngoài phạm vi là KHÔNG TỒN TẠI (404)', () => {
  const guard = new BranchScopeGuard(new Reflector(), asService);
  const ctxFor = (
    resource: BranchScopedResource,
    id: string,
    allowedBranchIds: readonly string[] | null,
  ): ExecutionContext => {
    const handler = () => undefined;
    Reflect.defineMetadata(BRANCH_SCOPED_KEY, { resource, param: 'id' }, handler);
    const req = { tenant: { tenantId, allowedBranchIds }, params: { id } };
    return {
      getHandler: () => handler,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
  };
  const outcome = async (ctx: ExecutionContext) => {
    try {
      return (await guard.canActivate(ctx)) ? 'pass' : 'deny';
    } catch (e) {
      return e instanceof NotFoundException ? '404' : `lỗi khác: ${String(e)}`;
    }
  };

  maybe('toàn gian hàng (null) đi qua mọi tài nguyên, không cần tra', async () => {
    expect(await outcome(ctxFor(BRANCH_SCOPED_RESOURCE.VEHICLE, nkCarId, null))).toBe('pass');
  });

  maybe('xe của chi nhánh KHÁC ⇒ 404 — đây là đường "kéo xe về chi nhánh mình"', async () => {
    expect(await outcome(ctxFor(BRANCH_SCOPED_RESOURCE.VEHICLE, nkCarId, [q5Id]))).toBe('404');
    expect(await outcome(ctxFor(BRANCH_SCOPED_RESOURCE.VEHICLE, q5CarId, [q5Id]))).toBe('pass');
  });

  maybe('phiếu thu chi: gắn xe lấy chi nhánh của XE, không gắn xe lấy cột của phiếu', async () => {
    const byNo = async (no: string) =>
      (await prisma.receipt.findFirstOrThrow({ where: { tenantId, receiptNo: no } })).id;
    expect(await outcome(ctxFor(BRANCH_SCOPED_RESOURCE.RECEIPT, await byNo('PT-BF-NKA'), [q5Id]))).toBe('404');
    expect(await outcome(ctxFor(BRANCH_SCOPED_RESOURCE.RECEIPT, await byNo('PT-BF-NKB'), [q5Id]))).toBe('404');
    expect(await outcome(ctxFor(BRANCH_SCOPED_RESOURCE.RECEIPT, await byNo('PT-BF-Q5C'), [q5Id]))).toBe('pass');
  });

  maybe('chi nhánh ngoài phạm vi ⇒ 404 (PATCH /branches/:id)', async () => {
    expect(await outcome(ctxFor(BRANCH_SCOPED_RESOURCE.BRANCH, ninhKieuId, [q5Id]))).toBe('404');
    expect(await outcome(ctxFor(BRANCH_SCOPED_RESOURCE.BRANCH, q5Id, [q5Id]))).toBe('pass');
  });

  maybe('limited RỖNG chặn hết; id không tồn tại để service tự trả 404 của nó', async () => {
    expect(await outcome(ctxFor(BRANCH_SCOPED_RESOURCE.VEHICLE, q5CarId, []))).toBe('404');
    expect(await outcome(ctxFor(BRANCH_SCOPED_RESOURCE.VEHICLE, newId(), [q5Id]))).toBe('pass');
  });

  maybe('id của gian hàng KHÁC không bị guard nhận nhầm là "tồn tại"', async () => {
    expect(await outcome(ctxFor(BRANCH_SCOPED_RESOURCE.BRANCH, foreignBranchId, [q5Id]))).toBe('pass');
  });
});

describe('Trần giao quyền — không ai cấp được phạm vi rộng hơn của mình (ADR 0052)', () => {
  const all = { branchScope: MEMBERSHIP_BRANCH_SCOPE.ALL, branchIds: [] };
  const limited = (...ids: string[]) => ({ branchScope: MEMBERSHIP_BRANCH_SCOPE.LIMITED, branchIds: ids });
  const code = (fn: () => void) => {
    try {
      fn();
      return 'ok';
    } catch (e) {
      return (e as ForbiddenException).getResponse?.() &&
        ((e as ForbiddenException).getResponse() as { code: string }).code;
    }
  };

  it('toàn gian hàng (null) giao được mọi phạm vi', () => {
    expect(code(() => assertWithinActorScope(null, all))).toBe('ok');
  });

  it('người bị giới hạn KHÔNG cấp được "Tất cả chi nhánh"', () => {
    expect(code(() => assertWithinActorScope(['A'], all))).toBe(API_ERROR_CODE.BRANCH_SCOPE_EXCEEDED);
  });

  it('chỉ cấp được tập con của phần mình', () => {
    expect(code(() => assertWithinActorScope(['A', 'B'], limited('A')))).toBe('ok');
    expect(code(() => assertWithinActorScope(['A'], limited('A', 'C')))).toBe(
      API_ERROR_CODE.BRANCH_SCOPE_EXCEEDED,
    );
  });
});

/**
 * Khoá cả ngày trên Lịch (ADR 0052 §8 tự cảnh báo đúng ca này): một lô tạo lúc xem "Tất cả" phủ
 * mọi chi nhánh, và công tắc trên lịch đang lọc chi nhánh A từng gỡ CẢ LÔ — xoá luôn lịch khoá
 * của chi nhánh B. Ngày ở xa tương lai để không đụng các chiếm lịch khác của fixture.
 */
describe('Khoá hàng loạt trên Lịch — chỉ chạm xe trong phạm vi đang xem', () => {
  const bulk = new BulkDayService(asService, occupancy, audit);
  const DAY = '2027-03-10';
  const blocksOf = (vehicleId: string) =>
    prisma.vehicleBlock.count({ where: { tenantId, vehicleId, bulkBatchId: { not: null } } });

  maybe('tắt công tắc khi lọc chi nhánh A KHÔNG gỡ khoá của chi nhánh B', async () => {
    const { batchId } = await bulk.blockAll(
      tenantId,
      ownerId,
      { from: DAY, to: DAY, reason: VEHICLE_BLOCK_REASON.NOT_FOR_RENT, vehicleIds: [q5CarId, nkCarId] },
      null,
    );
    try {
      expect(await blocksOf(q5CarId)).toBe(1);
      expect(await blocksOf(nkCarId)).toBe(1);

      const { released } = await bulk.releaseBatch(tenantId, ownerId, batchId, q5Id, null);
      expect(released).toBe(1);
      expect(await blocksOf(q5CarId)).toBe(0);
      expect(await blocksOf(nkCarId)).toBe(1); // chi nhánh B còn nguyên
    } finally {
      await bulk.releaseBatch(tenantId, ownerId, batchId, undefined, null);
    }
  });

  maybe('xem trước khi lọc chi nhánh A không báo lô chỉ phủ chi nhánh B', async () => {
    const { batchId } = await bulk.blockAll(
      tenantId,
      ownerId,
      { from: DAY, to: DAY, reason: VEHICLE_BLOCK_REASON.NOT_FOR_RENT, vehicleIds: [nkCarId] },
      null,
    );
    try {
      const preview = (branchId: string) =>
        bulk.preview(tenantId, { from: DAY, to: DAY, branchId } as never, null);
      expect((await preview(q5Id)).activeBlockBatchId).toBeNull();
      expect((await preview(ninhKieuId)).activeBlockBatchId).toBe(batchId);
    } finally {
      await bulk.releaseBatch(tenantId, ownerId, batchId, undefined, null);
    }
  });

  maybe('người bị giới hạn gửi id xe chi nhánh khác: không khoá được', async () => {
    await expect(
      bulk.blockAll(
        tenantId,
        ownerId,
        { from: DAY, to: DAY, reason: VEHICLE_BLOCK_REASON.NOT_FOR_RENT, vehicleIds: [nkCarId] },
        [q5Id],
      ),
    ).rejects.toThrow();
    expect(await blocksOf(nkCarId)).toBe(0);
  });

  maybe('người bị giới hạn gỡ lô: chỉ phần trong phạm vi của họ', async () => {
    const { batchId } = await bulk.blockAll(
      tenantId,
      ownerId,
      { from: DAY, to: DAY, reason: VEHICLE_BLOCK_REASON.NOT_FOR_RENT, vehicleIds: [q5CarId, nkCarId] },
      null,
    );
    try {
      const { released } = await bulk.releaseBatch(tenantId, ownerId, batchId, undefined, [q5Id]);
      expect(released).toBe(1);
      expect(await blocksOf(nkCarId)).toBe(1);
    } finally {
      await bulk.releaseBatch(tenantId, ownerId, batchId, undefined, null);
    }
  });
});

describe('Tạo phiếu thu chi — chỉ ghi được vào phần được giao (ADR 0052)', () => {
  const base = {
    type: RECEIPT_TYPE.EXPENSE,
    amount: '10000',
    paymentMethod: PAYMENT_METHOD.CASH,
    occurredAt: inHours(-1).toISOString(),
  };

  maybe('người bị giới hạn ở Q5 không ghi được chi phí cho chi nhánh/xe của Ninh Kiều', async () => {
    await expect(
      receipts.create(tenantId, ownerId, { ...base, branchId: ninhKieuId } as never, [q5Id]),
    ).rejects.toThrow();
    await expect(
      receipts.create(tenantId, ownerId, { ...base, vehicleId: nkCarId } as never, [q5Id]),
    ).rejects.toThrow();
  });

  maybe('trong phạm vi thì ghi được bình thường', async () => {
    const created = await receipts.create(tenantId, ownerId, { ...base, branchId: q5Id } as never, [q5Id]);
    expect(created.id).toBeTruthy();
    await prisma.receipt.delete({ where: { id: created.id } });
  });
});
