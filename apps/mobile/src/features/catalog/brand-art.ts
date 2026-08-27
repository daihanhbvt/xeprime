/*
 * SINH TỰ ĐỘNG bởi `scripts/sync-brand-art.mjs` từ `apps/web/public/brands/*.svg`.
 * KHÔNG sửa tay — sửa SVG bên web rồi chạy lại script.
 */
import type { ImageSourcePropType } from 'react-native';
import bmw from '../../../assets/brands/bmw.png';
import chevrolet from '../../../assets/brands/chevrolet.png';
import ford from '../../../assets/brands/ford.png';
import honda from '../../../assets/brands/honda.png';
import hyundai from '../../../assets/brands/hyundai.png';
import kia from '../../../assets/brands/kia.png';
import mazda from '../../../assets/brands/mazda.png';
import mercedes from '../../../assets/brands/mercedes.png';
import mini from '../../../assets/brands/mini.png';
import mitsubishi from '../../../assets/brands/mitsubishi.png';
import nissan from '../../../assets/brands/nissan.png';
import toyota from '../../../assets/brands/toyota.png';
import vinfast from '../../../assets/brands/vinfast.png';
import volkswagen from '../../../assets/brands/volkswagen.png';

/** Khoá là `vehicleBrandKey(brand)`. Hãng ngoài bảng → monogram, xem `BrandMark`. */
export const BRAND_ART: Readonly<Record<string, ImageSourcePropType>> = {
  bmw,
  chevrolet,
  ford,
  honda,
  hyundai,
  kia,
  mazda,
  mercedes,
  mini,
  mitsubishi,
  nissan,
  toyota,
  vinfast,
  volkswagen,
};
