import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { PLAN_FEATURE, type PlanFeature } from '@xeprime/types';
import { AppModule } from '../src/app.module';
import { collectRouteAccess, type RouteAccess } from '../src/openapi/route-access';

/**
 * W3 LÔ 2 — **spec quan trọng nhất của đợt**: cổng chặn có phủ đúng chỗ không.
 *
 * Vì sao nó tồn tại: một endpoint mới `POST /receipts/export` ship thiếu `@RequiresFeature` là
 * một lỗ hổng IM LẶNG — không ai thấy gì sai cho tới khi một gian hàng bậc cơ bản dùng được thứ
 * đáng lẽ phải mua. Ở đây nó làm ĐỎ CI ngay lần chạy đầu.
 *
 * Spec kiểm CẢ HAI CHIỀU, và chiều thứ hai quan trọng ngang chiều thứ nhất:
 *  - controller trong nhóm nâng cao ⇒ mọi route PHẢI có marker (trừ ngoại lệ khai tường minh);
 *  - controller bậc cơ bản ⇒ TUYỆT ĐỐI không được có marker. Gác nhầm `payments` là lấy mất
 *    quyền xem tiền của TỪNG ĐƠN — thứ ADR 0027 điều 1 nói rõ thuộc bộ cơ bản.
 *
 * Chạy ở `preview: true`: chỉ quét metadata, không đụng DB.
 */

/** Controller thuộc nhóm nâng cao và cờ gác chúng — ADR 0027 điều 1. */
const GATED: Readonly<Record<string, PlanFeature>> = {
  ReceiptsController: PLAN_FEATURE.FINANCE,
  FinanceCategoriesController: PLAN_FEATURE.FINANCE,
  MembersController: PLAN_FEATURE.MEMBERS,
  DriversController: PLAN_FEATURE.DRIVERS,
  ContractsController: PLAN_FEATURE.CONTRACTS,
  VehicleMaintenanceController: PLAN_FEATURE.MAINTENANCE,
  MaintenanceBoardController: PLAN_FEATURE.MAINTENANCE,
};

/**
 * Controller ôm NHIỀU nhóm nên gắn marker theo từng route — kiểm bằng bản đồ handler → cờ.
 * `FinanceOverviewController` là ca duy nhất: nó vừa có báo cáo thu chi vừa ôm `GET /debts`.
 */
const PER_ROUTE: Readonly<Record<string, Readonly<Record<string, PlanFeature>>>> = {
  FinanceOverviewController: {
    debts: PLAN_FEATURE.DEBTS,
    summary: PLAN_FEATURE.FINANCE,
    series: PLAN_FEATURE.FINANCE,
    byCategory: PLAN_FEATURE.FINANCE,
    byVehicle: PLAN_FEATURE.FINANCE,
    byCustomer: PLAN_FEATURE.FINANCE,
  },
  BranchesController: {
    create: PLAN_FEATURE.BRANCHES,
    setDefault: PLAN_FEATURE.BRANCHES,
    deactivate: PLAN_FEATURE.BRANCHES,
    activate: PLAN_FEATURE.BRANCHES,
  },
};

/**
 * NGOẠI LỆ có tên và có lý do — không phải "chưa làm tới".
 *
 * Bậc cơ bản luôn có đúng MỘT chi nhánh mặc định do `registerShop` tạo, và địa chỉ của nó là địa
 * chỉ công khai của gian hàng trên chợ. Khoá ba route này là khoá một thứ thuộc bộ cơ bản
 * (ADR 0027 điều 1) — và khoá đọc thì `PATCH` cũng vô dụng vì không có form nào load được.
 */
const INTENTIONALLY_UNGATED: Readonly<Record<string, readonly string[]>> = {
  BranchesController: ['list', 'get', 'update'],
};

/**
 * Controller bậc CƠ BẢN — phải KHÔNG có marker nào. Mỗi dòng là một quyết định của ADR 0027:
 * tiền của từng đơn, giao nhận xe, số KM lúc bàn giao, và hợp đồng NGUỒN GỐC xe đều là bộ cơ bản.
 */
const MUST_STAY_UNGATED = [
  // Tiền TRÊN MỘT ĐƠN là bậc cơ bản — chủ xe thấy số tiền từng chuyến, chỉ SỔ TỔNG HỢP mới bán.
  'PaymentsController',
  'BookingsController',
  'BookingSettlementController',
  // Giao/nhận xe và số KM lúc bàn giao thuộc vòng đời chuyến, không phải nghiệp vụ bảo dưỡng.
  'BookingHandoversController',
  'HandoverQueueController',
  'VehiclesController',
  'VehicleDocumentsController',
  'CalendarController',
  'BookingRequestsController',
  'CustomersController',
  'TenantsController',
  'ReviewController',
];

let app: INestApplication;
let access: Map<string, RouteAccess>;

beforeAll(async () => {
  app = await NestFactory.create(AppModule, { preview: true, logger: false });
  access = collectRouteAccess(app);
}, 120_000);

afterAll(async () => {
  await app?.close();
});

function routesOf(controller: string): RouteAccess[] {
  return [...access.values()].filter((r) => r.controller === controller);
}

describe('phủ cổng chặn năng lực — controller nhóm nâng cao', () => {
  it.each(Object.entries(GATED))('%s: MỌI route mang cờ %s', (controller, feature) => {
    const routes = routesOf(controller);
    expect(routes.length).toBeGreaterThan(0);

    const missing = routes.filter((r) => r.feature !== feature).map((r) => r.handler);
    expect(missing).toEqual([]);
  });

  it.each(Object.entries(PER_ROUTE))('%s: từng route mang đúng cờ của nhóm nó', (controller, map) => {
    // So bằng BẢN ĐỒ đầy đủ chứ không lặp từng khoá: đổi tên một handler thì `actual` mất khoá
    // đó và test chỉ ra ngay tên nào biến mất, thay vì một `undefined` không nói gì.
    const actual = Object.fromEntries(
      routesOf(controller)
        .filter((r) => r.feature !== null)
        .map((r) => [r.handler, r.feature]),
    );
    expect(actual).toEqual(map);
  });

  it('ngoại lệ CHỪA phải đúng danh sách đã khai — thêm bớt một route là đỏ CI', () => {
    for (const [controller, handlers] of Object.entries(INTENTIONALLY_UNGATED)) {
      const ungated = routesOf(controller)
        .filter((r) => r.feature === null)
        .map((r) => r.handler)
        .sort();
      expect(ungated).toEqual([...handlers].sort());
    }
  });

  it('⚠️ một endpoint MỚI thêm vào controller bị gác mà thiếu marker sẽ lộ ra ở đây', () => {
    // Diễn giải lại khẳng định đầu tiên dưới dạng tổng: nếu ai đó thêm handler mới vào bất kỳ
    // controller nào trong GATED mà quên marker, `feature` của nó là null và phép đếm lệch.
    const gatedRoutes = Object.keys(GATED).flatMap(routesOf);
    expect(gatedRoutes.filter((r) => r.feature === null).map((r) => `${r.controller}.${r.handler}`)).toEqual(
      [],
    );
  });
});

describe('phủ cổng chặn năng lực — controller bậc cơ bản KHÔNG được gác', () => {
  it('tiền của từng đơn, giao nhận xe, lịch, sổ khách: không route nào mang cờ', () => {
    const gatedBasics = MUST_STAY_UNGATED.flatMap(routesOf)
      .filter((r) => r.feature !== null)
      .map((r) => `${r.controller}.${r.handler} → ${r.feature}`);
    expect(gatedBasics).toEqual([]);
  });

  it('mọi controller có tên trong danh sách bậc cơ bản đều TỒN TẠI (chống danh sách chết)', () => {
    const missing = MUST_STAY_UNGATED.filter((name) => routesOf(name).length === 0);
    expect(missing).toEqual([]);
  });
});

describe('phủ cổng chặn năng lực — bất biến chung', () => {
  it('route có cờ thì BẮT BUỘC tenant-scoped: không có tenant thì không có gói để đọc', () => {
    const orphans = [...access.values()]
      .filter((r) => r.feature !== null && !r.tenantScoped)
      .map((r) => `${r.controller}.${r.handler}`);
    expect(orphans).toEqual([]);
  });

  it('route công khai KHÔNG bao giờ mang cờ — khách không có gói nào để hỏi', () => {
    const publicGated = [...access.values()]
      .filter((r) => r.feature !== null && r.isPublic)
      .map((r) => `${r.controller}.${r.handler}`);
    expect(publicGated).toEqual([]);
  });

  it('mọi cờ dùng trong code đều thuộc PLAN_FEATURE (không chuỗi trần)', () => {
    const used = new Set(
      [...access.values()].map((r) => r.feature).filter((f): f is PlanFeature => f !== null),
    );
    for (const feature of used) {
      expect(Object.values(PLAN_FEATURE)).toContain(feature);
    }
  });

  it('escrow_hold CHƯA gác gì — ADR 0025 chưa thi công', () => {
    const escrow = [...access.values()].filter((r) => r.feature === PLAN_FEATURE.ESCROW_HOLD);
    expect(escrow).toEqual([]);
  });
});
