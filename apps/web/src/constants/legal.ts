/**
 * Shim re-export — bộ văn bản pháp lý nay sống ở `@xeprime/domain/legal`.
 *
 * Danh sách slug, ngày hiệu lực và thứ tự điều khoản là DỮ LIỆU dùng chung: app native mở đúng
 * `/legal/<slug>` của web trong trình duyệt trong-app, nên hai bản danh sách là hai cơ hội để
 * một liên kết trỏ tới văn bản đã đổi tên. File này giữ nguyên đường import `@/constants/legal`
 * mà mười mấy chỗ trong `apps/web` đang dùng — cùng vai với các shim ở `apps/web/src/lib/*`.
 *
 * Lý do từng hằng tồn tại (vì sao là code chứ không phải bảng DB, vì sao thứ tự mục tách khỏi
 * bó message) nằm ở docblock của chính `packages/domain/src/legal.ts`.
 */
export {
  LEGAL_DOC,
  LEGAL_DOC_GROUP,
  LEGAL_DOC_GROUPS,
  LEGAL_DOC_VALUES,
  LEGAL_DOC_WEB_VALUES,
  LEGAL_EFFECTIVE_FROM,
  LEGAL_SECTIONS,
  LEGAL_WEB_ONLY_DOCS,
  isLegalDoc,
  isWebLegalDoc,
  legalDocsFor,
  legalPath,
  legalSectionKeys,
  type LegalDoc,
  type LegalDocGroup,
  type LegalSection,
  type LegalTable,
} from '@xeprime/domain';
