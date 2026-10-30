import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  BILLING_MODE,
  MEMBERSHIP_STATUS,
  PHONE_VERIFICATION_PURPOSE,
  USER_STATUS,
  OPEN_CUSTOMER_TRIP_STATUSES,
  VEHICLE_PUBLIC_STATUS,
  compactPhoneInput,
  realmAllowsPasswordlessLogin,
  realmAllowsSelfRegistration,
  realmRequiresPhoneLogin,
  type AccountRealm,
  type Permission,
  type PhoneVerificationPurpose,
} from '@xeprime/types';
/*
 * `bcrypt` NATIVE chứ không phải `bcryptjs`: bản JS thuần băm ngay trên event loop — mỗi phép
 * cost 12 chặn cả API ~250ms, bốn lượt đăng nhập cùng lúc xếp hàng thành ~1s. Bản native chạy
 * trên threadpool của libuv, event loop không kẹt. Định dạng `$2a$`/`$2b$` như nhau nên hash cũ
 * trong DB vẫn đọc được.
 */
import bcrypt from 'bcrypt';
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
import {
  resolveStorefront,
  storefrontTenantSelect,
} from '../../common/storefront/storefront-identity';
import { EmailService } from '../email/email.service';
import { FeePoliciesService } from '../fee-policies/fee-policies.service';
import { PhoneVerificationService } from '../phone-verification/phone-verification.service';
import { LoginThrottleService } from './login-throttle.service';
import { NATIVE_REVOKE_REASON, NativeSessionService } from './native-session.service';
import { RequestRealmService } from './request-realm.service';
import { SessionService, WEB_REVOKE_REASON } from './session.service';
import type { CurrentTenantSummaryDto, MeDto } from './dto/auth.dto';
import type { VerifiedIdentity } from './social/identity';

const BCRYPT_ROUNDS = 12;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 giờ

let timingDummyHash: Promise<string> | undefined;
/**
 * Hash THẬT, cùng cost, của một chuỗi ngẫu nhiên không ai biết — để `loginWithPassword` so khớp
 * khi định danh không có tài khoản, cho thời gian phản hồi bằng nhau.
 *
 * Không dùng hằng số viết tay: hằng `$2a$12$000…` cũ có salt không hợp lệ nên thư viện từ chối
 * NGAY (0ms) thay vì băm (~250ms) — đo thời gian là biết SĐT/email có tài khoản hay không.
 */
function timingDummyHashOnce(): Promise<string> {
  timingDummyHash ??= bcrypt.hash(randomBytes(32).toString('hex'), BCRYPT_ROUNDS);
  return timingDummyHash;
}

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
    /** URL site của từng realm — link trong email trỏ về đúng site của tài khoản (ADR 0053). */
    private readonly realms: RequestRealmService,
    /**
     * OTP chỉ để CHỨNG MINH SỞ HỮU SĐT trước khi tạo tài khoản hoặc đặt lại mật khẩu (ADR 0060).
     * Nó không bao giờ là một cách đăng nhập: không hàm nào ở đây phát phiên vì một mã đúng.
     */
    private readonly phoneVerification: PhoneVerificationService,
    /** Phiên web + phiên app — đổi/đặt lại mật khẩu thu hồi chúng (ADR 0076). */
    private readonly sessions: SessionService,
    private readonly nativeSessions: NativeSessionService,
    /** Khoá đăng nhập theo định danh (ADR 0076 điều 3). */
    private readonly loginThrottle: LoginThrottleService,
  ) {}

  /**
   * Realm `platform` không tự đăng ký và không vào bằng Google/Facebook — ADR 0053 điều 3.
   * Kiểm TRƯỚC khi chạm DB: không có hàng nào được ghi cho một lượt chắc chắn hỏng.
   */
  private assertSelfRegistration(realm: AccountRealm): void {
    if (!realmAllowsSelfRegistration(realm)) {
      throw new BadRequestException({
        code: API_ERROR_CODE.REALM_LOGIN_METHOD_NOT_ALLOWED,
        message: 'Tài khoản quản trị do quản trị viên nền tảng tạo, không tự đăng ký',
      });
    }
  }

  private assertSocialLogin(realm: AccountRealm): void {
    if (!realmAllowsPasswordlessLogin(realm)) {
      throw new BadRequestException({
        code: API_ERROR_CODE.REALM_LOGIN_METHOD_NOT_ALLOWED,
        message: 'Tài khoản quản trị chỉ đăng nhập bằng mật khẩu',
      });
    }
  }

  // ---- Đăng ký / đăng nhập bằng định danh + mật khẩu ------------------------

  /**
   * Đăng ký bằng SĐT + mật khẩu, TRONG một realm (ADR 0053). SĐT được chuẩn hoá về dạng
   * `84xxxxxxxxx` trước khi lưu. Cùng số đó ở realm khác là một tài khoản khác, không phải trùng.
   * Tạo user + identity(provider='password') trong một transaction.
   *
   * Từ ADR 0060 SĐT phải được CHỨNG MINH SỞ HỮU bằng OTP `purpose=register` (mã gửi qua
   * `POST /auth/phone/send-otp`) — tài khoản ra đời với `phone_verified_at` đã đặt, nên không ai
   * chiếm được số của người khác, và luật chặn tự đặt xe (ADR 0053 điều 7) đọc được số này.
   *
   * Thứ tự cố ý: MÃ trước, TRÙNG sau. Kiểm trùng trước mã thì endpoint này thành máy dò "số nào
   * đã có tài khoản" mà không cần cầm điện thoại của ai (`send-otp` đã báo trùng sớm cho người
   * dùng thật, dưới cùng mức chặn tần suất).
   */
  async register(
    input: {
      phone: string;
      password: string;
      displayName: string;
      code: string;
    },
    realm: AccountRealm,
  ): Promise<{ userId: string }> {
    this.assertSelfRegistration(realm);
    const phone = normalizePhone(input.phone);

    // Nhận cả mã vừa gửi lẫn mã đã qua bước "Xác thực" của form (tích xanh) — xem service.
    await this.phoneVerification.verifyRegistrationOtp(input.phone, input.code, realm);

    const existing = await this.prisma.user.findFirst({
      where: { realm, phone, deletedAt: null },
      select: { id: true },
    });
    if (existing) throw phoneTaken();

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const userId = newId();
    const now = new Date();

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.create({
          data: {
            id: userId,
            realm,
            phone,
            phoneVerifiedAt: now,
            displayName: input.displayName.trim(),
            passwordHash,
            status: USER_STATUS.ACTIVE,
            lastLoginAt: now,
          },
        });
        await tx.userIdentity.create({
          data: {
            id: newId(),
            userId,
            realm,
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
        throw phoneTaken();
      }
      throw err;
    }

    return { userId };
  }

  /**
   * Đăng nhập bằng định danh + mật khẩu, TRONG realm của site/app đang gọi.
   *
   *  - `customer` · `partner`: định danh CHỈ là số điện thoại (ADR 0060). Một chuỗi có `@` bị từ
   *    chối bằng `PHONE_LOGIN_REQUIRED` TRƯỚC khi chạm DB — luật chặn theo HÌNH DẠNG, nên nó không
   *    nói gì về việc email đó có tài khoản hay không. Ẩn ô email ở giao diện thôi thì một client
   *    tự gọi API vẫn đăng nhập bằng email được — chỗ chặn thật là ở đây.
   *  - `platform`: email HOẶC số điện thoại như trước (ADR 0053 điều 3 — không đổi).
   *
   * Lỗi luôn chung chung (INVALID_CREDENTIALS) dù sai định danh hay sai mật khẩu — không tiết lộ
   * tài khoản nào tồn tại. So khớp bcrypt kể cả khi không có user (giảm timing attack). Tài khoản
   * không có mật khẩu (tạo bằng Google/Facebook, hay bằng OTP thời trước ADR 0060) không đăng
   * nhập kiểu này được — lối của họ là "Quên mật khẩu" bằng SĐT, hoặc mạng xã hội đã nối.
   */
  async loginWithPassword(
    rawIdentifier: string,
    password: string,
    realm: AccountRealm,
  ): Promise<{ userId: string }> {
    const identifier = rawIdentifier.trim();
    const isEmail = identifier.includes('@');
    if (isEmail && realmRequiresPhoneLogin(realm)) {
      throw new BadRequestException({
        code: API_ERROR_CODE.PHONE_LOGIN_REQUIRED,
        message: 'Hãy đăng nhập bằng số điện thoại',
      });
    }
    // Tra TRONG realm (ADR 0053): cùng số/email ở site khác là một tài khoản khác, mật khẩu khác.
    // `compactPhoneInput` bỏ dấu cách/chấm/gạch/ngoặc — cùng phép bỏ mà ô nhập ở client đã cho qua.
    const key = isEmail ? identifier.toLowerCase() : normalizePhone(compactPhoneInput(identifier));
    const where = isEmail
      ? { realm, email: key, deletedAt: null }
      : { realm, phone: key, deletedAt: null };

    // Định danh đang bị khoá vì sai quá nhiều lần — chặn TRƯỚC bcrypt, kể cả khi lần này đúng mật
    // khẩu (ADR 0076 điều 3). Định danh không có tài khoản cũng khoá y hệt.
    await this.loginThrottle.assertNotLocked(realm, key);

    const user = await this.prisma.user.findFirst({
      where,
      select: { id: true, passwordHash: true, status: true },
    });

    const hash = user?.passwordHash ?? (await timingDummyHashOnce());
    const ok = await bcrypt.compare(password, hash);

    if (!user || !user.passwordHash || !ok) {
      // Chạm trần ở chính lượt này thì `recordFailure` ném `LOGIN_TEMPORARILY_LOCKED`.
      await this.loginThrottle.recordFailure(realm, key);
      throw new UnauthorizedException({
        code: API_ERROR_CODE.INVALID_CREDENTIALS,
        message: realmRequiresPhoneLogin(realm)
          ? 'Số điện thoại hoặc mật khẩu không đúng'
          : 'Email/số điện thoại hoặc mật khẩu không đúng',
      });
    }
    if (user.status !== USER_STATUS.ACTIVE) {
      throw new UnauthorizedException({
        code: API_ERROR_CODE.ACCOUNT_LOCKED,
        message: 'Tài khoản đã bị khoá',
      });
    }

    await this.loginThrottle.clear(realm, [key]);
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
   *  - Mọi phiên KHÁC (web lẫn app) bị thu hồi trong cùng transaction; phiên đang thao tác
   *    (`current`) được giữ (ADR 0076 điều 2). Đổi mật khẩu vì nghi bị lộ mà kẻ kia vẫn ở trong là
   *    đổi cho có.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    current: { sessionId: string; transport: 'cookie' | 'bearer' },
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
      await this.sessions.revokeAllForUser(user.id, WEB_REVOKE_REASON.PASSWORD_CHANGED, {
        exceptSessionId: current.transport === 'cookie' ? current.sessionId : undefined,
        tx,
      });
      await this.nativeSessions.revokeAllForUser(user.id, NATIVE_REVOKE_REASON.PASSWORD_CHANGED, {
        exceptSessionId: current.transport === 'bearer' ? current.sessionId : undefined,
        tx,
      });
    });
  }

  /**
   * Sau khi mật khẩu được ĐẶT LẠI (email hoặc OTP): giết mọi phiên web + app của tài khoản, trong
   * transaction của lượt đổi mật khẩu. Người đặt lại mật khẩu thường là vì nghi bị chiếm — mọi
   * phiên đang mở đều có thể là của kẻ kia (ADR 0076 điều 2).
   */
  private async revokeAllSessionsWithinTx(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<void> {
    await this.sessions.revokeAllForUser(userId, WEB_REVOKE_REASON.PASSWORD_RESET, { tx });
    await this.nativeSessions.revokeAllForUser(userId, NATIVE_REVOKE_REASON.PASSWORD_RESET, { tx });
  }

  /** Mật khẩu vừa đặt lại ⇒ mở khoá đăng nhập của mọi định danh của tài khoản (ADR 0076 điều 3). */
  private async clearLoginLockout(
    realm: AccountRealm,
    account: { phone: string | null; email: string | null },
  ): Promise<void> {
    await this.loginThrottle.clear(
      realm,
      [account.phone, account.email].filter((value): value is string => Boolean(value)),
    );
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
  async requestPasswordReset(rawEmail: string, realm: AccountRealm): Promise<void> {
    const email = rawEmail.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { realm, email, deletedAt: null, status: USER_STATUS.ACTIVE },
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

    // Link về đúng SITE của tài khoản (ADR 0053): tài khoản partner đặt lại mật khẩu ở site partner.
    const resetUrl = `${this.realms.webUrlFor(realm)}/reset-password?token=${token}`;

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

  /**
   * Đặt mật khẩu mới từ token. Token dùng một lần, phải còn hạn, và phải được dùng ở đúng SITE
   * của tài khoản (ADR 0053): token của tài khoản partner đem sang site khách là token không hợp
   * lệ — cùng một mã lỗi, không lộ rằng token đó có tồn tại ở nơi khác.
   */
  async resetPassword(token: string, newPassword: string, realm: AccountRealm): Promise<void> {
    const tokenHash = this.hashToken(token);
    const record = await this.prisma.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() }, user: { realm } },
      select: { id: true, userId: true, user: { select: { phone: true, email: true } } },
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
      await this.revokeAllSessionsWithinTx(tx, record.userId);
    });
    await this.clearLoginLockout(realm, record.user);
  }

  // ---- OTP theo mục đích (ADR 0060) ------------------------------------------

  /**
   * Luật của AUTH cho một lần GỬI mã — gọi trước `PhoneVerificationService.sendOtp`.
   *
   *  - `login` → 410 `OTP_LOGIN_RETIRED`. Đăng nhập bằng OTP đã gỡ; gửi tiếp một tin nhắn có phí
   *    cho một mã không còn đổi được ra thứ gì là lãng phí của cả hai bên.
   *  - `register` → số đã có tài khoản TRONG realm ⇒ `PHONE_TAKEN` ngay, trước khi tốn tin nhắn —
   *    cùng kỷ luật với `POST /users/me/phone/send-otp`. Đây cũng là mức lộ thông tin mà
   *    `POST /auth/register` cũ vẫn có, dưới cùng mức chặn tần suất.
   *  - `password_reset` → KHÔNG nói số có tài khoản hay không: luôn trả như nhau, nhưng chỉ THẬT
   *    SỰ nhắn tin khi có một tài khoản đang hoạt động mang số đó (`deliver`). Hàng mã vẫn được
   *    ghi để cooldown/trần gửi tính như nhau ở cả hai nhánh — khác nhau ở cooldown là một máy dò.
   *  - mục đích khác: như trước.
   */
  /**
   * Kiểm một lượt đăng ký TRƯỚC bước nhập mã (`POST /auth/register/check` và bước gửi mã
   * `register`): site có tự đăng ký + SĐT chưa có tài khoản trong realm. Định dạng ô đã do DTO kiểm.
   * Không lộ thêm gì so với `send-otp` — cùng câu trả lời, cùng mức chặn tần suất. Lượt
   * `register` thật vẫn kiểm lại (unique DB là chốt cuối).
   */
  async checkRegistration(rawPhone: string, realm: AccountRealm): Promise<void> {
    this.assertSelfRegistration(realm);
    const taken = await this.prisma.user.findFirst({
      where: { realm, phone: normalizePhone(rawPhone), deletedAt: null },
      select: { id: true },
    });
    if (taken) throw phoneTaken();
  }

  async otpDeliveryFor(
    purpose: PhoneVerificationPurpose,
    rawPhone: string,
    realm: AccountRealm,
  ): Promise<{ deliver: boolean }> {
    if (purpose === PHONE_VERIFICATION_PURPOSE.LOGIN) throw otpLoginRetired();

    const phone = normalizePhone(rawPhone);
    if (purpose === PHONE_VERIFICATION_PURPOSE.REGISTER) {
      await this.checkRegistration(phone, realm);
      return { deliver: true };
    }
    if (purpose === PHONE_VERIFICATION_PURPOSE.PASSWORD_RESET) {
      return { deliver: (await this.findResettableAccount(phone, realm)) !== null };
    }
    return { deliver: true };
  }

  /**
   * Quên mật khẩu bằng SĐT — đặt mật khẩu mới từ mã OTP `purpose=password_reset` (ADR 0060).
   *
   * KHÔNG cấp phiên: mã chứng minh sở hữu số để ĐỔI MẬT KHẨU, không phải để vào tài khoản — người
   * dùng đăng nhập lại bằng mật khẩu vừa đặt. Biến bước này thành một lần đăng nhập là mở lại
   * đúng cửa "đăng nhập bằng OTP" vừa đóng.
   *
   * Không tài khoản nào mang số đó ⇒ CÙNG lỗi `OTP_INVALID` với mã sai: ở production mã cho một
   * số không có tài khoản không bao giờ được gửi đi, nên đây đúng là thứ người dò sẽ nhận.
   *
   * Mã đúng còn là bằng chứng sở hữu số ⇒ đóng dấu `phone_verified_at` nếu chưa có (tài khoản cũ
   * đăng ký trước khi đăng ký bắt OTP). Link đặt lại qua email đang lơ lửng mất hiệu lực, như ở
   * `resetPassword`.
   *
   * Mã nhận ở dạng đang chờ (app gửi mã + mật khẩu cùng lúc) HOẶC đã qua bước "Nhập mã OTP" của web
   * (`verify-otp` trước, mật khẩu mới ở màn sau) — và bị TIÊU trong cùng transaction đổi mật khẩu,
   * nên mỗi mã chỉ đổi được mật khẩu một lần.
   */
  async resetPasswordWithOtp(
    rawPhone: string,
    code: string,
    newPassword: string,
    realm: AccountRealm,
  ): Promise<void> {
    if (!realmRequiresPhoneLogin(realm)) {
      throw new BadRequestException({
        code: API_ERROR_CODE.REALM_LOGIN_METHOD_NOT_ALLOWED,
        message: 'Tài khoản quản trị đặt lại mật khẩu qua email',
      });
    }
    const verificationId = await this.phoneVerification.verifyPasswordResetOtp(
      rawPhone,
      code,
      realm,
    );

    const account = await this.findResettableAccount(normalizePhone(rawPhone), realm);
    if (!account) {
      throw new BadRequestException({
        code: API_ERROR_CODE.OTP_INVALID,
        message: 'Mã xác thực không đúng',
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await this.phoneVerification.consumePasswordResetWithinTx(tx, verificationId);
      await tx.user.update({
        where: { id: account.id },
        data: { passwordHash, ...(account.phoneVerifiedAt ? {} : { phoneVerifiedAt: now }) },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId: account.id, usedAt: null },
        data: { usedAt: now },
      });
      await this.revokeAllSessionsWithinTx(tx, account.id);
    });
    await this.clearLoginLockout(realm, account);
  }

  /** Tài khoản ĐANG HOẠT ĐỘNG mang SĐT đó trong realm — cùng điều kiện với quên mật khẩu qua email. */
  private findResettableAccount(
    normalizedPhone: string,
    realm: AccountRealm,
  ): Promise<{
    id: string;
    phone: string | null;
    email: string | null;
    phoneVerifiedAt: Date | null;
  } | null> {
    return this.prisma.user.findFirst({
      where: { realm, phone: normalizedPhone, deletedAt: null, status: USER_STATUS.ACTIVE },
      select: { id: true, phone: true, email: true, phoneVerifiedAt: true },
    });
  }

  /**
   * Tìm hoặc tạo user từ một danh tính ĐÃ được nhà cung cấp xác minh — ADR 0002 bước 2.
   *
   * Idempotent: đăng nhập lại bằng cùng provider không tạo user mới. Khoá tra cứu là
   * `(realm, provider, providerUserId)` chứ không phải email — email đổi được, và tin email
   * để nhận diện là cách hai tài khoản khác nhau bị gộp làm một.
   *
   * Nhận `VerifiedIdentity` chứ không nhận token (ADR 0019): việc xác minh là chuyện riêng của
   * từng provider và đã xong trước khi vào đây. Nhờ vậy hàm này không biết Google, Facebook hay
   * Apple tồn tại — thêm provider mới không chạm một dòng nào ở đây.
   */
  async upsertUserFromIdentity(
    identity: VerifiedIdentity,
    realm: AccountRealm,
  ): Promise<{ userId: string }> {
    this.assertSocialLogin(realm);
    const providerEmail = identity.email?.trim().toLowerCase() ?? null;

    // Khoá tra cứu có realm (ADR 0053 điều 1): cùng một tài khoản Google là một tài khoản XePrime
    // ở site khách và một tài khoản KHÁC ở site partner.
    const existing = await this.prisma.userIdentity.findUnique({
      where: {
        realm_provider_providerUserId: {
          realm,
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

    /*
     * Tự nối vào tài khoản có sẵn theo email CHỈ KHI cả hai đầu cùng đã xác minh email đó:
     *  - provider chưa xác minh ⇒ kẻ khác tự khai cùng email để vào tài khoản của nạn nhân;
     *  - tài khoản XePrime chưa xác minh (vd tạo bằng Facebook, email chỉ là thông tin provider
     *    đưa) ⇒ kẻ khác GIEO sẵn một tài khoản mang email nạn nhân, chờ nạn nhân đăng nhập Google
     *    là được nối vào tài khoản kẻ đó còn giữ (pre-account hijack).
     * Lệch một trong hai ⇒ CONFLICT, người dùng đăng nhập bằng cách đã dùng trước đó.
     */
    const emailUser = providerEmail
      ? await this.prisma.user.findFirst({
          where: { realm, email: providerEmail, deletedAt: null },
          select: { id: true, status: true, emailVerifiedAt: true },
        })
      : null;

    if (emailUser && (!identity.emailVerified || emailUser.emailVerifiedAt === null)) {
      throw new ConflictException({
        code: API_ERROR_CODE.CONFLICT,
        message:
          'Email này đã có tài khoản XePrime. Hãy đăng nhập bằng phương thức đã dùng trước đó.',
      });
    }

    const linkedUser = emailUser;
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
            realm,
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
          realm,
          provider: identity.provider,
          providerUserId: identity.providerUserId,
          providerEmail,
          providerPhone: identity.phone,
        },
      });
    });

    return { userId };
  }

  async me(userId: string): Promise<MeDto> {
    const user = await this.prisma.user.findFirstOrThrow({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        realm: true,
        displayName: true,
        email: true,
        avatarUrl: true,
        phone: true,
        phoneVerifiedAt: true,
        passwordHash: true,
      },
    });
    const realm = user.realm as AccountRealm;

    /*
     * Mỗi realm chỉ có đúng phần của nó (ADR 0053): tài khoản khách không có gian hàng, tài khoản
     * partner không có chuyến đi thuê, tài khoản nền tảng không có cả hai. DB đã giữ hai vế đầu
     * bằng trigger; ở đây chỉ là không đi hỏi những thứ chắc chắn rỗng trên endpoint nóng nhất.
     */
    const isPartner = realm === ACCOUNT_REALM.PARTNER;
    const isPlatform = realm === ACCOUNT_REALM.PLATFORM;
    const isCustomer = realm === ACCOUNT_REALM.CUSTOMER;

    const now = new Date();
    const [membership, platformMembership] = await Promise.all([
      !isPartner
        ? null
        : this.prisma.tenantMembership.findFirst({
            where: { userId, status: MEMBERSHIP_STATUS.ACTIVE },
            select: {
              roleKey: true,
              roleId: true,
              // Phạm vi chi nhánh (ADR 0052) — web cần nó để KHÔNG đưa "Tất cả chi nhánh" cho người
              // bị giới hạn ở modal mời và ô phân quyền. Backend vẫn chặn (`BRANCH_SCOPE_EXCEEDED`).
              branchScope: true,
              // Trục năng lực (ADR 0027) đi kèm luôn — `select` phải khớp `TenantScopeGuard`, vì cả
              // hai gọi cùng `resolveTenantFeatures`. Menu của web đọc từ đây ở LẦN VẼ ĐẦU, nên tách
              // ra một query riêng là menu nhấp nháy.
              tenant: {
                select: {
                  /*
                   * Tên khu làm việc theo tuyến HIỆU LỰC (ADR 0054): chủ xe cá nhân là chính họ — vỏ
                   * site partner hiện họ tên trên tài khoản, không phải tên gian hàng cũ từ thời có
                   * gói. `subscriptions` của fragment trùng khít bản bên dưới (cùng where/args).
                   */
                  ...storefrontTenantSelect(now),
                  id: true,
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
          }),
      !isPlatform
        ? null
        : this.prisma.platformMembership.findFirst({
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
     * Chuyến ĐI THUÊ chưa khép — CHỈ tài khoản khách có (ADR 0053: chủ xe đi thuê bằng tài khoản
     * khách riêng, nên tài khoản partner không bao giờ là người thuê).
     *
     * Đếm ở đây thay vì để web tự gọi `/trips`: menu vẽ ở LẦN ĐẦU, và một request thứ hai nghĩa
     * là menu nhấp nháy. Cùng vị từ với tab "đang diễn ra" của `/trips`
     * (`OPEN_CUSTOMER_TRIP_STATUSES`).
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
      isCustomer ? this.prisma.bookingRequest.count({ where: openTripWhere }) : 0,
      /*
       * Giải ngữ cảnh gói TRƯỚC, vì nó quyết định có cần đọc chính sách phí hay không — và
       * `toTenantSummary` dùng lại chính kết quả này thay vì giải lần thứ hai.
       */
      Promise.resolve(
        membership
          ? resolveTenantFeatures(
              membership.tenant.subscriptions,
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
      realm,
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
          ? toTenantSummary(
              membership,
              resolveStorefront(membership.tenant, now).name,
              tenantPlan,
              publicVehicleCount,
              activeServiceFeePercent,
            )
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
    branchScope: string;
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
  /** Tên khu làm việc theo tuyến (`resolveStorefront`) — không phải `tenants.name` trần. */
  workspaceName: string,
  /** Ngữ cảnh gói đã giải ở `me()` — nhận vào thay vì giải lại, để có đúng MỘT phép chấm pha. */
  plan: TenantPlanContext,
  publicVehicleCount: number,
  /** % phí dịch vụ của chính sách phí đang hiệu lực — xem `CurrentTenantSummaryDto`. */
  activeServiceFeePercent: number | null,
): CurrentTenantSummaryDto {
  return {
    id: membership.tenant.id,
    name: workspaceName,
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
    branchScope: membership.branchScope,
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

/** SĐT đã có tài khoản TRONG realm — một mã, một câu, ở mọi đường tạo/gắn số. */
function phoneTaken(): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.PHONE_TAKEN,
    message: 'Số điện thoại này đã được đăng ký',
  });
}

/**
 * 410 cho mọi cửa của đăng nhập bằng OTP đã gỡ (ADR 0060) — gửi mã `purpose=login`, và hai route
 * `…/phone/login` của web và app. 410 chứ không 404: route vẫn còn để client cũ nhận được một MÃ
 * đọc được ("hãy đăng nhập bằng mật khẩu / quên mật khẩu") thay vì một lỗi mơ hồ.
 */
export function otpLoginRetired(): GoneException {
  return new GoneException({
    code: API_ERROR_CODE.OTP_LOGIN_RETIRED,
    message:
      'Đăng nhập bằng mã OTP không còn hỗ trợ. Hãy đăng nhập bằng số điện thoại và mật khẩu.',
  });
}
