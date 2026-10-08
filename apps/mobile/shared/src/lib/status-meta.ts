import { STATUS_COLOR, type StatusColor } from '@xeprime/types';

type MetaTable = Readonly<Record<string, { readonly label: string; readonly color: StatusColor }>>;

/**
 * Tra bảng `*_META` theo một mã ĐI TRÊN DÂY. Mã trên dây là `string` sinh từ OpenAPI: backend mới
 * hơn bản app đang cài có thể trả một trạng thái chưa khai ở đây, và `META[x].color` khi đó làm sập
 * cả màn. Web không sập vì `<Tag>`/`StatusTag` chịu được `undefined` — bản native phải tự dự phòng.
 */
export function metaColor(meta: MetaTable, code: string | null | undefined): StatusColor {
  return (code ? meta[code]?.color : undefined) ?? STATUS_COLOR.NEUTRAL;
}

/** Nhãn dự phòng cho `domainLabel(group, code, fallback)` — mã lạ thì để `domainLabel` hiện chính mã. */
export function metaLabel(meta: MetaTable, code: string | null | undefined): string | undefined {
  return code ? meta[code]?.label : undefined;
}
