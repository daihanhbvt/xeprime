import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PUSH_PLATFORM_VALUES, PUSH_PROVIDER, PUSH_PROVIDER_VALUES } from '@xeprime/types';
import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';

/**
 * Registration token của FCM có thể dài — độ dài không được công bố và đã đổi vài lần (163 ký
 * tự ở bản cũ, ~200 ngày nay). Trần rộng rãi để không phải sửa DTO mỗi lần Google đổi định
 * dạng; cái cần chặn chỉ là một body vài megabyte.
 */
const TOKEN_MAX = 4096;

export class RegisterPushDeviceDto {
  /*
   * KHÔNG khai `default` trong `@ApiPropertyOptional`: `openapi-typescript` coi mọi thuộc tính
   * CÓ default là bắt buộc trong type sinh ra (server luôn điền nó) — đúng cho response, sai cho
   * request body, và client sẽ phải gửi một trường mà nó được phép bỏ trống. Mặc định `fcm` đặt
   * ở service, nơi nó thực sự được áp dụng.
   */
  @ApiPropertyOptional({
    enum: PUSH_PROVIDER_VALUES,
    description: `Nhà cung cấp push. Bỏ trống = \`${PUSH_PROVIDER.FCM}\`.`,
  })
  @IsOptional()
  @IsIn(PUSH_PROVIDER_VALUES)
  provider?: string;

  @ApiProperty({
    description:
      'Registration token do FCM cấp cho bản cài app. KHÔNG bao giờ được trả lại trong response hay ghi ra log.',
  })
  @IsString()
  @Length(1, TOKEN_MAX)
  token!: string;

  @ApiProperty({ enum: PUSH_PLATFORM_VALUES })
  @IsIn(PUSH_PLATFORM_VALUES)
  platform!: string;

  @ApiPropertyOptional({ maxLength: 30, example: '0.1.0' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  appVersion?: string;

  @ApiPropertyOptional({
    maxLength: 120,
    description: 'Tên máy do client tự khai — chỉ để người dùng nhận ra thiết bị.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceName?: string;
}

/**
 * Huỷ đăng ký. Bỏ trống `token` = huỷ mọi thiết bị của PHIÊN hiện tại — đường đi của nút đăng
 * xuất, khi app không còn giữ token trong tay.
 */
export class UnregisterPushDeviceDto {
  @ApiPropertyOptional({ description: 'Token cần tắt. Bỏ trống = mọi thiết bị của phiên này.' })
  @IsOptional()
  @IsString()
  @Length(1, TOKEN_MAX)
  token?: string;
}

/**
 * Kết quả huỷ đăng ký. KHÔNG dùng `DeletedCountDto`: thiết bị bị TẮT chứ không bị xoá (
 * `push_deliveries` còn trỏ tới nó, và lịch sử "vì sao tin này không tới" là thứ duy nhất trả
 * lời được khiếu nại). Một DTO nói "đã xoá" cho một thao tác không xoá gì sẽ đi thẳng vào
 * `openapi.json` và thành hiểu lầm của mọi client sau này.
 */
export class DisabledCountDto {
  @ApiProperty({ example: 1, description: 'Số thiết bị vừa ngừng nhận thông báo đẩy.' })
  disabled!: number;
}

/**
 * Thiết bị đã đăng ký — CỐ Ý không có `token`.
 *
 * Trả lại token nghĩa là nó đi qua log của proxy, cache của client và màn network của devtool;
 * client vốn đã có nó rồi, nên không có gì để đổi lại.
 */
export class PushDeviceDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: PUSH_PROVIDER_VALUES }) provider!: string;
  @ApiProperty({ enum: PUSH_PLATFORM_VALUES }) platform!: string;
  @ApiProperty({ description: 'Thiết bị có đang nhận thông báo đẩy không' }) enabled!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) deviceName!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) lastSeenAt!: string;
  @ApiProperty({
    description:
      'Cờ `PUSH_ENABLED` của server. `false` = thiết bị đã ghi nhận nhưng chưa có thông báo nào được đẩy.',
  })
  pushEnabled!: boolean;
}
