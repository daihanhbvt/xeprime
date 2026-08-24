import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, Public, VerifiesCredentials } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import {
  CreateSessionDto,
  ForgotPasswordDto,
  LoginDto,
  MeDto,
  RegisterDto,
  ResetPasswordDto,
  SetPasswordDto,
} from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  /**
   * ADR 0002 — thay cho `POST /auth/sync-firebase-user` mà tài liệu cũ mô tả.
   *
   * Đây là endpoint DUY NHẤT nhận ID token của Firebase. Sau lời gọi này, client không
   * bao giờ gửi token nữa; mọi request đi bằng session cookie.
   */
  @Public()
  @VerifiesCredentials()
  @Post('session')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập: đổi ID token lấy session cookie httpOnly' })
  @ApiOkResponse({ type: MeDto })
  async createSession(
    @Body() dto: CreateSessionDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeDto> {
    const { userId } = await this.auth.upsertUserFromIdToken(dto.idToken);
    const { token } = this.sessions.issue(userId);
    this.sessions.attach(res, token);
    return this.auth.me(userId);
  }

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Đăng ký bằng số điện thoại + mật khẩu' })
  @ApiOkResponse({ type: MeDto })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeDto> {
    const { userId } = await this.auth.register(dto);
    this.issueSession(res, userId);
    return this.auth.me(userId);
  }

  @Public()
  @VerifiesCredentials()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập bằng email hoặc số điện thoại + mật khẩu' })
  @ApiOkResponse({ type: MeDto })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response): Promise<MeDto> {
    const { userId } = await this.auth.loginWithPassword(dto.identifier, dto.password);
    this.issueSession(res, userId);
    return this.auth.me(userId);
  }

  @Post('password/set')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Đặt mật khẩu lần đầu cho tài khoản chưa có (vd tạo bằng SĐT/OTP)' })
  @ApiNoContentResponse()
  async setPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetPasswordDto,
  ): Promise<void> {
    await this.auth.setPassword(user.id, dto.password);
  }

  @Public()
  @Post('password/forgot')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Quên mật khẩu: gửi link đặt lại qua email' })
  @ApiNoContentResponse()
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    // Luôn 204 dù email có tồn tại hay không (không rò rỉ email đã đăng ký).
    await this.auth.requestPasswordReset(dto.email);
  }

  @Public()
  @Post('password/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Đặt lại mật khẩu từ token trong email' })
  @ApiNoContentResponse()
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.auth.resetPassword(dto.token, dto.password);
  }

  @Public()
  @Delete('session')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Đăng xuất: xoá session cookie' })
  logout(@Res({ passthrough: true }) res: Response): void {
    this.sessions.clear(res);
  }

  private issueSession(res: Response, userId: string): void {
    const { token } = this.sessions.issue(userId);
    this.sessions.attach(res, token);
  }

  @Get('me')
  @ApiOperation({ summary: 'Thông tin user hiện tại kèm tenant scope và quyền' })
  @ApiOkResponse({ type: MeDto })
  me(@CurrentUser() user: AuthenticatedUser): Promise<MeDto> {
    return this.auth.me(user.id);
  }
}
