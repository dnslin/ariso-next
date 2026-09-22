import { PublicShell } from '../components/shell/public-shell';

export default function NotFound() {
  return (
    <PublicShell>
      <section className="public-message">
        <h1>页面不存在</h1>
        <p>此地址尚未开放，或页面已移除。</p>
      </section>
    </PublicShell>
  );
}
