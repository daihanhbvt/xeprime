/**
 * Seed dữ liệu demo cho 3 scope: platform admin / shop owner / customer.
 *
 * Idempotent: chạy nhiều lần không nhân bản dữ liệu. Chạy lại sau khi sửa seed là thao
 * tác thường xuyên lúc dev, nên seed phải chịu được điều đó.
 *
 * Chạy: pnpm db:seed
 */
import {
  BOOKING_STATUS,
  DEFAULT_PLATFORM_ROLE_PERMISSIONS,
  DEFAULT_TENANT_ROLE_PERMISSIONS,
  MEMBERSHIP_STATUS,
  OCCUPANCY_SOURCE_TYPE,
  PERMISSION_VALUES,
  PLATFORM_ROLE,
  PLATFORM_ROLE_LABEL,
  SCOPE,
  SERVICE_TYPE,
  TENANT_ROLE,
  TENANT_ROLE_LABEL,
  TENANT_STATUS,
  USER_STATUS,
  VEHICLE_OPERATION_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
  type Permission,
} from '@xeprime/types';
import { ulid } from 'ulid';
import { createPrismaClient } from './index';

// Prisma 7: client cần driver adapter (ADR 0001). Chạy qua `dotenv -e ../.env` nên
// DATABASE_URL đã có trong env.
const prisma = createPrismaClient();

/** Mốc thời gian cố định để seed cho ra lịch giống nhau mỗi lần chạy. */
const TODAY = new Date();
TODAY.setUTCHours(0, 0, 0, 0);

function daysFromToday(days: number, hourUtc = 3): Date {
  const d = new Date(TODAY);
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d;
}

async function seedPermissions(): Promise<Map<Permission, string>> {
  const byKey = new Map<Permission, string>();

  for (const key of PERMISSION_VALUES) {
    const [module = 'core'] = key.split('.');
    const row = await prisma.permission.upsert({
      where: { key },
      update: {},
      create: {
        id: ulid(),
        key,
        name: key,
        module: key.startsWith('platform.') ? 'platform' : module,
        scope: key.startsWith('platform.') ? SCOPE.PLATFORM : SCOPE.TENANT,
      },
      select: { id: true },
    });
    byKey.set(key, row.id);
  }

  console.log(`  permissions: ${byKey.size}`);
  return byKey;
}

async function seedSystemRole(
  scope: string,
  key: string,
  name: string,
  permissions: readonly Permission[],
  permissionIds: Map<Permission, string>,
): Promise<string> {
  const existing = await prisma.role.findFirst({
    where: { scope, key, tenantId: null },
    select: { id: true },
  });

  const roleId =
    existing?.id ??
    (
      await prisma.role.create({
        data: { id: ulid(), scope, key, name, isSystem: true, tenantId: null },
        select: { id: true },
      })
    ).id;

  // Ghi đè toàn bộ quyền của role hệ thống: seed là nguồn sự thật cho chúng, và xoá một
  // quyền khỏi DEFAULT_* phải thực sự thu hồi được.
  await prisma.rolePermission.deleteMany({ where: { roleId } });
  await prisma.rolePermission.createMany({
    data: permissions
      .map((p) => permissionIds.get(p))
      .filter((id): id is string => Boolean(id))
      .map((permissionId) => ({ roleId, permissionId })),
    skipDuplicates: true,
  });

  return roleId;
}

async function upsertUser(input: {
  providerUserId: string;
  email: string;
  displayName: string;
  phoneVerified: boolean;
}): Promise<string> {
  const identity = await prisma.userIdentity.findUnique({
    where: {
      provider_providerUserId: { provider: 'mock', providerUserId: input.providerUserId },
    },
    select: { userId: true },
  });

  if (identity) return identity.userId;

  const userId = ulid();
  await prisma.$transaction(async (tx) => {
    await tx.user.create({
      data: {
        id: userId,
        email: input.email,
        emailVerifiedAt: new Date(),
        displayName: input.displayName,
        phoneVerifiedAt: input.phoneVerified ? new Date() : null,
        status: USER_STATUS.ACTIVE,
      },
    });
    await tx.userIdentity.create({
      data: {
        id: ulid(),
        userId,
        provider: 'mock',
        providerUserId: input.providerUserId,
        providerEmail: input.email,
      },
    });
  });

  return userId;
}

const DEMO_VEHICLES = [
  { code: 'XE-001', name: 'Toyota Vios 2022', plate: '51H-123.45', type: VEHICLE_TYPE.CAR, seats: 5, brand: 'Toyota', model: 'Vios', weekday: 650_000, weekend: 800_000 },
  { code: 'XE-002', name: 'Honda City 2021', plate: '51H-234.56', type: VEHICLE_TYPE.CAR, seats: 5, brand: 'Honda', model: 'City', weekday: 700_000, weekend: 850_000 },
  { code: 'XE-003', name: 'Mazda CX-5 2023', plate: '51H-345.67', type: VEHICLE_TYPE.CAR, seats: 5, brand: 'Mazda', model: 'CX-5', weekday: 1_100_000, weekend: 1_300_000 },
  { code: 'XE-004', name: 'Kia Carnival 2022', plate: '51H-456.78', type: VEHICLE_TYPE.CAR, seats: 7, brand: 'Kia', model: 'Carnival', weekday: 1_600_000, weekend: 1_900_000 },
  { code: 'XE-005', name: 'Ford Ranger 2021', plate: '51C-567.89', type: VEHICLE_TYPE.CAR, seats: 5, brand: 'Ford', model: 'Ranger', weekday: 1_200_000, weekend: 1_400_000 },
  { code: 'XM-001', name: 'Honda Vision 2023', plate: '59X1-111.22', type: VEHICLE_TYPE.MOTORBIKE, seats: 2, brand: 'Honda', model: 'Vision', weekday: 130_000, weekend: 160_000 },
  { code: 'XM-002', name: 'Yamaha Janus 2022', plate: '59X1-222.33', type: VEHICLE_TYPE.MOTORBIKE, seats: 2, brand: 'Yamaha', model: 'Janus', weekday: 120_000, weekend: 150_000 },
  { code: 'XM-003', name: 'Honda SH 150i 2023', plate: '59X1-333.44', type: VEHICLE_TYPE.MOTORBIKE, seats: 2, brand: 'Honda', model: 'SH 150i', weekday: 300_000, weekend: 350_000 },
] as const;

/** Đơn demo: đủ để màn lịch có event ngắn, event dài và event vắt qua hôm nay. */
const DEMO_BOOKINGS = [
  { vehicleCode: 'XE-001', customer: 'Nguyễn Văn An', phone: '0901234567', from: -2, to: 1, status: BOOKING_STATUS.ACTIVE },
  { vehicleCode: 'XE-002', customer: 'Trần Thị Bình', phone: '0912345678', from: 1, to: 4, status: BOOKING_STATUS.CONFIRMED },
  { vehicleCode: 'XE-003', customer: 'Lê Minh Cường', phone: '0923456789', from: 3, to: 10, status: BOOKING_STATUS.RESERVED },
  { vehicleCode: 'XE-004', customer: 'Phạm Thu Dung', phone: '0934567890', from: -8, to: -5, status: BOOKING_STATUS.COMPLETED },
  { vehicleCode: 'XM-001', customer: 'Hoàng Văn Em', phone: '0945678901', from: 0, to: 2, status: BOOKING_STATUS.ACTIVE },
  { vehicleCode: 'XM-003', customer: 'Vũ Thị Giang', phone: '0956789012', from: 5, to: 6, status: BOOKING_STATUS.RESERVED },
] as const;

/** ADR 0006: trạng thái nào giữ chỗ trên lịch. */
const OCCUPYING: readonly string[] = [
  BOOKING_STATUS.RESERVED,
  BOOKING_STATUS.CONFIRMED,
  BOOKING_STATUS.ACTIVE,
];

async function main(): Promise<void> {
  console.log('Seeding XePrime...');

  const permissionIds = await seedPermissions();

  for (const roleKey of Object.values(TENANT_ROLE)) {
    await seedSystemRole(
      SCOPE.TENANT,
      roleKey,
      TENANT_ROLE_LABEL[roleKey],
      DEFAULT_TENANT_ROLE_PERMISSIONS[roleKey],
      permissionIds,
    );
  }
  for (const roleKey of Object.values(PLATFORM_ROLE)) {
    await seedSystemRole(
      SCOPE.PLATFORM,
      roleKey,
      PLATFORM_ROLE_LABEL[roleKey],
      DEFAULT_PLATFORM_ROLE_PERMISSIONS[roleKey],
      permissionIds,
    );
  }
  console.log('  roles hệ thống: xong');

  const adminUserId = await upsertUser({
    providerUserId: 'demo-admin',
    email: 'admin@xeprime.test',
    displayName: 'Platform Admin Demo',
    phoneVerified: true,
  });
  const ownerUserId = await upsertUser({
    providerUserId: 'demo-owner',
    email: 'owner@xeprime.test',
    displayName: 'Chủ shop demo',
    phoneVerified: true,
  });
  // Khách thuê demo: tạo user để đăng nhập được, chưa gắn membership nào (đúng luồng —
  // khách không thuộc tenant). Không giữ id vì Phase 0 chưa có booking gắn customer_user.
  await upsertUser({
    providerUserId: 'demo-customer',
    email: 'customer@xeprime.test',
    displayName: 'Khách thuê demo',
    phoneVerified: false,
  });
  console.log('  users: 3');

  await prisma.platformMembership.upsert({
    where: {
      userId_roleKey: { userId: adminUserId, roleKey: PLATFORM_ROLE.PLATFORM_ADMIN },
    },
    update: { status: MEMBERSHIP_STATUS.ACTIVE },
    create: {
      id: ulid(),
      userId: adminUserId,
      roleKey: PLATFORM_ROLE.PLATFORM_ADMIN,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
  });

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'xeprime-demo' },
    update: {},
    create: {
      id: ulid(),
      code: 'DEMO-001',
      slug: 'xeprime-demo',
      name: 'Gian hàng Demo XePrime',
      tenantType: 'business',
      status: TENANT_STATUS.ACTIVE,
      ownerUserId,
      phone: '0900000000',
      email: 'shop@xeprime.test',
    },
    select: { id: true },
  });

  await prisma.tenantMembership.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: ownerUserId } },
    update: { status: MEMBERSHIP_STATUS.ACTIVE },
    create: {
      id: ulid(),
      tenantId: tenant.id,
      userId: ownerUserId,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
      joinedAt: new Date(),
    },
  });
  console.log('  tenant active + membership owner: xong');

  const vehicleIdByCode = new Map<string, string>();
  for (const v of DEMO_VEHICLES) {
    const row = await prisma.vehicle.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: v.code } },
      update: {},
      create: {
        id: ulid(),
        tenantId: tenant.id,
        code: v.code,
        name: v.name,
        plateNumber: v.plate,
        vehicleType: v.type,
        serviceType: SERVICE_TYPE.SELF_DRIVE,
        brand: v.brand,
        model: v.model,
        seatCount: v.seats,
        operationStatus: VEHICLE_OPERATION_STATUS.AVAILABLE,
        // Cố ý KHÔNG seed `approved_public`: chỉ ApprovalService mới được đặt trạng thái
        // đó (CLAUDE.md mục 5). Seed ra xe đã duyệt sẽ che mất luồng duyệt khi test.
        publicStatus: VEHICLE_PUBLIC_STATUS.DRAFT,
        weekdayPrice: v.weekday,
        weekendPrice: v.weekend,
        createdBy: ownerUserId,
      },
      select: { id: true },
    });
    vehicleIdByCode.set(v.code, row.id);
  }
  console.log(`  vehicles: ${vehicleIdByCode.size}`);

  let bookingCount = 0;
  for (const [i, b] of DEMO_BOOKINGS.entries()) {
    const vehicleId = vehicleIdByCode.get(b.vehicleCode);
    if (!vehicleId) continue;

    const code = `DH${String(i + 1).padStart(4, '0')}`;
    const pickupAt = daysFromToday(b.from, 3);
    const returnAt = daysFromToday(b.to, 5);

    const existing = await prisma.booking.findUnique({
      where: { tenantId_code: { tenantId: tenant.id, code } },
      select: { id: true },
    });
    if (existing) continue;

    const bookingId = ulid();
    const days = Math.max(1, b.to - b.from);
    const vehicle = DEMO_VEHICLES.find((v) => v.code === b.vehicleCode);
    const total = (vehicle?.weekday ?? 0) * days;

    // Booking và occupancy phải cùng transaction — ADR 0006.
    await prisma.$transaction(async (tx) => {
      await tx.booking.create({
        data: {
          id: bookingId,
          tenantId: tenant.id,
          vehicleId,
          code,
          customerName: b.customer,
          customerPhone: b.phone,
          status: b.status,
          serviceType: SERVICE_TYPE.SELF_DRIVE,
          pickupAt,
          returnAt,
          baseAmount: total,
          totalAmount: total,
          paidAmount: b.status === BOOKING_STATUS.COMPLETED ? total : 0,
          createdBy: ownerUserId,
        },
      });

      if (OCCUPYING.includes(b.status)) {
        await tx.vehicleOccupancy.create({
          data: {
            id: ulid(),
            tenantId: tenant.id,
            vehicleId,
            sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING,
            sourceId: bookingId,
            startAt: pickupAt,
            endAt: returnAt,
          },
        });
      }
    });
    bookingCount += 1;
  }
  console.log(`  bookings: ${bookingCount}`);

  // Một lịch bảo dưỡng, để màn lịch có event không phải booking và để chứng minh
  // exclusion constraint chặn được xung đột GIỮA các nguồn khác nhau.
  const maintenanceVehicleId = vehicleIdByCode.get('XE-005');
  if (maintenanceVehicleId) {
    const sourceId = ulid();
    const already = await prisma.vehicleOccupancy.findFirst({
      where: { vehicleId: maintenanceVehicleId, sourceType: OCCUPANCY_SOURCE_TYPE.MAINTENANCE },
      select: { id: true },
    });
    if (!already) {
      await prisma.vehicleOccupancy.create({
        data: {
          id: ulid(),
          tenantId: tenant.id,
          vehicleId: maintenanceVehicleId,
          sourceType: OCCUPANCY_SOURCE_TYPE.MAINTENANCE,
          sourceId,
          startAt: daysFromToday(2, 1),
          endAt: daysFromToday(4, 10),
        },
      });
      console.log('  maintenance block: 1');
    }
  }

  console.log('\nSeed xong. Đăng nhập bằng mock token (AUTH_MODE=mock):');
  console.log('  platform admin : mock:demo-admin:admin@xeprime.test:Platform Admin Demo');
  console.log('  shop owner     : mock:demo-owner:owner@xeprime.test:Chủ shop demo');
  console.log('  customer       : mock:demo-customer:customer@xeprime.test:Khách thuê demo');
  console.log('\n  curl -i -X POST localhost:4000/auth/session \\');
  console.log('    -H "content-type: application/json" \\');
  console.log('    -d \'{"idToken":"mock:demo-owner:owner@xeprime.test:Chủ shop demo"}\'');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err: unknown) => {
    console.error('Seed thất bại:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
