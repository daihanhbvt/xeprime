import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, Public } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { CreateSessionDto, MeDto } from './dto/auth.dto';

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
  @Delete('session')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Đăng xuất: xoá session cookie' })
  logout(@Res({ passthrough: true }) res: Response): void {
    this.sessions.clear(res);
  }

  @Get('me')
  @ApiOperation({ summary: 'Thông tin user hiện tại kèm tenant scope và quyền' })
  @ApiOkResponse({ type: MeDto })
  me(@CurrentUser() user: AuthenticatedUser): Promise<MeDto> {
    return this.auth.me(user.id);
  }
}
