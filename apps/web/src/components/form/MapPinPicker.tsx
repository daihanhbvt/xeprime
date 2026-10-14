'use client';

import { Alert, Button, Spin } from 'antd';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { GeoPoint } from '@xeprime/domain';
import { EmbedMap } from '@/components/data-display/EmbedMap';
import { useGoogleMapsAuthFailed } from '@/hooks/use-interactive-map';
import { resolveAppLocale } from '@/i18n/config';
import {
  googleMapsMapId,
  isGoogleMapsAuthFailed,
  loadGoogleMaps,
  type GoogleAdvancedMarker,
  type GoogleMap,
  type MapMouseEvent,
  type MapsEventListener,
} from '@/lib/google-maps-loader';
import { isMapConfigured, mapExternalUrl, mapPlaceUrl } from '@/lib/map-embed';
import styles from './MapPinPicker.module.css';

/** Mức thu phóng khi đã có ghim — đủ gần để thấy số nhà, đủ xa để nhận ra ngã tư quanh đó. */
const PINNED_ZOOM = 17;
/** Chưa có ghim: thu phóng mức "một phường" để người dùng tự tìm tới nơi mình muốn. */
const UNPINNED_ZOOM = 13;

/** Trung tâm Việt Nam khi chưa biết gì — chỉ dùng để bản đồ có một chỗ để mở ra, không phải gợi ý. */
const FALLBACK_CENTER: GeoPoint = { lat: 16.0471, lng: 108.2062 };

/** Cùng chiều cao với `.map` trong CSS Module — khung nhúng thay thế không làm form nhảy chỗ. */
const EMBED_HEIGHT = 240;

const samePoint = (a: GeoPoint | null, b: GeoPoint | null): boolean =>
  a !== null && b !== null && a.lat === b.lat && a.lng === b.lng;

/** `MapMouseEvent.latLng` → toạ độ thuần. `null` khi sự kiện không mang toạ độ. */
const pointOf = (e: MapMouseEvent): GeoPoint | null =>
  e.latLng ? { lat: e.latLng.lat(), lng: e.latLng.lng() } : null;

export interface MapPinPickerProps {
  /** Ghim hiện tại. `null` = chưa ai ghim — bản đồ mở ở `fallbackCenter` và chờ một cú bấm. */
  value: GeoPoint | null;
  onChange: (point: GeoPoint) => void;
  /** Mở ở đâu khi chưa có ghim — thường là trung tâm tỉnh người dùng vừa chọn. */
  fallbackCenter?: GeoPoint | null;
  /**
   * Thu phóng khi mở ở `fallbackCenter`. Bỏ trống = {@link UNPINNED_ZOOM}.
   *
   * Có prop riêng vì hai loại "chưa có ghim" cần hai khoảng cách khác nhau: neo vào điểm nhận xe
   * của chính chiếc xe thì mức phường là đúng, còn neo vào TÂM MỘT TỈNH ở mức đó là mở ra một
   * khu phố ngẫu nhiên cách chỗ cần tới vài chục km — người dùng phải thu nhỏ ra trước khi làm
   * được gì.
   */
  fallbackZoom?: number;
  /** Nhãn cho trình đọc màn hình và `title` của ghim; cũng là `title` của khung nhúng chỉ-xem. */
  label: string;
  disabled?: boolean;
}

/**
 * Chọn/chỉnh GHIM trên bản đồ (Google Maps JavaScript API — ADR 0059).
 *
 * **Vì sao thao tác này tồn tại.** Máy tra địa chỉ thường trả về tên đơn vị hành chính CŨ (trước
 * sắp xếp 01/07/2025) và đôi khi ghim lệch cả trăm mét — vào giữa toà nhà bên cạnh, hoặc ra mặt
 * đường lớn thay vì trong hẻm. Toạ độ đó là thứ tính phí giao xe tận nơi và là thứ tài xế lái
 * tới, nên người khai địa chỉ phải NHÌN nó một lần trước khi lưu.
 *
 * **Mỗi lần dựng bản đồ là một lượt tính tiền** (Dynamic Maps), nên bản đồ tương tác chỉ dựng
 * MỘT LẦN cho vòng đời của ô, và chỉ khi ô từng được phép sửa:
 *   - Ô mở ra đã `disabled` (form chỉ-xem) → bản đồ NHÚNG miễn phí, không nạp Maps JavaScript API.
 *   - Ô đang sửa rồi bị `disabled` (đang lưu) → khoá thao tác trên chính bản đồ đó, không dựng lại.
 *   - Google từ chối key / script không tải được → một câu thông báo; người dùng vẫn sửa được
 *     bằng cách chọn một gợi ý địa điểm khác.
 *
 * Không có key nào cả → không hiện gì. Một khung bản đồ vỡ tệ hơn hẳn việc không có khung nào.
 */
export function MapPinPicker({
  value,
  onChange,
  fallbackCenter,
  fallbackZoom = UNPINNED_ZOOM,
  label,
  disabled = false,
}: MapPinPickerProps) {
  const t = useTranslations('Address.map');
  const locale = resolveAppLocale(useLocale());
  const authFailed = useGoogleMapsAuthFailed();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const markerRef = useRef<GoogleAdvancedMarker | null>(null);
  /**
   * Điểm mà CHÍNH bản đồ vừa phát ra (bấm/kéo). Khi `value` quay về đúng điểm đó thì không dời
   * khung nhìn — người dùng vừa đặt ghim ở chỗ họ đang nhìn, kéo bản đồ về tâm và đổi mức thu
   * phóng lúc đó là giật màn hình ngay dưới con trỏ của họ.
   */
  const emittedRef = useRef<GeoPoint | null>(null);
  /**
   * `onChange` và `disabled` mới nhất, đọc trong listener của Google.
   *
   * Listener chỉ gắn MỘT LẦN (gắn lại mỗi lần `onChange` đổi định danh sẽ rò listener và làm
   * bản đồ dựng lại giữa lúc người dùng đang kéo), nên nó phải đọc qua ref thay vì đóng gói giá
   * trị của lần render đầu.
   */
  const onChangeRef = useRef(onChange);
  const disabledRef = useRef(disabled);
  /*
   * Gán trong effect chứ không lúc render: ghi vào ref giữa chừng một lần render làm hàm render
   * hết thuần tuý — React 19 có quyền bỏ dở và dựng lại lần render đó, và `react-hooks/refs-in-render`
   * chặn đúng chỗ đó. Không có mảng phụ thuộc: chạy sau MỌI lần render, nên listener luôn đọc
   * được giá trị của lần render gần nhất.
   */
  useEffect(() => {
    onChangeRef.current = onChange;
    disabledRef.current = disabled;
  });

  /*
   * Ô đã TỪNG được phép sửa chưa. Chốt một chiều: `disabled` bật/tắt quanh mỗi lần lưu, và dựng
   * lại bản đồ theo nhịp đó là một lượt tính tiền cho mỗi lần bấm Lưu.
   *
   * Cập nhật ngay trong lúc render (mẫu "lưu thông tin từ lần render trước" của React) chứ không
   * trong effect: có điều kiện nên không lặp, và không thêm một vòng render rỗng.
   */
  const [everEditable, setEverEditable] = useState(!disabled);
  if (!disabled && !everEditable) setEverEditable(true);

  /*
   * Khởi tạo thẳng ở `loading` thay vì `idle` rồi `setStatus('loading')` ngay đầu effect (thứ
   * `react-hooks/set-state-in-effect` chặn, vì nó thêm một vòng render trước cả khi bản đồ kịp
   * bắt đầu tải). Hai trạng thái đó vốn hiện RA cùng một thứ — phần dưới chỉ phân biệt `ready`
   * và `unavailable` — nên gộp chúng không đổi gì trên màn hình.
   */
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const interactive = isMapConfigured();
  const live = interactive && everEditable && !authFailed;

  useEffect(() => {
    if (!live) return;

    let cancelled = false;
    const listeners: MapsEventListener[] = [];
    let marker: GoogleAdvancedMarker | null = null;

    void loadGoogleMaps(locale).then((api) => {
      const el = containerRef.current;
      if (cancelled) return;
      /*
       * Hỏi lại cờ từ chối key NGAY trước khi dựng: cờ đó có thể vừa bật trong lúc chờ, và
       * `setStatus` của nó chưa kịp render. Dựng tiếp lúc đó là trả tiền cho một khung xám.
       */
      if (!api || !el || isGoogleMapsAuthFailed()) {
        setStatus('unavailable');
        return;
      }

      const center = value ?? fallbackCenter ?? FALLBACK_CENTER;
      const map = new api.Map(el, {
        center,
        zoom: value ? PINNED_ZOOM : fallbackZoom,
        mapId: googleMapsMapId(),
        disableDefaultUI: true,
        zoomControl: true,
        /*
         * Ô này nằm giữa một form dài: cuộn trang đi qua bản đồ mà bị "hút" vào thu phóng là một
         * trong những khó chịu kinh điển của form có bản đồ. `cooperative` = thu phóng cần
         * Ctrl + cuộn trên máy tính, hai ngón trên điện thoại; một ngón vẫn cuộn trang.
         */
        gestureHandling: 'cooperative',
        /*
         * Tắt bấm vào biểu tượng địa điểm của Google: bật thì bấm trúng một quán cà phê sẽ mở
         * khung thông tin của Google thay vì đặt ghim — đúng ở chỗ người dùng muốn ghim nhất.
         */
        clickableIcons: false,
      });

      /*
       * Ghim tự vẽ bằng một khối HTML + CSS Module thay vì ghim đỏ mặc định: lấy được màu thương
       * hiệu từ token (ADR 0003). `AdvancedMarkerElement` neo nội dung ở ĐÁY GIỮA — đúng chỗ mũi
       * ghim, là điểm toạ độ thật.
       */
      const pin = document.createElement('div');
      pin.className = styles.pin ?? '';
      marker = new api.AdvancedMarkerElement({
        /*
         * Chưa có toạ độ thì CHƯA đặt ghim lên bản đồ: một cái ghim ở giữa màn hình trông y hệt
         * một vị trí đã chọn, và người dùng sẽ lưu nó mà không biết mình chưa chọn gì. Ghim được
         * gắn muộn — ở cú bấm bản đồ, hoặc khi người dùng chọn một gợi ý địa điểm.
         */
        map: value ? map : null,
        position: value ?? null,
        content: pin,
        gmpDraggable: true,
        title: label,
      });
      const placed = marker;

      const emit = (next: GeoPoint) => {
        emittedRef.current = next;
        onChangeRef.current(next);
      };

      // Bấm vào bản đồ = đặt ghim ở đó. Nhanh hơn kéo khi ghim đang ở rất xa chỗ cần tới.
      listeners.push(
        map.addListener('click', (e) => {
          if (disabledRef.current) return;
          const next = pointOf(e);
          if (!next) return;
          placed.position = next;
          placed.map = map;
          emit(next);
        }),
        placed.addListener('dragend', (e) => {
          const next = pointOf(e);
          if (next) emit(next);
        }),
      );

      mapRef.current = map;
      markerRef.current = placed;
      setStatus('ready');
    });

    return () => {
      cancelled = true;
      // Google không có `map.destroy()`; gỡ listener và ghim là đủ để bản đồ cũ không còn gọi về
      // một `onChange` của lần dựng trước (ở dev, `reactStrictMode` chạy mọi effect hai lần).
      for (const listener of listeners) listener.remove();
      if (marker) marker.map = null;
      mapRef.current = null;
      markerRef.current = null;
    };
    // Chạy MỘT LẦN cho vòng đời của ô. `value`/`fallbackCenter` chỉ dùng làm vị trí MỞ ĐẦU; đồng
    // bộ về sau đi qua các effect dưới, vì dựng lại cả bản đồ mỗi lần toạ độ đổi sẽ nháy màn hình,
    // huỷ luôn cú kéo mà người dùng đang thực hiện, và tốn thêm một lượt tính tiền.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  /** `disabled` bật/tắt (đang lưu) → khoá/mở thao tác trên CHÍNH bản đồ đang có. */
  useEffect(() => {
    if (status !== 'ready') return;
    mapRef.current?.setOptions({
      gestureHandling: disabled ? 'none' : 'cooperative',
      zoomControl: !disabled,
      keyboardShortcuts: !disabled,
    });
    if (markerRef.current) markerRef.current.gmpDraggable = !disabled;
  }, [status, disabled]);

  /** Ghim đổi từ BÊN NGOÀI (người dùng vừa chọn một gợi ý địa điểm) → dời bản đồ theo. */
  useEffect(() => {
    if (status !== 'ready' || !value) return;
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;

    marker.position = value;
    marker.map = map;
    if (samePoint(value, emittedRef.current)) return;
    map.setCenter(value);
    map.setZoom(PINNED_ZOOM);
  }, [status, value]);

  /*
   * CHƯA có ghim mà điểm neo đổi (người dùng vừa đổi tỉnh) → dời khung nhìn theo.
   *
   * Bản đồ chỉ đọc `fallbackCenter` MỘT LẦN lúc dựng, nên thiếu effect này thì đổi tỉnh xong
   * khung vẫn nằm ở tỉnh cũ — và người dùng phải tự kéo qua cả nước để tìm chỗ đặt ghim.
   *
   * Chặn khi ĐÃ có ghim: lúc đó khung nhìn thuộc về cái ghim, và kéo nó đi vì một prop vừa đổi
   * sẽ giật màn hình ngay giữa lúc người ta đang soi lại vị trí mình vừa chọn.
   */
  useEffect(() => {
    if (status !== 'ready' || value || !fallbackCenter) return;
    mapRef.current?.setCenter(fallbackCenter);
    mapRef.current?.setZoom(fallbackZoom);
  }, [status, value, fallbackCenter, fallbackZoom]);

  if (!interactive) return null;

  if (authFailed || status === 'unavailable') {
    /*
     * Bản đồ không tải được KHÔNG phải lỗi của người đang điền form: nói một câu, giữ nguyên toạ
     * độ đang có, và để họ lưu bình thường. Không rơi về bản đồ nhúng: hai bản đồ dùng CHUNG một
     * key, nên ca hay gặp nhất (Google từ chối key) làm hỏng cả khung nhúng.
     */
    return <Alert type="info" showIcon className={styles.block} title={t('unavailable')} />;
  }

  if (!everEditable) {
    // Form chỉ-xem: xem vị trí bằng bản đồ nhúng MIỄN PHÍ. Chưa có ghim thì không có gì để xem.
    const embedUrl = mapPlaceUrl(value, locale);
    if (!embedUrl) return null;
    return (
      <div className={styles.block}>
        <EmbedMap src={embedUrl} title={label} height={EMBED_HEIGHT} />
      </div>
    );
  }

  return (
    <div className={styles.block}>
      <div className={styles.mapWrap}>
        <div ref={containerRef} className={styles.map} role="application" aria-label={label} />
        {status !== 'ready' ? (
          <div className={styles.loading}>
            <Spin size="small" />
          </div>
        ) : null}
      </div>
      <div className={styles.footer}>
        <p className={styles.hint}>{value ? t('adjustHint') : t('pickHint')}</p>
        {value ? (
          <Button
            size="small"
            type="link"
            href={mapExternalUrl(value)}
            target="_blank"
            rel="noreferrer"
          >
            {t('openInGoogleMaps')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
