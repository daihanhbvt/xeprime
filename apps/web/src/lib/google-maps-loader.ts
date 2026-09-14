/**
 * Nạp Maps JavaScript API MỘT LẦN cho cả phiên, theo yêu cầu.
 *
 * Vì sao có file này bên cạnh `map-embed.ts`: bản đồ NHÚNG (iframe) chỉ để XEM và không tốn hạn
 * mức; bản đồ TƯƠNG TÁC (kéo ghim) đòi Maps JavaScript API và CÓ tính tiền theo lượt tải. Hai
 * thứ khác nhau về giá nên phải khác nhau về cách nạp: iframe render cùng trang, còn script này
 * chỉ tải khi người dùng thật sự mở ô chỉnh ghim.
 *
 * Key ở đây là key TRÌNH DUYỆT (`NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`), khoá theo HTTP referrer.
 * Nó KHÔNG BAO GIỜ là `GOOGLE_MAPS_SERVER_KEY` — key đó khoá theo IP, gọi Geocoding/Routes có
 * tính tiền, và chỉ backend giữ (ADR 0018).
 *
 * Chưa cấu hình key ⇒ `loadGoogleMaps()` trả `null`. Đó là một câu trả lời hợp lệ: giao diện rơi
 * về bản đồ nhúng chỉ-xem, người dùng vẫn chọn được địa điểm từ gợi ý, chỉ mất thao tác kéo ghim.
 */

/** Phần Maps JavaScript API mà ô chỉnh ghim thật sự dùng — khai hẹp thay vì kéo cả `@types/google.maps`. */
export interface GoogleMapsApi {
  Map: new (el: HTMLElement, options: Record<string, unknown>) => GoogleMap;
  marker: {
    AdvancedMarkerElement: new (options: Record<string, unknown>) => GoogleMarker;
  };
}

export interface GoogleMap {
  setCenter(position: { lat: number; lng: number }): void;
  getCenter(): { lat(): number; lng(): number } | undefined;
  addListener(event: string, handler: (e: { latLng?: { lat(): number; lng(): number } }) => void): {
    remove(): void;
  };
}

export interface GoogleMarker {
  position: { lat: number; lng: number } | null;
  map: GoogleMap | null;
  addListener(event: string, handler: (e: unknown) => void): { remove(): void };
}

interface GoogleGlobal {
  maps?: {
    Map?: GoogleMapsApi['Map'];
    importLibrary?: (name: string) => Promise<unknown>;
  };
}

declare global {
  interface Window {
    google?: GoogleGlobal;
  }
}

const SCRIPT_ID = 'xp-google-maps-js';

/**
 * Một promise dùng chung cho cả phiên.
 *
 * Không phải tối ưu vặt: hai ô địa chỉ mở cùng lúc (form chi nhánh trong một trang đã có bản đồ)
 * sẽ chèn hai thẻ `<script>` cùng URL, và Maps JS API phát cảnh báo "included multiple times"
 * rồi cư xử khó lường. Một promise = một lần tải, bao nhiêu người gọi cũng được.
 */
let loading: Promise<GoogleMapsApi | null> | null = null;

export function googleMapsBrowserKey(): string | null {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY || null;
}

/** Có bật được bản đồ tương tác không — nơi gọi kiểm trước để KHÔNG hiện nút "chỉnh ghim" vô nghĩa. */
export function isInteractiveMapConfigured(): boolean {
  return googleMapsBrowserKey() !== null;
}

/**
 * Nạp Maps JavaScript API. `null` = chưa cấu hình key HOẶC script không tải được.
 *
 * Không ném: nơi gọi là một ô nhập địa chỉ, và một lỗi mạng của Google không được phép biến
 * thành màn hình lỗi của form.
 */
export async function loadGoogleMaps(): Promise<GoogleMapsApi | null> {
  if (typeof window === 'undefined') return null;
  const key = googleMapsBrowserKey();
  if (!key) return null;
  loading ??= injectScript(key);
  return loading;
}

function injectScript(key: string): Promise<GoogleMapsApi | null> {
  return new Promise((resolve) => {
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener('load', () => void resolveApi().then(resolve));
      existing.addEventListener('error', () => resolve(null));
      // Script đã tải xong từ trước (không còn bắn `load` nữa) — hỏi thẳng global.
      if (window.google?.maps) void resolveApi().then(resolve);
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    const params = new URLSearchParams({
      key,
      // `loading=async` là cách Google khuyến nghị từ 2023; thiếu nó console đầy cảnh báo và
      // bản đồ chặn luồng render chính.
      loading: 'async',
      // `marker` cho `AdvancedMarkerElement` (ghim kéo được), `v=weekly` để không bị đóng băng
      // ở một bản cũ khi Google bỏ API.
      libraries: 'marker',
      v: 'weekly',
      language: 'vi',
      region: 'VN',
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.addEventListener('load', () => void resolveApi().then(resolve));
    script.addEventListener('error', () => {
      // Cho phép thử lại ở lần mở sau: một lần mất mạng không nên khoá tính năng cả phiên.
      loading = null;
      resolve(null);
    });
    document.head.appendChild(script);
  });
}

/** `importLibrary` trả từng thư viện rời — gom lại thành một đối tượng để nơi gọi chỉ chờ một lần. */
async function resolveApi(): Promise<GoogleMapsApi | null> {
  const maps = window.google?.maps;
  if (!maps?.importLibrary) return null;
  try {
    const [core, marker] = await Promise.all([
      maps.importLibrary('maps') as Promise<{ Map: GoogleMapsApi['Map'] }>,
      maps.importLibrary('marker') as Promise<GoogleMapsApi['marker']>,
    ]);
    return { Map: core.Map, marker };
  } catch {
    loading = null;
    return null;
  }
}
