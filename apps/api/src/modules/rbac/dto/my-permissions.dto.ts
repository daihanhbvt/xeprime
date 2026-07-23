import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PERMISSION_VALUES, PLATFORM_ROLE_VALUES, TENANT_ROLE_VALUES } from '@xeprime/types';

export class MyPermissionsDto {
  @ApiPropertyOptional({ enum: TENANT_ROLE_VALUES, nullable: true })
  tenantRole!: string | null;

  @ApiPropertyOptional({ enum: PLATFORM_ROLE_VALUES, nullable: true })
  platformRole!: string | null;

  @ApiProperty({ isArray: true, enum: PERMISSION_VALUES })
  permissions!: string[];
}
