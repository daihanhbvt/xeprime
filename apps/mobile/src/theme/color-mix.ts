/**
 * `color-mix(in srgb, …)` cho React Native.
 *
 * Web dựng phần lớn nền nhạt của mình bằng `color-mix()` NGAY TRONG CSS: nền cuối tuần là 60% màu
 * nền phụ trên nền thẻ, viền một thanh trạng thái là 35% màu trạng thái trên chính nền của nó.
 * Cách đó có một tính chất mà bảng hex viết tay không có — đổi MỘT token gốc thì cả bộ dẫn xuất
 * đổi theo, nên hai bên không bao giờ trôi khỏi nhau.
 *
 * React Native không hiểu `color-mix`, và bản native trước đây giải bài này bằng cách tính sẵn
 * từng giá trị thành hex rồi chép vào mã (`sidebar` ở `tokens.ts`). Cách đó đúng ở thời điểm
 * chép và sai kể từ lần đầu ai đó chỉnh token gốc mà không tính lại — không có gì trong máy phát
 * hiện ra, vì một màu lệch vẫn là một màu hợp lệ.
 *
 * Hàm này là chính công thức đó, chạy MỘT LẦN lúc nạp module (mọi nơi gọi đều gán vào hằng ở
 * scope module), nên nó không nằm trên đường render.
 */

type Rgb = readonly [number, number, number];

function toRgb(hex: string): Rgb {
  const value = hex.trim();
  /*
   * CHỈ nhận `#rrggbb`. Token của `@xeprime/ui` đều ở dạng này, và một `rgb()`/`hsl()` lọt vào
   * đây sẽ ra `NaN` rồi thành `#NaNNaNNaN` — một chuỗi mà React Native bỏ qua im lặng, để lại
   * đúng cái nền trong suốt không ai truy ra nguồn.
   */
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error(`mixHex chỉ nhận màu dạng '#rrggbb', nhận được '${hex}'.`);
  }
  return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as unknown as Rgb;
}

/**
 * Trộn tuyến tính trong không gian sRGB — bản sao đúng của `color-mix(in srgb, a <ratio>%, b)`.
 *
 * @param a Màu được nêu tỉ lệ (vế `a <ratio>%` bên CSS).
 * @param b Màu chiếm phần còn lại.
 * @param ratio Phần của `a`, từ 0 đến 1 (`0.45` = `45%`).
 */
export function mixHex(a: string, b: string, ratio: number): string {
  if (!(ratio >= 0 && ratio <= 1)) {
    throw new Error(`mixHex nhận tỉ lệ trong [0, 1], nhận được ${ratio}.`);
  }

  const [ra, ga, ba] = toRgb(a);
  const [rb, gb, bb] = toRgb(b);
  const channel = (x: number, y: number) => Math.round(x * ratio + y * (1 - ratio));

  return `#${[channel(ra, rb), channel(ga, gb), channel(ba, bb)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
}
