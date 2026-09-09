/**
 * Đo ÁNG CHỪNG bề rộng một chuỗi và xếp các phần tử vào hàng — hai phép tính thuần, không đụng
 * React Native, để test được bằng số thay vì bằng ảnh chụp màn hình.
 *
 * Vì sao phải áng chừng: `flexWrap` của React Native ngắt dòng THEO THỨ TỰ. Ba viên nhãn rộng
 * 120 · 90 · 150 trên một hàng 360 sẽ ra "120 90" rồi xuống dòng cho 150 — bỏ trống 150pt cuối
 * hàng đầu, trong khi đảo viên thứ ba lên là vừa khít. Muốn ngắt dòng ĐẸP thì phải biết bề rộng
 * trước khi ngắt, mà bề rộng thật chỉ có sau khi đo xong (`onLayout`) — tức là sau khi đã ngắt.
 *
 * Sai số của phép áng chừng KHÔNG gây vỡ giao diện: nơi gọi vẫn dựng mỗi hàng bằng một
 * `flexWrap`, nên đoán hụt thì hàng đó tự xuống dòng đúng như hôm nay.
 */

/**
 * Bề rộng một ký tự, tính theo TỈ LỆ với cỡ chữ.
 *
 * Không có bảng metric thật của font hệ thống (mỗi máy một font: SF Pro, Roboto, và bản người
 * dùng thay), nên phân theo LỚP ký tự — đủ để phân biệt "Sẵn sàng" với "Chờ duyệt công khai",
 * là việc duy nhất phép đo này phải làm.
 *
 * Dấu tiếng Việt không cộng thêm bề rộng: `ế`, `ộ` là ký tự dựng sẵn, cùng advance với chữ gốc.
 */
const NARROW = /[iIl1.,:;'`|!()[\]{}\- ]/;
const WIDE = /[mwMW@%]/;
const DIGIT = /[0-9]/;

/**
 * Chữ HOA nhận diện bằng ánh xạ hoa–thường của Unicode, không bằng một dải mã.
 *
 * Dải `À-Ỹ` (U+00C0–U+1EF8) trông như "chữ hoa có dấu" nhưng nó chạy xen kẽ hoa và thường —
 * `à`, `ẵ`, `ộ` đều nằm trong đó. Dùng dải là mọi nguyên âm có dấu của tiếng Việt bị tính bề
 * rộng của chữ hoa, và "Sẵn sàng" hoá ra rộng hơn "San sang" đúng bằng số dấu trong nó.
 */
function isUpperCase(char: string): boolean {
  return char !== char.toLowerCase() && char === char.toUpperCase();
}

const RATIO = {
  narrow: 0.32,
  wide: 0.92,
  upperOrDigit: 0.62,
  normal: 0.55,
} as const;

/** Chữ đậm nở ngang chừng 3–4% so với chữ thường ở cùng cỡ. */
const BOLD_FACTOR = 1.04;

/**
 * Biên an toàn: thà đoán RỘNG hơn một chút.
 *
 * Đoán hụt thì hàng bị nhồi quá và tự xuống dòng — đúng cảnh ragged mà cả module này sinh ra để
 * tránh. Đoán dư chỉ làm một viên rơi xuống hàng sau sớm hơn cần thiết.
 */
const SAFETY = 1.03;

export function estimateTextWidth(text: string, fontSize: number, bold = false): number {
  let ratio = 0;
  for (const char of text) {
    if (NARROW.test(char)) ratio += RATIO.narrow;
    else if (WIDE.test(char)) ratio += RATIO.wide;
    else if (DIGIT.test(char) || isUpperCase(char)) ratio += RATIO.upperOrDigit;
    else ratio += RATIO.normal;
  }
  return ratio * fontSize * (bold ? BOLD_FACTOR : 1) * SAFETY;
}

/**
 * Xếp các phần tử vào hàng, GIỮ thứ tự ưu tiên, chỉ kéo phần tử sau lên khi nó lấp vừa chỗ trống.
 *
 * Không phải sắp xếp lại theo độ dài: thứ tự của những viên nhãn này là thứ tự KHẨN (trạng thái
 * vận hành → công khai → việc cần làm), và sắp lại theo bề rộng là đánh đổi cái nghĩa lấy cái
 * đẹp. Ở đây hàng vẫn chạy theo đúng thứ tự vào, chỉ khi viên kế tiếp KHÔNG vừa thì mới tìm viên
 * gần nhất còn lại lọt được vào khoảng trống đó — chỗ trống cuối hàng được lấp mà không viên nào
 * bị đẩy xuống sau một viên kém khẩn hơn nó.
 *
 * Trả về CHỈ SỐ chứ không phải phần tử: nơi gọi giữ dữ liệu của mình, hàm này chỉ nói cách xếp.
 */
export function packRows(
  widths: readonly number[],
  available: number,
  gap: number,
): number[][] {
  if (!Number.isFinite(available) || available <= 0) {
    return widths.length > 0 ? [widths.map((_, index) => index)] : [];
  }

  const remaining = widths.map((_, index) => index);
  const rows: number[][] = [];

  while (remaining.length > 0) {
    const row: number[] = [];
    let used = 0;

    for (let cursor = 0; cursor < remaining.length; ) {
      const index = remaining[cursor] as number;
      const need = (row.length > 0 ? gap : 0) + (widths[index] as number);

      /* Hàng rỗng thì NHẬN bất kể vừa hay không — một viên rộng hơn cả hàng vẫn phải nằm đâu đó. */
      if (row.length === 0 || used + need <= available) {
        row.push(index);
        used += need;
        remaining.splice(cursor, 1);
      } else {
        cursor += 1;
      }
    }

    rows.push(row);
  }

  return rows;
}
