import { describe, expect, it } from 'vitest';
import { insuranceCoverageItems, joinInsuranceCoverageItems } from './insurance-coverage';

describe('insuranceCoverageItems', () => {
  it('tách mỗi dòng thành một mục, bỏ dòng trống và khoảng trắng', () => {
    expect(insuranceCoverageItems('  Đâm va  \n\nHoả hoạn\r\nMất cắp\n')).toEqual([
      'Đâm va',
      'Hoả hoạn',
      'Mất cắp',
    ]);
  });

  it('bỏ gạch đầu dòng gõ tay', () => {
    expect(insuranceCoverageItems('- Đâm va\n• Hoả hoạn\n* Mất cắp')).toEqual([
      'Đâm va',
      'Hoả hoạn',
      'Mất cắp',
    ]);
  });

  it('giữ dấu gạch nằm giữa câu và câu một dòng cũ', () => {
    expect(insuranceCoverageItems('Đâm va - lật đổ, chìm, rơi.')).toEqual([
      'Đâm va - lật đổ, chìm, rơi.',
    ]);
  });

  it('rỗng ⇒ không có mục', () => {
    expect(insuranceCoverageItems(null)).toEqual([]);
    expect(insuranceCoverageItems('\n  \n')).toEqual([]);
  });
});

describe('joinInsuranceCoverageItems', () => {
  it('ghép lại dạng lưu chuẩn', () => {
    expect(joinInsuranceCoverageItems([' Đâm va ', '', 'Hoả hoạn'])).toBe('Đâm va\nHoả hoạn');
  });
});
