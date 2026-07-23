/**
 * `@xeprime/ui` — component dùng chung giữa `(public)` marketplace và `(manage)` portal.
 *
 * Cố ý để trống ở Phase 0.
 *
 * Đẩy component vào package dùng chung khi mới có một nơi sử dụng là nợ kỹ thuật: nó tạo
 * ranh giới API phải duy trì trước khi biết ranh giới đó nên nằm ở đâu. Component hiện
 * sống ở `apps/web/src/components`; khi marketplace (Phase 3) thật sự cần dùng lại cái gì
 * thì chuyển sang đây.
 *
 * Quy ước khi thêm: chỉ nhận props thuần, không gọi API, không đọc Redux — nếu cần dữ liệu
 * thì nhận qua props để dùng được ở cả hai app.
 */
export {};
