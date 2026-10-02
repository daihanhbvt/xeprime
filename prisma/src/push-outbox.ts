import { PUSH_DELIVERY_STATUS, pushClientAppForUrl } from '@xeprime/types';
import type { Prisma, PrismaClient } from '../generated/client';
import { newId } from './id';

/**
 * Xếp hàng đẩy một thông báo tới mọi THIẾT BỊ đang bật của người nhận.
 *
 * Vì sao nằm ở `@xeprime/prisma` chứ không ở `apps/api`: có HAI tiến trình phát thông báo —
 * API (sự kiện do người dùng gây ra) và worker (sự kiện theo đồng hồ: hạn phản hồi, hết hạn giữ
 * chỗ, vòng đời gói). Worker cố ý không kéo runtime Nest vào (xem `apps/worker/src/lib/notify.ts`),
 * nên nó không dùng lại được `NotificationService`. Bản sao thứ hai của đoạn này sẽ trôi khỏi
 * bản gốc đúng vào lúc nguy hiểm nhất — một bên quên lọc `enabled`, và thiết bị đã gỡ app vẫn
 * được xếp hàng gửi mãi mãi.
 *
 * Cái KHÔNG nằm ở đây: quyết định "có bật push không" (`PUSH_ENABLED` là env của từng tiến
 * trình, và package dùng chung không đọc `process.env`) và việc GỬI (worker làm, sau khi
 * transaction nghiệp vụ đã commit).
 */

/** Một thông báo vừa ghi: id của nó và người sẽ nhận. */
export interface PushRecipientNotification {
  notificationId: string;
  userId: string;
  /**
   * Deep link đã đóng băng vào `data_json` của dòng thông báo (nếu có). Nó quyết định APP nhận
   * đẩy: `/manage/**` → XePrime Partner, còn lại → XePrime. Thiết bị của app hợp nhất cũ
   * (`client_app IS NULL`) nhận mọi audience nên không phụ thuộc trường này.
   */
  url?: string | null;
}

export interface EnqueuePushOptions {
  /**
   * Hạn CHÓT gửi. Quá mốc này worker bỏ qua thay vì gửi muộn — "yêu cầu sắp hết hạn" nảy lên
   * sau khi yêu cầu đã đóng là một thông báo SAI, không phải một thông báo trễ.
   */
  expiresAt?: Date | null;
}

type Client = PrismaClient | Prisma.TransactionClient;

/**
 * Trả về số dòng giao vận đã tạo. Người nhận không có thiết bị nào ⇒ 0, và đó là đường đi bình
 * thường: thông báo in-app vẫn tồn tại đầy đủ, chỉ là không có máy nào để rung.
 *
 * `skipDuplicates` dựa lưng vào unique `(notification_id, push_device_id)` — nghiệp vụ thử lại
 * một transaction không được biến thành hai lần rung máy.
 */
export async function enqueuePushDeliveries(
  db: Client,
  recipients: readonly PushRecipientNotification[],
  options: EnqueuePushOptions = {},
): Promise<number> {
  if (recipients.length === 0) return 0;

  const userIds = [...new Set(recipients.map((r) => r.userId))];
  const devices = await db.pushDevice.findMany({
    where: { userId: { in: userIds }, enabled: true },
    select: { id: true, userId: true, clientApp: true },
  });
  if (devices.length === 0) return 0;

  const byUser = new Map<string, { id: string; clientApp: string | null }[]>();
  for (const device of devices) {
    const list = byUser.get(device.userId);
    if (list) list.push(device);
    else byUser.set(device.userId, [device]);
  }

  const rows: Prisma.PushDeliveryCreateManyInput[] = [];
  for (const recipient of recipients) {
    // App đích theo deep link của CHÍNH thông báo này. Thiết bị `client_app` NULL là bản cài
    // app hợp nhất cũ — nó vẫn đăng ký cả hai bề mặt nên nhận mọi audience.
    const targetApp = pushClientAppForUrl(recipient.url);
    for (const device of byUser.get(recipient.userId) ?? []) {
      if (device.clientApp !== null && device.clientApp !== targetApp) continue;
      rows.push({
        id: newId(),
        notificationId: recipient.notificationId,
        pushDeviceId: device.id,
        status: PUSH_DELIVERY_STATUS.PENDING,
        expiresAt: options.expiresAt ?? null,
      });
    }
  }
  if (rows.length === 0) return 0;

  const created = await db.pushDelivery.createMany({ data: rows, skipDuplicates: true });
  return created.count;
}
