"""Vista local: rutas de Pages, loopback y sin caché de archivos de desarrollo."""
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
import argparse,re

ROOT=Path(__file__).resolve().parents[2]

def main():
 parser=argparse.ArgumentParser()
 parser.add_argument('--port',type=int,required=True)
 parser.add_argument('--directory',required=True)
 args=parser.parse_args()
 directory=Path(args.directory).resolve()
 if directory not in [ROOT/'dist',ROOT/'dist-panel']:
  parser.error('Solo se puede servir dist o dist-panel de este proyecto.')
 if not (directory/'index.html').is_file():parser.error('Compila la aplicación antes de iniciar la vista local.')
 class Handler(SimpleHTTPRequestHandler):
  def __init__(self,*values,**kwargs):super().__init__(*values,directory=str(directory),**kwargs)
  def send_head(self):
   path=urlsplit(self.path).path
   if directory==ROOT/'dist':
    if re.fullmatch(r'/producto/[a-z0-9-]{1,160}/?',path):self.path='/producto/index.html'
    elif path in ['/catalogo','/tallas','/favoritos']:self.path=path+'.html'
   # Evitar un 304 con contenido anterior al reconstruir dentro del mismo segundo.
   if 'If-Modified-Since' in self.headers:del self.headers['If-Modified-Since']
   return super().send_head()
  def end_headers(self):
   self.send_header('Cache-Control','no-store')
   super().end_headers()
 with ThreadingHTTPServer(('127.0.0.1',args.port),Handler) as server:
  print(f'Vista local en http://localhost:{args.port}/',flush=True)
  server.serve_forever()

if __name__=='__main__':main()
