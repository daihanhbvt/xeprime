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
import { WalletService } from '../../src/modules/wallet/wallet.service';
import { FirebaseAppService } from '../../src/modules/firebase/firebase-app.service';
import { NotificationService } from '../../src/modules/notification/notification.service';
import { BillingService } from '../../src/modules/billing/billing.service';
import { BranchesService } from '../../src/modules/branches/branches.service';
import { CatalogModelService } from '../../src/modules/catalog/catalog-model.service';
import { CatalogService } from '../../src/modules/catalog/catalog.service';
import { GeoNotConfiguredProvider } from '../../src/modules/geo/geo-provider';
import { GeoService } from '../../src/modules/geo/geo.service';
import { AddressService } from '../../src/modules/locations/address.service';
import { ProvincesService } from '../../src/modules/locations/provinces.service';
import { WardsService } from '../../src/modules/locations/wards.service';
import { ListingsService } from '../../src/modules/public-listings/listings.service';
import { PublicListingsService } from '../../src/modules/public-listings/public-listings.service';
import { DepositPolicyService } from '../../src/modules/deposit-policy/deposit-policy.service';
import { InsuranceReadService } from '../../src/modules/insurance/insurance-read.service';
import { InsuranceService } from '../../src/modules/insurance/insurance.service';
import { NoopInsurancePartner } from '../../src/modules/insurance/partner/noop-insurance.partner';
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

/**
 * `NotificationService` (10/09/2026) — mọc thêm `FirebaseAppService` để biết `PUSH_ENABLED`.
 *
 * Không dựng `FirebaseAppService` thật: nó đọc `ConfigService`, và spec nào cũng sẽ phải nhớ
 * đặt biến env chỉ để một cờ boolean trả về `false`. Ở đây cờ đó là một THAM SỐ tường minh, nên
 * spec bật push chỉ khi nó thật sự đang kiểm chuyện đẩy — mọi spec còn lại chạy như trước.
 */
export function makeNotificationService(
  prisma: PrismaService,
  opts: { pushEnabled?: boolean } = {},
): NotificationService {
  const firebase = { pushEnabled: opts.pushEnabled ?? false } as FirebaseAppService;
  return new NotificationService(prisma, firebase);
}

export function makeBranchesService(prisma: PrismaService): BranchesService {
  const audit = new AuditService(prisma);
  return new BranchesService(
    prisma,
    new ListingsService(prisma),
    audit,
    makeAddressService(prisma),
  );
}

/**
 * `AddressService` THẬT trên danh mục THẬT — bảng `provinces`/`wards` do migration nạp nên spec
 * nào cũng có đủ 34 tỉnh và 3.321 xã mà không phải seed gì thêm.
 *
 * Bản đồ thì TẮT (`makeDisabledGeoService`): kiểm luật "xã phải thuộc tỉnh" không liên quan gì
 * tới việc Google có trả lời hay không, và một spec gọi ra Internet là một spec sẽ đỏ khi mất
 * mạng.
 */
/** `WardsService` trên danh mục THẬT do migration nạp — không cần seed gì thêm. */
export function makeWardsService(prisma: PrismaService): WardsService {
  return new WardsService(prisma);
}

export function makeAddressService(prisma: PrismaService): AddressService {
  const audit = new AuditService(prisma);
  return new AddressService(
    new ProvincesService(prisma, audit),
    new WardsService(prisma),
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
    makeNotificationService(prisma),
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
  const notifications = makeNotificationService(prisma);
  return new BookingHoldsService(
    prisma,
    makeBookingsService(prisma),
    new OccupancyService(prisma),
    makeVehicleSettingsService(prisma),
    new HoldSettlementService(prisma, audit, notifications, new WalletService(prisma)),
    makeBillingService(prisma),
    audit,
    notifications,
    new InsuranceReadService(prisma),
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
  const notifications = stubs.notifications ?? makeNotificationService(prisma);
  return new BookingRequestsService(
    prisma,
    stubs.bookings ?? makeBookingsService(prisma),
    audit,
    notifications,
    stubs.phoneVerification,
    stubs.auth,
    stubs.occupancy ?? new OccupancyService(prisma),
    stubs.pricing ?? makePricingService(prisma),
    stubs.customers ?? makeCustomersService(prisma, audit),
    makeBookingHoldsService(prisma),
    stubs.settings ?? makeVehicleSettingsService(prisma),
    makeDepositPolicyService(prisma),
    makeAddressService(prisma),
  );
}

/**
 * `DepositPolicyService` (Phase 6) — service THẬT, không stub: nó chỉ đọc `tenant_subscriptions`
 * và `tenant_payment_settings`, và chính hai lượt đọc đó là thứ spec cần kiểm. Thay bằng stub là
 * kiểm một chính sách cọc không tồn tại trong production.
 */
export function makeDepositPolicyService(prisma: PrismaService): DepositPolicyService {
  return new DepositPolicyService(prisma, makeBillingService(prisma), new AuditService(prisma));
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
    makeDepositPolicyService(prisma),
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
    insurance?: InsuranceService;
  } = {},
): BookingsService {
  const audit = overrides.audit ?? new AuditService(prisma);
  const notifications = overrides.notifications ?? makeNotificationService(prisma);
  return new BookingsService(
    prisma,
    overrides.occupancy ?? new OccupancyService(prisma),
    audit,
    notifications,
    new DriversService(prisma, audit),
    overrides.customers ?? makeCustomersService(prisma, audit),
    new HoldSettlementService(prisma, audit, notifications, new WalletService(prisma)),
    overrides.settings ?? makeVehicleSettingsService(prisma),
    overrides.insurance ?? makeInsuranceService(prisma),
    makeAddressService(prisma),
  );
}

/**
 * `InsuranceService` với adapter NOOP — đúng bản chạy ở production hiện tại.
 *
 * Spec nào cần một đối tác "thành công" thì truyền fake riêng của nó (`overrides.insurance`).
 * Mặc định phải là noop: nếu mặc định là fake-thành-công thì mọi spec sẽ chạy trên một thế giới
 * có bảo hiểm hoạt động, trong khi production thì không — và cái khác nhau đó chính là thứ cần
 * được nhìn thấy.
 */
export function makeInsuranceService(prisma: PrismaService): InsuranceService {
  return new InsuranceService(prisma, new AuditService(prisma), new NoopInsurancePartner());
}

/** `CustomersService` — mọc thêm `AddressService` khi địa chỉ khách có cấu trúc (14/09/2026). */
export function makeCustomersService(prisma: PrismaService, audit: AuditService): CustomersService {
  return new CustomersService(prisma, audit, makeAddressService(prisma));
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
    makeAddressService(prisma),
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
