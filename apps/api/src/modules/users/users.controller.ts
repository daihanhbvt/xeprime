import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  EMAIL_VERIFICATION_PURPOSE,
  PHONE_VERIFICATION_PURPOSE,
} from '@xeprime/types';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CurrentUser } from '../../common/decorators';
import { normalizePhone } from '../../common/phone';
import type { AuthenticatedUser } from '../../common/types/request-context';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import {
  EmailVerificationService,
  normalizeEmail,
} from '../email-verification/email-verification.service';
import { SendOtpResultDto } from '../phone-verification/dto/phone-verification.dto';
import { PhoneVerificationService } from '../phone-verification/phone-verification.service';

/** SĐT Việt Nam: `0` + 9 số hoặc `+84` + 9 số. Server chuẩn hoá về `84xxxxxxxxx`. */
const VN_PHONE = /^(0|\+84)\d{9}$/;

export class UpdateMeDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  displayName?: string;

  /**
   * `null` = GỠ ảnh đại diện, `undefined` = không đụng tới. Hai thứ khác nhau và cả hai đều cần:
   * thiếu `null` thì nút "Xoá ảnh" ở giao diện không có cách nào diễn đạt được ý của nó, và ảnh
   * cũ nằm lại mãi.
   */
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  avatarUrl?: string | null;
}

export class SendPhoneOtpDto {
  @ApiProperty({ example: '0901234567' })
  @IsString()
  @Matches(VN_PHONE, { message: 'Số điện thoại không hợp lệ' })
  phone!: string;
}

export class VerifyPhoneDto extends SendPhoneOtpDto {
  @ApiProperty({ example: '123456', minLength: 6, maxLength: 6 })
  @IsString()
  @Length(6, 6)
  code!: string;
}

export class SendEmailOtpDto {
  @ApiProperty({ example: 'ten@vidu.com', maxLength: 255 })
  @IsEmail({}, { message: 'Địa chỉ email không hợp lệ' })
  @MaxLength(255)
  email!: string;
}

export class VerifyEmailDto extends SendEmailOtpDto {
  @ApiProperty({ example: '123456', minLength: 6, maxLength: 6 })
  @IsString()
  @Length(6, 6)
  code!: string;
}

export class UserProfileDto {
  @ApiProperty() id!: string;
  @ApiProperty() displayName!: string;
  // Luôn có mặt, chỉ nullable → `@ApiProperty` + `nullable` (không phải Optional).
  // `type: String` bắt buộc, thiếu nó contract sinh ra `Record<string, never>`.
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: String, nullable: true }) phone!: string | null;
  @ApiProperty({ type: String, nullable: true }) avatarUrl!: string | null;
  @ApiProperty() phoneVerified!: boolean;
  @ApiProperty() emailVerified!: boolean;
}

/** Cột cần đọc cho `UserProfileDto` — khai một lần để `me`/`updateMe`/verify không lệch nhau. */
const PROFILE_SELECT = {
  id: true,
  displayName: true,
  email: true,
  phone: true,
  avatarUrl: true,
  phoneVerifiedAt: true,
  emailVerifiedAt: true,
} as const;

type ProfileRow = {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  phoneVerifiedAt: Date | null;
  emailVerifiedAt: Date | null;
};

function toProfile(row: ProfileRow): UserProfileDto {
  const { phoneVerifiedAt, emailVerifiedAt, ...rest } = row;
  return {
    ...rest,
    phoneVerified: phoneVerifiedAt !== null,
    emailVerified: emailVerifiedAt !== null,
  };
}

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly phoneVerification: PhoneVerificationService,
    private readonly emailVerification: EmailVerificationService,
    private readonly email: EmailService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Hồ sơ của user hiện tại' })
  @ApiOkResponse({ type: UserProfileDto })
  async me(@CurrentUser() user: AuthenticatedUser): Promise<UserProfileDto> {
    const row = await this.prisma.user.findFirstOrThrow({
      where: { id: user.id, deletedAt: null },
      select: PROFILE_SELECT,
    });
    return toProfile(row);
  }

  /**
   * Chỉ sửa được hồ sơ của chính mình — không có tham số userId.
   *
   * `email`/`phone` KHÔNG đi qua đây: chúng là định danh đăng nhập, nên mỗi cái có một cặp
   * endpoint riêng bên dưới, nơi việc đổi chỉ có hiệu lực sau khi người dùng chứng minh mình
   * nhận được mã ở địa chỉ/số MỚI.
   */
  @Patch('me')
  @ApiOperation({ summary: 'Cập nhật tên hiển thị và ảnh đại diện của chính mình' })
  @ApiOkResponse({ type: UserProfileDto })
  async updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateMeDto,
  ): Promise<UserProfileDto> {
    const row = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        ...(dto.displayName === undefined ? {} : { displayName: dto.displayName }),
        ...(dto.avatarUrl === undefined ? {} : { avatarUrl: dto.avatarUrl }),
      },
      select: PROFILE_SELECT,
    });
    return toProfile(row);
  }

  /**
   * Bước 1 của đổi/thêm SĐT: gửi mã tới số MỚI.
   *
   * Kiểm tra trùng NGAY ở bước này thay vì đợi lúc xác nhận: bắt người dùng chờ một tin nhắn,
   * gõ đúng 6 số rồi mới báo "số này đã có tài khoản" là lãng phí cả thời gian của họ lẫn một
   * tin nhắn có phí. Unique index vẫn là chốt thật ở bước 2 (hai người có thể cùng qua được
   * kiểm tra này).
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('me/phone/send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gửi mã xác thực tới số điện thoại mới của chính mình' })
  @ApiOkResponse({ type: SendOtpResultDto })
  async sendPhoneOtp(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendPhoneOtpDto,
  ): Promise<SendOtpResultDto> {
    await this.assertPhoneFree(normalizePhone(dto.phone), user.id);
    const { expiresAt, devCode } = await this.phoneVerification.sendOtp(
      dto.phone,
      PHONE_VERIFICATION_PURPOSE.PROFILE,
    );
    return { expiresAt: expiresAt.toISOString(), devCode };
  }

  /**
   * Bước 2: mã đúng → `PhoneVerificationService` đóng dấu `users.phone` + `phone_verified_at`
   * trong cùng một transaction với bản ghi xác thực.
   */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('me/phone/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xác nhận mã và đổi số điện thoại của chính mình' })
  @ApiOkResponse({ type: UserProfileDto })
  async verifyPhone(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyPhoneDto,
  ): Promise<UserProfileDto> {
    const phone = normalizePhone(dto.phone);
    await this.assertPhoneFree(phone, user.id);

    try {
      await this.phoneVerification.verifyOtp(
        dto.phone,
        PHONE_VERIFICATION_PURPOSE.PROFILE,
        dto.code,
        user.id,
      );
    } catch (err) {
      // Hai tài khoản cùng xác thực một số gần như đồng thời: cả hai qua được pre-check, unique
      // index chặn người thứ hai. Đổi P2002 thành lỗi nghiệp vụ thay vì để lộ 500.
      rethrowAsTaken(err, API_ERROR_CODE.PHONE_TAKEN, 'Số điện thoại này đã có tài khoản');
    }

    return this.me(user);
  }

  /** Bước 1 của đổi/thêm email: gửi mã 6 số tới địa chỉ MỚI. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('me/email/send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gửi mã xác thực tới email mới của chính mình' })
  @ApiOkResponse({ type: SendOtpResultDto })
  async sendEmailOtp(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendEmailOtpDto,
  ): Promise<SendOtpResultDto> {
    const email = normalizeEmail(dto.email);
    await this.assertEmailFree(email, user.id);

    const me = await this.prisma.user.findFirstOrThrow({
      where: { id: user.id, deletedAt: null },
      select: { displayName: true },
    });
    const { expiresAt, devCode } = await this.emailVerification.sendOtp(
      email,
      EMAIL_VERIFICATION_PURPOSE.PROFILE,
      me.displayName,
    );
    return { expiresAt: expiresAt.toISOString(), devCode };
  }

  /**
   * Bước 2: mã đúng → ghi `users.email` + `email_verified_at`, rồi BÁO CHO ĐỊA CHỈ CŨ.
   *
   * Thư báo là lớp bảo vệ thật của luồng này: mã 6 số chỉ chứng minh người đổi kiểm soát hộp
   * thư MỚI, không chứng minh họ là chủ tài khoản. Nếu một phiên bị chiếm thì thư gửi tới địa
   * chỉ cũ là đường duy nhất tới được chủ thật.
   *
   * Gửi thư nằm NGOÀI transaction và lỗi gửi không làm hỏng việc đổi: người dùng đã chứng minh
   * đủ điều kiện, và một hộp thư cũ không còn tồn tại (lý do phổ biến nhất để đổi email) không
   * được phép chặn họ.
   */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('me/email/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xác nhận mã và đổi email của chính mình' })
  @ApiOkResponse({ type: UserProfileDto })
  async verifyEmail(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyEmailDto,
  ): Promise<UserProfileDto> {
    const email = normalizeEmail(dto.email);
    await this.assertEmailFree(email, user.id);

    const before = await this.prisma.user.findFirstOrThrow({
      where: { id: user.id, deletedAt: null },
      select: { email: true, displayName: true },
    });

    const verified = await this.emailVerification.verifyOtp(
      email,
      EMAIL_VERIFICATION_PURPOSE.PROFILE,
      dto.code,
      user.id,
    );

    // Unique index là chốt thật: hai tài khoản cùng xác thực một địa chỉ gần như đồng thời đều
    // qua được pre-check ở trên, và người thứ hai phải nhận một lỗi đọc được chứ không phải 500.
    const row: ProfileRow = await this.prisma.user
      .update({
        where: { id: user.id },
        data: { email: verified, emailVerifiedAt: new Date() },
        select: PROFILE_SELECT,
      })
      .catch((err: unknown) =>
        rethrowAsTaken(err, API_ERROR_CODE.EMAIL_TAKEN, 'Email này đã có tài khoản'),
      );

    if (before.email && before.email !== verified) {
      await this.email
        .sendEmailChangedNotice(before.email, before.displayName, verified)
        .catch(() => undefined);
    }

    return toProfile(row);
  }

  /** SĐT đã thuộc về một tài khoản KHÁC (còn sống) thì không ai đổi sang được. */
  private async assertPhoneFree(phone: string, userId: string): Promise<void> {
    const taken = await this.prisma.user.findFirst({
      where: { phone, deletedAt: null, id: { not: userId } },
      select: { id: true },
    });
    if (taken) {
      throw new ConflictException({
        code: API_ERROR_CODE.PHONE_TAKEN,
        message: 'Số điện thoại này đã có tài khoản',
      });
    }
  }

  private async assertEmailFree(email: string, userId: string): Promise<void> {
    const taken = await this.prisma.user.findFirst({
      where: { email, deletedAt: null, id: { not: userId } },
      select: { id: true },
    });
    if (taken) {
      throw new ConflictException({
        code: API_ERROR_CODE.EMAIL_TAKEN,
        message: 'Email này đã có tài khoản',
      });
    }
  }
}

/** Va chạm unique → lỗi nghiệp vụ ổn định; mọi lỗi khác đi tiếp nguyên vẹn. */
function rethrowAsTaken(err: unknown, code: string, message: string): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    throw new ConflictException({ code, message });
  }
  throw err;
}
