import { SURCHARGE_CATEGORY, SURCHARGE_CATEGORY_VALUES } from '@xeprime/types';

import { visibleSurchargeCategories } from './surcharge-categories';

/**
 * Danh mục nào còn chọn được khi ghi phụ phí.
 *
 * Backend từ chối khoản thứ hai ở danh mục một-lần (`SURCHARGE_CATEGORY_DUPLICATE`). Nếu giao
 * diện vẫn bày nó ra, người dùng đi hết biểu mẫu — chọn danh mục, gõ số tiền, gõ lý do — rồi mới
 * ăn lỗi ở bước gửi, trong khi câu trả lời đã biết từ lúc mở tấm.
 *
 * Lọc QUÁ TAY thì hỏng theo chiều ngược lại và khó thấy hơn: một chuyến có thể có hai khoản vệ
 * sinh thật, mỗi khoản một lý do. Nên hai chiều đều có test.
 */
describe('visibleSurchargeCategories', () => {
  it('chưa ghi khoản nào ⇒ giữ nguyên toàn bộ danh mục', () => {
    expect(visibleSurchargeCategories([])).toEqual(SURCHARGE_CATEGORY_VALUES);
  });

  it('ĐÃ ghi phí vượt km ⇒ bỏ đúng danh mục đó', () => {
    const visible = visibleSurchargeCategories([
      { category: SURCHARGE_CATEGORY.EXCESS_MILEAGE },
    ]);

    expect(visible).not.toContain(SURCHARGE_CATEGORY.EXCESS_MILEAGE);
    expect(visible).toHaveLength(SURCHARGE_CATEGORY_VALUES.length - 1);
  });

  it('ĐÃ ghi vệ sinh ⇒ vẫn ghi được khoản vệ sinh thứ hai', () => {
    /*
     * Đây là vế dễ hỏng khi ai đó "cho gọn" bằng cách lọc mọi danh mục đã ghi: một chuyến có thể
     * phát sinh hai khoản vệ sinh thật, và chặn khoản thứ hai là bắt chủ xe gộp hai lý do vào một
     * dòng — mất dấu vết của chính khoản họ sẽ phải giải thích với khách.
     */
    const visible = visibleSurchargeCategories([{ category: SURCHARGE_CATEGORY.CLEANING }]);

    expect(visible).toContain(SURCHARGE_CATEGORY.CLEANING);
    expect(visible).toEqual(SURCHARGE_CATEGORY_VALUES);
  });

  it('nhiều khoản cùng lúc ⇒ chỉ danh mục một-lần bị bỏ', () => {
    const visible = visibleSurchargeCategories([
      { category: SURCHARGE_CATEGORY.CLEANING },
      { category: SURCHARGE_CATEGORY.EXCESS_MILEAGE },
      { category: SURCHARGE_CATEGORY.DAMAGE },
    ]);

    expect(visible).not.toContain(SURCHARGE_CATEGORY.EXCESS_MILEAGE);
    expect(visible).toContain(SURCHARGE_CATEGORY.CLEANING);
    expect(visible).toContain(SURCHARGE_CATEGORY.DAMAGE);
  });

  it('mã lạ trong danh sách đã ghi KHÔNG làm rơi danh mục nào', () => {
    // Đơn cũ có thể mang một mã danh mục đã bị gỡ khỏi `SURCHARGE_CATEGORY`.
    expect(visibleSurchargeCategories([{ category: 'fuel' }])).toEqual(SURCHARGE_CATEGORY_VALUES);
  });
});
