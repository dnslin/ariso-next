// Isolated design samples, never returned by a product API.
export const rankingCounts = [186, 164, 138, 124, 112, 86, 72, 64, 46, 42];
export function imageSample(index: number) {
  const ratio = rankingCounts[index] / 186;
  const versions = [862, 284, 102].map((count) => Math.round(count * ratio));
  return {
    versions,
    cumulative: versions.reduce((sum, count) => sum + count, 0),
    periods: [186, 624, 1032].map((count) => Math.round(count * ratio)),
  };
}

export function trendSample(days: number) {
  const history = [
    142, 158, 151, 186, 163, 216, 193, 178, 210, 236, 205, 258, 224, 186,
  ];
  return Array.from({ length: days }, (_, i) => ({
    date: new Date(Date.UTC(2026, 9, 9 - days + i + 1))
      .toISOString()
      .slice(5, 10)
      .replace('-', '/'),
    count: i === days - 1 ? 186 : history[(90 - days + i) % history.length],
  }));
}
