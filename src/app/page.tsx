import Image from 'next/image';

export default function HomePage() {
  return (
    <main style={{ maxWidth: 640, margin: '12vh auto', padding: '0 24px' }}>
      <Image src="/runtime.svg" alt="" width={64} height={64} priority />
      <h1 style={{ fontSize: 40, marginBottom: 8 }}>Ariso</h1>
      <p>单用户，自托管图床。</p>
      <section
        aria-labelledby="runtime-heading"
        style={{
          marginTop: 32,
          padding: 24,
          background: '#e3f6f5',
          borderRadius: 16,
        }}
      >
        <h2 id="runtime-heading" style={{ fontSize: 20, marginTop: 0 }}>
          运行基础建设中
        </h2>
        <p>当前已接通基础页面与本地静态资源。</p>
        <p style={{ marginBottom: 0 }}>账号初始化、登录和图片上传尚未开放。</p>
      </section>
    </main>
  );
}
