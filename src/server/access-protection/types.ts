export type AccessProtectionInput = {
  mode: 'off' | 'observe' | 'enforce';
  rate: number;
  burst: number;
};

export type AccessProtectionSettingsResponse = AccessProtectionInput & {
  updatedAt: string;
  clientIp: { ready: boolean; message: string | null };
};
