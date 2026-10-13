'use client';

import {
  createElement,
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
} from 'react';
import { useAnimate } from 'motion/react';
import { componentEntryTransition, getReducedMotion } from './motion';

/** Enter actual content once on mount; ordinary updates keep it in place. */
export function ComponentEntrance({
  as = 'div',
  delay = 0,
  className = '',
  style,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'section' | 'header' | 'h1' | 'article' | 'li' | 'form' | 'p';
  delay?: number;
}) {
  const initialDelay = useRef(delay);
  const [scope, animate] = useAnimate<HTMLElement>();
  useLayoutEffect(() => {
    // Read the client preference before starting; hydration uses the server snapshot.
    const reduce = getReducedMotion();
    const controls = animate(
      scope.current,
      {
        opacity: [0, 1],
        transform: reduce ? ['none', 'none'] : ['translateY(10px)', 'none'],
      },
      componentEntryTransition(reduce, reduce ? 0 : initialDelay.current),
    );
    return () => controls.complete();
  }, [animate, scope]);
  return createElement(as, {
    ...props,
    ref: scope,
    'data-component-entry': '',
    className: `ariso-component ${className}`,
    style: { ...style, opacity: 0, transform: 'translateY(10px)' },
  });
}
