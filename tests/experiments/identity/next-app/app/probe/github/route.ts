import { getGithubExperiment } from '../../../context.ts';

export function POST(request: Request) {
  return getGithubExperiment().manage(request);
}
export const DELETE = POST;
