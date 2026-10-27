import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const output=resolve(process.argv[2]||'/tmp/shimanami-apps-script');
await mkdir(output,{recursive:true});
for(const name of ['Code.gs','Connection.gs','appsscript.json'])await writeFile(join(output,name),await readFile(new URL('../apps-script/'+name,import.meta.url)));
const logo='data:image/png;base64,'+(await readFile(new URL('../assets/brand/shimanami-logo.png',import.meta.url))).toString('base64');
await writeFile(join(output,'Admin.html'),(await readFile(new URL('../apps-script/Admin.html',import.meta.url),'utf8')).replace('__LOGO_DATA__',logo));
console.log(output);
