import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import { PrismaService } from '../../prisma/prisma.service';

export class UpdateMeDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}

export class UserProfileDto {
  @ApiProperty() id!: string;
  @ApiProperty() displayName!: string;
  @ApiPropertyOptional({ nullable: true }) email!: string | null;
  @ApiPropertyOptional({ nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ nullable: true }) avatarUrl!: string | null;
  @ApiProperty() phoneVerified!: boolean;
}

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me')
  @ApiOperation({ summary: 'Hồ sơ của user hiện tại' })
  @ApiOkResponse({ type: UserProfileDto })
  async me(@CurrentUser() user: AuthenticatedUser): Promise<UserProfileDto> {
    const row = await this.prisma.user.findFirstOrThrow({
      where: { id: user.id, deletedAt: null },
      select: {
        id: true,
        displayName: true,
        email: true,
        phone: true,
        avatarUrl: true,
        phoneVerifiedAt: true,
      },
    });
    return { ...row, phoneVerified: row.phoneVerifiedAt !== null };
  }

  /**
   * Chỉ sửa được hồ sơ của chính mình — không có tham số userId.
   * `email`/`phone` cố ý không cho sửa ở đây: chúng là khoá nhận diện và phải đi qua
   * luồng xác thực riêng (Phase 1).
   */
  @Patch('me')
  @ApiOperation({ summary: 'Cập nhật hồ sơ của chính mình' })
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
      select: {
        id: true,
        displayName: true,
        email: true,
        phone: true,
        avatarUrl: true,
        phoneVerifiedAt: true,
      },
    });
    return { ...row, phoneVerified: row.phoneVerifiedAt !== null };
  }
}
