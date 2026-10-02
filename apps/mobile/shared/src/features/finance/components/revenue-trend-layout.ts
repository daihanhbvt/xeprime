import { wholeUnits } from '@xeprime/domain';

/**
 * Phần TOÁN của biểu đồ thu-chi-lợi nhuận — tách khỏi component để test được mà không phải
 * render một biểu đồ SVG.
 *
 * Lý do tách rõ ràng hơn "cho gọn": ba thứ ở đây là chỗ dễ sai nhất và cũng khó nhìn thấy nhất
 * bằng mắt — quy đổi CHUỖI tiền sang số pixel (ADR 0007), phép căn ĐƯỜNG lợi nhuận vào giữa cặp
 * cột, và thang chia trục Y. Hai cái sau bám vào công thức nội bộ của thư viện vẽ; giữ chúng ở
 * đây kèm test nghĩa là nâng thư viện mà công thức đổi thì test đỏ, chứ không phải một đường lệch
 * nửa nhóm hay một nửa trục bị cắt mà chỉ người dùng nhìn thấy.
 */

/** Hình dạng một chuỗi tiền hợp lệ — cùng bộ chặn `toChartValue` của web dùng. */
const MONEY_SHAPE = /^-?\d+(\.\d+)?$/;

/**
 * Chuỗi tiền → số ĐỒNG NGUYÊN, giữ nguyên DẤU.
 *
 * Quy đổi chỉ xảy ra ở đây và chỉ để đặt hình: không con số nghiệp vụ nào đi ra từ phép này.
 * Đi qua `wholeUnits` chứ không `Number()` trần — bỏ phần lẻ trên CHUỖI trước rồi mới quy đổi,
 * nên số lớn không mất chính xác dọc đường. Đúng cách `toChartValue` của web làm.
 */
export function chartValue(money: string | null | undefined): number {
  if (!money || !MONEY_SHAPE.test(money)) return 0;
  const value = Number(wholeUnits(money));
  return Number.isFinite(value) ? value : 0;
}

/** Bố cục ngang của một biểu đồ CẶP CỘT: hai cột sát nhau, các nhóm cách nhau một khe rộng hơn. */
export interface GroupedBarLayout {
  /** Bề rộng một cột. */
  readonly barWidth: number;
  /** Khe giữa cột doanh thu và cột chi phí TRONG một nhóm. */
  readonly barGap: number;
  /** Khe giữa hai nhóm. */
  readonly groupGap: number;
  /** Lề trái trước nhóm đầu tiên. */
  readonly initialSpacing: number;
}

/**
 * Bước lặp của một nhóm = hai cột + khe trong nhóm + khe sang nhóm sau.
 *
 * `BarChart` cộng `spacing` SAU mỗi cột, nên khe trong nhóm là `spacing` của cột thứ nhất và khe
 * sang nhóm sau là `spacing` của cột thứ hai.
 */
export function groupPitch(layout: GroupedBarLayout): number {
  return layout.barWidth * 2 + layout.barGap + layout.groupGap;
}

/** Tâm ngang của nhóm thứ `index`, tính từ mép trái vùng vẽ (chưa cộng bề rộng trục Y). */
export function groupCenterX(layout: GroupedBarLayout, index: number): number {
  return layout.initialSpacing + groupPitch(layout) * index + layout.barWidth + layout.barGap / 2;
}

/**
 * Cấu hình khoảng cách cho ĐƯỜNG lợi nhuận, để điểm thứ `k` rơi đúng tâm nhóm thứ `k`.
 *
 * `BarChart` tính X của điểm line bằng
 * `firstBarWidth/2 + lineConfig.initialSpacing + (barWidth + lineConfig.spacing) * index`
 * (xem `getXForLineInBar` của `gifted-charts-core`; các hằng `+6`, `−4` và `−dataPointsWidth/2`
 * của thư viện triệt tiêu nhau ở giá trị mặc định). Đường đi qua N điểm trong khi dải cột có 2N
 * phần tử, nên nếu để nó dùng chung `spacing` của cột thì đường chỉ dài bằng nửa biểu đồ.
 *
 * Giải hai ẩn từ đẳng thức "X điểm k = tâm nhóm k":
 *   `spacing`        = pitch − barWidth
 *   `initialSpacing` = initialSpacing của cột + (barWidth + barGap) / 2
 */
export function profitLineSpacing(layout: GroupedBarLayout): {
  spacing: number;
  initialSpacing: number;
} {
  return {
    spacing: groupPitch(layout) - layout.barWidth,
    initialSpacing: layout.initialSpacing + (layout.barWidth + layout.barGap) / 2,
  };
}

/** X mà thư viện sẽ đặt cho điểm line thứ `index` — bản sao công thức, dùng để TEST phép căn. */
export function profitLineX(layout: GroupedBarLayout, index: number): number {
  const line = profitLineSpacing(layout);
  return layout.barWidth / 2 + line.initialSpacing + (layout.barWidth + line.spacing) * index;
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Trải dải cột theo bề ngang có được
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/** Khe giữa hai cột trong một nhóm — `barGap={2}` của web; chỉ co lại ở kỳ dày tới mức hết chỗ. */
const BAR_GAP = 2;

/** Trần bề rộng một cột — `maxBarSize={28}` của web. Không có nó, một mốc duy nhất ra hai tảng màu. */
export const MAX_BAR_WIDTH = 28;

/**
 * Phần bề ngang của một dải mà cặp cột được chiếm; phần còn lại là khe giữa hai mốc.
 *
 * Tương đương `barCategoryGap: '10%'` (mặc định của recharts) — 10% chia đều hai bên.
 */
const BAND_FILL = 0.8;

/** Sàn bề rộng ô nhãn: đủ cho `01/09` và `09/2026` ở cỡ chữ nhãn. */
const MIN_LABEL_WIDTH = 52;

/** Bố cục đã chốt, kèm những kích thước dẫn xuất mà nơi gọi cần tới. */
export interface FittedBarLayout extends GroupedBarLayout {
  /** Bề rộng ô nhãn trục X. */
  readonly labelWidth: number;
  /** Bước nhóm — khoảng cách giữa tâm hai mốc liền nhau, cũng là bề rộng một dải chạm. */
  readonly pitch: number;
  /** Bề rộng THẬT của dải cột: bằng khung khi trải vừa, lớn hơn khung khi phải cuộn. */
  readonly contentWidth: number;
  /** `true` khi mọi mốc nằm gọn trong khung — lúc đó biểu đồ không cuộn. */
  readonly fitted: boolean;
}

/**
 * Cỡ mà một mốc đáng được nhận khi kỳ dày tới mức phải cuộn.
 *
 * Cột 14dp đủ dày để phân biệt màu và để chạm trúng; khe 20dp giữa hai mốc đủ rộng để mắt gom hai
 * cột thành MỘT mốc và để các chấm trên đường lợi nhuận thưa ra thành một đường, không thành một
 * chuỗi hạt dính nhau.
 */
const ROOMY: GroupedBarLayout = { barWidth: 14, barGap: BAR_GAP, groupGap: 20, initialSpacing: 12 };

/**
 * Trải `groups` mốc theo bề ngang có được: **còn chỗ thì giãn cho đầy khung, hết chỗ thì cuộn**.
 *
 * - **Còn chỗ** (12 tháng, 5 tuần, một mốc lẻ): chia đều khung thành `groups` dải như
 *   `ResponsiveContainer` + `recharts` làm trên web, cặp cột nằm giữa dải và nở tới `maxBarSize`
 *   rồi thôi. Không có nhánh này thì một kỳ chỉ có một mốc vẽ ra biểu đồ rộng 60dp nằm lọt thỏm
 *   giữa tấm thẻ — người đọc thấy thẻ hỏng chứ không thấy "kỳ này chỉ có một mốc".
 * - **Hết chỗ** (30 ngày trở lên trên màn điện thoại): giữ nguyên cỡ {@link ROOMY} và để dải cột
 *   dài ra, cuộn ngang. Đây là chỗ app buộc phải khác web: `recharts` có cả bề ngang màn desktop
 *   để chia, còn ép 30 ngày vào ~330dp thì cột còn 8dp, hai cột dính vào nhau và các chấm lợi
 *   nhuận dồn thành một vệt — biểu đồ vẫn "vẽ đúng" nhưng không còn đọc được.
 *
 * Cả hai nhánh giữ **bước nhóm đều nhau**, điều kiện để lớp chạm biết ngón tay rơi vào mốc nào:
 * tâm mốc k luôn là `groupCenterX(layout, k)`, cách nhau đúng `pitch`.
 */
export function fitGroupedBars(groups: number, plotWidth: number): FittedBarLayout {
  const roomyPitch = groupPitch(ROOMY);
  const roomyWidth = ROOMY.initialSpacing + roomyPitch * groups;

  /* Chưa đo xong màn, kỳ rỗng, hoặc kỳ dày quá khung: giữ cỡ thoải mái và để nơi gọi cho cuộn. */
  if (groups <= 0 || plotWidth <= 0 || roomyWidth > plotWidth) {
    return {
      ...ROOMY,
      labelWidth: Math.max(MIN_LABEL_WIDTH, ROOMY.barWidth * 2 + ROOMY.barGap),
      pitch: roomyPitch,
      contentWidth: Math.max(0, roomyWidth),
      fitted: false,
    };
  }

  const pitch = plotWidth / groups;

  /** Phần dải mà cặp cột được chiếm; phần còn lại thành khe giữa hai mốc. */
  const band = pitch * BAND_FILL;
  /*
    Khe TRONG nhóm co lại trước khi cột phải mảnh thêm, và không bao giờ nuốt quá một phần ba dải:
    ở kỳ một năm theo NGÀY, giữ khư khư 2dp là hai cột teo lại còn mỏng hơn chính cái khe tách
    chúng — mắt đọc ra ba vạch đều nhau chứ không ra một cặp.
  */
  const barGap = Math.min(BAR_GAP, band / 3);
  const barWidth = Math.min(MAX_BAR_WIDTH, (band - barGap) / 2);

  const layout: GroupedBarLayout = {
    barWidth,
    barGap,
    /* Cột đã chạm trần `maxBarSize` thì phần dải dôi ra dồn hết vào khe giữa hai mốc. */
    groupGap: Math.max(0, pitch - barWidth * 2 - barGap),
    // Đẩy nhóm đầu vào giữa dải của nó; các nhóm sau tự đúng chỗ vì bước nhóm bằng bước dải.
    initialSpacing: Math.max(0, pitch / 2 - barWidth - barGap / 2),
  };

  return {
    ...layout,
    labelWidth: Math.max(MIN_LABEL_WIDTH, barWidth * 2 + barGap),
    /*
      Bước nhóm đọc NGƯỢC từ bố cục vừa chốt chứ không chép lại `pitch` lý thuyết: nó là con số
      mà `groupCenterX` thật sự dùng để đặt từng mốc, và lớp chạm dựa vào đúng bất biến đó — dải
      chạm rộng `pitch` quanh mỗi tâm thì phủ kín và không chồng lấn.
    */
    pitch: groupPitch(layout),
    contentWidth: plotWidth,
    fitted: true,
  };
}

/**
 * Dịch ngang chữ của nhãn trục X thứ `index`, tính bằng dp.
 *
 * Sửa hai chỗ lệch mà `BarChart` để lại, và cả hai đều là thứ `recharts` làm sẵn trên web:
 *
 * 1. **Nhãn không nằm giữa mốc.** Thư viện gắn nhãn vào CỘT ĐẦU của cặp và dựng hộp chữ rộng
 *    `labelWidth` ngay từ mép trái cột đó, nên tâm chữ rơi ở `cột₁ + labelWidth/2` — với hộp 52dp
 *    và cột 8dp là lệch phải hơn 20dp, chữ `10/09` đứng chệch hẳn sang mốc bên cạnh.
 * 2. **Nhãn hai đầu tràn khỏi dải cột.** Mốc cuối có tâm cách mép phải chưa tới nửa hộp chữ, nên
 *    `30/09` bị đẩy ra rìa và cắt cụt. `<XAxis>` của web neo tick đầu/cuối vào MÉP TRONG đúng như
 *    một trục in trên giấy; phép kẹp dưới đây là chính điều đó — kẹp theo bề rộng NỘI DUNG, nên ở
 *    kỳ cuộn được thì nó ôm mép dải cột chứ không ôm mép khung nhìn đang trôi.
 *
 * Trả về khoảng dịch, không phải toạ độ: nơi gọi chỉ việc đưa nó vào `transform: translateX` của
 * `labelTextStyle` từng cột — đó là móc DUY NHẤT mà thư viện mở ra cho nhãn theo từng mốc.
 */
export function labelShiftX(layout: FittedBarLayout, index: number): number {
  const half = layout.labelWidth / 2;
  /* Tâm hộp chữ mà thư viện dựng ra: mép trái cột đầu của cặp, cộng nửa bề rộng hộp. */
  const boxCenter = layout.initialSpacing + layout.pitch * index + half;
  /* Chỗ chữ ĐÁNG nằm: đúng tâm cặp cột, chính là chỗ điểm lợi nhuận của mốc đó rơi xuống. */
  const target = groupCenterX(layout, index);
  /* Dải cột hẹp hơn cả một nhãn thì không còn chỗ để kẹp — giữ nguyên tâm mốc, đừng làm tệ hơn. */
  const centered =
    layout.contentWidth >= layout.labelWidth
      ? Math.min(Math.max(target, half), layout.contentWidth - half)
      : target;

  return centered - boxCenter;
}

/**
 * Những mốc ĐƯỢC in nhãn — bản native của `interval="preserveStartEnd"` + `minTickGap` bên web.
 *
 * Kỳ 30 ngày trên màn 390dp cho mỗi mốc khoảng 11dp, trong khi `01/09` cần hơn 30dp: in đủ nhãn
 * thì chúng chồng lên nhau thành một vệt xám không đọc được chữ nào. Bỏ bớt theo bước đều, và
 * LUÔN giữ hai đầu — hai đầu là thứ nói ra biểu đồ đang xem khoảng thời gian nào.
 *
 * Nhãn bị bỏ không làm mất dữ liệu: mọi mốc vẫn chạm được và thẻ chi tiết in đúng ngày của nó.
 */
export function labelledBuckets(
  groups: number,
  pitch: number,
  minLabelSpace: number,
): ReadonlySet<number> {
  const shown = new Set<number>();
  if (groups <= 0) return shown;

  const stride = pitch > 0 ? Math.max(1, Math.ceil(minLabelSpace / pitch)) : 1;
  for (let index = 0; index < groups; index += stride) shown.add(index);

  // Mốc cuối chen vào chỗ của mốc kế trước thì nhường: hai đầu quan trọng hơn một bước đều tuyệt đối.
  const last = groups - 1;
  for (const index of [...shown]) {
    if (index !== 0 && last - index < stride) shown.delete(index);
  }
  shown.add(last);

  return shown;
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Thang chia trục Y
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Số vạch trục Y — mặc định của `<YAxis>` bên `recharts`.
 *
 * Là HẰNG chứ không phải tham số: thuật toán dưới đây lặp cho tới khi số vạch vừa đúng con số
 * này, và với giá trị nhỏ hơn 3 vòng lặp đó không dừng khi miền có cả phần âm lẫn phần dương.
 * Web không cho đổi nó, app cũng vậy.
 */
export const Y_AXIS_TICK_COUNT = 5;

/** Thang chia trục Y đã chốt: bậc, số nấc hai phía đường 0, và toàn bộ mốc. */
export interface AxisTicks {
  /** Khoảng cách giữa hai vạch liền nhau. */
  readonly step: number;
  /** Số nấc TRÊN đường 0 — luôn ≥ 1. */
  readonly sectionsAbove: number;
  /** Số nấc DƯỚI đường 0 — bằng 0 khi kỳ không có lỗ. */
  readonly sectionsBelow: number;
  /** Vạch cao nhất = `step × sectionsAbove`. */
  readonly max: number;
  /** Vạch thấp nhất = `−step × sectionsBelow`. */
  readonly min: number;
  /** Toàn bộ vạch, từ thấp lên cao — dùng để đối chiếu với web. */
  readonly ticks: readonly number[];
}

/** Số chữ số phần nguyên (`getDigitCount` của recharts): 1.732.914 → 7, còn 0,5 → 0. */
function digitCount(value: number): number {
  return value === 0 ? 1 : Math.floor(Math.log10(Math.abs(value))) + 1;
}

/**
 * Bậc "dễ đọc" gần nhất phía trên `roughStep` — `getAdaptiveStep` của recharts.
 *
 * Recharts tính `ceil(stepRatio / 0,05) × 0,05 × 10^d` bằng số thập phân CHÍNH XÁC
 * (`decimal.js-light`). Ở đây gộp `0,05 × 10^d` thành MỘT thừa số nguyên trước khi nhân:
 * `d = 1` cho `0,1 × 10 = 1`, `d` khác 1 cho `0,05 × 10^d = 5 × 10^(d−2)`. Kết quả đại số y hệt
 * nhưng không đi qua phép nhân với 0,05 — nhị phân không biểu diễn đúng 0,05 nên
 * `3 × 0,05 × 10⁷` ra `1500000,0000000002`, và một bậc lẻ như thế in thẳng ra nhãn trục.
 */
function adaptiveStep(roughStep: number, correctionFactor: number): number {
  if (roughStep <= 0) return 0;
  const digits = digitCount(roughStep);
  const unit = digits === 1 ? 1 : 5 * 10 ** (digits - 2);
  return (Math.ceil(roughStep / unit) + correctionFactor) * unit;
}

/**
 * `calculateStep` của recharts, chép nguyên: bậc cùng số nấc hai phía sao cho tổng số vạch đúng
 * bằng {@link Y_AXIS_TICK_COUNT}. Vạch được phép nằm NGOÀI miền dữ liệu — đó chính là thứ biến
 * đỉnh `2.839.966 ₫` thành trần `3tr` thay vì `2,8tr`.
 */
function calculateStep(
  min: number,
  max: number,
  correctionFactor = 0,
): { step: number; tickMin: number; tickMax: number } {
  const step = adaptiveStep((max - min) / (Y_AXIS_TICK_COUNT - 1), correctionFactor);
  if (step <= 0) return { step: 0, tickMin: 0, tickMax: 0 };

  // 0 nằm trong miền thì 0 phải là một vạch — nếu không, cột và đường mất mốc chung để so.
  const mid = (min + max) / 2;
  const middle = min <= 0 && max >= 0 ? 0 : mid - (mid % step);

  let belowCount = Math.ceil((middle - min) / step);
  let upCount = Math.ceil((max - middle) / step);
  const scaleCount = belowCount + upCount + 1;

  // Chưa phủ hết miền thì nới bậc rồi tính lại; thừa vạch thì phát thêm về phía có dữ liệu.
  if (scaleCount > Y_AXIS_TICK_COUNT) return calculateStep(min, max, correctionFactor + 1);
  if (scaleCount < Y_AXIS_TICK_COUNT) {
    if (max > 0) upCount += Y_AXIS_TICK_COUNT - scaleCount;
    else belowCount += Y_AXIS_TICK_COUNT - scaleCount;
  }

  return { step, tickMin: middle - belowCount * step, tickMax: middle + upCount * step };
}

/**
 * Thang trục Y cho cả ba chuỗi — **cùng thuật toán `getNiceTickValues` mà `recharts` chạy trên
 * web**, không phải một phép làm tròn riêng của app.
 *
 * Vì sao phải chép chứ không tự nghĩ: cùng một kỳ, cùng một con số, mở web thấy thang
 * `0 · 1,5tr · 3tr` mà mở app thấy `709k · 1,4tr · 2,1tr · 2,8tr` thì người dùng phải tự quy đổi
 * giữa hai bản báo cáo của CÙNG một cửa hàng. Bản làm tròn theo bội số của số nấc còn cắt cụt nửa
 * âm: đường lợi nhuận tụt tới `−2,84tr` mà trục chỉ tới `−1,4tr` thì phần lỗ biến mất khỏi hình.
 *
 * Miền dữ liệu dựng theo `domain={[0, 'auto']}` + `allowDataOverflow` false của web: 0 luôn nằm
 * trong miền, đáy nới xuống tới giá trị âm nhất, đỉnh lên tới giá trị dương nhất.
 *
 * Một trục chung cho cả ba chuỗi: chúng cùng là tiền VND nên so trực tiếp được. Hai thang riêng là
 * cách nhanh nhất để vẽ ra một tương quan không tồn tại.
 */
export function niceAxis(values: readonly number[]): AxisTicks {
  const min = values.reduce((low, value) => Math.min(low, value), 0);
  const max = values.reduce((high, value) => Math.max(high, value), 0);

  /*
   * Kỳ trắng (mọi chuỗi bằng 0). Web rơi vào nhánh `getTickOfSingleValue(0, 5, true)` và in thang
   * `0 1 2 3 4`; chép luôn nhánh đó để hai bên không rẽ hướng ngay ở ca rỗng. Thực tế màn hình đã
   * chặn trước bằng trạng thái "kỳ này chưa có số liệu", nên đây là lưới an toàn.
   */
  if (min === 0 && max === 0) {
    return { step: 1, sectionsAbove: 4, sectionsBelow: 0, max: 4, min: 0, ticks: [0, 1, 2, 3, 4] };
  }

  const { step, tickMin, tickMax } = calculateStep(min, max);

  /*
   * Thư viện native dựng trục bằng "số nấc trên/dưới đường 0" chứ không bằng một cặp biên, nên nó
   * KHÔNG vẽ được trục có đỉnh đúng bằng 0 (điều recharts làm được khi mọi giá trị đều ≤ 0). Mà
   * trần dữ liệu chỉ bằng 0 khi doanh thu và chi phí đều bằng 0 — khi đó lợi nhuận cũng bằng 0 và
   * chẳng có phần âm nào để vẽ. Nâng lên một nấc là lối thoát cho ca không thể xảy ra, không phải
   * một chỗ lệch với web trong dữ liệu thật.
   */
  const sectionsAbove = tickMax > 0 ? Math.round(tickMax / step) : 1;
  const sectionsBelow = tickMin < 0 ? Math.round(-tickMin / step) : 0;

  const ticks: number[] = [];
  for (let i = -sectionsBelow; i <= sectionsAbove; i++) {
    const tick = step * i;
    // `step * -0` ra `-0`; nhãn trục sẽ in "-0 ₫" và mọi phép so sánh mốc đều lệch một cách vô hình.
    ticks.push(tick === 0 ? 0 : tick);
  }

  return {
    step,
    sectionsAbove,
    sectionsBelow,
    max: step * sectionsAbove,
    min: -step * sectionsBelow,
    ticks,
  };
}

/**
 * Nới trần trục thêm MỘT NẤC khi mốc lợi nhuận cao nhất sát trần tới mức chấm của nó bị cắt.
 *
 * Đường lợi nhuận sống trong một `<Svg>` riêng, và thư viện đặt tâm chấm ở
 * `cy = H − value/max × H` — đo từ **mép trên khung vẽ**. Mốc chạm đúng trần trục cho `cy = 0`,
 * nghĩa là nửa trên của chấm nằm ngoài khung và bị SVG xén phẳng. Không có prop nào nới khung đó,
 * và kéo riêng đường xuống thì nó không còn chỉ đúng giá trị của mình nữa.
 *
 * Nên chỗ nới phải nằm ở THANG: thêm một nấc trục là mốc cao nhất tụt xuống dưới trần đúng một
 * bậc, thừa chỗ cho cả chấm thường lẫn chấm đang chọn (nở to hơn). Một nấc là đủ và chỉ thêm khi
 * cần — trục vẫn giữ nguyên bậc chia của `recharts`, không phải một thang khác web.
 *
 * `topValue` là giá trị lớn nhất CÓ CHẤM, tức đỉnh của chuỗi lợi nhuận: cột không có chấm nên cột
 * chạm trần vẫn ổn — nó chỉ mất phần bo góc, và đó là việc của `PLOT_HEADROOM` bên component.
 */
export function axisWithDotHeadroom(
  axis: AxisTicks,
  topValue: number,
  plotHeight: number,
  dotRadius: number,
): AxisTicks {
  if (topValue <= 0 || axis.max <= 0) return axis;

  const above = positiveHeight(axis, plotHeight);
  /* Chỗ trống từ chấm cao nhất lên tới trần, tính bằng dp — đúng cái `cy` mà thư viện sẽ đặt. */
  const gap = above - (topValue * above) / axis.max;
  if (gap >= dotRadius) return axis;

  const sectionsAbove = axis.sectionsAbove + 1;
  const ticks: number[] = [];
  for (let i = -axis.sectionsBelow; i <= sectionsAbove; i++) {
    const tick = axis.step * i;
    ticks.push(tick === 0 ? 0 : tick);
  }

  return { ...axis, sectionsAbove, max: axis.step * sectionsAbove, ticks };
}

/**
 * Chiều cao NỬA TRÊN đường 0, sao cho cả biểu đồ vẫn cao đúng `plotHeight`.
 *
 * `BarChart` nhận `height` là chiều cao phần DƯƠNG rồi tự nối thêm `sectionsBelow × stepHeight`
 * bên dưới. Đưa thẳng `plotHeight` vào thì một kỳ có lỗ cao gấp đôi một kỳ có lãi, và khối biểu
 * đồ nhảy chiều cao mỗi lần người dùng đổi kỳ. Web giữ khung cố định và để đường 0 trượt trong
 * khung — đây là phép chia làm đúng như vậy.
 */
export function positiveHeight(axis: AxisTicks, plotHeight: number): number {
  return Math.round((plotHeight * axis.sectionsAbove) / (axis.sectionsAbove + axis.sectionsBelow));
}
