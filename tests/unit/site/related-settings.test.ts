import { expect, it } from 'vitest';
import { defaultStorageLabel } from '../../../src/components/site/related-settings';
import type { StorageSummary } from '../../../src/components/storage/storage-api';

const storage = {
  id: 'default',
  name: '本地归档',
  enabled: true,
} as StorageSummary;
it('默认为空或停用时明确展示，不根据其他可用配置补选', () => {
  expect(
    defaultStorageLabel({ id: 1, defaultStorageId: null }, [storage]),
  ).toBe('未设置');
  expect(
    defaultStorageLabel({ id: 1, defaultStorageId: storage.id }, [storage]),
  ).toBe('本地归档');
  expect(
    defaultStorageLabel({ id: 1, defaultStorageId: storage.id }, [
      { ...storage, enabled: false },
      { ...storage, id: 'another', name: '其他可用' },
    ]),
  ).toBe('本地归档（已停用）');
  expect(
    defaultStorageLabel({ id: 1, defaultStorageId: 'deleted' }, [storage]),
  ).toBe('默认存储不存在，请核对');
});
