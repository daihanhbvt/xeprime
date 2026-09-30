import { mapPickerHtml, parseMapMessage } from './map-interactive';

/**
 * Cầu nối WebView là chỗ DUY NHẤT của khối bản đồ tương tác có logic thuần kiểm được: phần còn
 * lại là một trang HTML chạy trong tiến trình khác. Và nó đúng là chỗ đáng kiểm nhất — mọi thứ
 * qua đây đều là `string` từ một bề mặt không tin được, nên một `JSON.parse` trần hay một toạ độ
 * rác lọt qua sẽ ghi thẳng vào trường tính phí giao xe.
 */
describe('parseMapMessage', () => {
  it('đọc được tin đặt ghim', () => {
    expect(parseMapMessage(JSON.stringify({ type: 'pin', lat: 16.05, lng: 108.2 }))).toEqual({
      type: 'pin',
      lat: 16.05,
      lng: 108.2,
    });
  });

  it('nhận ready và error', () => {
    expect(parseMapMessage('{"type":"ready"}')).toEqual({ type: 'ready' });
    expect(parseMapMessage('{"type":"error","detail":"leaflet-missing"}')).toEqual({
      type: 'error',
      detail: 'leaflet-missing',
    });
  });

  it('trả null cho chuỗi không phải JSON thay vì ném', () => {
    expect(parseMapMessage('không phải json')).toBeNull();
  });

  it('loại toạ độ không hợp lệ — một ghim rác tệ hơn hẳn không có ghim', () => {
    expect(parseMapMessage('{"type":"pin","lat":"xin chào","lng":108.2}')).toBeNull();
    expect(parseMapMessage('{"type":"pin","lat":999,"lng":108.2}')).toBeNull();
  });

  it('bỏ qua loại tin không biết', () => {
    expect(parseMapMessage('{"type":"whatever"}')).toBeNull();
    expect(parseMapMessage('[]')).toBeNull();
  });
});

describe('mapPickerHtml', () => {
  const center = { lat: 16.05, lng: 108.2 };

  /*
   * `EXPO_PUBLIC_*` được Metro thay thế lúc build; trong jest nó là `process.env` bình thường,
   * nên đặt/xoá trực tiếp là cách duy nhất kiểm được cả hai nhánh khoá.
   */
  const originalKey = process.env.EXPO_PUBLIC_GEOAPIFY_MAP_KEY;
  afterEach(() => {
    if (originalKey == null) delete process.env.EXPO_PUBLIC_GEOAPIFY_MAP_KEY;
    else process.env.EXPO_PUBLIC_GEOAPIFY_MAP_KEY = originalKey;
  });

  it('trả null khi chưa có khoá — nơi gọi rơi về ảnh tĩnh chỉ-xem', () => {
    delete process.env.EXPO_PUBLIC_GEOAPIFY_MAP_KEY;
    expect(mapPickerHtml({ center, zoom: 17, pinned: true })).toBeNull();
  });

  it('dựng trang có tile Geoapify, ghi nguồn ODbL và ghim ban đầu', () => {
    process.env.EXPO_PUBLIC_GEOAPIFY_MAP_KEY = 'test-key';
    const html = mapPickerHtml({ center, zoom: 17, pinned: true });

    expect(html).toContain('maps.geoapify.com/v1/tile/osm-bright');
    expect(html).toContain('apiKey=test-key');
    expect(html).toContain('openstreetmap.org/copyright');
    expect(html).toContain('place(16.05, 108.2);');
  });

  it('KHÔNG vẽ ghim khi chưa có toạ độ — một ghim giữa tâm tỉnh trông như đã xác nhận', () => {
    process.env.EXPO_PUBLIC_GEOAPIFY_MAP_KEY = 'test-key';
    const html = mapPickerHtml({ center, zoom: 13, pinned: false });

    expect(html).not.toContain('place(16.05, 108.2);');
    // Hàm vẫn phải có, vì cú bấm đầu tiên gọi chính nó.
    expect(html).toContain('function place(');
  });
});
