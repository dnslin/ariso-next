import { Skeleton } from '@heroui/react/skeleton';

export function LibraryLoading() {
  return (
    <div
      data-testid="library-loading"
      role="status"
      aria-label="正在加载图片"
      className="grid gap-5"
    >
      <p className="text-sm">正在加载图片，请稍候。</p>
      <div
        aria-hidden="true"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 xl:gap-5"
      >
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-52 rounded-2xl xl:h-68" />
        ))}
      </div>
    </div>
  );
}
