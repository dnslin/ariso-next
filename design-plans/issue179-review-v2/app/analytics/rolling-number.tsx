import type { CSSProperties } from 'react';

const digits = Array.from({ length: 10 }, (_, digit) => digit);

export function RollingNumber({ value }: { value: number }) {
  const formatted = value.toLocaleString('zh-CN');
  return (
    <span className="rolling-number" role="img" aria-label={formatted}>
      <span aria-hidden="true" className="rolling-number-digits">
        {[...formatted].map((character, index) =>
          /\d/.test(character) ? (
            <span className="number-slot" key={formatted.length - index}>
              <span
                className="number-wheel"
                style={
                  {
                    '--digit-offset': `${-Number(character) * 10}%`,
                  } as CSSProperties
                }
              >
                {digits.map((digit) => (
                  <span key={digit}>{digit}</span>
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
