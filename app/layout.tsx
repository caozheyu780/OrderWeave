import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'OrderWeave', applicationName: 'OrderWeave', description: 'OrderWeave — 小型餐饮商家的菜单、外卖订单与配送管理平台' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><head><meta name="theme-color" content="#20624b"/><link rel="stylesheet" href="/style.css"/></head><body>{children}</body></html>;
}
