import { Suspense } from 'react';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { LibraryProbe } from './probe';

export default function Page() {
  return (
    <main className="mx-auto grid max-w-5xl gap-4 p-4 md:p-8">
      <h1 className="text-2xl font-bold">查询与查看器接入验证</h1>
      <p>EV-LIBRARY-01 隔离夹具，不是正式图库。图片使用本地测试样本。</p>
      <Suspense fallback={<p>正在加载查询参数</p>}>
        <NuqsAdapter>
          <LibraryProbe />
        </NuqsAdapter>
      </Suspense>
    </main>
  );
}
