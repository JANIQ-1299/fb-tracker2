import "./globals.css";

export const metadata = {
  title: "نظام تتبع الطلبات - Meta",
  description: "لوحة تحكم تتبع العملاء المحتملين والطلبات من إعلانات Meta",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
