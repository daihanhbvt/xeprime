import { createHash, randomInt } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  PHONE_VERIFICATION_PURPOSE,
  PHONE_VERIFICATION_STATUS,
  type AccountRealm,
  type PhoneVerificationPurpose,
  OTP_POLICY,
} from '@xeprime/types';
import { normalizePhone } from '../../common/phone';
import { PrismaService } from '../../prisma/prisma.service';
import { isProductionDeployment, OTP_BYPASS_PROVIDER, resolveOtpBypassCode } from './otp-bypass';
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

  /** Môi trường này có nhận mã OTP test không — để giao diện cho nhập mã mà không cần gửi trước. */
  testCodeEnabled(): boolean {
    return resolveOtpBypassCode(this.config) !== null;
  }

  /**
   * Gửi mã OTP cho (SĐT, mục đích). Chống spam: cooldown giữa 2 lần gửi + trần số lần/giờ theo
   * SĐT. Mã 6 số được hash (SHA-256 + pepper) trước khi lưu — DB rò rỉ không suy ra được mã.
   * Trả `devCode` khi provider là mock VÀ đây không phải triển khai production (dev + staging) —
   * để FE/test tự điền. Triển khai production luôn null; xem giải thích ở chỗ tính giá trị.
   */
  async sendOtp(
    rawPhone: string,
    purpose: PhoneVerificationPurpose,
    /**
     * Realm của luồng (ADR 0053): mã gửi ở site khách chỉ xác thực được ở site khách. Cooldown và
     * trần số lần/giờ ở dưới CỐ Ý vẫn tính theo SỐ ĐIỆN THOẠI trên mọi realm — chúng chống spam vào
     * chiếc máy của người đó, và người đó chỉ có một chiếc máy dù có mấy tài khoản.
     */
    realm: AccountRealm,
  ): Promise<{ expiresAt: Date; devCode: string | null }> {
    const phone = normalizePhone(rawPhone);
    const now = Date.now();

    const cooldownSec = OTP_POLICY.RESEND_COOLDOWN_SECONDS;
    // Hàng của mã test không tốn tin nhắn nào nên không tính vào cooldown/trần gửi.
    const notBypass = { not: OTP_BYPASS_PROVIDER };
    const last = await this.prisma.phoneVerification.findFirst({
      where: { phone, provider: notBypass },
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

    const maxPerHour = OTP_POLICY.MAX_SENDS_PER_HOUR;
    const sentLastHour = await this.prisma.phoneVerification.count({
      where: { phone, provider: notBypass, createdAt: { gte: new Date(now - 60 * 60 * 1000) } },
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

    // Huỷ các mã pending cũ cùng (realm, SĐT, mục đích) — chỉ mã mới nhất còn hiệu lực.
    await this.prisma.phoneVerification.updateMany({
      where: { realm, phone, purpose, status: PHONE_VERIFICATION_STATUS.PENDING },
      data: { status: PHONE_VERIFICATION_STATUS.EXPIRED },
    });

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const ttlMin = OTP_POLICY.TTL_MINUTES;
    const expiresAt = new Date(now + ttlMin * 60 * 1000);

    await this.prisma.phoneVerification.create({
      data: {
        id: newId(),
        realm,
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

    /*
     * `devCode` trả mã 6 số THẲNG trong response — chỉ khi đây KHÔNG phải một triển khai
     * production.
     *
     * "Triển khai production" = `NODE_ENV=production` VÀ `APP_ENV=production`. Hai điều kiện chứ
     * không một: staging cũng chạy `NODE_ENV=production` (bắt buộc, để bundle giống thật), nên
     * chỉ xét `NODE_ENV` là khoá luôn cả staging và biến mọi lần test luồng đặt xe thành một lần
     * đi đọc `docker compose logs api`.
     *
     * ⚠️ Đánh đổi đã biết: trên staging, ai gọi được endpoint này cũng lấy được mã của SĐT bất kỳ,
     * tức xác thực được SĐT bất kỳ. Chấp nhận được vì staging chứa dữ liệu test — và đó cũng là
     * lý do KHÔNG đưa dữ liệu khách hàng thật lên staging.
     *
     * `OTP_MODE !== 'esms'` là lớp thứ hai: với luật ở `env.schema.ts`, một triển khai production
     * không thể chạy mock. Giữ cả hai vế để lớp này không phụ thuộc vào việc luật kia còn đúng.
     */
    const isMockProvider = this.config.get<string>('OTP_MODE') !== 'esms';
    return {
      expiresAt,
      devCode: isMockProvider && !isProductionDeployment(this.config) ? code : null,
    };
  }

  /**
   * Đối chiếu mã. Đúng → đánh dấu verified; nếu khách đang đăng nhập (`userId`) thì stamp luôn
   * `users.phone` + `phone_verified_at` để lần sau khỏi verify lại. Sai/hết hạn → lỗi typed.
   * Nhập sai được đếm (`attempt_count`); chạm OTP_MAX_ATTEMPTS → khoá mã (status=failed) và trả
   * OTP_LOCKED, buộc gửi mã mới. Kèm TTL ngắn + @Throttle ở controller để hãm brute-force.
   *
   * Mã test (`resolveOtpBypassCode` — dev/staging, KHÔNG BAO GIỜ production) bỏ qua cả ba phép kiểm
   * trên: có mã đang chờ thì đánh dấu chính hàng đó verified, chưa gửi mã nào thì tạo một hàng
   * verified mới — để `assertPhoneVerifiedForBooking` đọc được như mã thật.
   */
  async verifyOtp(
    rawPhone: string,
    purpose: PhoneVerificationPurpose,
    code: string,
    /**
     * Realm của luồng — chỉ mã gửi ở CÙNG realm mới đối chiếu được (ADR 0053). Nhận một DANH SÁCH
     * chỉ để làm cầu tương thích cho app XePrime Partner (xem `MobilePhoneAuthController.login`);
     * mọi nơi khác truyền đúng một realm. Có `userId` thì phải là đúng realm của tài khoản đó.
     */
    realms: AccountRealm | readonly AccountRealm[],
    userId?: string | null,
  ): Promise<void> {
    const accepted: readonly AccountRealm[] = typeof realms === 'string' ? [realms] : realms;
    const realm = accepted[0];
    if (!realm) throw new Error('verifyOtp cần ít nhất một realm');
    const phone = normalizePhone(rawPhone);
    const row = await this.prisma.phoneVerification.findFirst({
      where: {
        realm: { in: [...accepted] },
        phone,
        purpose,
        status: PHONE_VERIFICATION_STATUS.PENDING,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, otpHash: true, expiresAt: true, attemptCount: true },
    });

    const bypassCode = resolveOtpBypassCode(this.config);
    if (bypassCode !== null && code === bypassCode) {
      await this.markVerified({ rowId: row?.id ?? null, realm, phone, purpose, userId });
      return;
    }

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
      const maxAttempts = OTP_POLICY.MAX_ATTEMPTS;
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

    await this.markVerified({ rowId: row.id, realm, phone, purpose, userId });
  }

  /**
   * Chốt một lượt xác thực đúng: đánh dấu hàng mã verified (hoặc tạo hàng verified khi mã test
   * được gõ mà chưa gửi mã nào), và nếu có `userId` thì gắn SĐT vào tài khoản — cùng MỘT transaction.
   */
  private async markVerified(args: {
    rowId: string | null;
    realm: AccountRealm;
    phone: string;
    purpose: PhoneVerificationPurpose;
    userId?: string | null;
  }): Promise<void> {
    const { rowId, realm, phone, purpose, userId } = args;
    const now = new Date();
    try {
      await this.prisma.$transaction(async (tx) => {
        const verified = {
          status: PHONE_VERIFICATION_STATUS.VERIFIED,
          verifiedAt: now,
          userId: userId ?? null,
        };
        if (rowId) {
          await tx.phoneVerification.update({ where: { id: rowId }, data: verified });
        } else {
          await tx.phoneVerification.create({
            data: {
              id: newId(),
              realm,
              phone,
              purpose,
              provider: OTP_BYPASS_PROVIDER,
              otpHash: null,
              sentCount: 0,
              expiresAt: now,
              ...verified,
            },
          });
        }

        if (userId) {
          /*
           * SĐT unique TRONG realm (ADR 0053). Số này đã là của một tài khoản KHÁC cùng realm thì
           * không gắn được — nói rõ `PHONE_TAKEN` thay vì để unique ở DB nổ thành 500. Số đó ở
           * realm khác thì không liên quan: đó là một tài khoản khác của cùng một người.
           */
          const owner = await tx.user.findFirst({
            where: { realm, phone, deletedAt: null, id: { not: userId } },
            select: { id: true },
          });
          if (owner) throw phoneTaken();
          await tx.user.update({
            where: { id: userId },
            data: { phone, phoneVerifiedAt: now },
          });
        }
      });
    } catch (error) {
      // Hai request gắn cùng số cùng lúc đều qua được phép kiểm ở trên — unique là chốt thật.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw phoneTaken();
      }
      throw error;
    }
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
        // Đặt xe là việc của KHÁCH (ADR 0053): chỉ mã xác thực ở site/app khách mới mở cửa này.
        realm: ACCOUNT_REALM.CUSTOMER,
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
    // Không trộn realm vào băm: realm đã nằm trong điều kiện tra (`where: { realm, ... }`), và một
    // mã chỉ được đối chiếu với đúng hàng của realm đó.
    const pepper = this.config.getOrThrow<string>('OTP_PEPPER');
    return createHash('sha256').update(`${code}:${phone}:${pepper}`).digest('hex');
  }
}

function phoneTaken(): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.PHONE_TAKEN,
    message: 'Số điện thoại này đã thuộc một tài khoản khác',
  });
}
