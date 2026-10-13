'use client';

import { motion, type HTMLMotionProps } from 'motion/react';
import { componentEntryTransition, useReducedMotion } from './motion';

const elements = {
  div: motion.div,
  section: motion.section,
  header: motion.header,
  h1: motion.h1,
  article: motion.article,
  li: motion.li,
  form: motion.form,
  p: motion.p,
};

/** Enter actual content once on mount; ordinary updates keep it in place. */
export function ComponentEntrance({
  as = 'div',
  delay = 0,
  className = '',
  ...props
}: Omit<
  HTMLMotionProps<'section'>,
  'initial' | 'animate' | 'transition' | 'exit' | 'ref'
> & { as?: keyof typeof elements; delay?: number }) {
  const reduce = useReducedMotion();
  const Component = elements[as];
  return (
    <Component
      {...props}
      data-component-entry
      className={`ariso-component ${className}`}
      initial={{ opacity: 0, transform: 'translateY(10px)' }}
      animate={{ opacity: 1, transform: 'none' }}
      transition={componentEntryTransition(reduce, reduce ? 0 : delay)}
    />
  );
}
