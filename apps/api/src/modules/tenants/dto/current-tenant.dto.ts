import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TENANT_ROLE_VALUES, TENANT_STATUS_VALUES } from '@xeprime/types';

export class CurrentTenantDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['individual', 'business'] }) tenantType!: string;
  @ApiProperty({ enum: TENANT_STATUS_VALUES }) status!: string;
  @ApiPropertyOptional({ nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ nullable: true }) email!: string | null;

  @ApiProperty({ description: 'Decimal trả về dạng string — ADR 0007', example: '4.75' })
  ratingAvg!: string;

  @ApiProperty() ratingCount!: number;
  @ApiProperty() vehicleCount!: number;
  @ApiProperty() memberCount!: number;

  @ApiProperty({ enum: TENANT_ROLE_VALUES }) myRoleKey!: string;
}
