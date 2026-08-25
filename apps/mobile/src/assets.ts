import logo from '../assets/images/logo.jpg';

/**
 * Ảnh tĩnh gom một chỗ vì Metro nội suy đường dẫn lúc build — không dựng động được.
 *
 * KHÔNG nằm trong `theme/`: đây là tài nguyên, không phải design token. Icon/splash của app
 * khai ở `app.json` và phải là PNG vuông (logo hiện tại là JPG 1024×768, chỉ dùng trong UI).
 */
export const images = { logo } as const;
