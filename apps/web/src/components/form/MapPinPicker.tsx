'use client';

import { Alert, Button, Spin } from 'antd';
import type { Map as LeafletMap, Marker } from 'leaflet';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { GeoPoint } from '@xeprime/domain';
import { StaticMap } from '@/components/data-display/StaticMap';
import {
  isInteractiveMapConfigured,
  geoapifyMapKey,
  loadLeaflet,
  tileUrlTemplate,
  TILE_ATTRIBUTION,
  TILE_MAX_ZOOM,
} from '@/lib/leaflet-loader';
import { mapPlaceUrl } from '@/lib/map-static';
import styles from './MapPinPicker.module.css';

/** Mức thu phóng khi đã có ghim — đủ gần để thấy số nhà, đủ xa để nhận ra ngã tư quanh đó. */
const PINNED_ZOOM = 17;
/** Chưa có ghim: thu phóng mức "một phường" để người dùng tự tìm tới nơi mình muốn. */
const UNPINNED_ZOOM = 13;

/** Trung tâm Việt Nam khi chưa biết gì — chỉ dùng để bản đồ có một chỗ để mở ra, không phải gợi ý. */
const FALLBACK_CENTER: GeoPoint = { lat: 16.0471, lng: 108.2062 };

/** Kích thước ghim, tính bằng pixel. Neo ở ĐÁY giữa: mũi ghim mới là điểm toạ độ, không phải tâm. */
const PIN_SIZE = 28;

export interface MapPinPickerProps {
  /** Ghim hiện tại. `null` = chưa ai ghim — bản đồ mở ở `fallbackCenter` và chờ một cú bấm. */
  value: GeoPoint | null;
  onChange: (point: GeoPoint) => void;
  /** Mở ở đâu khi chưa có ghim — thường là trung tâm tỉnh người dùng vừa chọn. */
  fallbackCenter?: GeoPoint | null;
  /** Nhãn cho trình đọc màn hình; cũng là `alt` của ảnh khi rơi về bản đồ tĩnh. */
  label: string;
  disabled?: boolean;
}

/**
 * Chọn/chỉnh GHIM trên bản đồ (Leaflet + tile Geoapify/OSM — ADR 0037).
 *
 * **Vì sao thao tác này tồn tại.** Máy tra địa chỉ thường trả về tên đơn vị hành chính CŨ (trước
 * sắp xếp 01/07/2025) và đôi khi ghim lệch cả trăm mét — vào giữa toà nhà bên cạnh, hoặc ra mặt
 * đường lớn thay vì trong hẻm. Với dữ liệu OpenStreetMap ở Việt Nam, nơi số nhà và hẻm còn thưa,
 * thao tác này càng quan trọng hơn chứ không kém đi. Toạ độ đó là thứ tính phí giao xe tận nơi
 * và là thứ tài xế lái tới, nên người khai địa chỉ phải NHÌN nó một lần trước khi lưu.
 *
 * **Hai chế độ, và cả hai đều là sản phẩm hoàn chỉnh:**
 *   - Có `NEXT_PUBLIC_GEOAPIFY_MAP_KEY` → bản đồ tương tác, bấm hoặc kéo để đặt lại ghim.
 *   - Không có → bản đồ TĨNH chỉ-xem. Người dùng vẫn kiểm được vị trí và vẫn sửa được bằng cách
 *     chọn một gợi ý địa điểm khác; chỉ mất thao tác kéo tay.
 *
 * Không có key nào cả → không hiện gì. Một khung bản đồ vỡ tệ hơn hẳn việc không có khung nào.
 */
export function MapPinPicker({
  value,
  onChange,
  fallbackCenter,
  label,
  disabled,
}: MapPinPickerProps) {
  const t = useTranslations('Address.map');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  /**
   * `onChange` mới nhất, đọc trong listener của Leaflet.
   *
   * Listener chỉ gắn MỘT LẦN (gắn lại mỗi lần `onChange` đổi định danh sẽ rò listener và làm
   * bản đồ dựng lại giữa lúc người dùng đang kéo), nên nó phải đọc callback qua ref thay vì
   * đóng gói giá trị của lần render đầu.
   */
  const onChangeRef = useRef(onChange);
  /*
   * Gán trong effect chứ không lúc render: ghi vào ref giữa chừng một lần render làm hàm render
   * hết thuần tuý — React 19 có quyền bỏ dở và dựng lại lần render đó, và `react-hooks/refs-in-render`
   * chặn đúng chỗ đó. Không có mảng phụ thuộc: chạy sau MỌI lần render, nên listener luôn đọc
   * được `onChange` của lần render gần nhất.
   */
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  /*
   * Khởi tạo thẳng ở `loading` thay vì `idle` rồi `setStatus('loading')` ngay đầu effect (thứ
   * `react-hooks/set-state-in-effect` chặn, vì nó thêm một vòng render trước cả khi bản đồ kịp
   * bắt đầu tải). Hai trạng thái đó vốn hiện RA cùng một thứ — phần dưới chỉ phân biệt `ready`
   * và `unavailable` — nên gộp chúng không đổi gì trên màn hình, kể cả nhánh `disabled` (effect
   * dừng sớm, ô ở nguyên spinner đúng như trước).
   */
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const interactive = isInteractiveMapConfigured();

  useEffect(() => {
    if (!interactive || disabled) return;

    let cancelled = false;
    /*
     * Giữ bản đồ ở biến CỤC BỘ chứ không chỉ ở ref: hàm dọn dẹp phải huỷ đúng bản đồ của LẦN
     * CHẠY NÀY. Leaflet ném "Map container is already initialized" nếu một phần tử đã có bản đồ
     * bị dựng bản đồ lần hai — và ở dev, `reactStrictMode` chạy mọi effect đúng hai lần.
     */
    let map: LeafletMap | null = null;
    let observer: ResizeObserver | null = null;

    void loadLeaflet().then((L) => {
      const el = containerRef.current;
      const key = geoapifyMapKey();
      if (cancelled) return;
      if (!L || !el || !key) {
        setStatus('unavailable');
        return;
      }

      const center = value ?? fallbackCenter ?? FALLBACK_CENTER;
      map = L.map(el, {
        center: [center.lat, center.lng],
        zoom: value ? PINNED_ZOOM : UNPINNED_ZOOM,
        // Bàn phím/cuộn: giữ cuộn trang là mặc định của Leaflet khi `scrollWheelZoom: false`,
        // nhưng ô này nằm giữa một form dài — cuộn qua bản đồ mà bị "hút" vào thu phóng là một
        // trong những khó chịu kinh điển của form có bản đồ.
        scrollWheelZoom: false,
        attributionControl: true,
      });

      L.tileLayer(tileUrlTemplate(key), {
        attribution: TILE_ATTRIBUTION,
        maxZoom: TILE_MAX_ZOOM,
      }).addTo(map);

      /*
       * Ghim tự vẽ bằng `divIcon` thay vì ảnh mặc định của Leaflet. Hai lý do: ảnh mặc định trỏ
       * tới đường dẫn tương đối mà bundler không giữ nguyên (lỗi kinh điển "marker mất tiêu"),
       * và một khối HTML thì lấy được màu từ token của mình qua CSS Module.
       */
      const icon = L.divIcon({
        className: styles.pin,
        iconSize: [PIN_SIZE, PIN_SIZE],
        // Neo ở ĐÁY giữa: mũi ghim là điểm toạ độ, không phải tâm hình tròn.
        iconAnchor: [PIN_SIZE / 2, PIN_SIZE],
      });
      const marker = L.marker([center.lat, center.lng], { draggable: true, icon, keyboard: true });
      /*
       * Chưa có toạ độ thì CHƯA đặt ghim: một cái ghim ở giữa màn hình trông y hệt một vị trí đã
       * chọn, và người dùng sẽ lưu nó mà không biết mình chưa chọn gì.
       *
       * Vì vậy ghim được thêm MUỘN — ở cú bấm bản đồ bên dưới, hoặc ở effect đồng bộ khi người
       * dùng chọn một gợi ý địa điểm. Cả hai chỗ đó gọi thẳng `addTo` mà không kiểm gì trước:
       * `Map.addLayer` tra `_layers` theo id rồi return sớm nếu lớp đã có, nên gọi lại là vô hại.
       *
       * Và tuyệt đối đừng kiểm bằng `marker.getPane()`. Thân hàm đó là `this._map.getPane(...)`,
       * mà `_map` chỉ tồn tại SAU khi lớp được thêm vào — nên dùng nó để hỏi "đã thêm chưa" sẽ
       * đúng ở ca đã thêm và ném `Cannot read properties of undefined` ở ca CHƯA thêm, tức là
       * hỏng đúng ca mà câu hỏi được đặt ra để xử lý.
       */
      if (value) marker.addTo(map);

      // Bấm vào bản đồ = đặt ghim ở đó. Nhanh hơn kéo khi ghim đang ở rất xa chỗ cần tới.
      map.on('click', (e) => {
        const next = { lat: e.latlng.lat, lng: e.latlng.lng };
        marker.setLatLng(e.latlng);
        marker.addTo(map!);
        onChangeRef.current(next);
      });
      marker.on('dragend', () => {
        const position = marker.getLatLng();
        onChangeRef.current({ lat: position.lat, lng: position.lng });
      });

      /*
       * Leaflet đo khung chứa MỘT LẦN lúc dựng. Ô này hay nằm trong hộp thoại sửa chi nhánh —
       * lúc effect chạy thì hộp thoại còn đang mở ra, khung còn cao 0px, và bản đồ sẽ hiện ra
       * một mảng xám với vài ô tile lệch. `ResizeObserver` bắt đúng khoảnh khắc khung có kích
       * thước thật và bảo Leaflet đo lại.
       */
      observer = new ResizeObserver(() => map?.invalidateSize());
      observer.observe(el);

      mapRef.current = map;
      markerRef.current = marker;
      setStatus('ready');
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      // `remove()` gỡ mọi listener và trả phần tử về trạng thái trống — thiếu nó là rò bộ nhớ
      // cộng với một lần ném ở lần dựng kế tiếp.
      map?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Chạy MỘT LẦN cho vòng đời của ô. `value`/`fallbackCenter` chỉ dùng làm vị trí MỞ ĐẦU; đồng
    // bộ về sau đi qua effect dưới, vì dựng lại cả bản đồ mỗi lần toạ độ đổi sẽ nháy màn hình và
    // huỷ luôn cú kéo mà người dùng đang thực hiện.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive, disabled]);

  /** Ghim đổi từ BÊN NGOÀI (người dùng vừa chọn một gợi ý địa điểm) → dời bản đồ theo. */
  useEffect(() => {
    if (status !== 'ready' || !value) return;
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;

    marker.setLatLng([value.lat, value.lng]);
    // Ghim đầu tiên đến từ một gợi ý địa điểm: lúc đó nó chưa nằm trên bản đồ (xem lúc dựng).
    marker.addTo(map);
    map.setView([value.lat, value.lng], PINNED_ZOOM);
  }, [status, value]);

  if (!interactive) {
    const staticUrl = mapPlaceUrl(value);
    if (!staticUrl) return null;
    return (
      <div className={styles.block}>
        <StaticMap src={staticUrl} title={label} height={200} />
        <p className={styles.hint}>{t('readOnlyHint')}</p>
      </div>
    );
  }

  if (status === 'unavailable') {
    // Bản đồ không tải được KHÔNG phải lỗi của người đang điền form: nói một câu, giữ nguyên
    // toạ độ đang có, và để họ lưu bình thường.
    return <Alert type="info" showIcon className={styles.block} title={t('unavailable')} />;
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
            href={`https://www.openstreetmap.org/?mlat=${value.lat}&mlon=${value.lng}#map=${PINNED_ZOOM}/${value.lat}/${value.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            {t('openInMaps')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
