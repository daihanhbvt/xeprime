---
description: Build bản iOS phát hành của app XePrime (khách) qua EAS Build (cloud) — máy Windows không build iOS được.
argument-hint: "[--no-submit]"
allowed-tools: Bash(npx eas-cli:*), Bash(ls:*)
---

# Build iOS — XePrime (khách) (`@xeprime/mobile-customer`)

Tham số người dùng (có thể rỗng): $ARGUMENTS

iOS chỉ build được trên macOS (Xcode) hoặc EAS Build trên cloud của Expo. Máy dev hiện tại là Windows ⇒ dùng EAS.

1. Kiểm tra trước, thiếu thì DỪNG và hướng dẫn người dùng tự làm (cần đăng nhập/đồng ý, agent không làm thay):
   - `npx eas-cli whoami` — chưa đăng nhập ⇒ người dùng tự chạy `npx eas-cli login`.
   - Bundle ID `vn.xeprime.customerapp` đã đăng ký trên Apple Developer và app đã tạo trên App Store Connect.
   - `buildNumber` trong `apps/mobile/customer/app.json` (`expo.ios.buildNumber`) đã TĂNG so với bản đã upload — App Store Connect từ chối số trùng. Hỏi người dùng trước khi tăng.
2. Chạy trong `apps/mobile/customer`:
   `npx eas-cli build --platform ios --profile production`
   Lần đầu EAS hỏi đăng nhập Apple ID để tạo certificate/provisioning profile — người dùng phải tự trả lời trong terminal, nên đưa lệnh cho họ chạy nếu phiên không tương tác.
3. Xong thì báo link build EAS. Nộp lên App Store Connect: `npx eas-cli submit --platform ios --latest` (bỏ qua nếu `--no-submit`) — cũng cần người dùng xác nhận.
4. KHÔNG commit.
