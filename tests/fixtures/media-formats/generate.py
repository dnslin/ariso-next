"""Reproduce original CC0 geometric media fixtures with ImageMagick/libheif.
APNG bytes follow https://www.w3.org/TR/png-3/#apng-chunks.
Run from any directory; Python 3 standard library only.
"""
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import zlib

ROOT = Path(__file__).resolve().parent

def run(*args):
    subprocess.run(args, cwd=ROOT, check=True)

def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))

def raster(color):
    return zlib.compress(b''.join(b'\0' + bytes(color) * 64 for _ in range(48)))

def apng(name, poster):
    header = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB',64,48,8,6,0,0,0))
    header += chunk(b'acTL', struct.pack('>II',2,0))
    if poster:
        header += chunk(b'IDAT', raster([0,0,255,255]))
    seq = 0
    for i,color in enumerate(([255,0,0,255],[0,255,0,255])):
        header += chunk(b'fcTL', struct.pack('>IIIIIHHBB',seq,64,48,0,0,1,5,0,0)); seq += 1
        if i == 0 and not poster:
            header += chunk(b'IDAT',raster(color))
        else:
            header += chunk(b'fdAT',struct.pack('>I',seq)+raster(color)); seq += 1
    (ROOT/name).write_bytes(header + chunk(b'IEND',b''))

run('magick','-size','64x48','xc:red','-fill','lime','-draw','rectangle 32,0 63,23','-fill','blue','-draw','rectangle 0,24 31,47','-fill','white','-draw','rectangle 32,24 63,47','PNG32:source.png')
run('magick','-size','64x48','xc:lime','PNG32:second.png')
run('magick','source.png','-alpha','set','-channel','A','-evaluate','set','50%','PNG32:alpha.png')
for suffix in ('jpg','webp','avif','bmp','tiff'):
    run('magick','source.png','-quality','95',f'static.{suffix}')
run('heif-enc','-L','alpha.png','-o','alpha.heic')
run('heif-enc','-L','--no-alpha','-t','16','source.png','-o','thumbnail.heic')
# A real encoded monochrome auxiliary plane becomes a constant depth map by
# changing only its standardized auxiliary type, with no container parser.
# libheif recognizes auxid:2 as depth (heif-info reports one 64x48 depth image).
alpha_bytes = (ROOT/'alpha.heic').read_bytes()
alpha_type = b'urn:mpeg:hevc:2015:auxid:1'
assert alpha_bytes.count(alpha_type) == 1
(ROOT/'depth.heic').write_bytes(alpha_bytes.replace(alpha_type, b'urn:mpeg:hevc:2015:auxid:2'))

run('heif-enc','-A','-L','alpha.png','-o','alpha.avif')
run('heif-enc','-L','--no-alpha','--rotate-cw','90','source.png','-o','oriented.heic')
run('heif-enc','-L','--no-alpha','--flip-h','source.png','-o','mirrored.heic')
run('magick','source.png','static.gif')
run('magick','-size','24x16','xc:none','-fill','red','-draw','rectangle 1,1 23,15','-page','64x48+20+12','-delay','20','(','-size','24x16','xc:lime','-page','64x48+20+12',')','-loop','0','offset.gif')
run('heif-enc','-L','--no-alpha','source.png','second.png','-o','multiple.heic')
run('heif-enc','-A','-L','--no-alpha','source.png','second.png','-o','multiple.avif')
# Controlled fixture edit: ISO/IEC 14496-12 PrimaryItemBox version 0 uses a
# 16-bit item_ID. Reference implementation:
# https://github.com/strukturag/libheif/blob/master/libheif/box.cc (Box_pitm).
# We only edit the unique exact box produced by our two-image encoder input.
for extension in ('heic', 'avif'):
    original = (ROOT / ('multiple.' + extension)).read_bytes()
    primary_one = struct.pack('>I4sIH', 14, b'pitm', 0, 1)
    primary_two = struct.pack('>I4sIH', 14, b'pitm', 0, 2)
    assert original.count(b'pitm') == 1
    assert original.count(primary_one) == 1
    updated = original.replace(primary_one, primary_two)
    assert len(updated) == len(original)
    assert updated.count(primary_two) == 1
    (ROOT / ('primary-second.' + extension)).write_bytes(updated)
run('heif-enc','-A','-L','--no-alpha','-S','--fps','5','source.png','second.png','-o','animated.avif')
run('magick','-delay','20','source.png','second.png','-loop','0','animated.gif')
run('magick','-delay','20','source.png','second.png','-loop','0','animated.webp')
run('magick','source.png','second.png','multiple.tiff')
run('magick','source.png','-define','icon:auto-resize=64,32,16','multiple.ico')
apng('animated.png',False)
apng('poster.png',True)
(ROOT/'static.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48"><path fill="red" d="M0 0h32v24H0z"/><path fill="lime" d="M32 0h32v24H32z"/><path fill="blue" d="M0 24h32v24H0z"/><path fill="white" d="M32 24h32v24H32z"/></svg>\n')

samples=[]
def add(file, fmt, classification='static', **expected):
    entry={'id':Path(file).stem+'-'+Path(file).suffix[1:],'file':file,'source':'Original Ariso geometric artwork; reproducible with generate.py (ImageMagick 7.1.2-32 / libheif 1.23.5).','license':'CC0-1.0','sha256':hashlib.sha256((ROOT/file).read_bytes()).hexdigest(),'expected':{'format':fmt,'width':64,'height':48,'classification':classification,**expected},'preview':{'input':file+'[0]','width':64,'height':48,'pixels':[{'x':8,'y':8,'rgba':[255,0,0,255],'tolerance':20},{'x':48,'y':8,'rgba':[0,255,0,255],'tolerance':20},{'x':8,'y':36,'rgba':[0,0,255,255],'tolerance':20},{'x':48,'y':36,'rgba':[255,255,255,255],'tolerance':20}]}}
    samples.append(entry)
    return entry
add('source.png','PNG')
for ext,fmt in [('jpg','JPEG'),('webp','WEBP'),('avif','AVIF'),('bmp','BMP'),('tiff','TIFF')]: add('static.'+ext,fmt)
add('thumbnail.heic','HEIC',primaryImages=1,thumbnails=1)
add('depth.heic','HEIC',primaryImages=1,auxiliaryImages=1,depthImages=1)
s=add('alpha.heic','HEIC',primaryImages=1,auxiliaryImages=1)
for p in s['preview']['pixels']: p['rgba'][3]=128
for file,fmt in [('multiple.heic','HEIC'),('multiple.avif','AVIF')]: add(file,fmt,'container',primaryImages=2,auxiliaryImages=0,pages=2)
for extension, fmt in [('heic', 'HEIC'), ('avif', 'AVIF')]:
    sample = add('primary-second.' + extension, fmt, 'container', primaryImages=2, auxiliaryImages=0, pages=2)
    for pixel in sample['preview']['pixels']:
        pixel['rgba'] = [0, 255, 0, 255]
for file,fmt in [('animated.avif','AVIF'),('animated.gif','GIF'),('animated.webp','WEBP')]: add(file,fmt,'animation',frames=2)
add('multiple.tiff','TIFF','container',pages=2)
s=add('multiple.ico','ICO','container',pages=3)
s['expected'].update(width=64,height=64)
s['preview'].update(width=64,height=64,pixels=[{'x':8,'y':8,'rgba':[255,0,0,255],'tolerance':20}])
for file in ['animated.png','poster.png']:
    s=add(file,'PNG','animation',frames=2)
    s['preview'].update(input='APNG:'+file+'[0]',pixels=[{'x':8,'y':8,'rgba':[255,0,0,255],'tolerance':20}])
    s['expected']['defaultImageIsFrame']=file=='animated.png'
add('static.svg','SVG','container',pages=1)
add('static.gif','GIF','container',frames=1)
s=add('alpha.avif','AVIF',primaryImages=1,auxiliaryImages=1)
for p in s['preview']['pixels']: p['rgba'][3]=128
s=add('oriented.heic','HEIC',primaryImages=1,auxiliaryImages=0)
s['expected'].update(width=48,height=64)
s['preview'].update(width=48,height=64,pixels=[{'x':8,'y':8,'rgba':[0,0,255,255],'tolerance':20},{'x':36,'y':8,'rgba':[255,0,0,255],'tolerance':20},{'x':8,'y':48,'rgba':[255,255,255,255],'tolerance':20},{'x':36,'y':48,'rgba':[0,255,0,255],'tolerance':20}])
s=add('mirrored.heic','HEIC',primaryImages=1,auxiliaryImages=0)
for p in s['preview']['pixels']: p['x']=63-p['x']
s=add('offset.gif','GIF','animation',frames=2)
s['preview']['pixels']=[{'x':0,'y':0,'rgba':[0,0,0,0],'tolerance':20},{'x':24,'y':16,'rgba':[255,0,0,255],'tolerance':20}]
s['preview']['coalesce']=True
# These expectations derive from the generation instructions above, not tool output.
# ExifTool calls belong to verification and must never rewrite this oracle.
FILE_TYPES = {
    'depth.heic': 'HEIF', 'thumbnail.heic': 'HEIF',
    'source.png': 'PNG', 'static.jpg': 'JPEG', 'static.webp': 'WEBP',
    'static.avif': 'AVIF', 'static.bmp': 'BMP', 'static.tiff': 'TIFF',
    'alpha.heic': 'HEIF', 'multiple.heic': 'HEIF', 'multiple.avif': 'AVIF',
    'animated.avif': 'MP4', 'animated.gif': 'GIF', 'animated.webp': 'Extended WEBP',
    'multiple.tiff': 'TIFF', 'multiple.ico': 'ICO', 'animated.png': 'APNG',
    'poster.png': 'APNG', 'static.svg': 'SVG', 'static.gif': 'GIF',
    'alpha.avif': 'AVIF', 'oriented.heic': 'HEIF', 'mirrored.heic': 'HEIF',
    'offset.gif': 'GIF', 'primary-second.heic': 'HEIF', 'primary-second.avif': 'AVIF',
}
EXTRA_TAGS = {
    'depth.heic': {'QuickTime:Doc1:AuxiliaryImageType': 'urn:mpeg:hevc:2015:auxid:2'},
    'animated.png': {'PNG:Main:AnimationFrames': 2},
    'poster.png': {'PNG:Main:AnimationFrames': 2},
    'animated.gif': {'GIF:Main:FrameCount': 2},
    'offset.gif': {'GIF:Main:FrameCount': 2},
    'animated.webp': {'RIFF:Main:AnimationLoopCount': 0, 'RIFF:Main:Duration': 0.4},
    'multiple.tiff': {'File:Main:PageCount': 2},
    'multiple.ico': {'File:Main:ImageCount': 3},
    'alpha.heic': {'QuickTime:Doc1:AuxiliaryImageType': 'urn:mpeg:hevc:2015:auxid:1'},
    'alpha.avif': {'QuickTime:Doc1:AuxiliaryImageType': 'urn:mpeg:mpegB:cicp:systems:auxiliary:alpha'},
    'oriented.heic': {'QuickTime:Main:Rotation': 3},
    'mirrored.heic': {'QuickTime:Main:Mirroring': 1},
    'animated.avif': {'Track1:Main:Copy1:HandlerType': 'pict'},
}
for sample in samples:
    file = sample['file']
    tags = {'File:Main:FileType': FILE_TYPES[file], **EXTRA_TAGS.get(file, {})}
    if file.endswith(('.heic', '.avif')):
        tags.update({'QuickTime:Main:MajorBrand': 'avis' if file == 'animated.avif' else ('heix' if file.endswith('.heic') else 'avif'), 'QuickTime:Main:HandlerType': 'pict', 'Meta:Main:PrimaryItemReference': 2 if file.startswith('primary-second.') else 1})
    sample['expected']['nativeTags'] = tags
    if file not in ('animated.avif', 'animated.png', 'poster.png'):
        sample['expected']['decodedImages'] = sample['expected'].get('pages', sample['expected'].get('frames', 1))
(ROOT/'manifest.json').write_text(json.dumps({'version':1,'samples':samples},indent=2)+'\n')
