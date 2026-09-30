const channelName = 'ariso:library-changed';

/** Separate channels notify both the current document and other open owner tabs. */
export function notifyLibraryChanged() {
  const channel = new BroadcastChannel(channelName);
  channel.postMessage('changed');
  channel.close();
}

export function subscribeLibraryChanges(listener: () => void) {
  const channel = new BroadcastChannel(channelName);
  channel.onmessage = () => listener();
  return () => channel.close();
}
