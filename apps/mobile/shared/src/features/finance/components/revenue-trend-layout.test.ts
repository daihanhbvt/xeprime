import {
  MAX_BAR_WIDTH,
  chartValue,
  fitGroupedBars,
  groupCenterX,
  axisWithDotHeadroom,
  groupPitch,
  labelShiftX,
  labelledBuckets,
  niceAxis,
  positiveHeight,
  profitLineSpacing,
  profitLineX,
  type GroupedBarLayout,
} from './revenue-trend-layout';

const LAYOUT: GroupedBarLayout = { barWidth: 12, barGap: 2, groupGap: 20, initialSpacing: 12 };

/**
 * Biểu đồ thu-chi-lợi nhuận — phần TOÁN.
 *
 * Đây là chỗ một lỗi không bao giờ đỏ trong test giao diện: đường lợi nhuận lệch nửa nhóm vẫn
 * render bình thường, chỉ có người dùng nhìn thấy nó chỉ vào sai cột. Công thức toạ độ lấy từ
 * `getXForLineInBar` của `gifted-charts-core`; nâng thư viện mà công thức đổi thì test này đỏ.
 */
describe('chartValue — chuỗi tiền sang số để ĐẶT HÌNH (ADR 0007)', () => {
  it('bỏ phần lẻ trên CHUỖI trước khi quy đổi', () => {
    expect(chartValue('1500000.99')).toBe(1500000);
  });

  it('GIỮ dấu âm — lỗ phải nằm dưới trục 0, không bị lật lên trên', () => {
    expect(chartValue('-300000')).toBe(-300000);
  });

  it('rỗng / null / rác đều là 0, không phải NaN', () => {
    expect(chartValue('')).toBe(0);
    expect(chartValue(null)).toBe(0);
    expect(chartValue(undefined)).toBe(0);
    expect(chartValue('1.2.3')).toBe(0);
    expect(chartValue('abc')).toBe(0);
  });

  it('số rất lớn vẫn ra đúng giá trị', () => {
    expect(chartValue('12345678901234')).toBe(12345678901234);
  });
});

describe('bố cục cặp cột', () => {
  it('bước nhóm = hai cột + khe trong nhóm + khe sang nhóm sau', () => {
    expect(groupPitch(LAYOUT)).toBe(12 * 2 + 2 + 20);
  });

  it('tâm nhóm đầu nằm giữa hai cột của chính nó', () => {
    // 12 (lề) + 12 (cột 1) + 1 (nửa khe trong nhóm) = 25
    expect(groupCenterX(LAYOUT, 0)).toBe(25);
  });

  it('các nhóm cách nhau đúng một bước', () => {
    expect(groupCenterX(LAYOUT, 3) - groupCenterX(LAYOUT, 2)).toBe(groupPitch(LAYOUT));
  });
});

/**
 * Điều kiện SỐNG CÒN của biểu đồ: điểm thứ k của đường lợi nhuận phải rơi đúng tâm cặp cột thứ k.
 *
 * Dải cột có 2N phần tử còn đường có N điểm, nên nếu để đường dùng chung `spacing` của cột thì nó
 * chỉ dài bằng nửa biểu đồ và mọi điểm đều chỉ sai chỗ.
 */
describe('đường lợi nhuận căn vào tâm cặp cột', () => {
  it.each([0, 1, 2, 7, 30, 364])('điểm %i trùng tâm nhóm %i', (index) => {
    expect(profitLineX(LAYOUT, index)).toBe(groupCenterX(LAYOUT, index));
  });

  it('bước của đường bằng bước nhóm, không bằng bước cột', () => {
    const line = profitLineSpacing(LAYOUT);
    expect(line.spacing + LAYOUT.barWidth).toBe(groupPitch(LAYOUT));
  });

  it.each([
    { barWidth: 8, barGap: 0, groupGap: 12, initialSpacing: 4 },
    { barWidth: 20, barGap: 6, groupGap: 30, initialSpacing: 24 },
  ])('vẫn đúng khi đổi bố cục (%o)', (layout: GroupedBarLayout) => {
    expect(profitLineX(layout, 5)).toBe(groupCenterX(layout, 5));
  });
});

/**
 * Trải mốc theo bề ngang có được — còn chỗ thì giãn cho đầy khung, hết chỗ thì cuộn.
 */
describe('fitGroupedBars — bề rộng tối thiểu là trọn khung', () => {
  const WIDTH = 330;

  it.each([1, 2, 4, 6])('%i mốc: giãn cho phủ đúng khung, không cuộn', (groups) => {
    const layout = fitGroupedBars(groups, WIDTH);
    expect(layout.fitted).toBe(true);
    expect(layout.contentWidth).toBe(WIDTH);
    expect(layout.pitch * groups).toBeCloseTo(WIDTH, 6);
  });

  /**
   * Kỳ dày mốc KHÔNG bị bóp cho vừa khung: cột 8dp và các chấm lợi nhuận dồn thành một vệt là
   * biểu đồ vẽ đúng mà đọc không ra. Giữ cỡ thoải mái, để dải cột dài hơn khung và cho cuộn.
   */
  it.each([12, 30, 90])('%i mốc: giữ cỡ cột thoải mái và cho cuộn', (groups) => {
    const layout = fitGroupedBars(groups, WIDTH);
    expect(layout.fitted).toBe(false);
    expect(layout.contentWidth).toBeGreaterThan(WIDTH);
    expect(layout.barWidth).toBe(14);
  });

  /**
   * Bất biến mà LỚP CHẠM dựa vào: tâm hai mốc liền nhau cách đúng `pitch`, nên đặt một ô rộng
   * `pitch` quanh mỗi tâm là phủ kín và không chồng lấn. Sai chỗ này thì chạm cột này ra số cột kia.
   */
  it.each([1, 3, 6, 30])('tâm hai mốc liền nhau cách đúng một bước — %i mốc', (groups) => {
    const layout = fitGroupedBars(groups, WIDTH);
    for (let index = 1; index < groups; index++) {
      expect(groupCenterX(layout, index) - groupCenterX(layout, index - 1)).toBeCloseTo(
        layout.pitch,
        6,
      );
    }
  });

  it('mốc đầu nằm giữa dải của nó khi biểu đồ đã trải vừa khung', () => {
    const layout = fitGroupedBars(3, WIDTH);
    expect(groupCenterX(layout, 0)).toBeCloseTo(layout.pitch / 2, 6);
  });

  it('một mốc duy nhất: cột dừng ở trần của web, không nở thành hai tảng màu', () => {
    expect(fitGroupedBars(1, WIDTH).barWidth).toBe(MAX_BAR_WIDTH);
  });

  it.each([1, 2, 6, 12, 30, 366])('cặp cột không bao giờ tràn khỏi dải — %i mốc', (groups) => {
    const layout = fitGroupedBars(groups, WIDTH);
    expect(layout.barWidth * 2 + layout.barGap).toBeLessThanOrEqual(layout.pitch);
    expect(layout.barWidth).toBeGreaterThan(0);
    expect(layout.initialSpacing).toBeGreaterThanOrEqual(0);
  });

  it('không có mốc nào thì không chia cho 0', () => {
    const layout = fitGroupedBars(0, WIDTH);
    expect(layout.pitch).toBeGreaterThan(0);
    expect(Number.isFinite(layout.barWidth)).toBe(true);
  });

  it('bề rộng khung bằng 0 (chưa đo xong màn) không sinh ra số vô nghĩa', () => {
    const layout = fitGroupedBars(5, 0);
    expect(layout.barWidth).toBeGreaterThan(0);
    expect(layout.pitch).toBeGreaterThan(0);
  });

  /**
   * Kỳ một năm theo NGÀY trên màn hẹp: mỗi mốc chưa tới 1dp. Cột và khe cùng teo lại, nhưng không
   * con số nào được phép âm hay bằng 0 — một `barWidth` âm là biểu đồ TRẮNG, không phải cột nhỏ.
   */
  it('kỳ dài bất thường vẫn ra bố cục hợp lệ, không có số âm', () => {
    const layout = fitGroupedBars(366, WIDTH);
    expect(layout.barWidth).toBeGreaterThan(0);
    expect(layout.groupGap).toBeGreaterThanOrEqual(0);
    expect(layout.initialSpacing).toBeGreaterThanOrEqual(0);
  });
});

/**
 * Nhãn trục X phải chỉ đúng mốc của nó và không mốc nào bị đẩy ra rìa.
 *
 * Hai lỗi thật mà phép dịch này chữa: thư viện dựng hộp chữ từ mép trái CỘT ĐẦU của cặp nên chữ
 * lệch phải hơn 20dp so với mốc, và nhãn cuối kỳ (`30/09`) trôi ra ngoài vùng vẽ rồi bị cắt.
 */
describe('labelShiftX — nhãn trục X căn như `<XAxis>` của web', () => {
  const WIDTH = 330;

  /** Tâm chữ THẬT sau khi dịch — chính là thứ người dùng nhìn thấy trên trục. */
  function labelCenter(groups: number, index: number, plotWidth = WIDTH): number {
    const layout = fitGroupedBars(groups, plotWidth);
    const box = layout.initialSpacing + layout.pitch * index + layout.labelWidth / 2;
    return box + labelShiftX(layout, index);
  }

  it.each([1, 2, 3, 5])('mốc giữa kỳ: chữ nằm đúng tâm cặp cột — mốc %i của 12', (index) => {
    const layout = fitGroupedBars(12, WIDTH);
    expect(labelCenter(12, index)).toBeCloseTo(groupCenterX(layout, index), 6);
  });

  it.each([4, 30])('nhãn ĐẦU không thò ra trái dải cột — %i mốc', (groups) => {
    const layout = fitGroupedBars(groups, WIDTH);
    expect(labelCenter(groups, 0) - layout.labelWidth / 2).toBeGreaterThanOrEqual(0);
  });

  /** Kỳ vừa khung lẫn kỳ phải cuộn: chữ cuối luôn nằm trọn trong dải cột, không bị mép cắt cụt. */
  it.each([4, 30])('nhãn CUỐI không thò ra phải dải cột — %i mốc', (groups) => {
    const layout = fitGroupedBars(groups, WIDTH);
    const last = groups - 1;
    expect(labelCenter(groups, last) + layout.labelWidth / 2).toBeLessThanOrEqual(
      layout.contentWidth,
    );
  });

  /** Kẹp là để chữ không bị cắt, không phải để dồn nhãn về giữa: mốc cuối vẫn phải nằm bên phải. */
  it('kẹp vào mép mà vẫn giữ đúng thứ tự thời gian trên trục', () => {
    expect(labelCenter(30, 29)).toBeGreaterThan(labelCenter(30, 15));
    expect(labelCenter(30, 15)).toBeGreaterThan(labelCenter(30, 0));
  });

  it('khung hẹp hơn một nhãn thì không kẹp ngược — giữ nguyên tâm mốc', () => {
    const narrow = 40;
    const layout = fitGroupedBars(3, narrow);
    expect(labelCenter(3, 1, narrow)).toBeCloseTo(groupCenterX(layout, 1), 6);
  });
});

/**
 * Chấm trên đường lợi nhuận không được để SVG xén.
 *
 * Thư viện đặt tâm chấm ở `cy = H − value/max × H`, đo từ mép trên khung vẽ: mốc chạm trần cho
 * `cy = 0` và mất nửa chấm. Đây là ca THẬT chứ không phải giả thuyết — thang của `recharts` cho
 * vạch trần bằng đúng đỉnh dữ liệu ở nhiều bộ số tròn.
 */
describe('axisWithDotHeadroom — chấm cao nhất không bị mép trên cắt', () => {
  const HEIGHT = 160;
  const RADIUS = 6;

  /** Khoảng từ chấm cao nhất lên tới trần, tính bằng dp — chính là `cy` thư viện sẽ đặt. */
  function topGap(axis: ReturnType<typeof niceAxis>, topValue: number): number {
    const above = positiveHeight(axis, HEIGHT);
    return above - (topValue * above) / axis.max;
  }

  it('đỉnh lợi nhuận CHẠM trần: nới thêm một nấc để chấm còn nguyên', () => {
    const values = [0, 1_800_000];
    const base = niceAxis(values);
    expect(topGap(base, 1_800_000)).toBeLessThan(RADIUS);

    const roomy = axisWithDotHeadroom(base, 1_800_000, HEIGHT, RADIUS);
    expect(roomy.sectionsAbove).toBe(base.sectionsAbove + 1);
    expect(roomy.max).toBe(base.max + base.step);
    expect(topGap(roomy, 1_800_000)).toBeGreaterThanOrEqual(RADIUS);
  });

  it('nới trần KHÔNG đổi bậc chia, cũng không đụng nửa âm', () => {
    const base = niceAxis([0, 1_800_000, -450_000]);
    const roomy = axisWithDotHeadroom(base, 1_800_000, HEIGHT, RADIUS);
    expect(roomy.step).toBe(base.step);
    expect(roomy.sectionsBelow).toBe(base.sectionsBelow);
    expect(roomy.min).toBe(base.min);
    // Mốc mới mọc thêm ở trên, thứ tự vẫn liền mạch từ đáy lên đỉnh.
    expect(roomy.ticks).toEqual([...base.ticks, base.max + base.step]);
  });

  it('đỉnh còn cách trần đủ xa thì GIỮ NGUYÊN thang của web', () => {
    const base = niceAxis([0, 2_839_966]);
    expect(axisWithDotHeadroom(base, 500_000, HEIGHT, RADIUS)).toBe(base);
  });

  it('kỳ toàn lỗ: không có chấm nào ở nửa dương thì không nới gì', () => {
    const base = niceAxis([0, -2_839_966]);
    expect(axisWithDotHeadroom(base, -100_000, HEIGHT, RADIUS)).toBe(base);
  });
});

describe('labelledBuckets — bỏ bớt nhãn như `preserveStartEnd` của web', () => {
  it('thưa mốc thì in đủ nhãn', () => {
    expect([...labelledBuckets(4, 80, 52)]).toEqual([0, 1, 2, 3]);
  });

  it('dày mốc thì bỏ bớt, nhưng LUÔN giữ hai đầu', () => {
    const shown = labelledBuckets(30, 11, 52);
    expect(shown.has(0)).toBe(true);
    expect(shown.has(29)).toBe(true);
    expect(shown.size).toBeLessThan(30);
  });

  it('mốc cuối không chen vào chỗ của mốc kế trước', () => {
    const shown = [...labelledBuckets(30, 11, 52)].sort((a, b) => a - b);
    const stride = Math.ceil(52 / 11);
    const lastGap = shown[shown.length - 1]! - shown[shown.length - 2]!;
    expect(lastGap).toBeGreaterThanOrEqual(stride);
  });

  it('một mốc duy nhất vẫn có nhãn của nó', () => {
    expect([...labelledBuckets(1, 330, 52)]).toEqual([0]);
  });

  it('không có mốc nào thì không có nhãn nào', () => {
    expect(labelledBuckets(0, 330, 52).size).toBe(0);
  });
});

/**
 * Thang trục Y — phải RA ĐÚNG con số mà `recharts` in ra bên web.
 *
 * Mọi mảng mốc dưới đây lấy từ chính `getNiceTickValues([min, max], 5, true)` của `recharts@3.10.1`
 * chạy trên bộ dữ liệu tương ứng, không phải suy từ công thức trong đầu. Đây là điều kiện để hai
 * client không in hai thang khác nhau cho cùng một kỳ của cùng một cửa hàng.
 */
describe('niceAxis — cùng thang chia với recharts bên web', () => {
  it.each([
    {
      name: 'chỉ có lãi',
      values: [0, 1_732_914],
      ticks: [0, 450_000, 900_000, 1_350_000, 1_800_000],
    },
    {
      name: 'chi phí một cục',
      values: [0, 2_839_966],
      ticks: [0, 750_000, 1_500_000, 2_250_000, 3_000_000],
    },
    {
      name: 'lỗ đúng bằng chi phí',
      values: [0, 2_839_966, -2_839_966],
      ticks: [-3_000_000, -1_500_000, 0, 1_500_000, 3_000_000],
    },
    {
      name: 'lỗ nhỏ, lãi lớn',
      values: [12_500_000, -450_000],
      ticks: [-4_500_000, 0, 4_500_000, 9_000_000, 13_500_000],
    },
    {
      name: 'lỗ lớn, lãi nhỏ',
      values: [300_000, -1_200_000],
      ticks: [-1_200_000, -800_000, -400_000, 0, 400_000],
    },
    {
      name: 'số rất lớn',
      values: [0, 87_654_321],
      ticks: [0, 25_000_000, 50_000_000, 75_000_000, 100_000_000],
    },
  ])('$name', ({ values, ticks }) => {
    expect(niceAxis(values).ticks).toEqual(ticks);
  });

  it('bậc luôn là số NGUYÊN — 0,05 nhị phân sẽ đẻ ra 1500000,0000000002 và in thẳng lên trục', () => {
    const axis = niceAxis([0, 2_839_966, -2_839_966]);
    expect(axis.step).toBe(1_500_000);
    expect(Number.isInteger(axis.step)).toBe(true);
  });

  it('luôn PHỦ hết dữ liệu — nửa âm bị cắt là khoản lỗ biến mất khỏi hình', () => {
    const values = [0, 2_839_966, -2_839_966];
    const axis = niceAxis(values);
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(axis.min);
      expect(value).toBeLessThanOrEqual(axis.max);
    }
    expect(axis.sectionsBelow).toBe(2);
  });

  it('kỳ có lãi không chừa nấc âm nào — nửa dưới trống là mất một nửa chiều cao', () => {
    expect(niceAxis([0, 1_732_914]).sectionsBelow).toBe(0);
  });

  it('mốc luôn cách đều và 0 luôn là một vạch', () => {
    const axis = niceAxis([300_000, -1_200_000]);
    expect(axis.ticks).toContain(0);
    const gaps = axis.ticks.slice(1).map((tick, index) => tick - axis.ticks[index]!);
    expect(new Set(gaps).size).toBe(1);
  });

  it('kỳ trắng ra thang 0..4 như web, không phải trần 0 (chia cho 0 khi dựng trục)', () => {
    const axis = niceAxis([0, 0, 0]);
    expect(axis.ticks).toEqual([0, 1, 2, 3, 4]);
    expect(axis.sectionsAbove).toBeGreaterThan(0);
  });
});

describe('positiveHeight — khối biểu đồ cao cố định dù kỳ có lỗ hay không', () => {
  it('chia chiều cao theo tỉ lệ hai nửa trục', () => {
    const axis = niceAxis([0, 2_839_966, -2_839_966]); // 2 nấc trên, 2 nấc dưới
    expect(positiveHeight(axis, 160)).toBe(80);
  });

  it('không có nửa âm thì lấy trọn chiều cao', () => {
    expect(positiveHeight(niceAxis([0, 1_732_914]), 160)).toBe(160);
  });

  it('nửa trên + nửa dưới cộng lại vẫn bằng chiều cao đặt ra', () => {
    const axis = niceAxis([300_000, -1_200_000]); // 1 nấc trên, 3 nấc dưới
    const above = positiveHeight(axis, 160);
    expect(above + (above / axis.sectionsAbove) * axis.sectionsBelow).toBe(160);
  });
});
