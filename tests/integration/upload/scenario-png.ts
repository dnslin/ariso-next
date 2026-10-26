import { execa } from 'execa';

/** Independent successful uploads need distinct valid image bytes, including real pixel differences. */
export async function scenarioPng(color: string) {
  const { stdout } = await execa(
    'magick',
    ['-size', '16x12', `xc:${color}`, '-strip', 'png:-'],
    { encoding: 'buffer' },
  );
  return Buffer.from(stdout);
}
