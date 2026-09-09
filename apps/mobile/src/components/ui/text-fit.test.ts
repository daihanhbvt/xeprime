import { estimateTextWidth, packRows } from './text-fit';

describe('estimateTextWidth', () => {
  it('chuỗi dài hơn thì rộng hơn', () => {
    expect(estimateTextWidth('Chờ duyệt công khai', 12)).toBeGreaterThan(
      estimateTextWidth('Sẵn sàng', 12),
    );
  });

  it('dấu tiếng Việt KHÔNG cộng thêm bề rộng — ký tự dựng sẵn, cùng advance với chữ gốc', () => {
    expect(estimateTextWidth('Sẵn sàng', 12)).toBeCloseTo(estimateTextWidth('San sang', 12), 5);
  });

  it('chữ hẹp rộng ít hơn chữ rộng ở cùng số ký tự', () => {
    expect(estimateTextWidth('iii', 12)).toBeLessThan(estimateTextWidth('mmm', 12));
  });

  it('cỡ chữ gấp đôi thì bề rộng gấp đôi', () => {
    expect(estimateTextWidth('Sẵn sàng', 24)).toBeCloseTo(estimateTextWidth('Sẵn sàng', 12) * 2, 5);
  });

  it('chuỗi rỗng không chiếm chỗ', () => {
    expect(estimateTextWidth('', 12)).toBe(0);
  });
});

describe('packRows', () => {
  it('vừa một hàng thì không tách', () => {
    expect(packRows([100, 100, 100], 320, 4)).toEqual([[0, 1, 2]]);
  });

  it('KÉO viên sau lên lấp chỗ trống thay vì bỏ trống cuối hàng', () => {
    // 120 + 20 + 200 vượt 300, nhưng 120 + 20 + 60 thì vừa — viên thứ ba lên hàng đầu.
    expect(packRows([120, 200, 60], 300, 20)).toEqual([
      [0, 2],
      [1],
    ]);
  });

  it('giữ nguyên thứ tự khi không có viên nào lấp vừa', () => {
    expect(packRows([200, 200, 200], 300, 8)).toEqual([[0], [1], [2]]);
  });

  it('tính cả khoảng hở giữa hai viên', () => {
    // 150 + 150 = 300 vừa khít, nhưng cộng khoảng hở 8 thì không.
    expect(packRows([150, 150], 300, 8)).toEqual([[0], [1]]);
    expect(packRows([150, 150], 308, 8)).toEqual([[0, 1]]);
  });

  it('viên rộng hơn cả hàng vẫn được nhận — nó phải nằm đâu đó', () => {
    expect(packRows([400, 50], 300, 8)).toEqual([[0], [1]]);
  });

  it('chưa đo được bề rộng thì trả một hàng — nơi gọi tự `flexWrap` như cũ', () => {
    expect(packRows([100, 100], 0, 4)).toEqual([[0, 1]]);
    expect(packRows([], 0, 4)).toEqual([]);
  });
});
