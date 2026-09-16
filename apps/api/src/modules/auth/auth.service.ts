import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BILLING_MODE,
  MEMBERSHIP_STATUS,
  USER_STATUS,
  OPEN_CUSTOMER_TRIP_STATUSES,
  VEHICLE_PUBLIC_STATUS,
  type Permission,
} from '@xeprime/types';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { normalizePhone, toLocalPhone } from '../../common/phone';
import {
  EFFECTIVE_SUBSCRIPTION_ARGS,
  effectiveSubscriptionWhere,
  resolveTenantFeatures,
  type TenantPlanContext,
} from '../../common/plan/feature-state';
import { EmailService } from '../email/email.service';
import { FeePoliciesService } from '../fee-policies/fee-policies.service';
import type { CurrentTenantSummaryDto, MeDto } from './dto/auth.dto';
import type { VerifiedIdentity } from './social/identity';

const BCRYPT_ROUNDS = 12;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 giờ

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    /** Chỉ dùng cho `/auth/me` — xem `CurrentTenantSummaryDto.serviceFeePercent`. */
    private readonly feePolicies: FeePoliciesService,
  ) {}

  // ---- Đăng ký / đăng nhập bằng định danh + mật khẩu ------------------------

  /**
   * Đăng ký bằng SĐT + mật khẩu. SĐT được chuẩn hoá về dạng `84xxxxxxxxx` trước khi lưu.
   * Tạo user + identity(provider='password') trong một transaction.
   */
  async register(input: {
    phone: string;
    password: string;
    displayName: string;
  }): Promise<{ userId: string }> {
    const phone = normalizePhone(input.phone);

    const existing = await this.prisma.user.findFirst({
      where: { phone, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        code: API_ERROR_CODE.PHONE_TAKEN,
        message: 'Số điện thoại này đã được đăng ký',
      });
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const userId = newId();

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.create({
          data: {
            id: userId,
            phone,
            displayName: input.displayName.trim(),
            passwordHash,
            status: USER_STATUS.ACTIVE,
            lastLoginAt: new Date(),
          },
        });
        await tx.userIdentity.create({
          data: {
            id: newId(),
            userId,
            provider: 'password',
            providerUserId: phone,
            providerPhone: phone,
          },
        });
      });
    } catch (err) {
      // Hai request cùng SĐT có thể cùng vượt qua pre-check. Unique constraint là chốt thật;
      // đổi P2002 thành lỗi nghiệp vụ ổn định thay vì để lộ lỗi DB 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          code: API_ERROR_CODE.PHONE_TAKEN,
          message: 'Số điện thoại này đã được đăng ký',
        });
      }
      throw err;
    }

    return { userId };
  }

  /**
   * Đăng nhập bằng **email HOẶC số điện thoại** + mật khẩu. Có `@` → tra email (lowercase);
   * ngược lại chuẩn hoá SĐT rồi tra `users.phone` (@unique, lưu dạng `84...`).
   *
   * Lỗi luôn chung chung (INVALID_CREDENTIALS) dù sai định danh hay sai mật khẩu — không tiết lộ
   * tài khoản nào tồn tại. So khớp bcrypt kể cả khi không có user (giảm timing attack). Tài khoản
   * tạo bằng SĐT/OTP có `passwordHash` null → chưa đặt mật khẩu thì không đăng nhập kiểu này được.
   */
  async loginWithPassword(rawIdentifier: string, password: string): Promise<{ userId: string }> {
    const identifier = rawIdentifier.trim();
    const where = identifier.includes('@')
      ? { email: identifier.toLowerCase(), deletedAt: null }
      : { phone: normalizePhone(identifier), deletedAt: null };
    const user = await this.prisma.user.findFirst({
      where,
      select: { id: true, passwordHash: true, status: true },
    });

    const hash =
      user?.passwordHash ?? '$2a$12$0000000000000000000000000000000000000000000000000000';
    const ok = await bcrypt.compare(password, hash);

    if (!user || !user.passwordHash || !ok) {
      throw new UnauthorizedException({
        code: API_ERROR_CODE.INVALID_CREDENTIALS,
        message: 'Email/số điện thoại hoặc mật khẩu không đúng',
      });
    }
    if (user.status !== USER_STATUS.ACTIVE) {
      throw new UnauthorizedException({
        code: API_ERROR_CODE.ACCOUNT_LOCKED,
        message: 'Tài khoản đã bị khoá',
      });
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { userId: user.id };
  }

  /**
   * Đặt mật khẩu cho tài khoản **chưa có mật khẩu** (tạo bằng SĐT/OTP). Cần đã đăng nhập.
   * Nếu đã có mật khẩu → `CONFLICT` (đổi mật khẩu là luồng khác, cần mật khẩu cũ) — endpoint này
   * chỉ để bổ sung mật khẩu lần đầu, không phải cửa hậu ghi đè.
   */
  async setPassword(userId: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findFirstOrThrow({
      where: { id: userId, deletedAt: null },
      select: { passwordHash: true },
    });
    if (user.passwordHash) {
      throw new ConflictException({
        code: API_ERROR_CODE.CONFLICT,
        message: 'Tài khoản đã có mật khẩu',
      });
    }
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  /**
   * Đổi mật khẩu khi ĐÃ đăng nhập.
   *
   * Ba điều cố ý:
   *  - Tài khoản chưa có mật khẩu → `PASSWORD_NOT_SET` (409), không phải tự động đặt: đặt lần đầu
   *    là `setPassword`, và trộn hai luồng nghĩa là một phiên bị chiếm có thể GÁN mật khẩu cho
   *    tài khoản OTP mà chủ nhân chưa từng đặt.
   *  - Sai mật khẩu hiện tại → 400 `CURRENT_PASSWORD_INCORRECT`, KHÔNG phải 401: người dùng vẫn
   *    đang đăng nhập hợp lệ, web không được coi đây là phiên hỏng.
   *  - Không ghi mật khẩu hay hash vào log/exception — chỉ có mã lỗi.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, passwordHash: true },
    });
    if (!user) {
      throw new UnauthorizedException({
        code: API_ERROR_CODE.UNAUTHENTICATED,
        message: 'Phiên không còn hợp lệ',
      });
    }
    if (!user.passwordHash) {
      throw new ConflictException({
        code: API_ERROR_CODE.PASSWORD_NOT_SET,
        message: 'Tài khoản chưa có mật khẩu — hãy đặt mật khẩu lần đầu',
      });
    }
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      throw new BadRequestException({
        code: API_ERROR_CODE.CURRENT_PASSWORD_INCORRECT,
        message: 'Mật khẩu hiện tại không đúng',
      });
    }
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      throw new BadRequestException({
        code: API_ERROR_CODE.PASSWORD_UNCHANGED,
        message: 'Mật khẩu mới phải khác mật khẩu hiện tại',
      });
    }
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      // Link "quên mật khẩu" đang lơ lửng (nếu có) mất hiệu lực: mật khẩu vừa được chủ nhân
      // xác nhận, không còn lý do để một email cũ ghi đè nó.
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
    });
  }

  // ---- Quên / đặt lại mật khẩu ----------------------------------------------

  private hashToken(token: string): string {
    // Token là ngẫu nhiên entropy cao nên sha256 đủ; bcrypt dành cho mật khẩu entropy thấp.
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Yêu cầu đặt lại mật khẩu. LUÔN trả về như nhau dù email có tồn tại hay không — không để
   * kẻ tấn công dò email nào đã đăng ký.
   */
  async requestPasswordReset(rawEmail: string): Promise<void> {
    const email = rawEmail.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null, status: USER_STATUS.ACTIVE },
      select: { id: true, displayName: true, email: true },
    });
    if (!user || !user.email) return;

    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);

    await this.prisma.$transaction(async (tx) => {
      // Huỷ mọi token chưa dùng trước đó của user — một link mới vô hiệu link cũ.
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.passwordResetToken.create({
        data: {
          id: newId(),
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      });
    });

    const webUrl = this.config.getOrThrow<string>('APP_WEB_URL').replace(/\/+$/, '');
    const resetUrl = `${webUrl}/reset-password?token=${token}`;

    /*
     * Nuốt lỗi gửi thư ở ĐÂY là một quyết định bảo mật, không phải sự cẩu thả.
     *
     * Hàm này cố ý im lặng khi email không tồn tại (`return` ở trên). Nếu SMTP hỏng mà ném lên,
     * endpoint trả 500 cho email CÓ THẬT và 200 cho email không có — chênh lệch đó là một máy dò
     * tài khoản hoàn hảo, và nó chỉ xuất hiện đúng vào lúc hệ thống đang trục trặc.
     *
     * Người dùng thấy cùng một câu "đã gửi nếu email tồn tại"; vận hành thấy lỗi thật trong log.
     */
    try {
      await this.email.sendPasswordReset(user.email, user.displayName, resetUrl);
    } catch (error) {
      this.logger.error(
        `Không gửi được thư đặt lại mật khẩu: ${error instanceof Error ? error.message : 'lỗi không rõ'}`,
      );
    }
  }

  /** Đặt mật khẩu mới từ token. Token dùng một lần và phải còn hạn. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    const record = await this.prisma.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, userId: true },
    });
    if (!record) {
      throw new BadRequestException({
        code: API_ERROR_CODE.INVALID_RESET_TOKEN,
        message: 'Liên kết đặt lại không hợp lệ hoặc đã hết hạn',
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
      // Đánh dấu dùng + huỷ mọi token khác của user.
      await tx.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
    });
  }

  /**
   * Tìm hoặc tạo user từ một danh tính ĐÃ được nhà cung cấp xác minh — ADR 0002 bước 2.
   *
   * Idempotent: đăng nhập lại bằng cùng provider không tạo user mới. Khoá tra cứu là
   * `(provider, providerUserId)` chứ không phải email — email đổi được, và tin email
   * để nhận diện là cách hai tài khoản khác nhau bị gộp làm một.
   *
   * Nhận `VerifiedIdentity` chứ không nhận token (ADR 0019): việc xác minh là chuyện riêng của
   * từng provider và đã xong trước khi vào đây. Nhờ vậy hàm này không biết Google, Facebook hay
   * Apple tồn tại — thêm provider mới không chạm một dòng nào ở đây.
   */
  async upsertUserFromIdentity(identity: VerifiedIdentity): Promise<{ userId: string }> {
    const providerEmail = identity.email?.trim().toLowerCase() ?? null;

    const existing = await this.prisma.userIdentity.findUnique({
      where: {
        provider_providerUserId: {
          provider: identity.provider,
          providerUserId: identity.providerUserId,
        },
      },
      select: { userId: true, user: { select: { status: true } } },
    });

    if (existing) {
      if (existing.user.status !== USER_STATUS.ACTIVE) {
        throw new UnauthorizedException({
          code: API_ERROR_CODE.ACCOUNT_LOCKED,
          message: 'Tài khoản đã bị khoá',
        });
      }
      await this.prisma.user.update({
        where: { id: existing.userId },
        data: { lastLoginAt: new Date() },
      });
      return { userId: existing.userId };
    }

    // Email từ provider không đáng tin như nhau. Chỉ provider đã xác minh email mới được nối tự
    // động vào tài khoản XePrime có sẵn; nếu không, kẻ khác có thể tự khai cùng email để chiếm tài khoản.
    const emailUser = providerEmail
      ? await this.prisma.user.findFirst({
          where: { email: providerEmail, deletedAt: null },
          select: { id: true, status: true },
        })
      : null;

    if (emailUser && !identity.emailVerified) {
      throw new ConflictException({
        code: API_ERROR_CODE.CONFLICT,
        message:
          'Email này đã có tài khoản XePrime. Hãy đăng nhập bằng phương thức đã dùng trước đó.',
      });
    }

    const linkedUser = identity.emailVerified ? emailUser : null;
    if (linkedUser && linkedUser.status !== USER_STATUS.ACTIVE) {
      throw new UnauthorizedException({
        code: API_ERROR_CODE.ACCOUNT_LOCKED,
        message: 'Tài khoản đã bị khoá',
      });
    }

    const userId = linkedUser?.id ?? newId();

    await this.prisma.$transaction(async (tx) => {
      if (!linkedUser) {
        await tx.user.create({
          data: {
            id: userId,
            email: providerEmail,
            emailVerifiedAt: identity.emailVerified ? new Date() : null,
            phone: identity.phone,
            displayName: identity.displayName ?? providerEmail ?? 'Người dùng mới',
            avatarUrl: identity.avatarUrl,
            status: USER_STATUS.ACTIVE,
            lastLoginAt: new Date(),
          },
        });
      } else {
        await tx.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
      }

      await tx.userIdentity.create({
        data: {
          id: newId(),
          userId,
          provider: identity.provider,
          providerUserId: identity.providerUserId,
          providerEmail,
          providerPhone: identity.phone,
        },
      });
    });

    return { userId };
  }

  /**
   * Passwordless: tìm hoặc tạo user theo SĐT đã xác thực (OTP) — dùng cho đăng nhập bằng SĐT và
   * cho luồng đặt xe của khách vãng lai. KHÔNG tự kiểm OTP: người gọi phải chứng minh sở hữu SĐT
   * trước (verifyOtp cho login, assertPhoneVerifiedForBooking cho đặt xe).
   *
   * Idempotent theo `users.phone` (@unique). Chống đua khi nhiều request cùng SĐT vào cùng lúc:
   * bắt P2002 rồi đọc lại. User tạo bằng SĐT có `passwordHash = null` (như tài khoản Google/FB) —
   * sau này người dùng có thể tự đặt mật khẩu / liên kết Google mà không chặn luồng đặt xe.
   */
  async resolveOrCreateUserByPhone(
    rawPhone: string,
    displayNameFallback?: string | null,
  ): Promise<{ userId: string; created: boolean }> {
    const phone = normalizePhone(rawPhone);
    const now = new Date();

    const existing = await this.prisma.user.findFirst({
      where: { phone, deletedAt: null },
      select: { id: true, status: true, phoneVerifiedAt: true },
    });
    if (existing) {
      if (existing.status !== USER_STATUS.ACTIVE) {
        throw new UnauthorizedException({
          code: API_ERROR_CODE.ACCOUNT_LOCKED,
          message: 'Tài khoản đã bị khoá',
        });
      }
      await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          lastLoginAt: now,
          ...(existing.phoneVerifiedAt ? {} : { phoneVerifiedAt: now }),
        },
      });
      return { userId: existing.id, created: false };
    }

    const userId = newId();
    const displayName = (displayNameFallback ?? '').trim() || defaultPhoneName(phone);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.create({
          data: {
            id: userId,
            phone,
            phoneVerifiedAt: now,
            displayName,
            status: USER_STATUS.ACTIVE,
            lastLoginAt: now,
          },
        });
        await tx.userIdentity.create({
          data: {
            id: newId(),
            userId,
            provider: 'phone_otp',
            providerUserId: phone,
            providerPhone: phone,
          },
        });
      });
      return { userId, created: true };
    } catch (err) {
      // Đua unique(phone): một request khác vừa tạo user cùng SĐT — đọc lại và dùng chung.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const raced = await this.prisma.user.findFirst({
          where: { phone, deletedAt: null },
          select: { id: true },
        });
        if (raced) return { userId: raced.id, created: false };
      }
      throw err;
    }
  }

  async me(userId: string): Promise<MeDto> {
    const user = await this.prisma.user.findFirstOrThrow({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        displayName: true,
        email: true,
        avatarUrl: true,
        phone: true,
        phoneVerifiedAt: true,
        passwordHash: true,
      },
    });

    const now = new Date();
    const [membership, platformMembership] = await Promise.all([
      this.prisma.tenantMembership.findFirst({
        where: { userId, status: MEMBERSHIP_STATUS.ACTIVE },
        select: {
          roleKey: true,
          roleId: true,
          // Trục năng lực (ADR 0027) đi kèm luôn — `select` phải khớp `TenantScopeGuard`, vì cả
          // hai gọi cùng `resolveTenantFeatures`. Menu của web đọc từ đây ở LẦN VẼ ĐẦU, nên tách
          // ra một query riêng là menu nhấp nháy.
          tenant: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
              // Trục ĐĂNG KÝ (ADR 0040) — web chọn KHU làm việc từ đây trước cả `billingMode`:
              // gian hàng chưa trả tiền phải về màn onboarding, không về Owner Lite.
              onboardingState: true,
              usedFeatures: true,
              // Logo cho vỏ portal — xem `CurrentTenantSummaryDto.logoUrl`.
              profile: { select: { logoUrl: true } },
              subscriptions: {
                where: effectiveSubscriptionWhere(now),
                ...EFFECTIVE_SUBSCRIPTION_ARGS,
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.platformMembership.findFirst({
        where: { userId, status: MEMBERSHIP_STATUS.ACTIVE },
        select: { roleKey: true, roleId: true },
      }),
    ]);

    /*
     * Đếm xe đang trên chợ đi CÙNG lượt với quyền, không nối thêm một round-trip nữa: cả hai
     * chỉ cần `membership` và cùng phải xong trước khi dựng response. Index
     * `(tenant_id, public_status)` đã có sẵn nên đây là một index-only scan.
     */
    /*
     * Chuyến ĐI THUÊ chưa khép của chính người này (15/09/2026).
     *
     * Khu `/account` của một tài khoản gian hàng ẩn menu Chuyến — nhưng KHÔNG được giấu một
     * chuyến đang chạy của chính họ. Ca thật: một chủ xe tuyến hoa hồng đang đi thuê xe của người
     * khác thì nâng lên gói; chuyến đó chưa xong, tiền hoàn chưa về, và chat với chủ xe kia vẫn
     * đang mở. Ẩn menu lúc đó là lấy mất đường vào đúng lúc họ cần nhất.
     *
     * Đếm ở đây thay vì để web tự gọi `/trips`: menu vẽ ở LẦN ĐẦU, và một request thứ hai nghĩa
     * là menu nhấp nháy. Cùng lý do với `publicVehicleCount` ngay bên cạnh, và cùng vị từ với tab
     * "đang diễn ra" của `/trips` (`OPEN_CUSTOMER_TRIP_STATUSES`).
     */
    const openTripWhere: Prisma.BookingRequestWhereInput = {
      customerUserId: userId,
      OR: [
        { booking: { is: { status: { in: OPEN_CUSTOMER_TRIP_STATUSES.bookingStatuses } } } },
        { booking: { is: null }, status: { in: OPEN_CUSTOMER_TRIP_STATUSES.requestStatuses } },
      ],
    };

    const [tenantPermissions, publicVehicleCount] = membership
      ? await Promise.all([
          this.rbac.permissionsForTenantMember(
            membership.roleKey as never,
            membership.roleId,
            membership.tenant.id,
          ),
          this.prisma.vehicle.count({
            where: {
              tenantId: membership.tenant.id,
              publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
              deletedAt: null,
            },
          }),
        ])
      : ([[], 0] as [readonly Permission[], number]);

    const [openRenterTripCount, tenantPlan] = await Promise.all([
      this.prisma.bookingRequest.count({ where: openTripWhere }),
      /*
       * Giải ngữ cảnh gói TRƯỚC, vì nó quyết định có cần đọc chính sách phí hay không — và
       * `toTenantSummary` dùng lại chính kết quả này thay vì giải lần thứ hai.
       */
      Promise.resolve(
        membership
          ? resolveTenantFeatures(
              membership.tenant.subscriptions[0] ?? null,
              membership.tenant.usedFeatures,
              now,
            )
          : null,
      ),
    ]);

    /*
     * % phí dịch vụ ĐANG THU, chỉ cho nhãn của chủ xe TUYẾN HOA HỒNG.
     *
     * Đọc qua `FeePoliciesService.findEffective` chứ không query `fee_policies` tay: docblock
     * của service nói rõ mọi nơi cần "policy hiện hành" phải đi qua đó, và một bản đọc thứ hai
     * là chỗ để hai định nghĩa "đang hiệu lực" trôi khỏi nhau.
     *
     * Điều kiện hẹp có chủ đích: `/auth/me` là endpoint nóng nhất và `findEffective` không có
     * cache. Tenant tuyến gói trả 0đ/chuyến, khách thuê không có nhãn nào — với họ kết quả này
     * sẽ bị vứt, nên đừng đi lấy.
     */
    const activeServiceFeePercent =
      tenantPlan?.billingMode === BILLING_MODE.COMMISSION
        ? ((await this.feePolicies.findEffective())?.serviceFeePercent ?? null)
        : null;

    const platformPermissions: readonly Permission[] = platformMembership
      ? await this.rbac.permissionsForPlatformMember(
          platformMembership.roleKey as never,
          platformMembership.roleId,
        )
      : [];

    return {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      // Dạng nội địa `0xxxxxxxxx` — đây là số của CHÍNH người đang đăng nhập, dùng để điền sẵn ô
      // liên hệ khi đặt xe. DB lưu `84xxxxxxxxx`; trả nguyên dạng đó thì người dùng nhìn vào
      // tưởng số lạ.
      phone: user.phone ? toLocalPhone(user.phone) : null,
      phoneVerified: user.phoneVerifiedAt !== null,
      hasPassword: user.passwordHash !== null,
      tenant:
        membership && tenantPlan
          ? toTenantSummary(membership, tenantPlan, publicVehicleCount, activeServiceFeePercent)
          : null,
      openRenterTripCount,
      platformRole: platformMembership?.roleKey ?? null,
      permissions: [...new Set([...tenantPermissions, ...platformPermissions])],
    };
  }
}

/**
 * Gian hàng hiện hành cho `MeDto` — kèm trục NĂNG LỰC (ADR 0027).
 *
 * `features` LUÔN đủ 8 cờ kể cả `hidden`: web dựng menu từ nó ở lần vẽ đầu, và một cờ vắng mặt
 * không phân biệt được với "backend cũ chưa biết cờ này".
 */
function toTenantSummary(
  membership: {
    roleKey: string;
    tenant: {
      id: string;
      name: string;
      slug: string;
      status: string;
      onboardingState: string;
      usedFeatures: string[];
      profile: { logoUrl: string | null } | null;
      subscriptions: {
        endsAt: Date;
        billingMode: string | null;
        plan: { code: string; name: string; limitsJson: unknown };
      }[];
    };
  },
  /** Ngữ cảnh gói đã giải ở `me()` — nhận vào thay vì giải lại, để có đúng MỘT phép chấm pha. */
  plan: TenantPlanContext,
  publicVehicleCount: number,
  /** % phí dịch vụ của chính sách phí đang hiệu lực — xem `CurrentTenantSummaryDto`. */
  activeServiceFeePercent: number | null,
): CurrentTenantSummaryDto {
  return {
    id: membership.tenant.id,
    name: membership.tenant.name,
    slug: membership.tenant.slug,
    status: membership.tenant.status,
    /*
     * Trục ĐĂNG KÝ, độc lập với `status` và `billingMode` — xem `CurrentTenantSummaryDto`.
     * Web đọc nó TRƯỚC `billingMode` trong `resolveWorkspaceHref`: `package_pending` có
     * `billingMode = null`, và mọi phép suy chỉ dựa vào `billingMode` sẽ xếp họ vào cùng rổ với
     * một tenant có danh mục gói hỏng.
     */
    onboardingState: membership.tenant.onboardingState,
    roleKey: membership.roleKey,
    logoUrl: membership.tenant.profile?.logoUrl ?? null,
    features: Object.entries(plan.features).map(([feature, state]) => ({ feature, state })),
    planCode: plan.planCode,
    planName: plan.planName,
    /*
     * % chỉ có nghĩa ở TUYẾN HOA HỒNG: tuyến gói trả 0đ trên chuyến (ADR 0029 điều 2), và
     * `unconfigured` chưa xác định được tuyến nên không có gì để hứa.
     */
    serviceFeePercent:
      plan.billingMode === BILLING_MODE.COMMISSION ? activeServiceFeePercent : null,
    planEndsAt: plan.planEndsAt?.toISOString() ?? null,
    billingMode: plan.billingMode,
    billingPhase: plan.phase,
    graceEndsAt: plan.graceEndsAt?.toISOString() ?? null,
    publicVehicleCount,
  };
}

/** Tên hiển thị mặc định cho tài khoản tạo bằng SĐT (chưa nhập tên): "Khách 4567". */
function defaultPhoneName(normalizedPhone: string): string {
  const last4 = normalizedPhone.slice(-4);
  return `Khách ${last4}`;
}
