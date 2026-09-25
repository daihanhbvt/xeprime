import 'reflect-metadata';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { SUPPORT_ACTION_KEY } from '../src/common/decorators';
import { AppModule } from '../src/app.module';

/**
 * Bảng allowlist THẬT của không gian hỗ trợ gian hàng (ADR 0050) — đọc thẳng từ metadata của mọi
 * controller trong `AppModule`, không từ một danh sách tay nào.
 *
 * Hai điều nó khoá:
 *  1. Không controller nào khai `@SupportAction` ở cấp CLASS (guard chỉ đọc cấp handler, nhưng một
 *     decorator class-level là dấu hiệu ai đó định mở cả controller).
 *  2. Tập handler mở cho phiên đúng bằng Đợt 1. Thêm một endpoint vào phiên là phải sửa bảng này —
 *     tức là một thay đổi có người review, không phải hệ quả ngầm.
 */
const SUPPORT_ALLOWLIST = [
  // ── Đợt 1: đọc xe/chi nhánh + ghi thông tin/ảnh xe + phiếu bảo dưỡng ──
  'BranchesController.list',
  'StorageController.presignVehicleImage',
  'VehicleMaintenanceController.attach',
  'VehicleMaintenanceController.createRecord',
  'VehicleMaintenanceController.getProfile',
  'VehicleMaintenanceController.odometerHistory',
  'VehicleMaintenanceController.presignAttachment',
  'VehicleMaintenanceController.records',
  'VehicleMaintenanceController.updateRecord',
  'VehiclesController.alerts',
  'VehiclesController.fleetSummary',
  'VehiclesController.getOne',
  'VehiclesController.list',
  'VehiclesController.stats',
  'VehiclesController.summary',
  'VehiclesController.update',
  // ── Đợt 2A: CHỈ ĐỌC, mỗi lĩnh vực một capability ──
  'BookingHandoversController.context',
  'BookingRequestsController.getOne',
  'BookingRequestsController.list',
  'BookingsController.getOne',
  'BookingsController.list',
  'BranchesController.get',
  'CalendarController.availability',
  'CalendarController.dailyPrices',
  'CalendarController.events',
  'CalendarController.resources',
  'CustomersController.bookings',
  'CustomersController.detail',
  'CustomersController.list',
  'CustomersController.summary',
  'DriversController.assignable',
  'DriversController.list',
  'HandoverQueueController.missingOdometer',
  'InvitesController.list',
  'MaintenanceBoardController.list',
  'MaintenanceBoardController.summary',
  'MembersController.list',
  'ShopPoliciesController.get',
  'SubscriptionController.invoices',
  'SubscriptionController.mySubscription',
  'SupportController.detail',
  'SupportController.list',
  'TenantsController.current',
  'TenantsController.myShop',
  'VehicleBlocksController.getOne',
  'VehiclesController.getPricing',
].sort();

type Ctor = abstract new (...args: never[]) => unknown;

/** Mọi method trên CẢ chuỗi prototype — handler kế thừa từ controller cha cũng phải bị soát. */
function methodNames(proto: object): string[] {
  const names = new Set<string>();
  for (let p: object | null = proto; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
    for (const name of Object.getOwnPropertyNames(p)) if (name !== 'constructor') names.add(name);
  }
  return [...names];
}

function collectControllers(root: unknown, seen = new Set<unknown>()): Ctor[] {
  if (!root || seen.has(root)) return [];
  seen.add(root);
  const target = (root as { module?: unknown }).module ?? root;
  const controllers: Ctor[] =
    Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, target as object) ?? [];
  const imports: unknown[] = [
    ...(Reflect.getMetadata(MODULE_METADATA.IMPORTS, target as object) ?? []),
    ...((root as { imports?: unknown[] }).imports ?? []),
  ];
  return [...controllers, ...imports.flatMap((m) => collectControllers(m, seen))];
}

describe('Allowlist của phiên hỗ trợ gian hàng (ADR 0050)', () => {
  const controllers = [...new Set(collectControllers(AppModule))];

  it('quét được toàn bộ controller của ứng dụng', () => {
    expect(controllers.length).toBeGreaterThan(40);
  });

  it('không controller nào khai @SupportAction ở cấp class', () => {
    const offenders = controllers
      .filter((c) => Reflect.getMetadata(SUPPORT_ACTION_KEY, c) !== undefined)
      .map((c) => c.name);
    expect(offenders).toEqual([]);
  });

  it('tập handler mở cho phiên đúng bằng allowlist Đợt 1 + 2A', () => {
    const opened = controllers.flatMap((c) =>
      methodNames(c.prototype)
        .filter((name) => {
          const handler = (c.prototype as Record<string, unknown>)[name];
          return (
            typeof handler === 'function' &&
            Reflect.getMetadata(SUPPORT_ACTION_KEY, handler) !== undefined
          );
        })
        .map((name) => `${c.name}.${name}`),
    );
    expect(opened.sort()).toEqual(SUPPORT_ALLOWLIST);
  });
});
