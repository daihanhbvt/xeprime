import type { AppLocale } from '@/i18n/config';
import { googleMapsBrowserKey, isMapConfigured } from './map-embed';

/**
 * Nạp Maps JavaScript API MỘT LẦN cho cả phiên, theo yêu cầu (ADR 0059).
 *
 * Vì sao có file này bên cạnh `map-embed.ts`: bản đồ NHÚNG (iframe) chỉ để XEM và miễn phí; bản
 * đồ TƯƠNG TÁC (kéo ghim) cần Maps JavaScript API và TÍNH TIỀN theo lượt tải bản đồ. Hai thứ khác
 * nhau về giá nên phải khác nhau về cách nạp: iframe render cùng trang, còn script này chỉ tải
 * khi người dùng thật sự mở ô chỉnh ghim.
 *
 * Key là key TRÌNH DUYỆT (`NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`), khoá theo HTTP referrer — cùng
 * key với bản đồ nhúng. Nó KHÔNG BAO GIỜ là `GOOGLE_MAPS_SERVER_KEY`: key đó khoá theo IP, gọi
 * Geocoding/Places/Routes có tính tiền, và chỉ backend giữ.
 *
 * Chưa cấu hình key, hoặc Google đã từ chối key ⇒ `loadGoogleMaps()` trả `null`. Đó là một câu
 * trả lời hợp lệ: ô ghim nói một câu "bản đồ tạm không tải được", người dùng vẫn chọn được địa
 * điểm từ gợi ý, chỉ mất thao tác kéo ghim.
 */

export interface LatLngLiteral {
  lat: number;
  lng: number;
}

interface GoogleLatLng {
  lat(): number;
  lng(): number;
}

export interface MapsEventListener {
  remove(): void;
}

/** Sự kiện chuột của bản đồ và của ghim (`MapMouseEvent`) — chỉ phần ô chỉnh ghim dùng. */
export interface MapMouseEvent {
  latLng?: GoogleLatLng | null;
}

/**
 * Phần Maps JavaScript API mà ô chỉnh ghim thật sự dùng — khai hẹp thay vì kéo cả
 * `@types/google.maps` (~10.000 dòng khai báo toàn cục) vào type-check của mọi file.
 */
export interface GoogleMap {
  setCenter(position: LatLngLiteral): void;
  setZoom(zoom: number): void;
  setOptions(options: Record<string, unknown>): void;
  addListener(event: 'click', handler: (e: MapMouseEvent) => void): MapsEventListener;
}

export interface GoogleAdvancedMarker {
  position: LatLngLiteral | null;
  map: GoogleMap | null;
  gmpDraggable: boolean;
  addListener(event: 'dragend', handler: (e: MapMouseEvent) => void): MapsEventListener;
}

export interface GoogleMapsApi {
  Map: new (el: HTMLElement, options: Record<string, unknown>) => GoogleMap;
  AdvancedMarkerElement: new (options: Record<string, unknown>) => GoogleAdvancedMarker;
}

interface GoogleGlobal {
  maps?: {
    importLibrary?: (name: string) => Promise<unknown>;
  };
}

declare global {
  interface Window {
    google?: GoogleGlobal;
    /** Google gọi hàm toàn cục này khi key bị từ chối (sai key, sai referrer, chưa bật billing). */
    gm_authFailure?: () => void;
  }
}

const SCRIPT_ID = 'xp-google-maps-js';

/**
 * Map ID — điều kiện của `AdvancedMarkerElement` (ghim kéo được).
 *
 * `DEMO_MAP_ID` là id công khai Google cấp sẵn để thử; production nên tạo Map ID riêng trong
 * Cloud Console (Map Management, miễn phí) rồi khai ở `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`. Không khai
 * thì vẫn chạy — chỉ là đang dùng id mẫu.
 */
export function googleMapsMapId(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';
}

/**
 * Sức khoẻ của bản đồ trong trang này — đọc được từ NGOÀI ô ghim.
 *
 * Có key chưa đủ để nói bản đồ dùng được: Google có thể từ chối key (sai referrer, billing hết
 * hạn) hoặc script không tải được. Form đặt xe cần biết điều đó để thôi đòi toạ độ — đòi một cái
 * ghim trong khi không có bản đồ để đặt ghim là khoá khách ở bước địa chỉ (ADR 0035 điều 6).
 *
 * - `authFailed` DÍNH tới hết lần tải trang: Google chỉ gọi `gm_authFailure` một lần, và dựng
 *   thêm bản đồ sau đó chỉ ra thêm một khung xám có tính tiền.
 * - Lỗi tải script thì KHÔNG dính: lần mở ô kế tiếp thử lại, và nạp được thì trạng thái về `ok`.
 */
type MapsHealth = 'unknown' | 'ok' | 'failed';
let health: MapsHealth = 'unknown';
let authFailed = false;
const healthListeners = new Set<() => void>();

function setHealth(next: MapsHealth): void {
  if (health === next) return;
  health = next;
  for (const listener of healthListeners) listener();
}

export function subscribeGoogleMapsHealth(listener: () => void): () => void {
  healthListeners.add(listener);
  return () => {
    healthListeners.delete(listener);
  };
}

/** Google đã từ chối key trong lần tải trang này. */
export function isGoogleMapsAuthFailed(): boolean {
  return authFailed;
}

/**
 * Người dùng CÓ đặt được ghim không: có key, và chưa thấy bản đồ hỏng. Chưa nạp lần nào thì coi
 * là được — không có cách nào biết trước khi thử, và mặc định chặt là mặc định đúng.
 */
export function isInteractiveMapUsable(): boolean {
  return isMapConfigured() && health !== 'failed';
}

/**
 * Một promise dùng chung cho cả phiên.
 *
 * Không phải tối ưu vặt: hai ô địa chỉ mở cùng lúc (form chi nhánh trong một trang đã có bản đồ)
 * sẽ chèn hai thẻ `<script>` cùng URL, và Maps JS API phát cảnh báo "included multiple times"
 * rồi cư xử khó lường. Một promise = một lần tải, bao nhiêu người gọi cũng được.
 *
 * Hệ quả cần biết: ngôn ngữ của bản đồ chốt ở LẦN NẠP ĐẦU. Đổi ngôn ngữ giao diện giữa phiên thì
 * nhãn bản đồ đổi theo ở lần tải trang kế tiếp — Google không cho nạp lại script với `language`
 * khác.
 */
let loading: Promise<GoogleMapsApi | null> | null = null;

/**
 * Nạp Maps JavaScript API. `null` = chưa cấu hình key HOẶC script không tải được.
 *
 * Không ném: nơi gọi là một ô nhập địa chỉ, và một lỗi mạng của Google không được phép biến
 * thành màn hình lỗi của form.
 */
export async function loadGoogleMaps(locale: AppLocale): Promise<GoogleMapsApi | null> {
  if (typeof window === 'undefined' || authFailed) return null;
  const key = googleMapsBrowserKey();
  if (!key) return null;
  loading ??= injectScript(key, locale);
  const api = await loading;
  // Hỏi lại SAU khi chờ: Google có thể từ chối key giữa lúc script đang nạp.
  if (authFailed) return null;
  setHealth(api ? 'ok' : 'failed');
  return api;
}

function injectScript(key: string, locale: AppLocale): Promise<GoogleMapsApi | null> {
  /*
   * Google gọi hàm toàn cục này khi TỪ CHỐI key (sai key, referrer chưa được phép, project chưa
   * gắn billing). Không nghe nó thì lỗi hiện ra như một khung xám "Trang này không thể tải Google
   * Maps đúng cách" giữa form — trông như lỗi của mình, và che mất lối ra là chọn gợi ý địa điểm.
   */
  window.gm_authFailure = () => {
    authFailed = true;
    setHealth('failed');
  };

  return new Promise((resolve) => {
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      // Script đã tải xong từ trước (không còn bắn `load` nữa) — hỏi thẳng global.
      if (window.google?.maps?.importLibrary) {
        void resolveApi().then(resolve);
        return;
      }
      existing.addEventListener('load', () => void resolveApi().then(resolve));
      existing.addEventListener('error', () => resolve(null));
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    const params = new URLSearchParams({
      key,
      // `loading=async` là cách Google khuyến nghị; thiếu nó console đầy cảnh báo và bản đồ chặn
      // luồng render chính.
      loading: 'async',
      // `v=weekly` để không bị đóng băng ở một bản cũ khi Google bỏ API.
      v: 'weekly',
      language: locale,
      region: 'VN',
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.addEventListener('load', () => void resolveApi().then(resolve));
    script.addEventListener('error', () => {
      // Cho phép thử lại ở lần mở sau: một lần mất mạng không nên khoá tính năng cả phiên.
      script.remove();
      loading = null;
      resolve(null);
    });
    document.head.appendChild(script);
  });
}

/** `importLibrary` trả từng thư viện rời — gom lại để nơi gọi chỉ chờ một lần. */
async function resolveApi(): Promise<GoogleMapsApi | null> {
  const importLibrary = window.google?.maps?.importLibrary;
  if (!importLibrary) return null;
  try {
    const [maps, marker] = await Promise.all([
      importLibrary('maps') as Promise<{ Map: GoogleMapsApi['Map'] }>,
      importLibrary('marker') as Promise<{
        AdvancedMarkerElement: GoogleMapsApi['AdvancedMarkerElement'];
      }>,
    ]);
    return { Map: maps.Map, AdvancedMarkerElement: marker.AdvancedMarkerElement };
  } catch {
    loading = null;
    return null;
  }
}
