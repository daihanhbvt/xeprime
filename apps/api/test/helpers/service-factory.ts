import { newId } from '@xeprime/prisma';
import { BRANCH_STATUS } from '@xeprime/types';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../../src/modules/audit/audit.service';
import { BookingHoldsService } from '../../src/modules/holds/booking-holds.service';
import { BookingRequestsService } from '../../src/modules/booking-requests/booking-requests.service';
import { BookingsService } from '../../src/modules/bookings/bookings.service';
import { OccupancyService } from '../../src/modules/calendar/occupancy.service';
import { CustomersService } from '../../src/modules/customers/customers.service';
import { DriversService } from '../../src/modules/drivers/drivers.service';
import { FeePoliciesService } from '../../src/modules/fee-policies/fee-policies.service';
import { HoldSettlementService } from '../../src/modules/holds/hold-settlement.service';
import { NotificationService } from '../../src/modules/notification/notification.service';
import { BillingService } from '../../src/modules/billing/billing.service';
import { BranchesService } from '../../src/modules/branches/branches.service';
import { CatalogModelService } from '../../src/modules/catalog/catalog-model.service';
import { CatalogService } from '../../src/modules/catalog/catalog.service';
import { GeoNotConfiguredProvider } from '../../src/modules/geo/geo-provider';
import { GeoService } from '../../src/modules/geo/geo.service';
import { ProvincesService } from '../../src/modules/locations/provinces.service';
import { ListingsService } from '../../src/modules/public-listings/listings.service';
import { PublicListingsService } from '../../src/modules/public-listings/public-listings.service';
import { PricingService } from '../../src/modules/pricing/pricing.service';
import { TenantsService } from '../../src/modules/tenants/tenants.service';
import { VehicleSettingsService } from '../../src/modules/vehicle-settings/vehicle-settings.service';
import { VehiclesService } from '../../src/modules/vehicles/vehicles.service';
import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Dựng service cho spec tích hợp (chạy trên PostgreSQL thật, không có Nest DI container).
 *
 * Vì sao gom vào đây: `VehiclesService` có 7 dependency và được dựng tay ở hơn mười spec. Mỗi
 * lần thêm một dependency là sửa hơn mười file — lần này là `BranchesService`. Một factory dùng
 * chung khiến thay đổi đó thành MỘT dòng, và không spec nào bị bỏ sót một cách âm thầm.
 */
/**
 * `VehicleSettingsService` (08/09/2026) — thiết lập vận hành theo xe: khung giờ giao nhận, thời
 * gian chết, tự động nhận chuyến, điều khoản. Bốn service khác đã phụ thuộc vào nó, nên nó nằm
 * đây thay vì được dựng lại ở từng spec. Dùng bản THẬT: nó chỉ cần prisma + audit + occupancy,
 * và chính hành vi của nó là thứ các spec giữ chỗ/yêu cầu thuê đang kiểm.
 */
export function makeVehicleSettingsService(prisma: PrismaService): VehicleSettingsService {
  return new VehicleSettingsService(prisma, new AuditService(prisma), new OccupancyService(prisma));
}

export function makeBranchesService(prisma: PrismaService): BranchesService {
  const audit = new AuditService(prisma);
  return new BranchesService(
    prisma,
    new ProvincesService(prisma, audit),
    new ListingsService(prisma),
    audit,
    makeDisabledGeoService(prisma),
  );
}

/**
 * `GeoService` với nhà cung cấp CHƯA CẤU HÌNH — đúng thứ spec cần.
 *
 * Test tích hợp không được gọi ra Internet: nó sẽ chậm, sẽ đỏ khi mất mạng, và sẽ đốt hạn mức
 * tính tiền của bản đồ mỗi lần CI chạy. Provider "chưa cấu hình" khiến `geo.enabled = false`,
 * nên `BranchesService` bỏ qua bước tra toạ độ — đúng nhánh mà production cũng chạy khi chưa
 * cấu hình key.
 */
export function makeDisabledGeoService(prisma: PrismaService): GeoService {
  return new GeoService(prisma, new GeoNotConfiguredProvider());
}

/**
 * `overrides.listings` tồn tại vì vài spec `jest.spyOn` chính instance `ListingsService` của
 * chúng để mô phỏng lỗi giữa transaction. Nếu factory luôn tự dựng instance riêng, spy sẽ gắn
 * vào một đối tượng KHÁC với đối tượng service thật gọi — test xanh/đỏ vì lý do sai.
 */
/**
 * BillingService — mọc thêm NotificationService (R2: kích hoạt gói khi tiền về phát thông báo).
 * Notification chỉ cần prisma nên dùng bản THẬT, không mock — cùng lý do ghi ở đầu file.
 */
export function makeBillingService(prisma: PrismaService): BillingService {
  return new BillingService(
    prisma,
    new AuditService(prisma),
    new NotificationService(prisma),
    // R3: gán/huỷ gói kéo theo đồng bộ chế độ thu phí lên listing (ADR 0024 ràng buộc 2).
    new ListingsService(prisma),
    // ConfigService trần đọc process.env — spec không đặt SEPAY_* nên paymentInfo trả "chưa cấu hình", đúng mặc định dev.
    new ConfigService(),
  );
}

/**
 * `BookingHoldsService` (R3) — writer của `booking_holds`. Dùng service THẬT ở mọi mắt xích:
 * spec giữ chỗ kiểm đúng đường tiền mà production chạy, kể cả bước tạo đơn khi tiền về.
 */
export function makeBookingHoldsService(prisma: PrismaService): BookingHoldsService {
  const audit = new AuditService(prisma);
  const notifications = new NotificationService(prisma);
  return new BookingHoldsService(
    prisma,
    makeBookingsService(prisma),
    new OccupancyService(prisma),
    makeVehicleSettingsService(prisma),
    new HoldSettlementService(prisma, audit, notifications),
    makeBillingService(prisma),
    audit,
    notifications,
  );
}

/**
 * `BookingRequestsService` — mười dependency, dựng tay ở sáu spec. `phoneVerification`/`auth`
 * là hai chỗ spec BẮT BUỘC thay bằng stub (không đi qua OTP/đăng nhập thật), nên chúng là tham
 * số; phần còn lại factory tự lo.
 */
export function makeBookingRequestsService(
  prisma: PrismaService,
  stubs: {
    phoneVerification: ConstructorParameters<typeof BookingRequestsService>[4];
    auth: ConstructorParameters<typeof BookingRequestsService>[5];
    bookings?: BookingsService;
    audit?: AuditService;
    notifications?: NotificationService;
    occupancy?: OccupancyService;
    pricing?: PricingService;
    customers?: CustomersService;
    settings?: VehicleSettingsService;
  },
): BookingRequestsService {
  const audit = stubs.audit ?? new AuditService(prisma);
  const notifications = stubs.notifications ?? new NotificationService(prisma);
  return new BookingRequestsService(
    prisma,
    stubs.bookings ?? makeBookingsService(prisma),
    audit,
    notifications,
    stubs.phoneVerification,
    stubs.auth,
    stubs.occupancy ?? new OccupancyService(prisma),
    stubs.pricing ?? makePricingService(prisma),
    stubs.customers ?? new CustomersService(prisma, audit),
    makeBookingHoldsService(prisma),
    stubs.settings ?? makeVehicleSettingsService(prisma),
  );
}

/**
 * `PricingService` — mọc thêm hai dependency ở R3 (`BillingService`, `FeePoliciesService`) để
 * báo giá gắn được phụ phí phía khách theo ADR 0029. Đúng ca mà factory này sinh ra để giải:
 * hơn mười spec dựng nó bằng tay.
 *
 * `overrides.listings` giữ nguyên lý do cũ — vài spec `jest.spyOn` chính instance đó.
 */
export function makePricingService(
  prisma: PrismaService,
  overrides: { listings?: ListingsService } = {},
): PricingService {
  return new PricingService(
    prisma,
    new AuditService(prisma),
    overrides.listings ?? new ListingsService(prisma),
    makeBillingService(prisma),
    new FeePoliciesService(prisma, new AuditService(prisma)),
  );
}

/**
 * `BookingsService` — mọc thêm `HoldSettlementService` ở R3: đơn kết thúc/huỷ là lúc chốt kết
 * cục khoản giữ chỗ (ADR 0028 điều 6). Service thật, không mock: nó chỉ cần prisma + audit +
 * notification, và spec nào không có hold thì hook tự thoát ở câu `findFirst` đầu tiên.
 */
export function makeBookingsService(
  prisma: PrismaService,
  overrides: {
    occupancy?: OccupancyService;
    audit?: AuditService;
    notifications?: NotificationService;
    customers?: CustomersService;
    settings?: VehicleSettingsService;
  } = {},
): BookingsService {
  const audit = overrides.audit ?? new AuditService(prisma);
  const notifications = overrides.notifications ?? new NotificationService(prisma);
  return new BookingsService(
    prisma,
    overrides.occupancy ?? new OccupancyService(prisma),
    audit,
    notifications,
    new DriversService(prisma, audit),
    overrides.customers ?? new CustomersService(prisma, audit),
    new HoldSettlementService(prisma, audit, notifications),
    overrides.settings ?? makeVehicleSettingsService(prisma),
  );
}

export function makeVehiclesService(
  prisma: PrismaService,
  overrides: { listings?: ListingsService } = {},
): VehiclesService {
  const audit = new AuditService(prisma);
  return new VehiclesService(
    prisma,
    audit,
    overrides.listings ?? new ListingsService(prisma),
    makeBranchesService(prisma),
    makeBillingService(prisma),
    new CatalogService(prisma, audit),
    new CatalogModelService(prisma, audit),
    makePricingService(prisma),
  );
}

/**
 * `TenantsService` — dựng ở hai spec, và nó vừa mọc thêm dependency thứ năm (`BillingService`,
 * để `registerShop` gán gói mặc định — ADR 0015 điều 9). Đúng ca mà factory này sinh ra để giải.
 */
export function makeTenantsService(prisma: PrismaService): TenantsService {
  const audit = new AuditService(prisma);
  return new TenantsService(
    prisma,
    audit,
    new ProvincesService(prisma, audit),
    makeBranchesService(prisma),
    makeBillingService(prisma),
  );
}

export function makePublicListingsService(prisma: PrismaService): PublicListingsService {
  const audit = new AuditService(prisma);
  return new PublicListingsService(
    prisma,
    new ProvincesService(prisma, audit),
    makePricingService(prisma),
    makeVehicleSettingsService(prisma),
  );
}

export function makeProvincesService(prisma: PrismaService): ProvincesService {
  return new ProvincesService(prisma, new AuditService(prisma));
}

/**
 * Chi nhánh mặc định cho một tenant trong spec — xe BẮT BUỘC thuộc một chi nhánh.
 *
 * Ghi thẳng bằng Prisma (không qua service) vì spec cần dựng tiền đề, không phải kiểm đường
 * tạo chi nhánh; các spec về chi nhánh thì gọi service thật.
 *
 * `provinceCode` mặc định `79` (Hồ Chí Minh) — có sẵn trong MỌI database sau migration danh mục
 * tỉnh, nên spec không phải tự seed dữ liệu tham chiếu.
 */
/**
 * Bọc `vehicles.create` để spec không phải tự dựng chi nhánh cho từng tenant.
 *
 * Xe BẮT BUỘC có `branchId` từ wave này. Hàng chục spec tạo xe chỉ để có dữ liệu thử nghiệm cho
 * chuyện khác (bàn giao, giấy tờ, bảo dưỡng…) — bắt mỗi spec tự seed chi nhánh là chép cùng một
 * đoạn hơn mười lần. Chi nhánh tạo LƯỜI theo tenant và nhớ lại trong map, nên nhiều xe cùng một
 * gian hàng vẫn dùng chung một chi nhánh, đúng như thực tế.
 */
export function vehicleCreator(
  vehicles: VehiclesService,
  prisma: PrismaService,
): (
  tenantId: string,
  userId: string,
  dto: Omit<Parameters<VehiclesService['create']>[2], 'branchId'>,
) => ReturnType<VehiclesService['create']> {
  const byTenant = new Map<string, string>();
  return async (tenantId, userId, dto) => {
    let branchId = byTenant.get(tenantId);
    if (!branchId) {
      const existing = await prisma.tenantBranch.findFirst({
        where: { tenantId, deletedAt: null, isDefault: true },
        select: { id: true },
      });
      branchId = existing?.id ?? (await seedBranch(prisma, { tenantId }));
      byTenant.set(tenantId, branchId);
    }
    return vehicles.create(tenantId, userId, { ...dto, branchId });
  };
}

/**
 * Tỉnh RIÊNG của một spec, để dữ liệu spec này không lẫn vào kết quả tìm kiếm của spec khác.
 *
 * Trước wave chi nhánh, các spec cô lập nhau bằng cách bịa một TÊN tỉnh độc nhất rồi lọc theo
 * tên. Giờ lọc chạy bằng MÃ, nên cách cô lập cũng phải là mã: mỗi spec dùng một mã ngoài danh
 * mục chính thức (`Z1`, `Z2`…) — không đụng 34 mã thật, và `upsert` nên chạy lại sau một lần
 * test bị ngắt vẫn sạch.
 */
export async function seedProvince(
  prisma: PrismaService,
  code: string,
  name: string,
): Promise<string> {
  await prisma.province.upsert({
    where: { code },
    update: { name, isEnabled: true, isPublicVisible: true },
    create: {
      code,
      name,
      administrativeType: 'province',
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      isEnabled: true,
      isPublicVisible: true,
      sortOrder: 900,
    },
  });
  return code;
}

export async function seedBranch(
  prisma: PrismaService,
  input: { tenantId: string; provinceCode?: string; isDefault?: boolean; status?: string },
): Promise<string> {
  const id = newId();
  await prisma.tenantBranch.create({
    data: {
      id,
      tenantId: input.tenantId,
      code: `CN${id.slice(-4)}`,
      name: 'Chi nhánh test',
      provinceCode: input.provinceCode ?? '79',
      isDefault: input.isDefault ?? true,
      status: input.status ?? BRANCH_STATUS.ACTIVE,
    },
  });
  return id;
}
