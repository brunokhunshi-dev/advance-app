import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js';
import {getAuth, onAuthStateChanged, signInWithEmailAndPassword} from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js';
import {getFirestore, writeBatch, doc, getDocFromServer} from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js';
import {firebaseConfig} from '../../firebase-config.js';
import {importarCatalogo} from '../data/product-import.js';
import {prepararCatalogo} from '../domain/products.js';
const app=initializeApp(firebaseConfig), auth=getAuth(app), db=getFirestore(app);
const form=document.getElementById('login-form'), button=document.getElementById('import-products'), status=document.getElementById('status');
let catalog, busy=false;
try {
    const response=await fetch(new URL('../../data/produtos-advance.json', import.meta.url));
    if(!response.ok)throw new Error('Não foi possível abrir o catálogo.');
    catalog=await response.json();
    const prepared=prepararCatalogo(catalog);
    document.getElementById('catalog-summary').textContent=prepared.products.length+' produtos · Projeto '+firebaseConfig.projectId;
} catch(error){status.textContent=error.message;}
onAuthStateChanged(auth,user=>{
    form.hidden=!!user;
    document.getElementById('account').textContent=user?'Conectado: '+user.email:'';
    button.disabled=!user || !catalog || busy;
});
form.addEventListener('submit',async event=>{
    event.preventDefault();
    try {await signInWithEmailAndPassword(auth,form.elements.email.value,form.elements.password.value);form.elements.password.value='';status.textContent='';}
    catch {status.textContent='Não foi possível entrar. Confira sua conta do Advance Check.';}
});
button.addEventListener('click',async()=>{
    if(busy || !auth.currentUser || !catalog)return;
    busy=true;button.disabled=true;status.textContent='Cadastrando produtos...';
    try {
        const count=await importarCatalogo(catalog,{
            commit:async writes=>{const batch=writeBatch(db);for(const item of writes)batch.set(doc(db,item.collection,item.id),item.data);await batch.commit();},
            read:async (collection,id)=>(await getDocFromServer(doc(db,collection,id))).data(),
            progress:()=>{status.textContent='Produtos gravados. Conferindo todas as propriedades...';}
        });
        status.textContent=count+' produtos cadastrados e verificados no Firebase.';
    } catch(error) {
        status.textContent=error.code==='permission-denied'?'Esta conta não tem permissão para cadastrar produtos. Use uma conta autorizada ou o importador administrativo.':error.message || 'Não foi possível concluir a importação.';
    } finally {busy=false;button.disabled=!auth.currentUser;}
});
