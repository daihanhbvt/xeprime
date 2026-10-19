import type { SVGProps } from 'react';

/**
 * Icons cho tiện ích trên xe khớp chuẩn Figma v2 (node 19707:83357).
 * Toàn bộ là inline SVG outline thanh mảnh, server-safe (không dùng context hay antd icon).
 */
export function VehicleFeatureIcon({ name, ...props }: { name: string } & SVGProps<SVGSVGElement>) {
  const n = name.toLowerCase();

  // Bluetooth
  if (n.includes('bluetooth')) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <circle cx="12" cy="12" r="10" />
        <path d="m8.5 7.5 7 7-3.5 3.5V6l3.5 3.5-7 7" />
      </svg>
    );
  }

  // Camera lùi (rear camera)
  if (n.includes('lùi') || n.includes('backup')) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <rect x="2" y="6" width="13" height="12" rx="3" />
        <path d="m15 10 5-3v10l-5-3v-4z" />
      </svg>
    );
  }

  // Camera hành trình / 360 / dashcam
  if (n.includes('hành trình') || n.includes('dash') || n.includes('camera')) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <rect x="2" y="5" width="20" height="14" rx="3" />
        <circle cx="12" cy="12" r="3.5" />
        <circle cx="18" cy="8" r="1" fill="currentColor" />
      </svg>
    );
  }

  // Cảm biến / sensor
  if (n.includes('cảm biến') || n.includes('sensor')) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v12M9 8v8M15 8v8M6.5 10.5v3M17.5 10.5v3" />
      </svg>
    );
  }

  // ETC
  if (n.includes('etc') || n.includes('thu phí')) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
        <line x1="4" y1="22" x2="4" y2="15" />
      </svg>
    );
  }

  // USB
  if (n.includes('usb')) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v6" />
        <line x1="10" y1="6" x2="10" y2="7" />
        <line x1="14" y1="6" x2="14" y2="7" />
      </svg>
    );
  }

  // Bản đồ / GPS / map
  if (n.includes('bản đồ') || n.includes('map') || n.includes('gps')) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
        <line x1="9" y1="3" x2="9" y2="18" />
        <line x1="15" y1="6" x2="15" y2="21" />
      </svg>
    );
  }

  // Màn hình / LCD / screen
  if (n.includes('màn hình') || n.includes('screen') || n.includes('lcd')) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="m16 3-4 4-4-4" />
      </svg>
    );
  }

  // Cửa sổ trời / sunroof
  if (n.includes('cửa sổ trời') || n.includes('sunroof')) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="12" y1="3" x2="12" y2="21" />
      </svg>
    );
  }

  // Túi khí / airbag
  if (n.includes('túi khí') || n.includes('airbag')) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" />
      </svg>
    );
  }

  // Default fallback
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

