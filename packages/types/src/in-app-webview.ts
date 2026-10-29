/**
 * Dấu nhận diện WebView của APP KHÁCH (XePrime) — app gắn vào cuối User-Agent
 * (`applicationNameForUserAgent`), web đọc header đó để thay câu nhắc gói/thuê bao bằng câu trung tính
 * (né IAP — người dùng chốt 29/10/2026). Header sống qua mọi lượt điều hướng trong WebView, query
 * param thì không. Trình duyệt thường không bao giờ mang dấu này ⇒ bản web giữ nguyên.
 */
export const CUSTOMER_APP_WEBVIEW_UA_TOKEN = 'XePrimeCustomerApp';
