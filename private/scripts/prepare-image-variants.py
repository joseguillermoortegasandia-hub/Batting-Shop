"""Genera WebP locales por tamaño a partir de copias de las fotos originales."""
from pathlib import Path
from PIL import Image, ImageOps
import argparse, hashlib, json

parser=argparse.ArgumentParser()
parser.add_argument('--manifest',required=True)
parser.add_argument('--output',default='public/assets/images/catalog')
parser.add_argument('--registry',default='public/data/image-variants.json')
args=parser.parse_args()
output=Path(args.output);output.mkdir(parents=True,exist_ok=True)
registry=json.loads(Path(args.registry).read_text(encoding='utf-8')) if Path(args.registry).exists() else {'overrides':{},'responsive':{}}
before=0;totals={str(side):0 for side in [320,480,960,1280,1600]}
for item in json.loads(Path(args.manifest).read_text(encoding='utf-8')):
 source=Path(item['file']);before+=source.stat().st_size
 digest=hashlib.sha256(source.read_bytes()+b'webp-responsive-v1').hexdigest()[:10]
 raw=Image.open(source).convert('RGBA')
 if raw.width*raw.height>40_000_000:raise ValueError('La foto supera los 40 megapíxeles.')
 image=Image.new('RGB',raw.size,'white');image.paste(raw,mask=raw.getchannel('A'))
 urls={}
 for side,quality in [(320,74),(480,78),(960,80),(1280,81),(1600,82)]:
  file=Path('public'+item['urls'][str(side)]) if item.get('reuse') else output/f"{item['id']}-{digest}-{side}.webp"
  if not file.exists():ImageOps.pad(image,(side,side),method=Image.Resampling.LANCZOS,color='white').save(file,quality=quality,method=6)
  urls[str(side)]='/'+file.relative_to('public').as_posix()
  totals[str(side)]+=file.stat().st_size
 registry['overrides'][item['storagePath']]=urls['1600']
 if item.get('thumbnailPath'):registry['overrides'][item['thumbnailPath']]=urls['480']
 registry['responsive'][urls['1600']]=urls
 print('Preparada',item['id'],flush=True)
Path(args.registry).parent.mkdir(parents=True,exist_ok=True)
Path(args.registry).write_text(json.dumps(registry,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
report={'photos':len(registry['responsive']),'sourceBytes':before,'bytesBySize':totals}
Path(args.manifest).with_name('report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report),flush=True)
