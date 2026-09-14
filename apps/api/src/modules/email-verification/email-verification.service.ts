import { createHash, randomInt } from 'node:crypto';
import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { newId } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  PHONE_VERIFICATION_STATUS,
  type EmailVerificationPurpose,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';

/**
 * Xác thực quyền sở hữu một ĐỊA CHỈ EMAIL bằng mã 6 số.
 *
 * Song sinh cố ý của `PhoneVerificationService`: cùng máy trạng thái (pending → verified /
 * expired / failed), cùng cách hash mã, cùng bộ giới hạn chống spam, cùng tên biến môi trường
 * (`OTP_TTL_MINUTES`, `OTP_MAX_ATTEMPTS`, …). Ai đọc hiểu một bên là hiểu bên kia, và một lần
 * siết cấu hình có hiệu lực cho cả hai kênh.
 *
 * Không gộp làm một service chung: điểm khác nằm ở chỗ quan trọng nhất — bảng lưu, phép chuẩn
 * hoá định danh và đường gửi (SMS qua eSMS ↔ SMTP). Một service "đa kênh" sẽ là hai nhánh `if`
 * chạy suốt từ đầu tới cuối mỗi hàm.
 */
@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  /**
   * Gửi mã tới một địa chỉ email. Chống spam bằng cooldown giữa hai lần gửi + trần số lần mỗi
   * giờ, đếm THEO ĐỊA CHỈ NHẬN chứ không theo tài khoản: kẻ phá hoại đổi tài khoản dễ hơn đổi
   * hộp thư của nạn nhân, và thứ cần bảo vệ ở đây là hộp thư đó.
   *
   * Trả `devCode` theo đúng luật của OTP điện thoại — chỉ khi KHÔNG phải triển khai production
   * (xem `PhoneVerificationService.sendOtp`), để dev/staging test được luồng mà không phải đi
   * đọc log hộp thư.
   */
  async sendOtp(
    rawEmail: string,
    purpose: EmailVerificationPurpose,
    displayName: string,
  ): Promise<{ expiresAt: Date; devCode: string | null }> {
    const email = normalizeEmail(rawEmail);
    const now = Date.now();

    const cooldownSec = this.config.get<number>('OTP_RESEND_COOLDOWN_SECONDS') ?? 60;
    const last = await this.prisma.emailVerification.findFirst({
      where: { email },
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
    const sentLastHour = await this.prisma.emailVerification.count({
      where: { email, createdAt: { gte: new Date(now - 60 * 60 * 1000) } },
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

    // Huỷ các mã pending cũ cùng (email, mục đích) — chỉ mã mới nhất còn hiệu lực.
    await this.prisma.emailVerification.updateMany({
      where: { email, purpose, status: PHONE_VERIFICATION_STATUS.PENDING },
      data: { status: PHONE_VERIFICATION_STATUS.EXPIRED },
    });

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const ttlMin = this.config.get<number>('OTP_TTL_MINUTES') ?? 5;
    const expiresAt = new Date(now + ttlMin * 60 * 1000);

    await this.prisma.emailVerification.create({
      data: {
        id: newId(),
        email,
        purpose,
        otpHash: this.hash(code, email),
        status: PHONE_VERIFICATION_STATUS.PENDING,
        sentCount: 1,
        expiresAt,
      },
    });

    await this.email.sendVerificationCode(email, displayName, code, ttlMin);

    const isProductionDeployment =
      this.config.getOrThrow<string>('NODE_ENV') === 'production' &&
      this.config.getOrThrow<string>('APP_ENV') === 'production';
    return { expiresAt, devCode: isProductionDeployment ? null : code };
  }

  /**
   * Đối chiếu mã. Đúng → đánh dấu verified và trả về địa chỉ ĐÃ CHUẨN HOÁ để nơi gọi ghi vào
   * `users.email`; sai/hết hạn → lỗi typed. Nhập sai được đếm, chạm trần thì khoá mã
   * (status=failed) buộc gửi mã mới — cùng luật với OTP điện thoại.
   *
   * Hàm này KHÔNG tự ghi vào `users`: đổi email còn kéo theo việc báo cho địa chỉ cũ và xử lý
   * va chạm `@unique`, những việc thuộc về nơi hiểu ngữ cảnh (xem `UsersController`).
   */
  async verifyOtp(
    rawEmail: string,
    purpose: EmailVerificationPurpose,
    code: string,
    userId: string,
  ): Promise<string> {
    const email = normalizeEmail(rawEmail);
    const row = await this.prisma.emailVerification.findFirst({
      where: { email, purpose, status: PHONE_VERIFICATION_STATUS.PENDING },
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
      await this.prisma.emailVerification.update({
        where: { id: row.id },
        data: { status: PHONE_VERIFICATION_STATUS.EXPIRED },
      });
      throw new BadRequestException({
        code: API_ERROR_CODE.OTP_EXPIRED,
        message: 'Mã đã hết hạn — hãy gửi lại mã mới',
      });
    }

    if (row.otpHash !== this.hash(code, email)) {
      const maxAttempts = this.config.get<number>('OTP_MAX_ATTEMPTS') ?? 5;
      const attemptCount = row.attemptCount + 1;
      if (attemptCount >= maxAttempts) {
        await this.prisma.emailVerification.update({
          where: { id: row.id },
          data: { status: PHONE_VERIFICATION_STATUS.FAILED, attemptCount },
        });
        throw new BadRequestException({
          code: API_ERROR_CODE.OTP_LOCKED,
          message: 'Bạn đã nhập sai quá nhiều lần — hãy gửi lại mã mới',
        });
      }
      await this.prisma.emailVerification.update({
        where: { id: row.id },
        data: { attemptCount },
      });
      throw new BadRequestException({
        code: API_ERROR_CODE.OTP_INVALID,
        message: 'Mã xác thực không đúng',
      });
    }

    await this.prisma.emailVerification.update({
      where: { id: row.id },
      data: {
        status: PHONE_VERIFICATION_STATUS.VERIFIED,
        verifiedAt: new Date(),
        userId,
      },
    });

    return email;
  }

  private hash(code: string, email: string): string {
    const pepper = this.config.getOrThrow<string>('OTP_PEPPER');
    return createHash('sha256').update(`${code}:${email}:${pepper}`).digest('hex');
  }
}

/**
 * Chuẩn hoá địa chỉ trước khi so khớp và trước khi ghi vào cột `@unique`.
 *
 * Chỉ `trim` + hạ chữ thường, KHÔNG đụng tới phần trước `@` sâu hơn thế: dấu chấm và hậu tố
 * `+tag` là chuyện riêng của từng nhà cung cấp (Gmail bỏ qua, nhiều hệ thống khác thì không),
 * nên "chuẩn hoá" chúng là tự quyết định thay người dùng rằng hai địa chỉ khác nhau là một.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
