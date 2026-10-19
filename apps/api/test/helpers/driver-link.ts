import { newId } from '@xeprime/prisma';
import { DRIVER_LINK_STATUS } from '@xeprime/types';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { customerAccountFor } from './customer-account';

/**
 * Tài xế là một LIÊN KẾT giữa bên thuê và một tài khoản KHÁCH (ADR 0063). Spec cần "một tài xế
 * đang liên kết" dựng bằng hàm này: tạo (hoặc tái dùng theo SĐT) tài khoản khách đã xác minh, rồi
 * ghi thẳng dòng `drivers` ở trạng thái mong muốn — bỏ qua vòng mời/đồng ý khi spec không kiểm nó.
 *
 * Tài khoản tạo ra được ghi nhớ; spec gọi `cleanupDriverAccounts` ở `afterAll` (SAU khi đã xoá
 * booking của mình) — `drivers.user_id` là RESTRICT nên liên kết phải đi trước tài khoản.
 */
const createdUserIds = new Set<string>();

export function randomDriverPhone(): string {
  return `09${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
}

export async function seedDriverLink(
  prisma: PrismaService,
  opts: { tenantId: string; name?: string; phone?: string; linkStatus?: string },
): Promise<{ driverId: string; userId: string }> {
  const phone = opts.phone ?? randomDriverPhone();
  const name = opts.name ?? 'Tài xế thử nghiệm';
  const userId = await customerAccountFor(prisma, phone, name);
  createdUserIds.add(userId);
  const driverId = newId();
  const linkStatus = opts.linkStatus ?? DRIVER_LINK_STATUS.ACTIVE;
  await prisma.driver.create({
    data: {
      id: driverId,
      tenantId: opts.tenantId,
      userId,
      name,
      phone: (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).phone ?? phone,
      linkStatus,
      ...(linkStatus !== DRIVER_LINK_STATUS.INVITED ? { respondedAt: new Date() } : {}),
    },
  });
  return { driverId, userId };
}

/** Ghi nhớ một tài khoản khách spec tự dựng (ngoài `seedDriverLink`) để dọn chung. */
export function trackDriverAccount(userId: string): void {
  createdUserIds.add(userId);
}

export async function cleanupDriverAccounts(prisma: PrismaService): Promise<void> {
  const ids = [...createdUserIds];
  if (ids.length === 0) return;
  await prisma.driver.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  createdUserIds.clear();
}
