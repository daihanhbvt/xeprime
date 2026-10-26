import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';
import { DATE_ONLY_PATTERN } from '../../../common/date-only';

/**
 * Trần cửa sổ tra lịch bận: đủ cho gói thuê dài hạn 12 tháng cộng dư, đủ chặt để một request
 * không quét được cả bảng occupancy của một xe.
 */
export const BUSY_DAYS_MAX_WINDOW = 400;

/**
 * Lịch bận của một xe để TÔ MÀU ô lịch trước khi người dùng chọn (preview — ADR 0006).
 *
 * Sống ở module lịch vì nó là một CÁCH ĐỌC `vehicle_occupancies` (`OccupancyService.listBusyDays`).
 * Hai cửa dùng chung: luồng thuê của khách (`GET /public/booking-requests/busy-days`, chỉ xe đang
 * lên chợ) và luồng đặt hộ của gian hàng (`GET /calendar/busy-days`, mọi xe của gian hàng).
 */
export class VehicleBusyDaysQueryDto {
  @ApiProperty({ description: 'ID xe (ULID)' })
  @IsString()
  @Length(26, 26)
  vehicleId!: string;

  @ApiProperty({ description: 'Ngày đầu cửa sổ tra cứu (YYYY-MM-DD, ngày lịch Việt Nam)' })
  @Matches(DATE_ONLY_PATTERN)
  from!: string;

  @ApiProperty({
    description: `Ngày cuối cửa sổ (YYYY-MM-DD). Quá ${BUSY_DAYS_MAX_WINDOW} ngày kể từ \`from\` thì bị kẹp về trần — xem \`to\` trong kết quả`,
  })
  @Matches(DATE_ONLY_PATTERN)
  to!: string;
}

export class VehicleBusyPeriodDto {
  @ApiProperty({ description: 'Bắt đầu bận (ISO-8601 UTC), đã cắt về trong ngày' })
  startAt!: string;

  @ApiProperty({ description: 'Kết thúc bận (ISO-8601 UTC), đã cắt về trong ngày' })
  endAt!: string;
}

export class VehicleBusyDayDto {
  @ApiProperty({ description: 'Ngày local Asia/Ho_Chi_Minh, YYYY-MM-DD' })
  date!: string;

  @ApiProperty({ description: 'Bận trọn ngày — ngày này không nhận cũng không trả xe được' })
  fullyBusy!: boolean;

  @ApiProperty({
    type: VehicleBusyPeriodDto,
    isArray: true,
    description: 'Các quãng bận trong ngày (đã gộp, tăng dần). Rỗng khi `fullyBusy`',
  })
  periods!: VehicleBusyPeriodDto[];
}

export class VehicleBusyDaysDto {
  @ApiProperty({
    type: VehicleBusyDayDto,
    isArray: true,
    description: 'CHỈ những ngày có lịch bận trong cửa sổ (danh sách thưa), tăng dần theo ngày',
  })
  days!: VehicleBusyDayDto[];

  @ApiProperty({ description: 'Ngày đầu cửa sổ đã áp dụng (YYYY-MM-DD)' })
  from!: string;

  @ApiProperty({ description: 'Ngày cuối cửa sổ đã áp dụng (YYYY-MM-DD) — có thể bị kẹp về trần' })
  to!: string;
}
