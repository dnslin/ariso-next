/* Protocol probe only. No product UI or production client imports this file. */
(() => {
  const initial = window.sharingInitial;
  let generation = 0;
  let activeRefresh;
  const controllers = new Set();
  const probe = {
    status: initial.status,
    showName: initial.showName,
    layout: initial.layout,
    items: initial.items ?? [],
    applied: 0,
    ignored: 0,
    aborted: 0,
    errors: [],
    batches: [],
    visibility: document.visibilityState,
    invalidate() {
      generation++;
      for (const controller of controllers) controller.abort();
      controllers.clear();
      activeRefresh = undefined;
    },
    async load(kind) {
      const expected = generation;
      const controller = new AbortController();
      controllers.add(controller);
      try {
        const response = await fetch(`/s/${initial.token}/${kind}`, {
          signal: controller.signal,
        });
        const body = await response.json();
        if (expected !== generation) {
          probe.ignored++;
          return;
        }
        if (!response.ok) {
          probe.invalidate();
          probe.status = response.status;
          probe.items = [];
          document.getElementById('status').textContent = String(probe.status);
          return;
        }
        if (probe.showName !== body.showName) probe.invalidate();
        probe.showName = body.showName;
        probe.layout = body.layout;
        probe.items = body.items;
        probe.applied++;
      } catch (error) {
        if (controller.signal.aborted) probe.aborted++;
        else probe.errors.push(String(error));
      } finally {
        controllers.delete(controller);
      }
    },
    async refresh() {
      if (
        activeRefresh ||
        document.visibilityState !== 'visible' ||
        probe.status !== 200
      )
        return;
      const operation = {};
      activeRefresh = operation;
      const expected = generation;
      // Only independent IDs are needed by this operation, not full image DTOs.
      const ids = probe.items.map((item) => item.id);
      try {
        for (let offset = 0; offset < Math.max(ids.length, 1); offset += 80) {
          if (expected !== generation || document.visibilityState !== 'visible')
            break;
          const batch = ids.slice(offset, offset + 80);
          const controller = new AbortController();
          controllers.add(controller);
          try {
            probe.batches.push(batch.length);
            const response = await fetch(`/s/${initial.token}/refresh`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids: batch }),
              signal: controller.signal,
            });
            const body = await response.json();
            if (expected !== generation) {
              probe.ignored++;
              break;
            }
            if (!response.ok) {
              probe.invalidate();
              probe.status = response.status;
              probe.items = [];
              document.getElementById('status').textContent = String(
                probe.status,
              );
              break;
            }
            const visible = new Map(body.items.map((item) => [item.id, item]));
            const checked = new Set(batch);
            probe.items = probe.items.flatMap((item) =>
              checked.has(item.id)
                ? visible.has(item.id)
                  ? [visible.get(item.id)]
                  : []
                : [item],
            );
            probe.layout = body.layout;
            if (probe.showName !== body.showName) {
              probe.showName = body.showName;
              probe.invalidate();
              if (!body.showName)
                probe.items = probe.items.map(({ id }) => ({ id }));
              break;
            }
            probe.applied++;
          } finally {
            controllers.delete(controller);
          }
        }
      } catch (error) {
        if (expected !== generation) probe.aborted++;
        else probe.errors.push(String(error));
      } finally {
        if (activeRefresh === operation) activeRefresh = undefined;
      }
    },
  };
  window.sharingProbe = probe;
  const timer = setInterval(() => {
    void probe.refresh();
  }, 5000);
  document.addEventListener('visibilitychange', () => {
    probe.visibility = document.visibilityState;
    if (document.visibilityState === 'visible') void probe.refresh();
    else probe.invalidate();
  });
  window.addEventListener(
    'pagehide',
    () => {
      clearInterval(timer);
      probe.invalidate();
    },
    { once: true },
  );
})();
