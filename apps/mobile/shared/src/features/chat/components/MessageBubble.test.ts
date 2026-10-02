import type { MessageAttachment } from '@/features/chat/api';
import { attachmentBox, bubbleSizeStyle, sameAttachments } from './MessageBubble';

/**
 * Lỗi thật trên máy: tin "aloo" kèm thẻ xe cho ra một ô trắng chỉ có ảnh, tên xe biến mất.
 *
 * Nguyên nhân là phép đo của Yoga — bề rộng một cột bằng bề rộng đứa con rộng nhất, và đứa con
 * `flex: 1` (cột chữ trong thẻ xe) không đóng góp gì vào phép đo đó. Bong bóng co về bề rộng chữ
 * "aloo", cột tên xe còn 0px.
 */
describe('bubbleSizeStyle', () => {
  it('CÓ thẻ xe ⇒ bề ngang CỐ ĐỊNH, để cột chữ có gì mà chia', () => {
    expect(bubbleSizeStyle(true)).toEqual({ width: '82%' });
  });

  it('KHÔNG có thẻ xe ⇒ co theo nội dung, chỉ chặn trần', () => {
    expect(bubbleSizeStyle(false)).toEqual({ maxWidth: '82%' });
  });

  /** Hai nhánh phải cùng một con số: lệch nhau thì bong bóng nhảy bề ngang giữa các tin. */
  it('hai nhánh dùng CÙNG một trần', () => {
    const withCard = bubbleSizeStyle(true) as { width: string };
    const plain = bubbleSizeStyle(false) as { maxWidth: string };
    expect(withCard.width).toBe(plain.maxWidth);
  });
});

/**
 * Ảnh đính kèm phải giữ TỈ LỆ GỐC, như web (`max-width/max-height: 200px`).
 *
 * Bản trước đặt cứng 180×180 kèm `contentFit="cover"`: mọi ảnh bị cắt thành hình vuông, ảnh dọc
 * mất hẳn đầu và chân — cùng một tệp mà hai client cho ra hai bức ảnh khác nhau.
 */
describe('attachmentBox', () => {
  it('ảnh NGANG chạm trần theo chiều rộng', () => {
    expect(attachmentBox(2)).toEqual({ width: 200, height: 100 });
  });

  it('ảnh DỌC chạm trần theo chiều cao', () => {
    expect(attachmentBox(0.5)).toEqual({ width: 100, height: 200 });
  });

  it('ảnh vuông chạm trần cả hai chiều', () => {
    expect(attachmentBox(1)).toEqual({ width: 200, height: 200 });
  });

  /** Chưa tải xong, hoặc metadata hỏng: ô vuông là phỏng đoán ít sai nhất, KHÔNG phải NaN. */
  it('tỉ lệ chưa biết hoặc vô nghĩa thì lùi về ô vuông', () => {
    for (const bad of [null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(attachmentBox(bad)).toEqual({ width: 200, height: 200 });
    }
  });

  /** Không cạnh nào được vượt trần — đó là toàn bộ lý do có hàm này. */
  it('không cạnh nào vượt trần', () => {
    for (const ratio of [0.1, 0.75, 1, 1.33, 16 / 9, 10]) {
      const box = attachmentBox(ratio);
      expect(box.width).toBeLessThanOrEqual(200);
      expect(box.height).toBeLessThanOrEqual(200);
    }
  });
});

/**
 * `memo` mặc định so theo THAM CHIẾU, và điều đó vô dụng ở đây.
 *
 * `mergeThreadMessages` dựng lại `{ message, state }` cho MỌI tin ở mỗi lượt hoà giải, nên
 * `attachments` luôn là một mảng mới dù nội dung y hệt — cả ba mươi bong bóng vẽ lại sau mỗi
 * nhịp poll (5–25 giây) dù không có gì đổi.
 */
describe('sameAttachments', () => {
  const at = (url: string): MessageAttachment => ({
    url,
    fileType: 'image/jpeg',
    fileName: 'a.jpg',
    fileSize: 1024,
  });

  it('MẢNG KHÁC nhưng cùng nội dung ⇒ coi là không đổi', () => {
    expect(sameAttachments([at('r2://a')], [at('r2://a')])).toBe(true);
  });

  it('rỗng hai bên ⇒ không đổi', () => {
    expect(sameAttachments([], [])).toBe(true);
  });

  it('khác URL ⇒ có đổi', () => {
    expect(sameAttachments([at('r2://a')], [at('r2://b')])).toBe(false);
  });

  it('khác SỐ LƯỢNG ⇒ có đổi', () => {
    expect(sameAttachments([at('r2://a')], [at('r2://a'), at('r2://b')])).toBe(false);
  });

  /** Thứ tự là thứ người dùng nhìn thấy — đảo chỗ hai ảnh là một thay đổi thật. */
  it('cùng bộ URL nhưng KHÁC THỨ TỰ ⇒ có đổi', () => {
    expect(sameAttachments([at('r2://a'), at('r2://b')], [at('r2://b'), at('r2://a')])).toBe(false);
  });
});
