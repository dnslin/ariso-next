'use client';

import { usePathname, useRouter } from 'next/navigation';
import { toast } from '@heroui/react';
import { Frame } from './frame';
import { Gallery } from './gallery';
import { Editor } from './editor';
import { Results } from './results';
import TemplatesPage from './templates-page';
import BatchPage from './batch-page';
import { useDemo } from './store';

export function Prototype() {
  const pathname = usePathname();
  const router = useRouter();
  const demo = useDemo();
  return (
    <Frame>
      {pathname === '/editor' ? (
        <Editor />
      ) : pathname === '/templates' ? (
        <TemplatesPage
          templates={demo.templates}
          onApply={(template) => {
            demo.setTemplateId(template.id);
            router.push('/batch');
          }}
          onRename={(id, name) => {
            demo.setTemplates((all) =>
              all.map((item) => (item.id === id ? { ...item, name } : item)),
            );
            toast.success('模板已重命名');
          }}
          onDelete={(id) => {
            demo.setTemplates((all) => all.filter((item) => item.id !== id));
            if (demo.templateId === id)
              demo.setTemplateId(
                demo.templates.find((item) => item.id !== id)?.id ?? '',
              );
            toast.success('模板已删除');
          }}
          onCreate={() => demo.openEditor(demo.currentId)}
        />
      ) : pathname === '/batch' ? (
        <BatchPage
          images={demo.images}
          templates={demo.templates}
          selectedIds={demo.selectedIds}
          onToggle={demo.toggleImage}
          templateId={demo.templateId}
          onTemplateChange={demo.setTemplateId}
          onStart={demo.startBatch}
          onBack={() => router.push('/library')}
        />
      ) : pathname === '/results' ? (
        <Results />
      ) : (
        <Gallery />
      )}
    </Frame>
  );
}
