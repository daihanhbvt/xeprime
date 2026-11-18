import { StatePage } from '@/components/feedback/StatePage';

/** 404 cho mọi đường dẫn không khớp route nào — trang trạng thái chung (Figma `22306:65272`). */
export default function NotFound() {
  return <StatePage kind="not-found" />;
}
