import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  BankTransactionListQueryDto,
  IgnoreBankTransactionDto,
} from '../src/modules/sepay/dto/bank-transaction.dto';

/**
 * Mép vào của hàng đợi tiền vào — không cần DB, thuần lớp validate DTO.
 *
 * Hai lỗ đã vá ở đợt rà soát màn Tài chính (01/10/2026):
 *  - mã chuyển trả toàn khoảng trắng lọt qua `MinLength(3)` rồi bị service cắt thành rỗng — admin
 *    tưởng đã ghi "đã trả lại" mà dòng không có bằng chứng nào;
 *  - ngày đúng DẠNG nhưng không có thật (`2026-13-45`) lọt xuống tính mốc giờ VN và nổ 500.
 */
function errorsOf<T extends object>(cls: new () => T, plain: object): string[] {
  const errors = validateSync(plainToInstance(cls, plain));
  return errors.map((e) => e.property);
}

describe('IgnoreBankTransactionDto', () => {
  it('mã chuyển trả chỉ có khoảng trắng ⇒ bị chặn, không thành "đã trả lại" rỗng', () => {
    expect(
      errorsOf(IgnoreBankTransactionDto, { note: 'Khách chuyển nhầm', refundReference: '   ' }),
    ).toContain('refundReference');
  });

  it('mã có khoảng trắng hai đầu ⇒ cắt rồi mới kiểm, giá trị lưu là bản đã cắt', () => {
    const dto = plainToInstance(IgnoreBankTransactionDto, {
      note: 'Khách chuyển nhầm',
      refundReference: '  FT26274000123  ',
    });
    expect(validateSync(dto)).toEqual([]);
    expect(dto.refundReference).toBe('FT26274000123');
  });

  it('không kèm mã ⇒ hợp lệ (bỏ qua mà chưa trả lại)', () => {
    expect(errorsOf(IgnoreBankTransactionDto, { note: 'Không thuộc luồng nào' })).toEqual([]);
  });

  it('lý do chỉ có khoảng trắng ⇒ bị chặn', () => {
    expect(errorsOf(IgnoreBankTransactionDto, { note: '    ' })).toContain('note');
  });
});

describe('BankTransactionListQueryDto — khoảng ngày', () => {
  it('ngày có thật ⇒ hợp lệ', () => {
    expect(errorsOf(BankTransactionListQueryDto, { from: '2026-02-28', to: '2026-09-30' })).toEqual(
      [],
    );
  });

  it('đúng dạng nhưng không có thật ⇒ 400, không lọt xuống tính mốc giờ', () => {
    expect(errorsOf(BankTransactionListQueryDto, { from: '2026-13-45' })).toContain('from');
    expect(errorsOf(BankTransactionListQueryDto, { to: '2026-02-30' })).toContain('to');
  });
});
