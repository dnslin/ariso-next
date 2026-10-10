import type { CSSProperties } from 'react';

const digits = Array.from({ length: 10 }, (_, digit) => digit);
const formatter = new Intl.NumberFormat('zh-CN');

/** Stable keys follow place value, so refreshes retarget each wheel in place. */
export function RollingNumber({ value }: { value: number }) {
  const formatted = formatter.format(value);
  return (
    <span
      className="inline-flex tracking-normal"
      role="img"
      aria-label={formatted}
    >
      <span aria-hidden="true" className="inline-flex">
        {[...formatted].map((character, index) =>
          /\d/.test(character) ? (
            <span
              className="inline-block h-[1.1em] w-[1ch] overflow-hidden"
              key={formatted.length - index}
            >
              <span
                data-testid="rolling-number-wheel"
                className="block [transform:translateY(var(--digit-offset))] transition-transform duration-[280ms] ease-(--ease-out-quint) starting:[transform:translateY(0)] motion-reduce:transition-none"
                style={
                  {
                    '--digit-offset': `${-Number(character) * 10}%`,
                  } as CSSProperties
                }
              >
                {digits.map((digit) => (
                  <span className="block h-[1.1em] leading-[1.1]" key={digit}>
                    {digit}
                  </span>
                ))}
              </span>
            </span>
          ) : (
            <span key={formatted.length - index}>{character}</span>
          ),
        )}
      </span>
    </span>
  );
}
