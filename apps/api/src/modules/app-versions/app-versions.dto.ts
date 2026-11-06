import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { NATIVE_APP_KEYS, NATIVE_PLATFORMS, type NativeAppKey, type NativePlatform } from '@xeprime/domain';

export class AppVersionParamsDto {
  @ApiProperty({ enum: NATIVE_APP_KEYS, example: 'customer' })
  @IsIn(NATIVE_APP_KEYS)
  app!: NativeAppKey;
}

export class AppVersionQueryDto {
  @ApiProperty({ enum: NATIVE_PLATFORMS, example: 'ios' })
  @IsIn(NATIVE_PLATFORMS)
  platform!: NativePlatform;
}

/** Cấu hình phiên bản của một app trên một nền tảng — đọc từ env, mọi trường có thể `null`. */
export class AppVersionDto {
  @ApiProperty({ type: String, nullable: true, example: '1.4.0', description: 'Bản mới nhất trên store - dưới bản này app nhắc "Cập nhật / Để sau".' })
  latestVersion!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '1.2.0', description: 'Bản tối thiểu - dưới bản này app bắt buộc cập nhật.' })
  minVersion!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'https://apps.apple.com/app/id6831492287' })
  storeUrl!: string | null;
}
