import fs from 'node:fs/promises';
import {importarCatalogo} from '../src/data/product-import.js';
import {prepararCatalogo} from '../src/domain/products.js';
const args=process.argv.slice(2);
const option=name=>args[args.indexOf(name)+1];
const file=args.includes('--file') ? option('--file') : 'data/produtos-advance.json';
const catalog=JSON.parse(await fs.readFile(file,'utf8'));
const prepared=prepararCatalogo(catalog);
if(args.includes('--validate-only')) {
    console.log('Catálogo validado: ' + prepared.products.length + ' produtos, IDs únicos e todas as propriedades preservadas.');
} else {
    const {applicationDefault, cert, initializeApp} = await import('firebase-admin/app');
    const {getFirestore} = await import('firebase-admin/firestore');
    const credential=args.includes('--service-account') ? cert(JSON.parse(await fs.readFile(option('--service-account'),'utf8'))) : applicationDefault();
    const app=initializeApp({credential,projectId:'banco-de-dados-monitor'});
    const db=getFirestore(app);
    const count=await importarCatalogo(catalog,{
        commit:async writes=>{const batch=db.batch();for(const item of writes)batch.set(db.collection(item.collection).doc(item.id),item.data);await batch.commit();},
        read:async (collection,id)=>(await db.collection(collection).doc(id).get()).data(),
        progress:(done,total)=>console.log('Gravados '+done+'/'+total+' documentos; verificando propriedades...')
    });
    console.log(count+' produtos cadastrados e verificados no Firebase.');
}
