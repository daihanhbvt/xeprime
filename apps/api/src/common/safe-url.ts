/**
 * URL hợp lệ cho ảnh/đích đến do quản trị nhập rồi render thẳng ra trang CÔNG KHAI (banner, ảnh
 * danh mục): http(s) tuyệt đối hoặc đường dẫn nội bộ bắt đầu bằng `/`. Chặn `javascript:`,
 * `data:` và mọi scheme lạ.
 *
 * Một hằng cho mọi nơi — banner và danh mục từng khai riêng, và hai bản sao của một luật an ninh
 * là cách một bản bị nới lỏng mà bản kia không.
 */
export const SAFE_URL_PATTERN = /^(https?:\/\/|\/)\S+$/;
