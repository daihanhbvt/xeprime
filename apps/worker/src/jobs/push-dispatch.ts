import type { PrismaClient } from '@xeprime/prisma';
import {
  PUSH_DELIVERY_STATUS,
  PUSH_ERROR_CODE,
  isPushPlatform,
  type NotificationType,
  type PushErrorCode,
} from '@xeprime/types';
import {
  androidChannelFor,
  pushCollapseKey,
  pushDataPayload,
  pushPriority,
} from '@xeprime/domain';
import { classifyPushError, firebaseSender, type PushSender } from '../lib/fcm';

const BATCH = 50;

/**
 * Số lần thử tối đa cho MỘT lượt giao. Tám lần với backoff mũ trần 5 phút ≈ nửa tiếng cố gắng —
 * quá mốc đó thì thông báo đã hết giá trị và vấn đề không nằm ở đường truyền.
 */
export const MAX_ATTEMPTS = 8;

/**
 * Một dòng nằm ở `processing` lâu hơn ngần này = tiến trình chiếm nó đã CHẾT, không phải đang gửi.
 *
 * Năm phút là bội số rộng rãi của một lời gọi FCM (vài trăm mili giây, timeout của SDK tính bằng
 * chục giây), nên không có nguy cơ thu hồi một dòng đang thật sự được gửi.
 */
const STUCK_AFTER_MS = 5 * 60 * 1000;

export interface PushDispatchResult {
  sent: number;
  retried: number;
  failed: number;
  expired: number;
  devicesDisabled: number;
  /** Dòng bị bỏ lại ở `processing` bởi một tiến trình đã chết, nay được trả về hàng đợi. */
  reclaimed: number;
}

/**
 * Đẩy các `push_deliveries` đã tới hạn — bước cuối của chuỗi
 * `sự kiện → notification → delivery → FCM`.
 *
 * ## Chiếm việc, không phải đọc rồi gửi
 *
 * Bước đầu là một `UPDATE … WHERE status IN ('pending','retry') … FOR UPDATE SKIP LOCKED` trả
 * về id. Không có nó thì hai worker (rolling deploy có đúng khoảnh khắc hai bản cùng chạy) đều
 * đọc thấy `pending` và người dùng nhận hai lần cùng một tin. Advisory lock ở `main.ts` là lớp
 * thứ hai, không phải lớp duy nhất: nó bảo vệ theo VÒNG LẶP, còn cái này bảo vệ theo HÀNG.
 *
 * `attempts` cũng tăng ngay ở bước chiếm, trước khi gọi mạng — và chính điều đó làm cho bước THU
 * HỒI ở đầu hàm an toàn. Worker bị SIGTERM giữa lô (mỗi lần merge vào `staging`/`main` là một lần
 * deploy) bỏ lại vài chục dòng mắc kẹt ở `processing`; không có ai trả chúng về hàng đợi thì đó
 * là mấy chục thông báo chết lặng, không log, không cảnh báo. Trả về `retry` thì chúng đi tiếp,
 * và `MAX_ATTEMPTS` vẫn chặn mọi vòng lặp vô hạn.
 *
 * `sender` chèn được để test bằng fake — job này không bao giờ gọi mạng thật trong spec.
 */
export async function dispatchPushDeliveries(
  prisma: PrismaClient,
  sender: PushSender = firebaseSender,
): Promise<PushDispatchResult> {
  const result: PushDispatchResult = {
    sent: 0,
    retried: 0,
    failed: 0,
    expired: 0,
    devicesDisabled: 0,
    reclaimed: 0,
  };

  // Trả về hàng đợi những dòng mà một tiến trình đã chết đang giữ. Chạy TRƯỚC bước chiếm để
  // chúng vào ngay lô này thay vì đợi thêm một nhịp.
  const reclaimed = await prisma.pushDelivery.updateMany({
    where: {
      status: PUSH_DELIVERY_STATUS.PROCESSING,
      updatedAt: { lt: new Date(Date.now() - STUCK_AFTER_MS) },
    },
    data: { status: PUSH_DELIVERY_STATUS.RETRY, nextAttemptAt: new Date() },
  });
  result.reclaimed = reclaimed.count;
  if (reclaimed.count > 0) {
    console.warn(
      `push: thu hồi ${reclaimed.count} dòng mắc kẹt ở processing (tiến trình trước bị dừng giữa chừng)`,
    );
  }

  const claimed = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE push_deliveries
       SET status = ${PUSH_DELIVERY_STATUS.PROCESSING},
           attempts = attempts + 1,
           updated_at = now()
     WHERE id IN (
       SELECT id
         FROM push_deliveries
        WHERE status IN (${PUSH_DELIVERY_STATUS.PENDING}, ${PUSH_DELIVERY_STATUS.RETRY})
          AND next_attempt_at <= now()
        ORDER BY next_attempt_at
        LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED
     )
    RETURNING id
  `;
  if (claimed.length === 0) return result;

  const rows = await prisma.pushDelivery.findMany({
    where: { id: { in: claimed.map((r) => r.id) } },
    select: {
      id: true,
      attempts: true,
      expiresAt: true,
      device: { select: { id: true, providerToken: true, platform: true, enabled: true } },
      notification: {
        select: { id: true, type: true, title: true, body: true, targetType: true, targetId: true, dataJson: true },
      },
    },
  });

  const now = new Date();

  for (const row of rows) {
    // Hết hạn TRƯỚC khi gửi: "yêu cầu sắp hết hạn" nảy lên sau khi yêu cầu đã đóng là một thông
    // báo SAI, không phải một thông báo trễ.
    if (row.expiresAt && row.expiresAt <= now) {
      await finish(prisma, row.id, PUSH_ERROR_CODE.EXPIRED);
      result.expired++;
      continue;
    }

    // Thiết bị bị tắt SAU khi delivery được xếp hàng (đăng xuất, gỡ app) — hàng đợi phải tôn
    // trọng điều đó, không phải chỉ thời điểm xếp hàng.
    if (!row.device.enabled || !isPushPlatform(row.device.platform)) {
      await finish(prisma, row.id, PUSH_ERROR_CODE.TOKEN_INVALID);
      result.failed++;
      continue;
    }

    const type = row.notification.type as NotificationType;
    const target = { targetType: row.notification.targetType, targetId: row.notification.targetId };

    try {
      const sendResult = await sender.send({
        token: row.device.providerToken,
        platform: row.device.platform,
        title: row.notification.title,
        body: row.notification.body,
        data: pushDataPayload({
          notificationId: row.notification.id,
          type,
          url: deepLinkOf(row.notification.dataJson),
        }),
        priority: pushPriority(type),
        androidChannelId: androidChannelFor(type),
        collapseKey: pushCollapseKey(type, target),
      });

      await prisma.pushDelivery.update({
        where: { id: row.id },
        data: {
          status: PUSH_DELIVERY_STATUS.SENT,
          sentAt: new Date(),
          providerMessageId: sendResult.messageId,
          lastErrorCode: null,
          lastErrorAt: null,
        },
      });
      result.sent++;
    } catch (error) {
      const verdict = classifyPushError(error);

      if (verdict.disableDevice) {
        // Token chết là chuyện của THIẾT BỊ, không của tin này: mọi delivery đang chờ cho máy đó
        // cũng vô nghĩa, và lần sau app mở lên sẽ đăng ký lại và bật nó lên.
        await prisma.pushDevice.updateMany({
          where: { id: row.device.id, enabled: true },
          data: { enabled: false, disabledAt: new Date() },
        });
        result.devicesDisabled++;
      }

      const giveUp = !verdict.retriable || row.attempts >= MAX_ATTEMPTS;
      if (giveUp) {
        await finish(
          prisma,
          row.id,
          row.attempts >= MAX_ATTEMPTS && verdict.retriable
            ? PUSH_ERROR_CODE.MAX_ATTEMPTS
            : verdict.code,
        );
        result.failed++;
      } else {
        await prisma.pushDelivery.update({
          where: { id: row.id },
          data: {
            status: PUSH_DELIVERY_STATUS.RETRY,
            nextAttemptAt: new Date(Date.now() + backoffMs(row.attempts)),
            lastErrorCode: verdict.code,
            lastErrorAt: new Date(),
          },
        });
        result.retried++;
      }

      // Log MÃ, không log lỗi gốc: message của FCM có nhánh chứa nguyên registration token.
      console.error(
        `push: delivery ${row.id} (notification ${row.notification.id}) lỗi ${verdict.code}, lần thử ${row.attempts}`,
      );
    }
  }

  return result;
}

async function finish(
  prisma: PrismaClient,
  deliveryId: string,
  code: PushErrorCode,
): Promise<void> {
  await prisma.pushDelivery.update({
    where: { id: deliveryId },
    data: {
      status: PUSH_DELIVERY_STATUS.FAILED,
      lastErrorCode: code,
      lastErrorAt: new Date(),
    },
  });
}

/**
 * Đích của thông báo, đọc từ `notifications.data_json`.
 *
 * KHÔNG giải lại từ `targetType` ở đây: cùng một `targetType: booking` dẫn tới `/trips/:id` hay
 * `/manage/bookings/:id` tuỳ người nhận đứng ở bề mặt nào, và chỉ nơi PHÁT mới biết điều đó
 * (`NotificationService.buildData` đóng băng nó lúc ghi). Worker chỉ thấy hàng trong DB.
 */
function deepLinkOf(dataJson: unknown): string | null {
  if (!dataJson || typeof dataJson !== 'object') return null;
  const url = (dataJson as { url?: unknown }).url;
  return typeof url === 'string' && url.startsWith('/') ? url : null;
}

/** Backoff mũ, trần 5 phút — cùng khuôn với `outbox-pump`, chỉ khác trần. */
function backoffMs(attempts: number): number {
  return Math.min(300_000, 1000 * 2 ** attempts);
}
