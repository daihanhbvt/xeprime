import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { BarChart, CurveType } from 'react-native-gifted-charts';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useAppFormat } from '@/i18n/use-app-format';
import { chartColors, colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import {
  axisWithDotHeadroom,
  chartValue,
  fitGroupedBars,
  groupCenterX,
  labelShiftX,
  labelledBuckets,
  niceAxis,
  positiveHeight,
  profitLineSpacing,
} from './revenue-trend-layout';
import type { FinanceSeriesBucket } from '../api';

/** Chiều cao vùng vẽ — cùng tỉ lệ với `height={220}` mà web dùng cho khối nhúng trong hồ sơ. */
const PLOT_HEIGHT = 160;

/** Bề rộng cột nhãn trục Y — đủ cho `12,5tr` ở cỡ chữ nhãn. */
const Y_AXIS_WIDTH = 46;

/** Bo góc cột: 4px ở ĐẦU DỮ LIỆU, chân vuông vì nó neo vào đường 0 — `CHART_BAR_RADIUS` của web. */
const BAR_RADIUS = 4;

/** Nét đường 2px, điểm mốc bán kính 4 — `CHART_LINE_WIDTH` / `CHART_DOT_RADIUS` của web. */
const LINE_WIDTH = 2;
const DOT_RADIUS = 4;

/** Mốc ĐANG CHỌN nở thêm 2 — `activeDot={{ r: CHART_DOT_RADIUS + 2 }}` của web. */
const ACTIVE_DOT_RADIUS = DOT_RADIUS + 2;

/** Lưới nét ĐỨT `3 3`, chỉ kẻ ngang — `CHART_GRID` của web. */
const RULE_DASH = 3;

/**
 * Khoảng hở phía TRÊN vạch cao nhất.
 *
 * Mặc định của thư viện là `containerHeight / 20` — với khối này chỉ khoảng 4dp, và chừng ấy phải
 * chứa cùng lúc BA thứ đều nhô lên trên vạch trần: ngọn chữ của nhãn `3tr`, nắp bo tròn của cột
 * chạm trần, và chỗ VỒNG LÊN của đường lợi nhuận — `curveType: CUBIC` (bản native của
 * `type="monotone"`) cho đường phình ra ngoài hai điểm mốc khi hai mốc chênh nhau nhiều. Thiếu chỗ
 * thì cả ba bị mép trên xén phẳng.
 */
const PLOT_HEADROOM = 12;

/**
 * Chiều cao Ô CHỮ của nhãn trục X.
 *
 * Phải khai, vì mặc định của thư viện là `xAxisTextNumberOfLines * 18` — 18dp cho một dòng, và ô
 * đó CẮT phần chữ thò ra ngoài. Ở cỡ 12dp thì `01/09` vừa đủ lọt, nhưng nhãn tháng (`09/2026`) và
 * nhãn tuần tiếng Việt đội dấu lên là mất ngọn. Ô rộng hơn dòng chữ một nhịp thì không nhãn nào bị
 * xén, ở bất kỳ độ mịn nào.
 */
const X_AXIS_LABEL_HEIGHT = 22;

/**
 * Kiểu chữ nhãn của CẢ HAI trục — và là NỀN mà mỗi mốc trên trục X chồng thêm phép dịch ngang
 * của riêng nó. Một kiểu chung vì hai trục là hai nửa của cùng một khung đọc; để chúng lệch cỡ
 * hay lệch màu là mắt phải chuyển hệ khi liếc từ trục này sang trục kia.
 *
 * `lineHeight` khai tường minh: bỏ trống thì RN bó dòng sát cỡ chữ và ngọn dấu tiếng Việt bị dòng
 * kẻ cắt. 1,4 lần cỡ chữ, và vẫn nhỏ hơn {@link X_AXIS_LABEL_HEIGHT} để ô chứa trọn dòng.
 */
const AXIS_LABEL_STYLE = {
  color: chartColors.axis,
  fontSize: fontSize.label,
  lineHeight: Math.round(fontSize.label * 1.4),
} as const;

/**
 * Tên vùng cuộn cho test.
 *
 * Có mặt vì "dải chạm nằm TRONG vùng cuộn" là một quan hệ CHA-CON, không phải một thuộc tính đọc
 * được qua chữ hiện trên màn: đó chính là điều kiện làm biểu đồ vừa chạm được vừa vuốt được, nên
 * nó phải có test khoá lại.
 */
export const SCROLL_TEST_ID = 'revenue-trend-scroll';

/** Chỗ tối thiểu cho một nhãn trục X trước khi phải bỏ bớt — `minTickGap` của web, cộng bề rộng chữ. */
const MIN_LABEL_SPACE = 44;

/**
 * Doanh thu · Chi phí · **Lợi nhuận** theo thời gian — bản native của `RevenueTrendChart` bên web.
 *
 * Web dựng bằng `recharts` (`ComposedChart` = 2 `Bar` + 1 `Line`); bản này bằng
 * `react-native-gifted-charts` (`BarChart` + `showLine`). Hai thư viện, **một hình**: cùng bảng màu
 * (`chartColors`, đọc chính `--xp-color-viz-*` mà web đọc), cùng bo góc cột, cùng nét đường và bán
 * kính điểm mốc, cùng lưới nét đứt chỉ-ngang, cùng đường cong (`type="monotone"` ↔
 * `curveType: CUBIC`), cùng nhãn trục Y tiền rút gọn, cùng thang chia trục Y (`niceAxis`).
 *
 * **Kỳ ít mốc trải vừa khung; kỳ dày mốc thì CUỘN NGANG** — xem `fitGroupedBars`. Web có cả bề
 * ngang màn desktop nên `recharts` chia 30 ngày vẫn còn chỗ; ép ngần ấy mốc vào ~330dp thì cột
 * còn 8dp, hai cột dính vào nhau và các chấm lợi nhuận dồn thành một vệt. Đây là chỗ app buộc phải
 * khác web, và cũng là chỗ DUY NHẤT được phép cuộn ngang trong màn hình này.
 *
 * **Chạm để đọc số.** Native không có hover; tooltip của web thành một thẻ chi tiết ngay dưới biểu
 * đồ, cùng nội dung và cùng thứ tự dòng với `ChartTooltip`, và mốc đang chọn nở to trên đường lợi
 * nhuận đúng như `activeDot` của web. Vùng chạm là một DẢI phủ trọn chiều cao biểu đồ — chạm vào
 * cột, vào chấm trên đường, hay vào khoảng trống của mốc đó đều mở cùng một thẻ.
 *
 * Vì sao là dải riêng chứ không phải `onPress` của thư viện: `onPress` chỉ có ở CỘT, mà cột của
 * một ngày không phát sinh đồng nào thì cao 0dp — không có gì để chạm; còn chấm trên đường thì
 * thư viện vẽ trong một lớp `<Svg>` đặt `pointerEvents: 'none'` trên iOS và chỉ nối được vào state
 * focus NỘI BỘ của nó. Một dải phủ toàn chiều cao giải quyết cả ba, giống hệt nhau trên hai nền
 * tảng.
 *
 * **Vùng cuộn là của component này, không phải của thư viện** — và đó là điều kiện để cuộn mượt.
 * `BarChart` có `ScrollView` riêng nhưng không nhận thêm con nào, nên dải chạm chỉ có thể là lớp
 * phủ ANH EM với nó; hai anh em thì không đàm phán cử chỉ được: hoặc dải nuốt mất cú vuốt (biểu đồ
 * đứng im), hoặc lớp phủ phải tự cướp cử chỉ rồi kéo biểu đồ bằng JS — mỗi khung hình một
 * `setState`, tức render lại 60 cột kèm đường và 30 dải, đúng cái giật thấy trên máy thật. Đưa
 * `ScrollView` ra ngoài và cho dải chạm làm CON của nó thì RN tự phân xử chạm-hay-vuốt như với
 * một nút trong danh sách, dải trôi theo nội dung ở tầng native, và cú vuốt không chạy dòng JS nào.
 *
 * Cũng vì thế mà KHÔNG dùng `pointerConfig`: nó suy chỉ số cột từ
 * `(x − initialSpacing) / (spacing + barWidth)`, tức giả định mọi khe bằng nhau — dải cột ở đây xen
 * kẽ hai độ rộng khe nên chỉ số sẽ lệch dần về cuối kỳ.
 */
export function RevenueTrendChart({
  buckets,
  labelOf,
  titleOf,
}: {
  buckets: readonly FinanceSeriesBucket[];
  /** Nhãn trục X đã dựng sẵn theo độ mịn — component không tự đoán ngày. Xem `useBucketLabels`. */
  labelOf: (bucket: string) => string;
  /** Tên ĐẦY ĐỦ của mốc, cho thẻ chi tiết và trình đọc màn hình — trục quá hẹp để chứa nó. */
  titleOf: (bucket: string) => string;
}) {
  const t = useTranslations('Finance.entity');
  const tChart = useTranslations('Finance.overview.chart');
  const fmt = useAppFormat();
  const { width } = useWindowDimensions();
  const [selected, setSelected] = useState<string | null>(null);

  const activeIndex = buckets.findIndex((bucket) => bucket.bucket === selected);
  const active = activeIndex >= 0 ? buckets[activeIndex]! : null;

  const toggle = useCallback(
    (bucket: string) => setSelected((current) => (current === bucket ? null : bucket)),
    [],
  );

  /** Bề rộng vùng vẽ = bề rộng màn hình trừ lề trang và cột nhãn trục Y. */
  const plotWidth = Math.max(0, width - space.md * 2 - Y_AXIS_WIDTH);
  const layout = useMemo(
    () => fitGroupedBars(buckets.length, plotWidth),
    [buckets.length, plotWidth],
  );
  const shownLabels = useMemo(
    () => labelledBuckets(buckets.length, layout.pitch, MIN_LABEL_SPACE),
    [buckets.length, layout.pitch],
  );

  /**
   * Hai cột mỗi mốc thời gian, xen kẽ trong MỘT mảng.
   *
   * `BarChart` không có khái niệm "nhóm": nó vẽ một dải cột và cộng `spacing` sau mỗi cột. Cặp đôi
   * được tạo bằng cách cho cột thứ nhất một khe hẹp và cột thứ hai một khe rộng. Nhãn trục X chỉ
   * gắn vào cột thứ nhất và chỉ ở những mốc còn chỗ in chữ.
   */
  const bars = useMemo(
    () =>
      buckets.flatMap((bucket, index) => [
        {
          value: chartValue(bucket.revenue),
          frontColor: chartColors.revenue,
          spacing: layout.barGap,
          ...(shownLabels.has(index)
            ? {
                label: labelOf(bucket.bucket),
                labelWidth: layout.labelWidth,
                /*
                  Kéo chữ về đúng tâm mốc, và giữ hai nhãn đầu-cuối trong lòng vùng vẽ — xem
                  `labelShiftX`. Khai theo TỪNG mốc vì mỗi mốc dịch một quãng khác nhau.
                */
                labelTextStyle: {
                  ...AXIS_LABEL_STYLE,
                  transform: [{ translateX: labelShiftX(layout, index) }],
                },
              }
            : {}),
        },
        {
          value: chartValue(bucket.cost),
          frontColor: chartColors.cost,
          spacing: layout.groupGap,
        },
      ]),
    [buckets, labelOf, layout, shownLabels],
  );

  /**
   * Đường lợi nhuận — MỘT điểm mỗi mốc, căn vào tâm cặp cột.
   *
   * Giữ nguyên DẤU: lỗ là một con số âm và nó phải nằm dưới trục 0, không phải bị lật lên trên.
   *
   * Bán kính khai theo TỪNG điểm để mốc đang chọn nở to. Đó là lý do `lineConfig.hideDataPoints`
   * bật: cờ đó không tắt chấm, nó chuyển thư viện sang nhánh vẽ chấm đọc thuộc tính của từng điểm
   * (`showDataPoint`/`dataPointRadius`/`dataPointColor`) thay vì áp một bán kính chung.
   */
  const profitPoints = useMemo(
    () =>
      buckets.map((bucket, index) => ({
        value: chartValue(bucket.profit),
        showDataPoint: true,
        dataPointRadius: index === activeIndex ? ACTIVE_DOT_RADIUS : DOT_RADIUS,
        dataPointColor: chartColors.profit,
      })),
    [buckets, activeIndex],
  );

  const values = useMemo(
    () =>
      buckets.flatMap((bucket) => [
        chartValue(bucket.revenue),
        chartValue(bucket.cost),
        chartValue(bucket.profit),
      ]),
    [buckets],
  );

  /**
   * Thang trục Y của web, rồi nới thêm một nấc nếu chấm lợi nhuận cao nhất sát trần — xem
   * `axisWithDotHeadroom`. Lấy bán kính chấm ĐANG CHỌN vì đó là cỡ lớn nhất chấm có thể nở tới.
   */
  const axis = useMemo(() => {
    const topProfit = buckets.reduce(
      (high, bucket) => Math.max(high, chartValue(bucket.profit)),
      0,
    );
    return axisWithDotHeadroom(niceAxis(values), topProfit, PLOT_HEIGHT, ACTIVE_DOT_RADIUS);
  }, [buckets, values]);
  const line = profitLineSpacing(layout);
  /* Cột mảnh hơn 8dp mà bo 4dp thì đỉnh cột thành hình vòm — bo không bao giờ quá nửa bề rộng. */
  const barRadius = Math.min(BAR_RADIUS, layout.barWidth / 2);

  return (
    <YStack gap={space.sm}>
      {/*
        Chú giải — ba chuỗi được vẽ, ba mục, chấm tròn 8px như `<Legend iconType="circle">`.

        Web đặt nó DƯỚI biểu đồ; ở đây nó lên trên và căn giữa. Phần dưới biểu đồ trên màn hẹp đã
        là chỗ của nhãn trục và thẻ chi tiết — chen thêm một hàng chú giải vào giữa sẽ đẩy thẻ chi
        tiết khỏi tầm mắt đúng lúc người dùng vừa chạm để đọc nó.
      */}
      <XStack gap={space.md} ai="center" jc="center" flexWrap="wrap">
        <LegendDot color={chartColors.revenue} label={t('revenue')} />
        <LegendDot color={chartColors.cost} label={t('cost')} />
        <LegendDot color={chartColors.profit} label={t('profit')} />
      </XStack>

      {/*
        VÙNG CUỘN LÀ CỦA CHÚNG TA, không phải của thư viện — và đó là toàn bộ mấu chốt của việc
        cuộn mượt.

        `BarChart` có sẵn một `ScrollView`, nhưng nó nằm SÂU bên trong và không nhận thêm con nào;
        dải chạm chỉ có thể là một lớp phủ ANH EM với nó. Mà anh em thì không đàm phán được cử chỉ:
        dải nhận touch trước là cuộn chết, còn muốn cuộn thì lớp phủ phải tự cướp cử chỉ rồi tự kéo
        biểu đồ bằng JS — mỗi khung hình một lượt `setState`, tức render lại 60 cột + đường + 30
        dải. Đó chính là cái giật trên máy thật.

        Đặt vùng cuộn ra ngoài và cho dải chạm làm CON của nó thì mọi thứ về đúng chỗ: RN tự phân
        xử chạm-hay-vuốt như với mọi nút nằm trong danh sách, dải trôi theo nội dung ở tầng native,
        và trong suốt cú vuốt không có một dòng JS nào chạy.
      */}
      <ScrollView
        testID={SCROLL_TEST_ID}
        horizontal
        showsHorizontalScrollIndicator={false}
        /* Trải vừa khung thì không còn gì để cuộn — khoá lại để không vuốt trượt vô nghĩa. */
        scrollEnabled={!layout.fitted}
        contentContainerStyle={{ width: Y_AXIS_WIDTH + layout.contentWidth }}
      >
        <YStack pos="relative" width={Y_AXIS_WIDTH + layout.contentWidth}>
          <BarChart
            data={bars}
            /*
            `height` của thư viện là chiều cao NỬA TRÊN đường 0, không phải cả biểu đồ — nửa dưới
            được nối thêm bên dưới. Chia lại để khối luôn cao đúng `PLOT_HEIGHT` dù kỳ có lỗ hay
            không, thay vì nhảy gấp đôi mỗi lần đường lợi nhuận thủng đáy.
          */
            height={positiveHeight(axis, PLOT_HEIGHT)}
            /*
            Bề rộng khai cho thư viện là bề rộng NỘI DUNG, không phải khung nhìn: nó vẽ trọn dải
            cột ra rồi để vùng cuộn bên ngoài lo phần bị che. Thiếu con số này thì vùng vẽ là một
            khối tuyệt đối không khai bề rộng và lưới/trục co về 0.
          */
            width={layout.contentWidth}
            parentWidth={layout.contentWidth}
            /*
            Vùng cuộn NỘI BỘ của thư viện phải tắt — cuộn lồng trong cuộn là hai vùng cùng tranh
            một cú vuốt. `endSpacing` cắt nốt khoảng thừa sau mốc cuối.
          */
            endSpacing={0}
            disableScroll
            barWidth={layout.barWidth}
            initialSpacing={layout.initialSpacing}
            spacing={layout.groupGap}
            barBorderTopLeftRadius={barRadius}
            barBorderTopRightRadius={barRadius}
            /*
            Không gradient, không animation: một biểu đồ sổ sách đọc bằng mắt, không phải trình diễn.

            `isAnimated={false}` chỉ tắt animation của CỘT. Thư viện vẫn hẹn vô điều kiện một
            `setTimeout(…, animationDuration)` để làm nhãn hiện dần, mặc định 800ms sau khi gắn —
            tức nhãn trục đứng trắng gần một giây trên máy chậm, và trong test thì cái hẹn đó sống
            lâu hơn cả môi trường jest. Đặt 0 là cách duy nhất chạm tới nó từ ngoài.
          */
            isAnimated={false}
            animationDuration={0}
            // ── Trục Y: thang của web, cùng một thang cho cả ba chuỗi ──────────────────
            maxValue={axis.max}
            stepValue={axis.step}
            noOfSections={axis.sectionsAbove}
            {...(axis.sectionsBelow > 0 ? { noOfSectionsBelowXAxis: axis.sectionsBelow } : {})}
            yAxisLabelWidth={Y_AXIS_WIDTH}
            yAxisThickness={0}
            /* Cùng lý do với nhãn trục X: bó dòng sát cỡ chữ là ngọn chữ bị ô cắt. */
            yAxisTextStyle={AXIS_LABEL_STYLE}
            /* Xem `PLOT_HEADROOM`: 4dp mặc định không đủ cho chữ, nắp cột và chỗ vồng của đường. */
            yAxisExtraHeight={PLOT_HEADROOM}
            formatYLabel={(label: string) => fmt.moneyCompact(label)}
            // ── Lưới nét ĐỨT, chỉ kẻ ngang — `CHART_GRID` của web ──────────────────────
            rulesType="dashed"
            rulesColor={chartColors.grid}
            rulesThickness={1}
            dashWidth={RULE_DASH}
            dashGap={RULE_DASH}
            xAxisColor={chartColors.grid}
            xAxisLabelTextStyle={AXIS_LABEL_STYLE}
            /* Xem `X_AXIS_LABEL_HEIGHT`: ô mặc định 18dp xén ngọn chữ của nhãn tháng và nhãn tuần. */
            xAxisLabelsHeight={X_AXIS_LABEL_HEIGHT}
            xAxisLabelsVerticalShift={2}
            /*
              Nhãn ngày xuống ĐÁY biểu đồ như `<XAxis>` của web, chứ không dính vào đường 0: khi
              kỳ có lỗ, đường lợi nhuận chạy xuyên qua đúng dải chữ đó và cả hai cùng khó đọc.
            */
            xAxisLabelsAtBottom
            // ── Đường LỢI NHUẬN ────────────────────────────────────────────────────────
            showLine
            lineData={profitPoints}
            lineConfig={{
              color: chartColors.profit,
              thickness: LINE_WIDTH,
              spacing: line.spacing,
              initialSpacing: line.initialSpacing,
              /* `type="monotone"` của web — đường qua các mốc là đường cong, không phải gấp khúc. */
              curved: true,
              curveType: CurveType.CUBIC,
              /* Xem `profitPoints`: chuyển sang nhánh vẽ chấm theo TỪNG điểm, không phải tắt chấm. */
              hideDataPoints: true,
              isAnimated: false,
            }}
          />

          {/*
          Lớp CHẠM: mỗi mốc một dải phủ trọn chiều cao, đặt đúng tâm cặp cột của mốc đó. Chạm vào
          cột, vào chấm trên đường, hay vào khoảng trống của mốc đó đều rơi vào cùng một dải.

          Dải là CON của vùng cuộn nên nó trôi cùng nội dung ở tầng native, không cần bù trừ theo
          vị trí cuộn, và RN tự quyết chạm-hay-vuốt đúng như với một nút nằm trong danh sách.
        */}
          <YStack
            pos="absolute"
            top={0}
            bottom={0}
            left={Y_AXIS_WIDTH}
            width={layout.contentWidth}
            zi={1}
          >
            {buckets.map((bucket, index) => (
              <Pressable
                key={bucket.bucket}
                onPress={() => toggle(bucket.bucket)}
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: groupCenterX(layout, index) - layout.pitch / 2,
                  width: layout.pitch,
                }}
                accessibilityRole="button"
                accessibilityLabel={titleOf(bucket.bucket)}
                accessibilityState={{ selected: bucket.bucket === selected }}
              />
            ))}
          </YStack>
        </YStack>
      </ScrollView>

      {/*
        Thẻ chi tiết — bản native của `ChartTooltip`: tiêu đề mốc, rồi ba dòng "chấm màu · nhãn ·
        số tiền căn phải". Chấm màu là thứ NỐI dòng này với cột trên hình; chữ giữ màu mực bình
        thường, vì tô cả dòng bằng màu series là bắt người đọc giải mã bảng màu để đọc một con số.

        Chưa chạm gì thì chỗ này là một dòng MỜI CHẠM, không phải khoảng trắng: không có gì trên
        hình tự nói ra rằng biểu đồ bấm được.
      */}
      {active ? (
        <YStack
          bg={colors.surface}
          br={radius.md}
          bw={1}
          bc={colors.border}
          p={space.sm}
          /*
            Đỉnh thẻ rộng hơn ba cạnh còn lại: dòng tiêu đề là TÊN NGÀY tiếng Việt, mà `Ngày` và
            `01/09` đội dấu lên trên vạch chữ — với lề đều nhau, dấu huyền chạm sát viền và trông
            như bị cắt. Thêm một nấc ở trên là đủ để chữ thở.
          */
          pt={space.md}
          gap={space.xs}
        >
          {/*
            `lineHeight` khai tường minh vì cùng lý do: mặc định của RN bó sát cỡ chữ và cắt cụt
            phần dấu tiếng Việt nhô cao. 1,4 lần cỡ chữ là chỗ vừa đủ cho `ề`, `ỗ`, `ữ`.
          */}
          <Text
            col={colors.text}
            fos={fontSize.bodySm}
            lh={Math.round(fontSize.bodySm * 1.4)}
            fow={fontWeight.semibold}
          >
            {titleOf(active.bucket)}
          </Text>
          <TooltipRow
            color={chartColors.revenue}
            label={t('revenue')}
            value={fmt.money(active.revenue)}
          />
          <TooltipRow color={chartColors.cost} label={t('cost')} value={fmt.money(active.cost)} />
          <TooltipRow
            color={chartColors.profit}
            label={t('profit')}
            value={fmt.money(active.profit)}
          />
        </YStack>
      ) : (
        <Text col={colors.textMuted} fos={fontSize.label}>
          {tChart('tapHint')}
        </Text>
      )}
    </YStack>
  );
}

function TooltipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <XStack ai="center" gap={space.xs}>
      <YStack w={8} h={8} br={radius.pill} bg={color} />
      <Text f={1} minWidth={0} col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
        {label}
      </Text>
      <Text col={colors.text} fos={fontSize.label} fow={fontWeight.semibold}>
        {value}
      </Text>
    </XStack>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <XStack ai="center" gap={space.xs}>
      <YStack w={8} h={8} br={radius.pill} bg={color} />
      {/*
        Chú giải đậm hơn chữ thường một nấc: nó là CHÌA KHOÁ đọc hình — ba cái tên nói cho biết màu
        nào là doanh thu, màu nào là chi phí. Ở cỡ chữ nhãn và màu mực nhạt, `regular` chìm xuống
        thành một dòng phụ chú và mắt lướt qua. `medium` là mức vừa đủ để nó nổi lên khỏi nền mà
        không tranh chỗ với tiêu đề thẻ — chỗ `semibold` đang giữ.
      */}
      <Text col={colors.textMuted} fos={fontSize.label} fow={fontWeight.medium}>
        {label}
      </Text>
    </XStack>
  );
}
