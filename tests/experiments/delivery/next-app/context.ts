import { openHttpFixture } from '../../identity/fixture.ts';
import { createCase, defaults, type Case, type Scenario } from '../fixture.ts';
const state = globalThis as typeof globalThis & {
  deliveryCases?: Map<string, Case>;
  deliveryAuth?: ReturnType<typeof openHttpFixture>;
};
export const cases = (state.deliveryCases ??= new Map());
export function create(id: string, input: Partial<Scenario>) {
  const probe = createCase({ ...defaults, ...input });
  cases.set(id, probe);
  return probe;
}
export function getAuth() {
  state.deliveryAuth ??= openHttpFixture(
    process.env.DELIVERY_DATABASE!,
    process.env.DELIVERY_CONFIG!,
    process.env.BETTER_AUTH_SECRET!,
  );
  return state.deliveryAuth.getAuth();
}
