import { newId } from '@xeprime/prisma';
import { BRANCH_STATUS } from '@xeprime/types';
import { AuditService } from '../../src/modules/audit/audit.service';
import { BillingService } from '../../src/modules/billing/billing.service';
import { BranchesService } from '../../src/modules/branches/branches.service';
import { CatalogService } from '../../src/modules/catalog/catalog.service';
import { ProvincesService } from '../../src/modules/locations/provinces.service';
import { ListingsService } from '../../src/modules/public-listings/listings.service';
import { PublicListingsService } from '../../src/modules/public-listings/public-listings.service';
import { PricingService } from '../../src/modules/pricing/pricing.service';
import { VehiclesService } from '../../src/modules/vehicles/vehicles.service';
import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Dựng service cho spec tích hợp (chạy trên PostgreSQL thật, không có Nest DI container).
 *
 * Vì sao gom vào đây: `VehiclesService` có 7 dependency và được dựng tay ở hơn mười spec. Mỗi
 * lần thêm một dependency là sửa hơn mười file — lần này là `BranchesService`. Một factory dùng
 * chung khiến thay đổi đó thành MỘT dòng, và không spec nào bị bỏ sót một cách âm thầm.
 */
export function makeBranchesService(prisma: PrismaService): BranchesService {
  const audit = new AuditService(prisma);
  return new BranchesService(
    prisma,
    new ProvincesService(prisma, audit),
    new ListingsService(prisma),
    audit,
  );
}

/**
 * `overrides.listings` tồn tại vì vài spec `jest.spyOn` chính instance `ListingsService` của
 * chúng để mô phỏng lỗi giữa transaction. Nếu factory luôn tự dựng instance riêng, spy sẽ gắn
 * vào một đối tượng KHÁC với đối tượng service thật gọi — test xanh/đỏ vì lý do sai.
 */
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
    new BillingService(prisma, audit),
    new CatalogService(prisma, audit),
    new PricingService(prisma, audit, new ListingsService(prisma)),
  );
}

export function makePublicListingsService(prisma: PrismaService): PublicListingsService {
  const audit = new AuditService(prisma);
  return new PublicListingsService(
    prisma,
    new ProvincesService(prisma, audit),
    new PricingService(prisma, audit, new ListingsService(prisma)),
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
