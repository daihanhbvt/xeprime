import { RECEIPT_LINK_MODE } from './constants';
import { receiptFormSchema } from './schema';

/** Chi nhánh phát sinh — gương schema web (ADR 0052): bắt buộc CHỈ ở chế độ "Không gắn". */
describe('receiptFormSchema.branchId', () => {
  const branchField = receiptFormSchema.pick(['linkMode', 'branchId']);

  it('NONE + thiếu chi nhánh ⇒ lỗi errors.branchRequired', async () => {
    await expect(
      branchField.validate({ linkMode: RECEIPT_LINK_MODE.NONE, branchId: null }),
    ).rejects.toThrow('errors.branchRequired');
  });

  it('NONE + có chi nhánh ⇒ hợp lệ', async () => {
    await expect(
      branchField.validate({ linkMode: RECEIPT_LINK_MODE.NONE, branchId: 'b1' }),
    ).resolves.toBeTruthy();
  });

  it('gắn xe / gắn đơn ⇒ không hỏi chi nhánh', async () => {
    for (const linkMode of [RECEIPT_LINK_MODE.VEHICLE, RECEIPT_LINK_MODE.BOOKING]) {
      await expect(branchField.validate({ linkMode, branchId: null })).resolves.toBeTruthy();
    }
  });
});
