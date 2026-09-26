import { cookies } from 'next/headers';

/** 在服务端首屏读取浏览器偏好，避免切换页面时先展开再收起。 */
export async function readSidebarCollapsed() {
  return (await cookies()).get('ariso.sidebar-collapsed')?.value === 'true';
}
