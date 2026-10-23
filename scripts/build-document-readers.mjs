import {build} from 'esbuild';
import {mkdir,copyFile,readFile,writeFile,cp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),out=new URL('public/document-vendor/',root);
export async function buildDocumentReaders(){
  await mkdir(out,{recursive:true});
  await build({entryPoints:[fileURLToPath(new URL('scripts/document-reader-worker.mjs',root))],outfile:fileURLToPath(new URL('reader-worker.js',out)),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,external:['./pdf.mjs'],legalComments:'eof'});
  for(const name of ['pdf.mjs','pdf.worker.mjs'])await copyFile(new URL('node_modules/pdfjs-dist/legacy/build/'+name,root),new URL(name,out));
  for(const name of ['cmaps','standard_fonts'])await cp(new URL('node_modules/pdfjs-dist/'+name,root),new URL(name,out),{recursive:true});
  await writeFile(new URL('LICENSES.txt',out),await Promise.all([
    ['SheetJS','xlsx/LICENSE'],['fflate','fflate/LICENSE'],['PDF.js','pdfjs-dist/LICENSE']
  ].map(async([name,path])=>'=== '+name+' ===\n'+await readFile(new URL('node_modules/'+path,root),'utf8'))).then(parts=>parts.join('\n\n')));
}
if(process.argv[1]===fileURLToPath(import.meta.url))await buildDocumentReaders();
