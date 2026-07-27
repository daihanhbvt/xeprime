import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NOTIFICATION_TYPE_VALUES } from '@xeprime/types';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export { DEFAULT_LIMIT as NOTIFICATION_DEFAULT_LIMIT, MAX_LIMIT as NOTIFICATION_MAX_LIMIT };

export class NotificationListQueryDto {
  @ApiPropertyOptional({ description: 'Chỉ lấy thông báo chưa đọc' })
  @IsOptional()
  // Query string "true"/"false" → boolean.
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unreadOnly?: boolean;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: DEFAULT_LIMIT, minimum: 1, maximum: MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number;
}

export class NotificationDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: NOTIFICATION_TYPE_VALUES }) type!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) body!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Loại đối tượng để dựng link' })
  targetType!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) targetId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO-8601 UTC; null = chưa đọc' })
  readAt!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

export class NotificationPageDto {
  @ApiProperty({ type: [NotificationDto] }) data!: NotificationDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

export class NotificationUnreadCountDto {
  @ApiProperty({ example: 3 }) count!: number;
}

export class NotificationReadResultDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) readAt!: string;
}

export class NotificationMarkAllResultDto {
  @ApiProperty({ description: 'Số thông báo vừa được đánh dấu đã đọc' }) updated!: number;
}
