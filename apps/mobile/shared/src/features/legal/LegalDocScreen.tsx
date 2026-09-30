import { legalPath, type LegalDoc } from '@xeprime/domain';
import { ContentWebScreen } from '@/features/content/ContentWebScreen';

/**
 * Một văn bản pháp lý, đọc trong app bằng bộ đọc nội dung chung (`ContentWebScreen`).
 *
 * Bốn văn bản viện dẫn lẫn nhau, và từ 23/09/2026 web còn có cặp trước/sau, bộ chuyển văn bản và
 * mục lục ngay trong trang — nên đi giữa chúng ở NGAY trong bộ đọc, và thanh đầu màn bám theo văn
 * bản đang hiện chứ không theo tham số route.
 */
export function LegalDocScreen({ doc, onBack }: { doc: LegalDoc; onBack: () => void }) {
  return <ContentWebScreen path={legalPath.doc(doc)} onBack={onBack} />;
}
