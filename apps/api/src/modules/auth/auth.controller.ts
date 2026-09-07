import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser, Public, VerifiesCredentials } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import {
  ForgotPasswordDto,
  LoginDto,
  MeDto,
  RegisterDto,
  ResetPasswordDto,
  SetPasswordDto,
} from './dto/auth.dto';

/**
 * Xác thực cho WEB — phiên bằng httpOnly cookie (ADR 0002).
 *
 * `@Throttle` trên bốn route công khai dưới đây siết chặt hơn hẳn mức chung 120 req/phút của app
 * (`app.module.ts`), và đặt **bằng đúng** mức của cặp song sinh native ở `MobileAuthController`:
 * hai controller gọi CÙNG `AuthService.loginWithPassword` / `AuthService.register`, nên để web
 * rộng hơn nghĩa là cửa dò mật khẩu chặt nhất của hệ thống chính là cửa lỏng nhất — kẻ dò chỉ
 * việc đổi URL.
 *
 * Vì sao rate limit là lớp phòng thủ CÒN LẠI, không phải lớp phụ: `loginWithPassword` không đếm
 * số lần sai và không khoá tài khoản (`ACCOUNT_LOCKED` chỉ phản ánh `users.status` do admin đặt).
 * Nó cố ý trả cùng một lỗi cho "không có tài khoản" và "sai mật khẩu", và so bcrypt với một hash
 * giả khi không tìm thấy user để thời gian phản hồi không tố cáo điều đó — nhưng cả hai thứ đó
 * chỉ giấu *ai tồn tại*, không hãm được tốc độ đoán mật khẩu.
 *
 * `password/forgot` siết cùng mức vì mỗi request GỬI MỘT EMAIL tới địa chỉ người khác nhập vào:
 * không siết thì đây là một khẩu súng bắn thư miễn phí, dù nó luôn trả 204 và không rò rỉ gì.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  // 5/phút — bằng `POST /auth/mobile/register`. Gửi liên tiếp nhiều SĐT để xem số nào trả
  // `PHONE_TAKEN` là cách dò danh bạ người dùng; đây là chỗ duy nhất hãm được nó.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
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
  // 5/phút — bằng `POST /auth/mobile/login`. Xem docblock của controller: không có bộ đếm sai
  // mật khẩu nào phía sau, nên đây là lớp duy nhất hãm tốc độ đoán.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
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
  // 5/phút — mỗi request gửi một email tới địa chỉ do người gọi nhập.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Quên mật khẩu: gửi link đặt lại qua email' })
  @ApiNoContentResponse()
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    // Luôn 204 dù email có tồn tại hay không (không rò rỉ email đã đăng ký).
    await this.auth.requestPasswordReset(dto.email);
  }

  @Public()
  @Post('password/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  // 10/phút — token đặt lại là 32 byte ngẫu nhiên nên không dò nổi bằng vét cạn; mức này để một
  // client hỏng không bơm được vào bảng token, không phải để chống đoán.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
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
