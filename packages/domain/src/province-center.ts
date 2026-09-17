import { PROVINCE_CODES } from '@xeprime/types';
import type { GeoPoint } from './geo';

/**
 * Toạ độ để MỞ bản đồ khi mới chỉ biết tỉnh/thành — 34 đơn vị của mô hình hành chính hai cấp
 * (hiệu lực 01/07/2025, ADR 0035).
 *
 * ## Đây là VỊ TRÍ MỞ ĐẦU, không phải một cái ghim
 *
 * Không giá trị nào ở đây được ghi vào `latitude`/`longitude` của một bản ghi, không giá trị nào
 * đi vào phép tính phí giao xe, và không giá trị nào được hiểu là "địa chỉ đã xác nhận". Chúng
 * chỉ trả lời đúng một câu hỏi: *khung bản đồ nên mở ra ở đâu khi người dùng vừa chọn tỉnh mà
 * chưa đặt ghim?* Trước khi có bảng này, câu trả lời là một hằng số duy nhất ở giữa Đà Nẵng —
 * nên một người đang khai địa chỉ ở Bắc Ninh nhìn thấy bản đồ Đà Nẵng và phải tự kéo 760km.
 *
 * ## Vì sao là TÂM ĐÔ THỊ chứ không phải trọng tâm hình học
 *
 * Trọng tâm hình học của Gia Lai hay Lâm Đồng rơi vào rừng. Địa chỉ người ta gõ thì tập trung ở
 * thành phố tỉnh lỵ, nên mỗi dòng dưới đây neo vào khu trung tâm của đô thị lớn nhất tỉnh — chỗ
 * mà xác suất cao nhất là người dùng chỉ cần kéo vài trăm mét, không phải vài chục km.
 *
 * ## Vì sao không lấy từ DB hay từ nhà cung cấp bản đồ
 *
 * Bảng `provinces` không có cột toạ độ và thêm cột chỉ để phục vụ một khung nhìn là đổi schema
 * cho một thứ không phải dữ liệu nghiệp vụ. Hỏi nhà cung cấp bản đồ thì mỗi lần người dùng đổi
 * tỉnh là một request CÓ TÍNH TIỀN, cho một con số không bao giờ được lưu lại. 34 dòng hằng số
 * rẻ hơn cả hai, và chạy được cả khi chưa cấu hình khoá bản đồ.
 *
 * Độ chính xác cần thiết ở đây là "đúng tỉnh", không phải "đúng số nhà" — vì vậy sai số vài km
 * là chấp nhận được và không có ngả nào để nó lớn hơn thế.
 */
const PROVINCE_CENTERS: Readonly<Record<string, GeoPoint>> = {
  '01': { lat: 21.0278, lng: 105.8342 }, // Hà Nội
  '04': { lat: 22.6657, lng: 106.257 }, // Cao Bằng
  '08': { lat: 21.823, lng: 105.214 }, // Tuyên Quang (gồm Hà Giang cũ)
  '11': { lat: 21.386, lng: 103.023 }, // Điện Biên
  '12': { lat: 22.396, lng: 103.459 }, // Lai Châu
  '14': { lat: 21.327, lng: 103.914 }, // Sơn La
  '15': { lat: 22.485, lng: 103.9707 }, // Lào Cai (gồm Yên Bái cũ)
  '19': { lat: 21.5928, lng: 105.8442 }, // Thái Nguyên (gồm Bắc Kạn cũ)
  '20': { lat: 21.853, lng: 106.761 }, // Lạng Sơn
  '22': { lat: 20.959, lng: 107.0448 }, // Quảng Ninh — Hạ Long
  '24': { lat: 21.1861, lng: 106.0763 }, // Bắc Ninh (gồm Bắc Giang cũ)
  '25': { lat: 21.323, lng: 105.402 }, // Phú Thọ — Việt Trì (gồm Vĩnh Phúc, Hoà Bình cũ)
  '31': { lat: 20.8449, lng: 106.6881 }, // Hải Phòng (gồm Hải Dương cũ)
  '33': { lat: 20.646, lng: 106.051 }, // Hưng Yên (gồm Thái Bình cũ)
  '37': { lat: 20.2506, lng: 105.9745 }, // Ninh Bình (gồm Hà Nam, Nam Định cũ)
  '38': { lat: 19.8067, lng: 105.7852 }, // Thanh Hoá
  '40': { lat: 18.679, lng: 105.6813 }, // Nghệ An — Vinh
  '42': { lat: 18.356, lng: 105.9 }, // Hà Tĩnh
  '44': { lat: 16.8163, lng: 107.1003 }, // Quảng Trị — Đông Hà (gồm Quảng Bình cũ)
  '46': { lat: 16.4637, lng: 107.5909 }, // Huế
  '48': { lat: 16.0471, lng: 108.2068 }, // Đà Nẵng (gồm Quảng Nam cũ)
  '51': { lat: 15.1214, lng: 108.8044 }, // Quảng Ngãi (gồm Kon Tum cũ)
  '52': { lat: 13.9833, lng: 108.0 }, // Gia Lai — Pleiku (gồm Bình Định cũ)
  '56': { lat: 12.2388, lng: 109.1967 }, // Khánh Hoà — Nha Trang (gồm Ninh Thuận cũ)
  '66': { lat: 12.6667, lng: 108.05 }, // Đắk Lắk — Buôn Ma Thuột (gồm Phú Yên cũ)
  '68': { lat: 11.9404, lng: 108.4583 }, // Lâm Đồng — Đà Lạt (gồm Đắk Nông, Bình Thuận cũ)
  '75': { lat: 10.9574, lng: 106.8426 }, // Đồng Nai — Biên Hoà (gồm Bình Phước cũ)
  '79': { lat: 10.7769, lng: 106.7009 }, // Hồ Chí Minh (gồm Bình Dương, Bà Rịa – Vũng Tàu cũ)
  '80': { lat: 11.31, lng: 106.098 }, // Tây Ninh (gồm Long An cũ)
  '82': { lat: 10.459, lng: 105.632 }, // Đồng Tháp — Cao Lãnh (gồm Tiền Giang cũ)
  '86': { lat: 10.253, lng: 105.972 }, // Vĩnh Long (gồm Bến Tre, Trà Vinh cũ)
  '91': { lat: 10.386, lng: 105.435 }, // An Giang — Long Xuyên (gồm Kiên Giang cũ)
  '92': { lat: 10.0452, lng: 105.7469 }, // Cần Thơ (gồm Sóc Trăng, Hậu Giang cũ)
  '96': { lat: 9.1769, lng: 105.15 }, // Cà Mau (gồm Bạc Liêu cũ)
};

/**
 * Nơi mở bản đồ cho một mã tỉnh. `null` khi chưa chọn tỉnh hoặc mã không thuộc danh mục hiện
 * hành — nơi gọi rơi về mặc định của chính nó thay vì nhận một toạ độ bịa.
 */
export function provinceCenter(provinceCode: string | null | undefined): GeoPoint | null {
  if (!provinceCode) return null;
  return PROVINCE_CENTERS[provinceCode] ?? null;
}

/**
 * Mã tỉnh CHƯA có toạ độ mở bản đồ.
 *
 * Tồn tại để một quyết định sắp xếp đơn vị hành chính mới không lặng lẽ để lại một tỉnh mở bản
 * đồ ở Đà Nẵng: test khoá mảng này phải rỗng, nên thêm mã vào danh mục mà quên thêm toạ độ là
 * một test đỏ chứ không phải một lời phàn nàn của người dùng sáu tháng sau.
 */
export function provinceCodesMissingCenter(): readonly string[] {
  return PROVINCE_CODES.filter((code) => !(code in PROVINCE_CENTERS));
}
