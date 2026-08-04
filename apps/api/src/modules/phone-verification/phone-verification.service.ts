import { createHash, randomInt } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { newId } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  PHONE_VERIFICATION_PURPOSE,
  PHONE_VERIFICATION_STATUS,
  type PhoneVerificationPurpose,
} from '@xeprime/types';
import { normalizePhone } from '../../common/phone';
import { PrismaService } from '../../prisma/prisma.service';
import { OTP_PROVIDER, type OtpProvider } from './otp-provider';

/** Trong bao lâu sau khi verify thì SĐT còn được coi là đã xác thực cho một hành động. */
const VERIFIED_WINDOW_MINUTES = 30;

@Injectable()
export class PhoneVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(OTP_PROVIDER) private readonly provider: OtpProvider,
  ) {}

  /**
   * Gửi mã OTP cho (SĐT, mục đích). Chống spam: cooldown giữa 2 lần gửi + trần số lần/giờ theo
   * SĐT. Mã 6 số được hash (SHA-256 + pepper) trước khi lưu — DB rò rỉ không suy ra được mã.
   * Trả `devCode` CHỈ ở dev (OTP_MODE=mock) để FE/test tự điền; production luôn null.
   */
  async sendOtp(
    rawPhone: string,
    purpose: PhoneVerificationPurpose,
  ): Promise<{ expiresAt: Date; devCode: string | null }> {
    const phone = normalizePhone(rawPhone);
    const now = Date.now();

    const cooldownSec = this.config.get<number>('OTP_RESEND_COOLDOWN_SECONDS') ?? 60;
    const last = await this.prisma.phoneVerification.findFirst({
      where: { phone },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (last && now - last.createdAt.getTime() < cooldownSec * 1000) {
      const waitSec = Math.ceil((cooldownSec * 1000 - (now - last.createdAt.getTime())) / 1000);
      throw new HttpException(
        {
          code: API_ERROR_CODE.OTP_COOLDOWN,
          message: `Vui lòng đợi ${waitSec}s trước khi gửi lại mã`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const maxPerHour = this.config.get<number>('OTP_MAX_SENDS_PER_HOUR') ?? 5;
    const sentLastHour = await this.prisma.phoneVerification.count({
      where: { phone, createdAt: { gte: new Date(now - 60 * 60 * 1000) } },
    });
    if (sentLastHour >= maxPerHour) {
      throw new HttpException(
        {
          code: API_ERROR_CODE.OTP_TOO_MANY,
          message: 'Bạn đã yêu cầu mã quá nhiều lần. Thử lại sau 1 giờ.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Huỷ các mã pending cũ cùng (SĐT, mục đích) — chỉ mã mới nhất còn hiệu lực.
    await this.prisma.phoneVerification.updateMany({
      where: { phone, purpose, status: PHONE_VERIFICATION_STATUS.PENDING },
      data: { status: PHONE_VERIFICATION_STATUS.EXPIRED },
    });

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const ttlMin = this.config.get<number>('OTP_TTL_MINUTES') ?? 5;
    const expiresAt = new Date(now + ttlMin * 60 * 1000);

    await this.prisma.phoneVerification.create({
      data: {
        id: newId(),
        phone,
        purpose,
        provider: this.config.get<string>('OTP_MODE') ?? 'mock',
        otpHash: this.hash(code, phone),
        status: PHONE_VERIFICATION_STATUS.PENDING,
        sentCount: 1,
        expiresAt,
      },
    });

    await this.provider.send(phone, code);

    const isMockDev =
      this.config.get<string>('OTP_MODE') !== 'esms' &&
      this.config.get<string>('NODE_ENV') !== 'production';
    return { expiresAt, devCode: isMockDev ? code : null };
  }

  /**
   * Đối chiếu mã. Đúng → đánh dấu verified; nếu khách đang đăng nhập (`userId`) thì stamp luôn
   * `users.phone` + `phone_verified_at` để lần sau khỏi verify lại. Sai/hết hạn → lỗi typed.
   * Nhập sai được đếm (`attempt_count`); chạm OTP_MAX_ATTEMPTS → khoá mã (status=failed) và trả
   * OTP_LOCKED, buộc gửi mã mới. Kèm TTL ngắn + @Throttle ở controller để hãm brute-force.
   */
  async verifyOtp(
    rawPhone: string,
    purpose: PhoneVerificationPurpose,
    code: string,
    userId?: string | null,
  ): Promise<void> {
    const phone = normalizePhone(rawPhone);
    const row = await this.prisma.phoneVerification.findFirst({
      where: { phone, purpose, status: PHONE_VERIFICATION_STATUS.PENDING },
      orderBy: { createdAt: 'desc' },
      select: { id: true, otpHash: true, expiresAt: true, attemptCount: true },
    });

    if (!row) {
      throw new BadRequestException({
        code: API_ERROR_CODE.OTP_INVALID,
        message: 'Chưa có mã xác thực nào — hãy gửi mã trước',
      });
    }

    if (row.expiresAt.getTime() < Date.now()) {
      await this.prisma.phoneVerification.update({
        where: { id: row.id },
        data: { status: PHONE_VERIFICATION_STATUS.EXPIRED },
      });
      throw new BadRequestException({
        code: API_ERROR_CODE.OTP_EXPIRED,
        message: 'Mã đã hết hạn — hãy gửi lại mã mới',
      });
    }

    if (row.otpHash !== this.hash(code, phone)) {
      const maxAttempts = this.config.get<number>('OTP_MAX_ATTEMPTS') ?? 5;
      const attemptCount = row.attemptCount + 1;
      if (attemptCount >= maxAttempts) {
        // Khoá mã: không cho thử tiếp mã này (updateMany với điều kiện PENDING để idempotent
        // khi 2 request sai gần như đồng thời — chỉ một lần khoá có tác dụng).
        await this.prisma.phoneVerification.update({
          where: { id: row.id },
          data: { status: PHONE_VERIFICATION_STATUS.FAILED, attemptCount },
        });
        throw new BadRequestException({
          code: API_ERROR_CODE.OTP_LOCKED,
          message: 'Bạn đã nhập sai quá nhiều lần — hãy gửi lại mã mới',
        });
      }
      await this.prisma.phoneVerification.update({
        where: { id: row.id },
        data: { attemptCount },
      });
      throw new BadRequestException({
        code: API_ERROR_CODE.OTP_INVALID,
        message: 'Mã xác thực không đúng',
      });
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.phoneVerification.update({
        where: { id: row.id },
        data: { status: PHONE_VERIFICATION_STATUS.VERIFIED, verifiedAt: now, userId: userId ?? null },
      });

      if (userId) {
        await tx.user.update({
          where: { id: userId },
          data: { phone, phoneVerifiedAt: now },
        });
      }
    });
  }

  /**
   * Chặn tạo yêu cầu thuê nếu SĐT chưa xác thực gần đây (§8). Chấp nhận dùng lại mã đã verify
   * trong cửa sổ ngắn (không "consume") — schema status không có trạng thái consumed, và window
   * ngắn + re-verify rẻ nên không mở đường replay đáng kể.
   */
  async assertPhoneVerifiedForBooking(rawPhone: string): Promise<void> {
    const phone = normalizePhone(rawPhone);
    const since = new Date(Date.now() - VERIFIED_WINDOW_MINUTES * 60 * 1000);
    const ok = await this.prisma.phoneVerification.findFirst({
      where: {
        phone,
        purpose: PHONE_VERIFICATION_PURPOSE.BOOKING,
        status: PHONE_VERIFICATION_STATUS.VERIFIED,
        verifiedAt: { gte: since },
      },
      select: { id: true },
    });
    if (!ok) {
      throw new ForbiddenException({
        code: API_ERROR_CODE.PHONE_NOT_VERIFIED,
        message: 'Vui lòng xác thực số điện thoại trước khi gửi yêu cầu thuê',
      });
    }
  }

  private hash(code: string, phone: string): string {
    const pepper = this.config.getOrThrow<string>('OTP_PEPPER');
    return createHash('sha256').update(`${code}:${phone}:${pepper}`).digest('hex');
  }
}
