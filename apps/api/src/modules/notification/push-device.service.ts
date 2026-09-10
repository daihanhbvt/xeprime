import { Injectable } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import { PUSH_PROVIDER, type PushProvider } from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { FirebaseAppService } from '../firebase/firebase-app.service';
import type { PushDeviceDto, RegisterPushDeviceDto } from './dto/push-device.dto';

/**
 * Đăng ký thiết bị nhận thông báo đẩy.
 *
 * Ba bất biến của lớp này:
 *
 *  1. **Token không bao giờ rời khỏi đây** — không log, không message lỗi, không response. Ai
 *     cầm được registration token thì gửi được thông báo tới máy đó.
 *  2. **`userId`/`sessionId` đến từ phiên**, không từ body. Nhận chúng từ client nghĩa là bất kỳ
 *     ai cũng đăng ký được một thiết bị đứng tên người khác — và rồi nhận mọi thông báo của họ.
 *  3. **Gán lại chủ là NGUYÊN TỬ.** FCM cấp token cho một BẢN CÀI: máy đó đăng nhập tài khoản
 *     khác sẽ mang lại đúng token cũ. `upsert` trên unique `(provider, provider_token)` là thứ
 *     đảm bảo không tồn tại hai hàng cùng token — nếu có, người dùng TRƯỚC tiếp tục nhận thông
 *     báo trên máy của người SAU.
 */
@Injectable()
export class PushDeviceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly firebase: FirebaseAppService,
  ) {}

  async register(
    userId: string,
    sessionId: string,
    dto: RegisterPushDeviceDto,
  ): Promise<PushDeviceDto> {
    const provider: PushProvider = (dto.provider as PushProvider | undefined) ?? PUSH_PROVIDER.FCM;
    const nativeAuthSessionId = await this.resolveNativeSession(userId, sessionId);
    const now = new Date();

    const common = {
      userId,
      nativeAuthSessionId,
      platform: dto.platform,
      appVersion: dto.appVersion ?? null,
      deviceName: dto.deviceName ?? null,
      lastSeenAt: now,
    };

    /*
     * `upsert` chứ không phải "tìm rồi ghi": hai lời gọi song song (app khởi động lại đúng lúc
     * FCM xoay token) đều thấy "chưa có" và cùng INSERT — đúng một cái thắng, cái kia nổ P2002.
     * Ở đây Postgres tự phân xử bằng chính unique index.
     *
     * Cập nhật LUÔN bật lại thiết bị: đăng ký lại là hành động khẳng định "máy này đang dùng",
     * và một thiết bị bị tắt vì phiên cũ bị thu hồi phải sống lại sau khi đăng nhập lần nữa.
     */
    const device = await this.prisma.pushDevice.upsert({
      where: { provider_providerToken: { provider, providerToken: dto.token } },
      create: {
        id: newId(),
        provider,
        providerToken: dto.token,
        enabled: true,
        disabledAt: null,
        ...common,
      },
      update: { ...common, enabled: true, disabledAt: null },
      select: SELECT,
    });

    return this.toDto(device);
  }

  /**
   * Tắt thiết bị theo token — nhưng CHỈ khi nó thuộc về người đang gọi.
   *
   * `updateMany` với `userId` trong WHERE, không phải `findUnique` rồi kiểm: một token của
   * người khác đơn giản là không khớp dòng nào, nên nó không tắt được thiết bị của ai và cũng
   * không tiết lộ token đó có tồn tại hay không.
   */
  async disableByToken(userId: string, token: string): Promise<number> {
    const res = await this.prisma.pushDevice.updateMany({
      where: { userId, providerToken: token, enabled: true },
      data: { enabled: false, disabledAt: new Date() },
    });
    return res.count;
  }

  /** Tắt mọi thiết bị của PHIÊN hiện tại — đường đi của nút đăng xuất khi app không gửi token. */
  async disableForCurrentSession(userId: string, sessionId: string): Promise<number> {
    const res = await this.prisma.pushDevice.updateMany({
      where: { userId, nativeAuthSessionId: sessionId, enabled: true },
      data: { enabled: false, disabledAt: new Date() },
    });
    return res.count;
  }

  /**
   * Id phiên NATIVE tương ứng, hoặc `null`.
   *
   * `AuthenticatedUser.sessionId` mang hai loại giá trị: `native_auth_sessions.id` với app
   * native (ADR 0017) và một ULID chỉ tồn tại trong JWT với phiên cookie của web (ADR 0002).
   * Nhét cái thứ hai vào FK là một lỗi ràng buộc ngay tại request; bỏ qua nó thì thiết bị vẫn
   * đăng ký được, chỉ là không tự tắt theo phiên.
   */
  private async resolveNativeSession(userId: string, sessionId: string): Promise<string | null> {
    const session = await this.prisma.nativeAuthSession.findFirst({
      where: { id: sessionId, userId },
      select: { id: true },
    });
    return session?.id ?? null;
  }

  private toDto(device: Prisma.PushDeviceGetPayload<{ select: typeof SELECT }>): PushDeviceDto {
    return {
      id: device.id,
      provider: device.provider,
      platform: device.platform,
      enabled: device.enabled,
      deviceName: device.deviceName,
      lastSeenAt: device.lastSeenAt.toISOString(),
      pushEnabled: this.firebase.pushEnabled,
    };
  }
}

/** KHÔNG có `providerToken` — xem docblock của `PushDeviceDto`. */
const SELECT = {
  id: true,
  provider: true,
  platform: true,
  enabled: true,
  deviceName: true,
  lastSeenAt: true,
} satisfies Prisma.PushDeviceSelect;
