import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { BookingRequestListQueryDto } from '../src/modules/booking-requests/dto/booking-request.dto';

/**
 * Bộ lọc trạng thái của hộp thư yêu cầu — thuần lớp validate DTO, không cần DB.
 *
 * ADR 0055 gỡ `hold_paid` và `approved_by_host` khỏi DB, nhưng bản app native ĐANG CHẠY vẫn gửi
 * `status=pending_host_approval,hold_paid` cho tab "Cần xử lý". Từ chối cả câu lọc là làm vỡ đúng
 * tab quan trọng nhất của họ, nên bộ lọc vẫn NHẬN giá trị đã gỡ (chúng khớp 0 dòng). Test này khoá
 * lời hứa đó cho tới khi đội mobile hết gửi.
 */
function statusErrors(status: string): string[] {
  const dto = plainToInstance(BookingRequestListQueryDto, { status });
  return validateSync(dto).map((error) => error.property);
}

describe('BookingRequestListQueryDto.status', () => {
  it('nhận chuỗi tab "Cần xử lý" mà app native đang chạy gửi lên (còn mang hold_paid)', () => {
    expect(statusErrors('pending_host_approval,hold_paid')).toEqual([]);
  });

  it('nhận một trạng thái sống, hoặc nhiều trạng thái nối dấu phẩy', () => {
    expect(statusErrors('awaiting_hold')).toEqual([]);
    expect(statusErrors('rejected_by_host,expired,slot_taken')).toEqual([]);
  });

  it('vẫn chặn giá trị lạ — tương thích ngược không phải là "nhận mọi thứ"', () => {
    expect(statusErrors('pending_host_approval,approved')).toContain('status');
  });
});
