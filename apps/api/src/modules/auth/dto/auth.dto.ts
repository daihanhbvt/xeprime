import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateSessionDto {
  @ApiProperty({
    description:
      'ID token từ Firebase Auth (hoặc `mock:<uid>:<email>:<tên>` khi AUTH_MODE=mock). ' +
      'Chỉ gửi đúng một lần lúc đăng nhập — sau đó dùng session cookie.',
    example: 'mock:demo-owner:owner@xeprime.test:Chủ shop demo',
  })
  @IsString()
  @MinLength(1)
  idToken!: string;
}

export class CurrentTenantSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ description: 'Xem TenantStatus trong @xeprime/types' }) status!: string;
  @ApiProperty({ description: 'Xem TenantRole trong @xeprime/types' }) roleKey!: string;
}

export class MeDto {
  @ApiProperty() id!: string;
  @ApiProperty() displayName!: string;
  @ApiPropertyOptional({ nullable: true }) email!: string | null;
  @ApiPropertyOptional({ nullable: true }) avatarUrl!: string | null;

  @ApiProperty({ description: 'Đã xác thực SĐT chưa — gate cho việc đặt xe/mở shop' })
  phoneVerified!: boolean;

  @ApiPropertyOptional({ type: CurrentTenantSummaryDto, nullable: true })
  tenant!: CurrentTenantSummaryDto | null;

  @ApiPropertyOptional({ nullable: true, description: 'Xem PlatformRole trong @xeprime/types' })
  platformRole!: string | null;

  @ApiProperty({ isArray: true, type: String })
  permissions!: string[];
}
