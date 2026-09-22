import { isValidGeoPoint, type GeoPoint } from '@xeprime/domain';
import { XP_TOKENS } from '@xeprime/ui';

import { geoapifyMapKey } from './map-static';

/**
 * Bản đồ TƯƠNG TÁC trên native — Leaflet chạy trong `react-native-webview`, tile Geoapify/OSM
 * (ADR 0037).
 *
 * ## Vì sao WebView chứ không phải một module bản đồ native
 *
 * `react-native-maps`/MapLibre là MODULE NATIVE: vắng mặt trong dev build thì app crash lúc CHẠY,
 * không phải lúc build — đúng lý do `map-static.ts` từng nêu để không kéo chúng vào. Lý do đó
 * không mất đi; thứ thay đổi là **`react-native-webview` đã có sẵn trong bundle** (màn văn bản
 * pháp lý dùng nó), nên một bản đồ tương tác ở đây không thêm module native nào cả.
 *
 * Đổi lại được đúng thứ ảnh tĩnh không làm nổi: **phóng to, kéo bản đồ, và bấm sang chỗ khác thì
 * ghim nhảy theo** — cùng ba thao tác web đã có từ `MapPinPicker`. Toạ độ đó là thứ tính phí
 * giao xe (ADR 0018) và là chỗ tài xế lái tới, nên người khai địa chỉ phải sửa được nó bằng tay
 * khi máy tra ra lệch — ở dữ liệu OSM Việt Nam, nơi số nhà và hẻm còn thưa, đó là chuyện thường.
 *
 * ## Vì sao Leaflet, không phải MapLibre GL
 *
 * Cùng lý lẽ với web (`apps/web/src/lib/leaflet-loader.ts`): việc ở đây đúng một câu — đặt và kéo
 * MỘT cái ghim. Leaflet làm việc đó với ~40KB và không cần WebGL, thứ không phải máy Android tầm
 * thấp nào cũng bật được trong WebView.
 *
 * ## Ảnh tĩnh KHÔNG bị thay thế
 *
 * Khối xem trước trong form vẫn là ảnh tĩnh: nó hiện ngay, không tốn một WebView cho mỗi ô địa
 * chỉ, và phần lớn lần mở form người dùng chỉ liếc qua xem ghim đúng chưa. Bản đồ tương tác chỉ
 * dựng khi họ thật sự mở tấm chỉnh ghim.
 *
 * ## Khoá
 *
 * Dùng chung `EXPO_PUBLIC_GEOAPIFY_MAP_KEY` với ảnh tĩnh — Geoapify không tách khoá tile với khoá
 * ảnh tĩnh (ADR 0037). Không bao giờ dùng khoá server `GEOAPIFY_API_KEY` ở đây.
 *
 * ## Ghi nguồn ODbL
 *
 * Khác ảnh tĩnh (Geoapify nung sẵn dòng ghi nguồn vào ảnh), tile RỜI không mang dòng nào — nên
 * trang HTML ở đây phải tự in, và Leaflet làm việc đó qua `attributionControl`. Đừng gỡ.
 */

/** Nền raster — cùng `style` với ảnh tĩnh, để hai bản đồ của một màn không lệch tông. */
const TILE_STYLE = 'osm-bright';

/** Geoapify ngừng phục vụ tile trên mức này; xin cao hơn chỉ nhận về ô xám. */
const TILE_MAX_ZOOM = 20;

/** Bản Leaflet ghim CỨNG: một bản đồ đổi hành vi sau một bản vá của CDN là thứ không ai truy ra. */
const LEAFLET_VERSION = '1.9.4';

/** Đã có ghim: đủ gần để thấy số nhà — cùng `PINNED_ZOOM` của `MapPinPicker` bên web. */
export const PINNED_ZOOM = 17;

/** Chưa có ghim: mức "một phường", người dùng tự kéo tới nơi mình muốn. */
export const UNPINNED_ZOOM = 13;

/** Mở ở đâu khi không biết gì cả — chỉ để bản đồ có một chỗ để mở ra, không phải một gợi ý. */
export const FALLBACK_CENTER: GeoPoint = { lat: 16.0471, lng: 108.2062 };

/**
 * Nguồn dữ liệu — BẮT BUỘC theo ODbL của OpenStreetMap và điều khoản gói miễn phí của Geoapify.
 */
const TILE_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://www.geoapify.com/">Geoapify</a>';

/** `true` khi dựng được bản đồ tương tác — nơi gọi kiểm TRƯỚC để không mời vào một ngõ cụt. */
export function isInteractiveMapConfigured(): boolean {
  return geoapifyMapKey() !== null;
}

/** Tin trang HTML gửi NGƯỢC ra RN. Một hình dạng duy nhất, đọc bằng `parseMapMessage`. */
export type MapBridgeMessage =
  | { type: 'ready' }
  | { type: 'pin'; lat: number; lng: number }
  | { type: 'error'; detail: string };

/**
 * Đọc `event.nativeEvent.data` thành một tin có kiểu — `null` cho mọi thứ không nhận ra.
 *
 * WebView là một bề mặt KHÔNG TIN ĐƯỢC về mặt kiểu: trang có thể gửi bất cứ chuỗi gì, và một
 * `JSON.parse` trần ném ngay giữa render. Ở đây mọi thứ lạ đều rơi về `null` và nơi gọi bỏ qua.
 */
export function parseMapMessage(raw: string): MapBridgeMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const data = parsed as Record<string, unknown>;

  if (data.type === 'ready') return { type: 'ready' };
  if (data.type === 'error') return { type: 'error', detail: String(data.detail ?? '') };
  if (data.type === 'pin') {
    const point = { lat: Number(data.lat), lng: Number(data.lng) };
    return isValidGeoPoint(point) ? { type: 'pin', ...point } : null;
  }
  return null;
}

/**
 * Trang HTML của bản đồ. Dựng MỘT LẦN cho mỗi lần mở tấm chỉnh ghim.
 *
 * Không nhúng toạ độ đang sống vào đây rồi dựng lại mỗi lần ghim đổi: dựng lại nghĩa là WebView
 * tải lại từ đầu, mất luôn mức thu phóng và vùng người dùng vừa kéo tới. Trong một phiên, ghim
 * chỉ đổi bên trong trang (`window.xpSetPin` đang chờ sẵn cho ngày có luồng cần đẩy ghim từ RN
 * vào — hiện chưa có, vì tấm trượt che trọn form suốt lúc nó mở).
 *
 * @param center Tâm lúc mở — ghim hiện tại, hoặc điểm neo (tâm tỉnh) khi chưa có ghim.
 * @param pinned Có vẽ ghim ngay không. `false` = mở trống và chờ cú bấm đầu tiên: một cái ghim
 *   giữa tâm tỉnh trông y hệt một vị trí đã được xác nhận.
 */
export function mapPickerHtml({
  center,
  zoom,
  pinned,
}: {
  center: GeoPoint;
  zoom: number;
  pinned: boolean;
}): string | null {
  const key = geoapifyMapKey();
  if (!key) return null;

  const tileUrl = `https://maps.geoapify.com/v1/tile/${TILE_STYLE}/{z}/{x}/{y}{r}.png?apiKey=${encodeURIComponent(key)}`;
  const leafletCss = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
  const leafletJs = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
  const pinColor = XP_TOKENS['color-primary'];
  const pinStroke = XP_TOKENS['color-text'];

  /*
   * `user-scalable=no` cho TRANG, trong khi bản đồ vẫn chụm-để-phóng bình thường.
   *
   * Hai phép phóng to khác nhau: phóng cả trang (trình duyệt) làm mọi thứ to lên rồi tràn ra
   * ngoài khung, còn phóng BẢN ĐỒ (Leaflet) tải tile ở mức chi tiết hơn — chỉ cái sau là thứ
   * người dùng muốn khi họ chụm hai ngón lên một bản đồ.
   */
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <link rel="stylesheet" href="${leafletCss}" />
    <style>
      html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: ${XP_TOKENS['color-bg-muted']}; }
      /*
       * "touch-action: none" là dòng làm cho KÉO BẢN ĐỒ ăn được trong WebView.
       *
       * Mặc định trình duyệt tự nhận mọi cú vuốt dọc là "cuộn trang" và chỉ giao lại cho JS
       * sau khi đã xử lý xong — trong một trang không có gì để cuộn thì cú vuốt đó rơi vào hư
       * không, và bản đồ đứng im đúng như đang hỏng. Tắt cử chỉ mặc định là Leaflet nhận trọn
       * chuỗi "touchmove" và kéo/chụm mới chạy.
       */
      #map { position: absolute; inset: 0; touch-action: none; }
      .xp-pin { width: 28px; height: 28px; }
      .leaflet-container { background: ${XP_TOKENS['color-bg-muted']}; }
      .leaflet-control-attribution { font-size: 9px; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="${leafletJs}"></script>
    <script>
      (function () {
        var bridge = window.ReactNativeWebView;
        function post(payload) { bridge && bridge.postMessage(JSON.stringify(payload)); }

        /* Lỗi nào cũng phải đi ra ngoài: một WebView hỏng im lặng chỉ là một ô xám không ai gỡ được. */
        window.onerror = function (message) { post({ type: 'error', detail: String(message) }); };

        if (!window.L) { post({ type: 'error', detail: 'leaflet-missing' }); return; }

        /*
         * "tap: false": bộ giả lập chạm của Leaflet dành cho iOS đời cũ nuốt mất cú chạm đầu của
         * một chuỗi kéo trong WebView, nên nhát vuốt đầu tiên sau khi mở tấm không ăn. Trình duyệt
         * ở đây đã có sự kiện chạm chuẩn, không cần bộ giả lập đó.
         *
         * "bounceAtZoomLimits: false": chụm quá mức tối đa mà bản đồ nảy lại thì trông y như nó
         * vừa từ chối thao tác.
         */
        var map = L.map('map', {
          zoomControl: true,
          attributionControl: true,
          tap: false,
          dragging: true,
          touchZoom: true,
          bounceAtZoomLimits: false,
        }).setView([${center.lat}, ${center.lng}], ${zoom});

        L.tileLayer('${tileUrl}', { maxZoom: ${TILE_MAX_ZOOM}, attribution: '${TILE_ATTRIBUTION}' }).addTo(map);

        /*
         * Ghim vẽ bằng SVG trong một divIcon, KHÔNG dùng icon mặc định của Leaflet: icon đó nạp
         * ảnh PNG theo đường dẫn tương đối của trang, và trang này không có gốc tĩnh nào để lấy —
         * kết quả là một ghim vô hình, đúng thứ người dùng đang cần nhìn.
         *
         * Neo ở ĐÁY giữa: mũi ghim mới là điểm toạ độ, không phải tâm hình.
         */
        var icon = L.divIcon({
          className: 'xp-pin',
          iconSize: [28, 28],
          iconAnchor: [14, 28],
          html:
            '<svg viewBox="0 0 24 24" width="28" height="28">' +
            '<path d="M12 23s8-8.2 8-13.2A8 8 0 1 0 4 9.8C4 14.8 12 23 12 23z" fill="${pinColor}" stroke="${pinStroke}" stroke-width="1.4"/>' +
            '<circle cx="12" cy="9.6" r="3" fill="${pinStroke}"/>' +
            '</svg>',
        });

        var marker = null;

        /* Đặt ghim mà KHÔNG báo ngược ra — dùng cho lệnh đến từ RN. */
        function place(lat, lng) {
          if (marker) { marker.setLatLng([lat, lng]); return; }
          marker = L.marker([lat, lng], { icon: icon, draggable: true }).addTo(map);
          marker.on('dragend', function () {
            var p = marker.getLatLng();
            post({ type: 'pin', lat: p.lat, lng: p.lng });
          });
        }

        window.xpSetPin = function (lat, lng) {
          place(lat, lng);
          map.setView([lat, lng], Math.max(map.getZoom(), ${PINNED_ZOOM}));
        };

        map.on('click', function (event) {
          place(event.latlng.lat, event.latlng.lng);
          post({ type: 'pin', lat: event.latlng.lat, lng: event.latlng.lng });
        });

        ${pinned ? `place(${center.lat}, ${center.lng});` : ''}
        post({ type: 'ready' });
      })();
    </script>
  </body>
</html>`;
}
