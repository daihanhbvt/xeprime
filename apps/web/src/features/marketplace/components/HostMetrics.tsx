'use client';

import {
  hostMetricState,
  HOST_METRIC_MIN_SAMPLES,
  HOST_METRIC_STATE,
  HOST_METRIC_WINDOW_DAYS,
  responseSpeedOf,
  type HostMetrics as HostMetricsShape,
} from '@xeprime/types';
import { useTranslations } from 'next-intl';
import { InfoHint } from '@/components/data-display/InfoHint';
import styles from './HostMetrics.module.css';

/**
 * BA CHỈ SỐ của một gian hàng — khối dùng chung cho trang gian hàng và trang chi tiết xe.
 *
 * ## Vì sao CLIENT component dù nội dung hoàn toàn tĩnh
 *
 * Mỗi con số ở đây đi kèm một dấu "i", và `InfoHint` vốn đã là client component — nên khối này
 * ship JS xuống trình duyệt dù có khai gì đi nữa. Giữ nó ở phía server thì đổi lại phải là một
 * `async` component lồng trong một `async` component khác (`ShopAbout`, `ListingDetailView`),
 * và React không render nổi cây đó ngoài runtime react-server: cả hai màn cha có test dựng
 * chúng bằng cách gọi như một hàm rồi `render` kết quả, và một async component con làm cả cây
 * trả về rỗng — im lặng, không lỗi.
 *
 * ## Chưa đủ mẫu thì nói MỘT câu, không vẽ ba ô trống
 *
 * `null` nghĩa là chưa đủ dữ liệu để nói (ADR 0045 điều 3), và điều đó đúng cho cả ba con số
 * cùng lúc vì chúng chung một mẫu số. Vẽ ba ô "—" là ba lần nhắc người đọc rằng ở đây không có
 * gì, trong khi một câu kèm SỐ MẪU THẬT vừa ngắn hơn vừa kiểm chứng được: "mới có 2 yêu cầu
 * trong 90 ngày" là một sự thật, còn "0%" là một lời vu khống.
 *
 * ## Vì sao không có huy hiệu nào ở đây
 *
 * Không "5 sao", không "100%", không vương miện. Một gian hàng 5/5 mẫu hoàn hảo và một gian
 * hàng 500/500 là hai thứ khác nhau, mà huy hiệu thì vẽ chúng giống hệt nhau. Con số kèm số mẫu
 * nói đúng thứ nó biết.
 *
 * ## Dấu "i" giữ phần GIẢI THÍCH, không giữ thông tin bắt buộc
 *
 * Chữ chính đọc được mà không cần bấm gì. Sau dấu "i" là định nghĩa mẫu số, cửa sổ 90 ngày, và
 * — với "nhận và giữ chuyến" — câu quan trọng nhất: chủ xe huỷ SAU KHI đã nhận sẽ làm con số
 * này giảm. Không có số tiền hay hành động nào nằm trong tooltip.
 */
export function HostMetrics({
  metrics,
  className,
}: {
  /**
   * `undefined` KHÁC `sampleCount: 0`, nên kiểu ở đây rộng hơn kiểu sinh từ OpenAPI.
   *
   * Giá trị tới được component này đi qua Data Cache của Next (`fetchListingDetail` dùng
   * `force-cache` + `revalidate`), và cache đó giữ NGUYÊN VĂN body của phiên bản đã ghi nó.
   * Một body ghi trước khi backend thêm trường vẫn được phục vụ cho lượt đọc stale đầu tiên
   * sau khi mã mới lên — hình dạng ở đây là hình dạng lúc GHI cache, không phải của kiểu hôm
   * nay.
   */
  metrics: HostMetricsShape | null | undefined;
  className?: string;
}) {
  const t = useTranslations('Shops.metrics');

  /*
   * Không có số liệu thì không nói gì. `sampleCount: 0` là một khẳng định ("chưa ai gửi yêu
   * cầu nào"); thiếu hẳn đối tượng thì không có gì để khẳng định, và im lặng đúng hơn là bịa
   * ra một con số. Quan trọng hơn: khối uy tín là phần BỔ TRỢ của trang chi tiết xe — nó
   * không được phép kéo sập cả trang ngay bên trên nút "Chọn thuê".
   */
  if (!metrics) return null;

  if (hostMetricState(metrics.sampleCount) !== HOST_METRIC_STATE.READY) {
    /*
     * "Đặt ngay" KHÔNG cần chờ đủ mẫu: nó là một CÀI ĐẶT của gian hàng chứ không phải một phép
     * đo thống kê, nên nó đúng ngay từ yêu cầu đầu tiên và là thông tin khách cần nhất khi chưa
     * có gì khác để đọc.
     */
    return (
      <div className={[styles.block, className].filter(Boolean).join(' ')}>
        {metrics.instantBook ? <span className={styles.instant}>{t('instantBook')}</span> : null}
        <span className={styles.insufficient}>
          {t('insufficient', {
            count: metrics.sampleCount,
            days: HOST_METRIC_WINDOW_DAYS,
          })}
          <InfoHint
            className={styles.hint}
            label={t('insufficientHintLabel')}
            content={t('insufficientHint', { min: HOST_METRIC_MIN_SAMPLES })}
          />
        </span>
      </div>
    );
  }

  const speed = responseSpeedOf(metrics.responseMinutesMedian);
  const items = [
    metrics.responseRatePercent === null
      ? null
      : {
          key: 'responseRate',
          value: t('responseRateValue', { percent: metrics.responseRatePercent }),
          label: t('responseRate'),
          hint: t('responseRateHint', { days: HOST_METRIC_WINDOW_DAYS }),
          hintLabel: t('responseRateHintLabel'),
        },
    /*
     * Trung vị thời gian phản hồi hiện thành DẢI, không phải con số trần: "47 phút" gợi một độ
     * chính xác mà một trung vị trên vài chục mẫu không có. Gian hàng chỉ dùng "Đặt ngay" thì
     * không có mẫu nào do NGƯỜI quyết ⇒ `speed === null`, và ô này nhường chỗ cho nhãn "Đặt
     * ngay" ở dưới thay vì hiện "0 phút".
     */
    speed === null
      ? metrics.instantBook
        ? {
            key: 'instant',
            value: t('instantBook'),
            label: t('responseTime'),
            hint: t('instantBookHint'),
            hintLabel: t('instantBookHintLabel'),
          }
        : null
      : {
          key: 'responseTime',
          value: t(`speed.${speed}`),
          label: t('responseTime'),
          hint: t('responseTimeHint', { days: HOST_METRIC_WINDOW_DAYS }),
          hintLabel: t('responseTimeHintLabel'),
        },
    metrics.acceptKeepRatePercent === null
      ? null
      : {
          key: 'acceptKeep',
          value: t('acceptKeepValue', { percent: metrics.acceptKeepRatePercent }),
          label: t('acceptKeep'),
          hint: t('acceptKeepHint', { days: HOST_METRIC_WINDOW_DAYS }),
          hintLabel: t('acceptKeepHintLabel'),
        },
  ].filter((item) => item !== null);

  if (items.length === 0) return null;

  return (
    <div className={[styles.block, className].filter(Boolean).join(' ')}>
      <ul className={styles.list} aria-label={t('sectionLabel')}>
        {items.map((item) => (
          <li key={item.key} className={styles.item}>
            <span className={styles.value}>{item.value}</span>
            <span className={styles.label}>
              {item.label}
              <InfoHint className={styles.hint} label={item.hintLabel} content={item.hint} />
            </span>
          </li>
        ))}
      </ul>
      {/* Số mẫu đứng ngoài lưới: nó là CƠ SỞ của cả ba con số, không phải con số thứ tư. */}
      <p className={styles.basis}>
        {t('basis', { count: metrics.sampleCount, days: HOST_METRIC_WINDOW_DAYS })}
      </p>
    </div>
  );
}
