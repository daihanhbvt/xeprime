import { createPrismaClient } from '@xeprime/prisma';
import {
  ANDROID_NOTIFICATION_CHANNEL,
  NOTIFICATION_TYPE,
  PUSH_PRIORITY,
  PUSH_PROVIDER,
  isPushPlatform,
} from '@xeprime/types';
import { pushDataPayload } from '@xeprime/domain';
import { classifyPushError, firebaseSender, tokenTail } from '../lib/fcm';

/**
 * Gửi MỘT thông báo thử nghiệm tới thiết bị mới nhất của một người —
 * `pnpm push:smoke -- --user-email ai-do@vi-du.com`.
 *
 * Vì sao là script CLI chứ không phải một endpoint (cùng lý lẽ với `holidays:sync`, và mạnh hơn):
 * một endpoint "gửi thử" là một endpoint gửi thông báo tới máy người khác. Dù có gác quyền, nó
 * vẫn là một bề mặt tấn công tồn tại vĩnh viễn để phục vụ một thao tác làm vài lần trong đời
 * một môi trường. Script chạy từ máy đã có `DATABASE_URL` và credential Firebase — tức là đã có
 * mọi quyền rồi.
 *
 * Ba luật:
 *  1. **Từ chối production theo mặc định.** Người thật không phải là bãi thử.
 *  2. **Dùng ĐÚNG sender của production** (`firebaseSender`). Một đường gửi riêng cho việc thử
 *     nghiệm chỉ chứng minh rằng đường gửi riêng đó hoạt động.
 *  3. **Không in token.** Chỉ 6 ký tự đuôi, đủ để đối chiếu với máy đang cầm trên tay.
 *
 * KHÔNG ghi `notifications` và KHÔNG tạo `push_deliveries`: đây là một phép thử hạ tầng, không
 * phải một sự kiện nghiệp vụ, và nó không được để lại rác trong hộp thư của ai.
 */

const SMOKE = {
  title: 'XePrime',
  body: 'Thông báo thử nghiệm đã hoạt động',
  url: '/trips',
} as const;

interface Args {
  userEmail?: string;
  allowProduction: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { allowProduction: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--user-email' && next) {
      args.userEmail = next;
      i++;
    } else if (arg?.startsWith('--user-email=')) args.userEmail = arg.slice('--user-email='.length);
    else if (arg === '--allow-production') args.allowProduction = true;
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.userEmail) {
    console.error(
      'Thiếu --user-email.\n' +
        'Ví dụ: pnpm push:smoke -- --user-email khach.an@xeprime.test',
    );
    process.exitCode = 1;
    return;
  }

  /*
   * Cửa chặn production. `APP_ENV` là biến nói "đây là môi trường nào" (xem env.schema.ts của
   * API); mặc định của nó là `production`, giá trị NGHIÊM NGẶT nhất, nên một máy không khai gì
   * cũng bị chặn thay vì được cho qua.
   */
  const appEnv = (process.env.APP_ENV ?? 'production').toLowerCase();
  if (appEnv === 'production' && !args.allowProduction) {
    console.error(
      `APP_ENV=${appEnv} — script này từ chối chạy trên production.\n` +
        'Người dùng thật không phải là bãi thử. Chạy ở local/staging, hoặc thêm --allow-production ' +
        'nếu bạn thực sự đang thử trên máy của chính mình.',
    );
    process.exitCode = 1;
    return;
  }

  for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) {
    if (!process.env[key]) {
      console.error(
        `${key} chưa được đặt — không có credential để gọi FCM.\n` +
          'Xem docs/third-party-keys.md §Firebase Cloud Messaging.',
      );
      process.exitCode = 1;
      return;
    }
  }

  const prisma = createPrismaClient();
  try {
    const user = await prisma.user.findFirst({
      where: { email: args.userEmail },
      select: { id: true, displayName: true },
    });
    if (!user) {
      console.error(`Không tìm thấy tài khoản với email ${args.userEmail}.`);
      process.exitCode = 1;
      return;
    }

    // Thiết bị ĐANG BẬT, mới đăng ký/mở app gần đây nhất — đúng máy người thử đang cầm.
    const device = await prisma.pushDevice.findFirst({
      where: { userId: user.id, enabled: true },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        id: true,
        provider: true,
        providerToken: true,
        platform: true,
        deviceName: true,
        lastSeenAt: true,
      },
    });
    if (!device) {
      console.error(
        `${user.displayName} chưa có thiết bị nào đang bật.\n` +
          'Mở app native, đăng nhập, cho phép thông báo — app sẽ gọi POST /notifications/device-token.',
      );
      process.exitCode = 1;
      return;
    }
    if (device.provider !== PUSH_PROVIDER.FCM || !isPushPlatform(device.platform)) {
      console.error(`Thiết bị dùng provider/nền tảng không hỗ trợ: ${device.provider}/${device.platform}.`);
      process.exitCode = 1;
      return;
    }

    console.log(
      `Gửi tới: ${user.displayName} · ${device.platform} · ${device.deviceName ?? 'không tên'} · ` +
        `token ${tokenTail(device.providerToken)} · thấy lần cuối ${device.lastSeenAt.toISOString()}`,
    );

    const result = await firebaseSender.send({
      token: device.providerToken,
      platform: device.platform,
      title: SMOKE.title,
      body: SMOKE.body,
      /*
       * `notificationId` là id của THIẾT BỊ, không phải của một hàng `notifications` — không có
       * hàng nào cả. App chỉ dùng trường này để đối chiếu/khử trùng, và bịa một ULID ngẫu nhiên
       * thì người đọc log không tra ngược được gì.
       *
       * `type` là một loại CÓ THẬT chứ không phải `'test'`: app điều hướng theo `url`, nên loại
       * nào cũng chạy — và thêm một `NotificationType` chỉ tồn tại để thử là để nó nằm vĩnh
       * viễn trong bảng nhãn/icon của cả web lẫn app.
       */
      data: pushDataPayload({
        notificationId: device.id,
        type: NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED,
        url: SMOKE.url,
      }),
      priority: PUSH_PRIORITY.HIGH,
      androidChannelId: ANDROID_NOTIFICATION_CHANNEL.OPERATIONS,
      collapseKey: null,
    });

    console.log(`Đã gửi. messageId = ${result.messageId}`);
    console.log(
      'Kiểm tra trên máy: (1) app đang mở → toast; (2) app ở nền → thông báo trên khay; ' +
        `(3) bấm vào thông báo → app mở ${SMOKE.url}.`,
    );
  } catch (error) {
    const verdict = classifyPushError(error);
    // In MÃ, không in lỗi gốc: message của FCM có nhánh chứa nguyên registration token.
    console.error(`Gửi THẤT BẠI: ${verdict.code}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('push:smoke lỗi:', err);
  process.exit(1);
});
