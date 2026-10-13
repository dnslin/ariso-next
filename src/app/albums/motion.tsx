'use client';

import { type ComponentProps } from 'react';
import { motion } from 'motion/react';
import { AlbumCard } from './card';
import { ComponentEntrance } from '../../components/component-entrance';
import { componentEase, useReducedMotion } from '../../components/motion';

export function AnimatedAlbumCard({
  index,
  ...props
}: ComponentProps<typeof AlbumCard> & {
  index: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      layout={reduce ? false : 'position'}
      transition={{ duration: 0.24, ease: componentEase }}
      className="min-w-0"
    >
      <ComponentEntrance delay={Math.min(index, 3) * 0.055} className="min-w-0">
        <AlbumCard {...props} />
      </ComponentEntrance>
    </motion.div>
  );
}
