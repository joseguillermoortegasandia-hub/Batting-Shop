"""Crea derivados de referencias locales; no publica ni cambia originales."""
from pathlib import Path
from PIL import Image,ImageOps
import argparse,io
def main():
 parser=argparse.ArgumentParser();parser.add_argument('source',type=Path);parser.add_argument('output',type=Path);args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
 for path in sorted(args.source.iterdir()):
  if path.suffix.lower() not in {'.jpg','.jpeg','.png','.webp'}:continue
  with Image.open(path) as original:
   im=ImageOps.exif_transpose(original).convert('RGB');im.thumbnail((1600,1600))
   im.save(args.output/(path.stem+'.webp'),'WEBP',quality=82)
   thumb=im.copy();thumb.thumbnail((480,480));thumb.save(args.output/(path.stem+'.thumb.webp'),'WEBP',quality=82)
   jpg=im.copy();jpg.thumbnail((1200,1200));quality=85
   while True:
    data=io.BytesIO();jpg.save(data,'JPEG',quality=quality,optimize=True)
    if len(data.getvalue())<=300*1024:break
    if quality>45:quality-=10
    else:jpg.thumbnail((int(jpg.width*.8),int(jpg.height*.8)));quality=75
   (args.output/(path.stem+'.og.jpg')).write_bytes(data.getvalue())
   print(path.name,'->',len(data.getvalue()),'bytes JPG')
if __name__=='__main__':main()
