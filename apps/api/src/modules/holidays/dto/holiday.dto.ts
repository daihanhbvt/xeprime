import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HOLIDAY_EVENT_TYPE_VALUES, HOLIDAY_SOURCE_VALUES } from '@xeprime/types';
import { IsString, Matches } from 'class-validator';
import { DATE_ONLY_PATTERN } from '../../../common/date-only';

/**
 * Một ngày lễ như phần còn lại của hệ thống nhìn thấy nó.
 *
 * Cố ý KHÔNG có `googleEventId` và `googleUpdatedAt`: chúng là chi tiết của cơ chế đồng bộ, và
 * frontend tuyệt đối không cần biết dữ liệu này tới từ đâu. Đổi nhà cung cấp lịch (hoặc nhập
 * tay hoàn toàn) không được phép làm đổi hình dạng response — đó là ý nghĩa của việc `source`
 * là một MÃ ngắn chứ không phải một cái tên nhà cung cấp.
 */
export class HolidayDto {
  @ApiProperty({ example: '01K3V9B0000000000000000000' }) id!: string;

  @ApiProperty({ example: '2026-04-30', description: 'Ngày đầu tiên (YYYY-MM-DD, giờ Việt Nam)' })
  startDate!: string;

  @ApiProperty({
    example: '2026-04-30',
    description:
      'Ngày CUỐI CÙNG của kỳ nghỉ — INCLUSIVE. Một ngày lễ đúng một ngày có startDate = endDate.',
  })
  endDate!: string;

  @ApiProperty({ example: 'Ngày Giải phóng miền Nam' }) name!: string;

  // `type: String` là BẮT BUỘC ở đây, không phải trang trí: thiếu nó thì `@nestjs/swagger` chỉ
  // sinh một schema rỗng và `openapi-typescript` dịch ra `Record<string, never>` — frontend mất
  // luôn kiểu chuỗi. Cùng khuôn với các trường nullable ở `calendar.dto.ts`.
  @ApiPropertyOptional({ type: String, example: 'Ngày lễ công cộng', nullable: true })
  description!: string | null;

  @ApiProperty({ enum: HOLIDAY_EVENT_TYPE_VALUES }) eventType!: string;

  @ApiProperty({ enum: HOLIDAY_SOURCE_VALUES }) source!: string;

  @ApiProperty({ description: 'Lượt đồng bộ gần nhất chạm tới bản ghi này (ISO-8601 UTC)' })
  syncedAt!: string;
}

export class HolidayListDto {
  @ApiProperty({ type: [HolidayDto] }) items!: HolidayDto[];
}

/**
 * Khoảng ngày cần tra. Cả hai đầu BẮT BUỘC: không có mặc định nào hợp lý cho "ngày lễ của
 * khoảng nào", và một mặc định lặng lẽ (ví dụ năm nay) sẽ làm lịch tháng 1 thiếu dữ liệu mà
 * không ai biết vì sao.
 */
export class HolidayRangeQueryDto {
  @ApiProperty({ example: '2026-04-25', description: 'Ngày đầu khoảng (YYYY-MM-DD)' })
  @IsString()
  @Matches(DATE_ONLY_PATTERN, { message: 'from phải theo dạng YYYY-MM-DD' })
  from!: string;

  @ApiProperty({ example: '2026-05-05', description: 'Ngày cuối khoảng, INCLUSIVE (YYYY-MM-DD)' })
  @IsString()
  @Matches(DATE_ONLY_PATTERN, { message: 'to phải theo dạng YYYY-MM-DD' })
  to!: string;
}
