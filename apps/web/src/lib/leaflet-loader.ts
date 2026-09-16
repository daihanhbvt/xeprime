import type * as LeafletNamespace from 'leaflet';

/**
 * Nạp Leaflet MỘT LẦN cho cả phiên, theo yêu cầu (ADR 0037).
 *
 * Vì sao có file này bên cạnh `map-static.ts`: bản đồ TĨNH là một tấm ảnh, dùng để XEM và không
 * tốn một byte JavaScript nào; bản đồ TƯƠNG TÁC (kéo ghim) cần một thư viện thật. Hai thứ khác
 * nhau về chi phí nên phải khác nhau về cách nạp — ảnh render cùng trang, còn Leaflet chỉ tải
 * khi người dùng thật sự mở ô chỉnh ghim.
 *
 * **Vì sao Leaflet chứ không phải MapLibre GL.** Việc ở đây đúng một câu: đặt và kéo MỘT cái
 * ghim. Leaflet làm việc đó với ~40KB, không cần WebGL (nên chạy cả trên máy văn phòng cũ mà
 * gian hàng hay dùng), và ô nhập địa chỉ là chỗ không được phép kén thiết bị. MapLibre nặng gấp
 * mấy lần để đổi lấy xoay/nghiêng/vector — những thứ không ai dùng ở một ô chọn toạ độ.
 *
 * Key ở đây là key BẢN ĐỒ của web (`NEXT_PUBLIC_GEOAPIFY_MAP_KEY`), khoá theo HTTP referrer.
 * Nó KHÔNG BAO GIỜ là `GEOAPIFY_API_KEY` — key đó khoá theo IP, gọi geocoding/routing có trừ
 * hạn mức, và chỉ backend giữ (ADR 0018/0037).
 *
 * Chưa cấu hình key ⇒ `loadLeaflet()` trả `null`. Đó là một câu trả lời hợp lệ: giao diện rơi
 * về bản đồ tĩnh chỉ-xem, người dùng vẫn chọn được địa điểm từ gợi ý, chỉ mất thao tác kéo ghim.
 */
export type Leaflet = typeof LeafletNamespace;

/** Nền raster. Cùng `style` với ảnh tĩnh để hai bản đồ trên một trang không lệch tông. */
const TILE_STYLE = 'osm-bright';

/**
 * Nguồn dữ liệu — BẮT BUỘC theo giấy phép ODbL của OpenStreetMap và điều khoản gói miễn phí của
 * Geoapify. Leaflet tự vẽ nó ở góc dưới bản đồ; đừng gỡ.
 */
export const TILE_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://www.geoapify.com/">Geoapify</a>';

/** Geoapify ngừng phục vụ tile trên mức này; xin cao hơn chỉ nhận về ô xám. */
export const TILE_MAX_ZOOM = 20;

export function geoapifyMapKey(): string | null {
  return process.env.NEXT_PUBLIC_GEOAPIFY_MAP_KEY || null;
}

/** Có bật được bản đồ tương tác không — nơi gọi kiểm trước để KHÔNG hiện nút "chỉnh ghim" vô nghĩa. */
export function isInteractiveMapConfigured(): boolean {
  return geoapifyMapKey() !== null;
}

/**
 * URL mẫu của lớp nền.
 *
 * `@2x` cho màn hình mật độ cao: Leaflet tự thay `{r}` bằng `@2x` khi trình duyệt báo
 * `devicePixelRatio > 1`, nên một chuỗi lo được cả hai trường hợp thay vì phải tự dò.
 */
export function tileUrlTemplate(key: string): string {
  return `https://maps.geoapify.com/v1/tile/${TILE_STYLE}/{z}/{x}/{y}{r}.png?apiKey=${encodeURIComponent(key)}`;
}

/**
 * Một promise dùng chung cho cả phiên.
 *
 * Không phải tối ưu vặt: hai ô địa chỉ mở cùng lúc (form chi nhánh trong một trang đã có bản đồ)
 * sẽ kích hai lần `import()`. Bundler gộp lại được, nhưng phần khởi tạo CSS và biến toàn cục của
 * Leaflet thì không nên chạy hai lần. Một promise = một lần nạp, bao nhiêu người gọi cũng được.
 */
let loading: Promise<Leaflet | null> | null = null;

/**
 * Nạp Leaflet. `null` = chưa cấu hình key HOẶC mô-đun không tải được.
 *
 * Không ném: nơi gọi là một ô nhập địa chỉ, và một lỗi mạng không được phép biến thành màn hình
 * lỗi của form.
 */
export async function loadLeaflet(): Promise<Leaflet | null> {
  if (typeof window === 'undefined') return null;
  if (!geoapifyMapKey()) return null;
  loading ??= importLeaflet();
  return loading;
}

async function importLeaflet(): Promise<Leaflet | null> {
  try {
    /*
     * CSS của Leaflet phải vào cùng lúc với mã: thiếu nó thì các ô tile xếp chồng lên nhau thành
     * một mớ hỗn độn thay vì một bản đồ — hỏng theo kiểu trông như lỗi của mình chứ không phải
     * của một thư viện chưa được style.
     *
     * Import động cả hai để chúng nằm chung một chunk, chỉ tải khi ô chỉnh ghim thật sự mở ra.
     */
    const [leaflet] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]);
    return leaflet.default ?? (leaflet as unknown as Leaflet);
  } catch {
    // Cho phép thử lại ở lần mở sau: một lần mất mạng không nên khoá tính năng cả phiên.
    loading = null;
    return null;
  }
}
