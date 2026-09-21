import { Probe } from './probe';
export default function Page() {
  return (
    <main className="mx-auto grid max-w-3xl gap-6 p-4 md:p-8">
      <h1 className="text-2xl font-bold">前端依赖组合验证</h1>
      <p>EV-UI-01 隔离实验，不保存业务数据。</p>
      <Probe />
    </main>
  );
}
