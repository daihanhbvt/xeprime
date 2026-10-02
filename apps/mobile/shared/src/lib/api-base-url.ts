import { devServerHost, devServerOrigin } from './dev-server';

const DEFAULT_API_PORT = 4000;

/**
 * Thiếu `EXPO_PUBLIC_API_URL` thì suy host từ Expo dev server: thiết bị thật không gọi được
 * `localhost` của máy dev, phải dùng đúng IP LAN mà Metro đang phục vụ (`lib/dev-server.ts`).
 *
 * Giá trị bắt đầu bằng `/` là ĐƯỜNG DẪN TRÊN CHÍNH METRO — proxy dev sang staging
 * (`scripts/stg-proxy-middleware.js`). Một giá trị `"/api/stg"` chạy đúng ở cả ba nền tảng, và
 * đó là cách duy nhất bản WEB gọi được staging: trình duyệt chặn cross-origin, còn staging thì
 * không được phép mở CORS cho `http://localhost` (API sẽ không boot — `env.schema.ts`).
 *
 * Tên `resolve…` chứ không `get…`: `getApiBaseUrl()` nay là của `@xeprime/api-client` và trả về
 * baseUrl ĐÃ cấu hình. Hàm này là thứ TÍNH RA giá trị đem đi cấu hình, và chỉ app native có.
 */
export function resolveApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
  if (configured) {
    return configured.startsWith('/') ? `${devServerOrigin()}${configured}` : configured;
  }

  return `http://${devServerHost()}:${DEFAULT_API_PORT}`;
}
