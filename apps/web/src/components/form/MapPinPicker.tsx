'use client';

import { Alert, Button, Spin } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { GeoPoint } from '@xeprime/domain';
import { EmbedMap } from '@/components/data-display/EmbedMap';
import {
  isInteractiveMapConfigured,
  loadGoogleMaps,
  type GoogleMap,
  type GoogleMarker,
} from '@/lib/google-maps-loader';
import { mapPlaceUrl } from '@/lib/map-embed';
import styles from './MapPinPicker.module.css';

/** Mức thu phóng khi đã có ghim — đủ gần để thấy số nhà, đủ xa để nhận ra ngã tư quanh đó. */
const PINNED_ZOOM = 17;
/** Chưa có ghim: thu phóng mức "một phường" để người dùng tự tìm tới nơi mình muốn. */
const UNPINNED_ZOOM = 13;

/** Trung tâm Việt Nam khi chưa biết gì — chỉ dùng để bản đồ có một chỗ để mở ra, không phải gợi ý. */
const FALLBACK_CENTER: GeoPoint = { lat: 16.0471, lng: 108.2062 };

export interface MapPinPickerProps {
  /** Ghim hiện tại. `null` = chưa ai ghim — bản đồ mở ở `fallbackCenter` và chờ một cú bấm. */
  value: GeoPoint | null;
  onChange: (point: GeoPoint) => void;
  /** Mở ở đâu khi chưa có ghim — thường là trung tâm tỉnh người dùng vừa chọn. */
  fallbackCenter?: GeoPoint | null;
  /** Nhãn cho trình đọc màn hình; cũng là `title` của iframe khi rơi về bản đồ nhúng. */
  label: string;
  disabled?: boolean;
}

/**
 * Chọn/chỉnh GHIM trên bản đồ.
 *
 * **Vì sao thao tác này tồn tại.** Google thường trả về tên đơn vị hành chính CŨ (trước sắp xếp
 * 01/07/2025) và đôi khi ghim lệch cả trăm mét — vào giữa toà nhà bên cạnh, hoặc ra mặt đường
 * lớn thay vì trong hẻm. Toạ độ đó là thứ tính phí giao xe tận nơi và là thứ tài xế lái tới,
 * nên người khai địa chỉ phải NHÌN nó một lần trước khi lưu.
 *
 * **Hai chế độ, và cả hai đều là sản phẩm hoàn chỉnh:**
 *   - Có `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` → bản đồ tương tác, bấm hoặc kéo để đặt lại ghim.
 *   - Không có → bản đồ NHÚNG chỉ-xem. Người dùng vẫn kiểm được vị trí và vẫn sửa được bằng
 *     cách chọn một gợi ý địa điểm khác; chỉ mất thao tác kéo tay.
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
  const mapRef = useRef<GoogleMap | null>(null);
  const markerRef = useRef<GoogleMarker | null>(null);
  /**
   * `onChange` mới nhất, đọc trong listener của Google.
   *
   * Listener chỉ gắn MỘT LẦN (gắn lại mỗi lần `onChange` đổi định danh sẽ rò listener và làm
   * bản đồ dựng lại giữa lúc người dùng đang kéo), nên nó phải đọc callback qua ref thay vì
   * đóng gói giá trị của lần render đầu.
   */
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
  const interactive = isInteractiveMapConfigured();

  useEffect(() => {
    if (!interactive || disabled) return;
    let cancelled = false;
    setStatus('loading');

    void loadGoogleMaps().then((api) => {
      if (cancelled) return;
      const el = containerRef.current;
      if (!api || !el) {
        setStatus('unavailable');
        return;
      }

      const center = value ?? fallbackCenter ?? FALLBACK_CENTER;
      const map = new api.Map(el, {
        center,
        zoom: value ? PINNED_ZOOM : UNPINNED_ZOOM,
        // `mapId` là điều kiện của `AdvancedMarkerElement`; `DEMO_MAP_ID` là id công khai Google
        // cấp sẵn cho đúng mục đích này, không cần tạo style riêng trên Cloud Console.
        mapId: 'DEMO_MAP_ID',
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'greedy',
      });
      const marker = new api.marker.AdvancedMarkerElement({
        map,
        position: value ?? undefined,
        gmpDraggable: true,
      });

      // Bấm vào bản đồ = đặt ghim ở đó. Nhanh hơn kéo khi ghim đang ở rất xa chỗ cần tới.
      map.addListener('click', (e) => {
        const point = e.latLng;
        if (!point) return;
        const next = { lat: point.lat(), lng: point.lng() };
        marker.position = next;
        onChangeRef.current(next);
      });
      marker.addListener('dragend', () => {
        const position = marker.position;
        if (position) onChangeRef.current({ lat: position.lat, lng: position.lng });
      });

      mapRef.current = map;
      markerRef.current = marker;
      setStatus('ready');
    });

    return () => {
      cancelled = true;
    };
    // Chạy MỘT LẦN cho vòng đời của ô. `value`/`fallbackCenter` chỉ dùng làm vị trí MỞ ĐẦU; đồng
    // bộ về sau đi qua effect dưới, vì dựng lại cả bản đồ mỗi lần toạ độ đổi sẽ nháy màn hình và
    // huỷ luôn cú kéo mà người dùng đang thực hiện.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive, disabled]);

  /** Ghim đổi từ BÊN NGOÀI (người dùng vừa chọn một gợi ý địa điểm) → dời bản đồ theo. */
  useEffect(() => {
    if (status !== 'ready' || !value) return;
    markerRef.current!.position = value;
    mapRef.current!.setCenter(value);
  }, [status, value]);

  if (!interactive) {
    const embedUrl = mapPlaceUrl(value);
    if (!embedUrl) return null;
    return (
      <div className={styles.block}>
        <EmbedMap src={embedUrl} title={label} height={200} />
        <p className={styles.hint}>{t('readOnlyHint')}</p>
      </div>
    );
  }

  if (status === 'unavailable') {
    // Bản đồ không tải được KHÔNG phải lỗi của người đang điền form: nói một câu, giữ nguyên
    // toạ độ đang có, và để họ lưu bình thường.
    return (
      <Alert type="info" showIcon className={styles.block} message={t('unavailable')} />
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
            href={`https://www.google.com/maps/search/?api=1&query=${value.lat},${value.lng}`}
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
