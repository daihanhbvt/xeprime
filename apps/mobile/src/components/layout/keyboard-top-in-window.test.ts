import { keyboardTopInWindow } from './Screen';

/**
 * Quy mép trên bàn phím từ hệ MÀN HÌNH về hệ CỬA SỔ.
 *
 * Đây là phép tính đứng giữa hai nguồn số liệu duy nhất mà cơ chế tránh bàn phím có, và một lỗi
 * ở đây không làm gì đỏ lên — nó chỉ để thanh soạn tin nằm dưới bàn phím trên vài đời máy.
 */
describe('keyboardTopInWindow', () => {
  it('trả về chính nó khi cửa sổ phủ trọn màn hình (iOS, và Android edge-to-edge thật sự)', () => {
    expect(keyboardTopInWindow(550, 914, 914)).toBe(550);
  });

  it('bù đúng phần cửa sổ hụt so với màn hình', () => {
    /*
     * Số đo thật từ một máy Android (21/09/2026): cửa sổ 853, bàn phím khai `screenY=550`. Nếu
     * màn hình cao 883 thì bàn phím cao 333, nên mép trên của nó trong CỬA SỔ là 853 − 333 = 520
     * — cao hơn 30 so với con số cơ chế cũ dùng, và 30 đó chính là phần bị che.
     */
    expect(keyboardTopInWindow(550, 853, 883)).toBe(520);
  });

  it('chiều cao bàn phím giữ nguyên qua phép quy đổi — đó là bất biến của phép tính này', () => {
    const screenY = 550;
    const windowH = 853;
    const screenH = 883;
    const topInWindow = keyboardTopInWindow(screenY, windowH, screenH);

    expect(screenH - screenY).toBe(windowH - topInWindow);
  });

  /*
   * Ba ca dưới đây đều là "không đủ dữ liệu để quy đổi", và cả ba phải GIỮ NGUYÊN hành vi cũ chứ
   * không được đoán: một con số bịa ở đây đẩy thanh soạn tin đi lung tung trên mọi màn của app.
   */
  it('giữ nguyên khi chưa có kích thước', () => {
    expect(keyboardTopInWindow(550, 0, 883)).toBe(550);
    expect(keyboardTopInWindow(550, 853, 0)).toBe(550);
  });

  it('giữ nguyên khi màn hình BÉ HƠN cửa sổ — số liệu vô lý, không phải một phép bù', () => {
    expect(keyboardTopInWindow(550, 914, 853)).toBe(550);
  });
});
