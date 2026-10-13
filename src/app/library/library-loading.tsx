export function LibraryLoading() {
  return (
    <div
      data-testid="library-loading"
      role="status"
      aria-label="正在加载图片"
      className="grid gap-5"
    >
      <p className="text-sm">正在加载图片，请稍候。</p>
    </div>
  );
}
