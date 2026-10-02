'use client';

import { createContext, useContext, type ReactNode } from 'react';
import {
  createModule,
  type ComponentProps,
  type Plugin,
} from 'yet-another-react-lightbox';

export const ViewerLayoutContext = createContext<{
  header: ReactNode;
  versions: ReactNode;
  information: ReactNode;
  footer: ReactNode;
  ratio: string;
  zoomed: boolean;
} | null>(null);

function ViewerLayout({ children }: ComponentProps) {
  const layout = useContext(ViewerLayoutContext);
  if (!layout) throw new Error('Viewer layout requires its image context');
  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-start gap-3 px-4 pt-[max(16px,env(safe-area-inset-top))] xl:px-8">
        {layout.header}
      </header>
      <div className="mx-auto mt-6 w-full max-w-168 shrink-0 px-4">
        {layout.versions}
      </div>
      <div
        data-testid="viewer-body"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-[clamp(24px,calc((100dvh-548px)/3),98px)] md:pt-6 xl:px-8"
      >
        <div className="mx-auto w-full max-w-250">
          <div
            data-testid="viewer-stage"
            style={{ aspectRatio: layout.ratio }}
            className={`relative max-h-[max(160px,calc(100dvh-330px))] w-full overflow-hidden ${layout.zoomed ? 'rounded-none' : 'rounded-xl'}`}
          >
            {children}
          </div>
          <div className="mt-5 grid gap-3 pb-5 text-sm leading-[22px]">
            {layout.information}
          </div>
        </div>
      </div>
      <footer
        data-testid="viewer-footer"
        className="grid shrink-0 grid-cols-3 gap-3 px-4 pt-4 pb-[max(16px,env(safe-area-inset-bottom))] xl:px-8"
      >
        {layout.footer}
      </footer>
    </div>
  );
}

// The controller measures only the picture stage; Fullscreen includes the chrome.
export const ViewerLayoutPlugin: Plugin = ({ addParent }) => {
  addParent('controller', createModule('viewer-layout', ViewerLayout));
};
