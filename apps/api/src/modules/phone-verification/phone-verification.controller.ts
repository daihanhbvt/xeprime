import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PHONE_VERIFICATION_PURPOSE, type PhoneVerificationPurpose } from '@xeprime/types';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators';
import { resolveOptionalUserId } from '../../common/optional-user';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { SessionService } from '../auth/session.service';
import { MeDto } from '../auth/dto/auth.dto';
import {
  PhoneLoginDto,
  SendOtpDto,
  SendOtpResultDto,
  VerifyOtpDto,
  VerifyOtpResultDto,
} from './dto/phone-verification.dto';
import { PhoneVerificationService } from './phone-verification.service';

/**
 * Xác thực SĐT bằng OTP (Phase 4) — công khai. Provider mock (dev, log mã) hoặc eSMS (thật),
 * chọn qua OTP_MODE. `@Throttle` siết riêng để hãm brute-force mã 6 số (ngoài rate-limit trong
 * service tính theo SĐT). Best-effort gắn userId để stamp `phone_verified_at` khi đã đăng nhập.
 *
 * `POST login` là passwordless (ADR 0002): OTP purpose=login vừa xác thực SĐT vừa cấp session
 * httpOnly — tái dùng `SessionService` như mọi luồng đăng nhập khác, không nhét quyền vào token.
 */
@ApiTags('phone-verification')
@Controller('auth/phone')
export class PhoneVerificationController {
  constructor(
    private readonly service: PhoneVerificationService,
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gửi mã OTP tới số điện thoại' })
  @ApiOkResponse({ type: SendOtpResultDto })
  async sendOtp(@Body() dto: SendOtpDto): Promise<SendOtpResultDto> {
    const { expiresAt, devCode } = await this.service.sendOtp(
      dto.phone,
      dto.purpose as PhoneVerificationPurpose,
    );
    return { expiresAt: expiresAt.toISOString(), devCode };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xác nhận mã OTP' })
  @ApiOkResponse({ type: VerifyOtpResultDto })
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request): Promise<VerifyOtpResultDto> {
    const userId = await resolveOptionalUserId(req, this.sessions, this.prisma);
    await this.service.verifyOtp(
      dto.phone,
      dto.purpose as PhoneVerificationPurpose,
      dto.code,
      userId,
    );
    return { verified: true };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập passwordless bằng SĐT + OTP (tự tạo tài khoản nếu chưa có)' })
  @ApiOkResponse({ type: MeDto })
  async login(
    @Body() dto: PhoneLoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeDto> {
    // Verify OTP purpose=login (đúng mục đích, không dùng chéo) → tìm/tạo tài khoản theo SĐT →
    // cấp session cookie. Tất cả sau khi khách đã chứng minh sở hữu SĐT bằng mã đúng.
    await this.service.verifyOtp(dto.phone, PHONE_VERIFICATION_PURPOSE.LOGIN, dto.code, null);
    const { userId } = await this.auth.resolveOrCreateUserByPhone(dto.phone);
    const { token } = this.sessions.issue(userId);
    this.sessions.attach(res, token);
    return this.auth.me(userId);
  }
}
