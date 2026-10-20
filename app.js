const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ROLES={admin:'Admin',ppbk:'PPBK',capten:'Capten Logistik',asisten:'Asisten Capten',logistik:'Logistik',relawan:'Relawan Lain'};
const URG={high:'High',normal:'Normal',low:'Low'},URGO={high:0,normal:1,low:2};
const MID=['relawan','logistik','asisten','capten'];
let auth,fs,me=null,unsubs=[],dataUn=[],started=false,ensuring=false,firstSnap={};
let items=[],txs=[],reqs=[],shop=[],users=[],notifs=[];
let view='stok',scanMode='info',scanner=null,q='',pTab='req',lTab='riwayat',authMode='login',tm=null;
const isBoss=()=>me&&['admin','ppbk'].includes(me.role);
const isStaff=()=>me&&['admin','ppbk','capten','asisten'].includes(me.role);
const isMember=()=>me&&me.role!=='relawan';
const byId=id=>items.find(i=>i.id===id);
const byCode=c=>items.find(i=>i.code.toLowerCase()===String(c).trim().toLowerCase());
const isLow=i=>i.stock<=i.min;
const fmt=t=>new Date(t).toLocaleString('id-ID',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const safeUrl=u=>/^https?:\/\//i.test(u||'')?u:'';
const uname=id=>(users.find(u=>u.id===id)||{}).name||'?';
const err=e=>alert('Gagal: '+(e&&e.code==='permission-denied'?'kamu tidak punya izin untuk aksi ini.':(e&&e.message)||e));
function nextCode(){let n=items.length+1,c;do{c='BRG-'+String(n++).padStart(4,'0')}while(byCode(c));return c}
const usersWith=(...r)=>users.filter(u=>r.includes(u.role)&&u.id!==me.id).map(u=>u.id);
const nfy=(b,uids,text)=>uids.forEach(u=>b.set(fs.collection('notifs').doc(),{to:u,text,at:Date.now(),read:false}));

/* ---------- BOOT & AUTH ---------- */
function boot(){
  if(!FIREBASE_CONFIG.projectId){$('#app').innerHTML='<div class="card"><h1>Firebase belum diatur</h1><p>Buka <code>config.js</code>, isi <code>FIREBASE_CONFIG</code> di bagian atas script dengan config dari Firebase Console, lalu muat ulang.</p></div>';return}
  firebase.initializeApp(FIREBASE_CONFIG);auth=firebase.auth();fs=firebase.firestore();
  auth.onAuthStateChanged(u=>{
    stopAll();me=null;started=false;ensuring=false;
    if(!u){render();return}
    unsubs.push(fs.doc('users/'+u.uid).onSnapshot(s=>{
      if(!s.exists){if(u.providerData.some(p=>p.providerId==='google.com')&&!ensuring){ensuring=true;const em=u.email||'';fs.doc('users/'+u.uid).set({name:u.displayName||em.split('@')[0],username:em.split('@')[0],email:em,role:'relawan',at:Date.now()}).catch(err)}return}const old=me&&me.role;me={id:s.id,...s.data()};
      if(!started||old!==me.role){started=true;stopData();listen(u.uid)}render()
    },err));
  });
  render();
}
function stopData(){dataUn.forEach(f=>f());dataUn=[];firstSnap={};items=[];txs=[];reqs=[];shop=[];users=[];notifs=[]}
function stopAll(){unsubs.forEach(f=>f());unsubs=[];stopData()}
function listen(uid){
  const L=(name,query,set,onNew)=>dataUn.push(query.onSnapshot(s=>{
    set(s.docs.map(d=>({id:d.id,...d.data()})));
    if(onNew&&firstSnap[name])s.docChanges().forEach(c=>c.type==='added'&&onNew(c.doc.data()));
    firstSnap[name]=true;rerender();
  },e=>{console.warn(name,e);err(e.code==='permission-denied'?{message:'Tidak ada izin membaca "'+name+'". Pastikan Rules di Firebase sudah di-Publish.'}:e)}));
  L('items',fs.collection('items'),d=>items=d);
  isMember()&&L('tx',fs.collection('tx').orderBy('at','desc').limit(300),d=>txs=d);
  isMember()&&L('reqs',fs.collection('requests'),d=>reqs=d);
  isMember()&&L('shop',fs.collection('shopping'),d=>shop=d);
  isMember()&&L('users',fs.collection('users'),d=>users=d);
  isMember()&&L('notifs',fs.collection('notifs').where('to','==',uid),d=>notifs=d.sort((a,b)=>b.at-a.at),n=>{
    try{if('Notification' in window&&Notification.permission==='granted')new Notification('Gudang',{body:n.text})}catch(e){}
  });
}
function rerender(){clearTimeout(tm);tm=setTimeout(()=>{const a=document.activeElement;if(a&&a.tagName==='INPUT'&&$('#app').contains(a))return;render()},120)}
function doAuth(){
  const id=$('#a_user').value.trim().toLowerCase(),p=$('#a_pass').value;
  if(!id||p.length<6)return alert('Isi email/username dan password (minimal 6 karakter).');
  if(authMode==='login'){
    const email=id.includes('@')?id:id.replace(/[^a-z0-9._]/g,'')+'@gudang.app';
    return auth.signInWithEmailAndPassword(email,p).catch(()=>alert('Email/username atau password salah.'));
  }
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(id))return alert('Isi email yang valid (mis. nama@gmail.com).');
  const name=$('#a_name').value.trim();if(!name)return alert('Isi nama lengkap.');
  auth.createUserWithEmailAndPassword(id,p).then(c=>fs.doc('users/'+c.user.uid).set({name,username:id.split('@')[0],email:id,role:'relawan',at:Date.now()}))
    .catch(e=>alert(e.code==='auth/email-already-in-use'?'Email sudah terdaftar. Coba Masuk atau Lupa password.':e.message));
}
function doGoogle(){
  const pv=new firebase.auth.GoogleAuthProvider();pv.setCustomParameters({prompt:'select_account'});
  auth.signInWithPopup(pv).catch(e=>{
    if(e.code==='auth/popup-blocked')return auth.signInWithRedirect(pv);
    if(['auth/popup-closed-by-user','auth/cancelled-popup-request'].includes(e.code))return;
    alert(e.code==='auth/unauthorized-domain'?'Domain ini belum diizinkan. Tambahkan di Firebase > Authentication > Settings > Authorized domains.':e.code==='auth/operation-not-allowed'?'Login Google belum diaktifkan di Firebase (Authentication > Sign-in method > Google).':'Gagal masuk dengan Google: '+e.message);
  });
}
function forgotForm(){
  openM(`<h1>Reset password</h1><p class="mt">Masukkan email akunmu. Tautan untuk membuat password baru akan dikirim ke email itu.</p>
  <label>Email</label><input id="rs_email" type="email" autocapitalize="none">
  <div class="row"><button class="btn p" onclick="doReset()">Kirim tautan</button><button class="btn" onclick="closeM()">Batal</button></div>`);
}
function doReset(){
  const e=$('#rs_email').value.trim().toLowerCase();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))return alert('Isi email yang valid.');
  if(e.endsWith('@gudang.app'))return alert('Akun ini memakai username tanpa email asli, jadi tautan tidak bisa dikirim. Masuk dengan Google bila sudah ditautkan, atau hubungi Admin.');
  auth.sendPasswordResetEmail(e).then(()=>{closeM();alert('Jika email terdaftar, tautan reset sudah dikirim. Cek juga folder Spam.')}).catch(x=>alert('Gagal mengirim: '+x.message));
}
function showAccount(){
  closeSide();
  const u=auth.currentUser,ps=u.providerData.map(p=>p.providerId),hasPw=ps.includes('password'),hasG=ps.includes('google.com');
  openM(`<div class="row sp"><h1>Akun saya</h1><button class="btn s" onclick="closeM()">Tutup</button></div>
  <div class="card"><b>${esc(me.name)}</b><div class="mt">${esc(u.email||'')} &middot; ${esc(ROLES[me.role]||me.role)}</div><div class="mt">Masuk lewat: ${[hasPw?'Password':'',hasG?'Google':''].filter(Boolean).join(' + ')}</div></div>
  ${hasPw?`<h2>Ganti password</h2><label>Password lama</label><input id="pw_old" type="password" autocomplete="current-password"><label>Password baru (min. 6 karakter)</label><input id="pw_new" type="password" autocomplete="new-password"><button class="btn p" onclick="changePw()">Simpan password</button>`:''}
  ${hasG?'':`<h2>Tautkan Google</h2><p class="mt">Setelah ditautkan, kamu bisa masuk dengan Gmail tanpa kehilangan role dan data.</p><button class="btn" onclick="linkGoogle()">Tautkan akun Google</button>`}`);
}
function changePw(){
  const o=$('#pw_old').value,n=$('#pw_new').value,u=auth.currentUser;
  if(n.length<6)return alert('Password baru minimal 6 karakter.');
  u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email,o)).then(()=>u.updatePassword(n))
   .then(()=>{closeM();alert('Password berhasil diganti.')}).catch(e=>alert(['auth/wrong-password','auth/invalid-credential'].includes(e.code)?'Password lama salah.':'Gagal: '+e.message));
}
function linkGoogle(){
  auth.currentUser.linkWithPopup(new firebase.auth.GoogleAuthProvider()).then(()=>{alert('Google berhasil ditautkan.');showAccount()})
   .catch(e=>alert(e.code==='auth/credential-already-in-use'?'Akun Google itu sudah dipakai akun lain.':e.code==='auth/popup-closed-by-user'?'Dibatalkan.':'Gagal: '+e.message));
}
function vAuth(){
  const reg=authMode==='reg';
  $('#app').innerHTML=`<h1>${reg?'Daftar akun':'Masuk'}</h1><div class="card">
  ${reg?'<label>Nama lengkap</label><input id="a_name" autocomplete="name">':''}
  <label>${reg?'Email (untuk reset password)':'Email atau username'}</label><input id="a_user" ${reg?'type="email"':''} autocapitalize="none" autocomplete="username">
  <label>Password${reg?' (min. 6 karakter)':''}</label><input id="a_pass" type="password" autocomplete="${reg?'new':'current'}-password">
  <button class="btn p" style="width:100%" onclick="doAuth()">${reg?'Daftar':'Masuk'}</button>
  ${reg?'':'<p style="margin:10px 0 0;text-align:center"><a href="#" onclick="forgotForm();return false">Lupa password?</a></p>'}</div>
  <div class="mt" style="text-align:center;margin:10px 0">atau</div>
  <button class="btn" style="width:100%" onclick="doGoogle()">Masuk dengan Google</button>
  <p style="text-align:center"><button class="btn s" onclick="authMode='${reg?'login':'reg'}';vAuth()">${reg?'Sudah punya akun? Masuk':'Belum punya akun? Daftar'}</button></p>
  ${reg?'<p class="mt">Akun baru berperan Relawan Lain (hanya lihat stok & scan). Role diubah oleh Admin, PPBK, atau Capten.</p>':''}`;
}

/* ---------- RENDER ---------- */
const MENU=[['stok','Stok',0],['scan','Scan',0],['pinjam','Dipinjam',1],['beli','Pembelian',1],['riwayat','Riwayat',1],['user','Pengguna',2]];
const allowed=()=>MENU.filter(m=>m[2]===0||(m[2]===1&&isMember())||(m[2]===2&&isStaff()));
const closeSide=()=>{$('#side').classList.remove('open');$('#scrim').hidden=true};
function go(v){stopScan();view=v;closeSide();render()}
$('#burger').onclick=()=>{$('#side').classList.add('open');$('#scrim').hidden=false};
$('#scrim').onclick=closeSide;
function render(){
  if(!auth)return;
  const on=!!me;
  $('#side').hidden=!on;$('#top').hidden=!on;document.body.classList.toggle('in',on);
  if(!on){$('#side').innerHTML='';return vAuth()}
  if(!allowed().some(m=>m[0]===view))view='stok';
  const un=notifs.filter(n=>!n.read).length,pend=isBoss()?reqs.filter(r=>r.status==='pending').length:0;
  $('#burger').innerHTML='&#9776;'+(un?`<span class="dot">${un}</span>`:'');
  $('#side').innerHTML=`<div><b>${esc(me.name)}</b><div class="mt">${esc(ROLES[me.role]||me.role)}</div></div>
  <div class="menu">${allowed().map(m=>`<button class="${m[0]===view?'on':''}" onclick="go('${m[0]}')">${m[1]}${m[0]==='beli'&&pend?`<span class="dot">${pend}</span>`:''}</button>`).join('')}</div>
  <div class="foot">${isMember()?`<button class="btn s" onclick="showNotifs()">Notifikasi${un?`<span class="dot">${un}</span>`:''}</button>`:''}<button class="btn s" onclick="showAccount()">Akun</button><button class="btn s" onclick="auth.signOut()">Keluar</button></div>`;
  ({stok:vStok,scan:vScan,pinjam:vPinjam,beli:vBeli,riwayat:vRiwayat,user:vUser})[view]();
}
function openM(h){$('#mbox').innerHTML=h;$('#modal').hidden=false}
function closeM(){$('#modal').hidden=true;$('#mbox').innerHTML=''}
$('#modal').onclick=e=>{if(e.target.id==='modal')closeM()};

/* ---------- NOTIFIKASI ---------- */
function showNotifs(){closeSide();
  const can='Notification' in window&&Notification.permission==='default';
  openM(`<div class="row sp"><h1>Notifikasi</h1><button class="btn s" onclick="closeM()">Tutup</button></div>
  ${can?'<button class="btn s" style="margin-bottom:10px" onclick="Notification.requestPermission().then(showNotifs)">Aktifkan pop-up notifikasi browser</button>':''}
  ${notifs.slice(0,40).map(n=>`<div class="card" style="${n.read?'opacity:.6':''}">${esc(n.text)}<div class="mt">${fmt(n.at)}</div></div>`).join('')||'<div class="card mt">Belum ada notifikasi.</div>'}`);
  const b=fs.batch();notifs.filter(n=>!n.read).forEach(n=>b.update(fs.doc('notifs/'+n.id),{read:true}));b.commit().catch(()=>{});
}

/* ---------- STOK ---------- */
function vStok(){
  const low=items.filter(isLow);
  const list=items.filter(i=>(i.name+i.category+i.location+i.code).toLowerCase().includes(q.toLowerCase()));
  $('#app').innerHTML=`<div class="row sp"><h1>Stok barang</h1>${isStaff()?'<div class="row"><button class="btn s" onclick="importForm()">Impor</button><button class="btn s" onclick="exportXlsx()">Ekspor</button><button class="btn s" id="qrall" onclick="dlAllQr()">Unduh QR</button><button class="btn p" onclick="itemForm()">+ Barang</button></div>':''}</div>
  ${low.length?`<div class="warn">${low.length} barang hampir habis: ${esc(low.slice(0,3).map(i=>i.name).join(', '))}${low.length>3?' dan lainnya':''}</div>`:''}
  <input id="q" placeholder="Cari nama, kategori, lokasi, kode" value="${esc(q)}">
  ${list.length?list.map(i=>`<div class="card ${isLow(i)?'low':''}">
    <div class="row sp" onclick="detail('${i.id}')" style="cursor:pointer;flex-wrap:nowrap"><div class="row" style="flex-wrap:nowrap;gap:10px;min-width:0">${thumb(i)}<div><b>${esc(i.name)}</b><div class="mt">${esc(i.category||'Tanpa kategori')} · ${esc(i.location||'Lokasi belum diisi')}</div></div></div>
    <span class="bd ${isLow(i)?'low':''}">${i.stock} ${esc(i.unit)}</span></div>
    ${isMember()?`<div class="row" style="margin-top:8px"><button class="btn s" onclick="txForm('${i.id}','out')">Keluar</button><button class="btn s" onclick="txForm('${i.id}','in')">Masuk</button></div>`:''}</div>`).join('')
  :`<div class="card mt">${items.length?'Tidak ada barang yang cocok.':'Belum ada barang.'}</div>`}`;
  const el=$('#q');el.oninput=()=>{q=el.value;vStok();const n=$('#q');n.focus();n.setSelectionRange(q.length,q.length)};
}
/* ---------- IMPOR / EKSPOR EXCEL ---------- */
const IMPMAP={name:['nama','nama barang','barang','item','name'],category:['kategori','category','jenis'],location:['lokasi','lokasi simpan','tempat','rak','location'],buyUrl:['link','link pembelian','link beli','url','toko','beli di'],stock:['stok','jumlah','qty','stock'],unit:['satuan','unit'],min:['batas','batas stok','batas peringatan','minimal','min'],code:['kode','kode barang','code','barcode','qr']};
let impPlan=[];
const sx=v=>/^[=+\-@]/.test(String(v))?"'"+v:v;
function importForm(){
  impPlan=[];
  openM(`<div class="row sp"><h1>Impor dari Excel / CSV</h1><button class="btn s" onclick="closeM()">Tutup</button></div>
  <p class="mt">Baris pertama harus berisi judul kolom, contoh: Nama, Kategori, Lokasi, Link, Stok, Satuan, Batas, Kode. Kolom Kode boleh kosong atau tidak ada: kode dibuat otomatis (BRG-0001, dst). Barang yang kode atau namanya sudah ada akan diperbarui, tidak digandakan.</p>
  <input type="file" accept=".xlsx,.xls,.csv" onchange="readImport(this)"><div id="impv"></div>`);
}
function readImport(el){
  const f=el.files[0];if(!f)return;
  if(typeof XLSX==='undefined')return alert('Library Excel gagal dimuat. Cek koneksi internet.');
  const r=new FileReader();
  r.onload=()=>{try{const wb=XLSX.read(new Uint8Array(r.result),{type:'array'});planImport(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''}))}catch(e){alert('File tidak bisa dibaca.')}};
  r.readAsArrayBuffer(f);
}
function planImport(rows){
  const used=new Set(items.map(i=>i.code.toLowerCase())),seen=new Set();let n=items.length+1,skip=0;
  const nc=()=>{let c;do{c='BRG-'+String(n++).padStart(4,'0')}while(used.has(c.toLowerCase()));used.add(c.toLowerCase());return c};
  impPlan=[];
  rows.forEach(row=>{
    const o={};
    Object.keys(row).forEach(k=>{const kk=String(k).trim().toLowerCase();for(const f in IMPMAP)if(IMPMAP[f].includes(kk)&&o[f]===undefined)o[f]=String(row[k]).trim()});
    const key=(o.code||o.name||'').toLowerCase();
    if(!o.name||seen.has(key)){skip++;return}
    seen.add(key);
    const ex=o.code?byCode(o.code):items.find(i=>i.name.toLowerCase()===o.name.toLowerCase());
    let code=ex?ex.code:(o.code||nc());if(!ex&&o.code)used.add(o.code.toLowerCase());
    impPlan.push({ex,o,code});
  });
  const nw=impPlan.filter(p=>!p.ex).length,up=impPlan.length-nw;
  $('#impv').innerHTML=`<div class="card" style="margin-top:10px">Baru: <b>${nw}</b> &middot; Diperbarui: <b>${up}</b> &middot; Dilewati: <b>${skip}</b></div>
  ${impPlan.slice(0,6).map(p=>`<div class="card row sp"><div><b>${esc(p.o.name)}</b><div class="mt">${esc(p.code)}</div></div><span class="bd ${p.ex?'md':''}">${p.ex?'Update':'Baru'}</span></div>`).join('')}
  ${impPlan.length>6?`<p class="mt">dan ${impPlan.length-6} baris lainnya</p>`:''}
  <label class="row" style="color:var(--tx);margin:8px 0 12px"><input type="checkbox" id="imp_stock" style="width:22px;margin:0"> Timpa stok barang yang sudah ada dengan angka dari file</label>
  <button class="btn p" ${impPlan.length?'':'disabled'} onclick="doImport()">Impor ${impPlan.length} barang</button>`;
}
async function doImport(){
  const ovr=$('#imp_stock').checked,ops=[];
  const num=(v,d)=>v===undefined||v===''?d:Math.max(0,parseInt(String(v).replace(/[^\d]/g,''),10)||0);
  impPlan.forEach(p=>{
    const o=p.o;
    if(p.ex){
      const d={};['name','category','location','buyUrl','unit'].forEach(f=>{if(o[f])d[f]=o[f]});
      if(o.min)d.min=num(o.min,0);if(ovr&&o.stock)d.stock=num(o.stock,0);
      if(Object.keys(d).length)ops.push(b=>b.update(fs.doc('items/'+p.ex.id),d));
    }else ops.push(b=>b.set(fs.collection('items').doc(),{name:o.name,category:o.category||'',location:o.location||'',buyUrl:o.buyUrl||'',unit:o.unit||'pcs',min:num(o.min,5),stock:num(o.stock,0),code:p.code}));
  });
  try{for(let i=0;i<ops.length;i+=400){const b=fs.batch();ops.slice(i,i+400).forEach(f=>f(b));await b.commit()}closeM();alert('Impor selesai: '+ops.length+' barang diproses.')}catch(e){err(e)}
}
function exportXlsx(){
  if(typeof XLSX==='undefined')return alert('Library Excel gagal dimuat. Cek koneksi internet.');
  const rows=items.map(i=>({Kode:sx(i.code),Nama:sx(i.name),Kategori:sx(i.category||''),Lokasi:sx(i.location||''),'Link Pembelian':sx(i.buyUrl||''),Stok:i.stock,Satuan:i.unit,'Batas Peringatan':i.min}));
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Stok');
  XLSX.writeFile(wb,'stok-gudang-'+new Date().toISOString().slice(0,10)+'.xlsx');
}
/* ---------- UNDUH QR ---------- */
const slug=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'barang';
function qrCanvas(i){
  const d=document.createElement('div');
  new QRCode(d,{text:i.code,width:360,height:360,correctLevel:QRCode.CorrectLevel.M});
  const q=d.querySelector('canvas'),pad=30,c=document.createElement('canvas'),x=c.getContext('2d');
  c.width=360+pad*2;c.height=360+pad*2+76;
  x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(q,pad,pad);
  x.fillStyle='#000';x.textAlign='center';x.font='bold 26px Arial,sans-serif';
  let n=i.name;while(x.measureText(n).width>c.width-30&&n.length>3)n=n.slice(0,-2);
  if(n!==i.name)n=n.trim()+'…';
  x.fillText(n,c.width/2,360+pad*2+8);
  x.font='22px Arial,sans-serif';x.fillStyle='#444';x.fillText(i.code,c.width/2,360+pad*2+44);
  return c;
}
const toBlob=c=>new Promise(r=>c.toBlob(r,'image/png'));
function saveBlob(b,name){const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000)}
async function dlQr(id){
  const i=byId(id);if(!i)return;
  try{saveBlob(await toBlob(qrCanvas(i)),i.code+'-'+slug(i.name)+'.png')}catch(e){alert('QR gagal dibuat.')}
}
async function dlAllQr(){
  if(!items.length)return alert('Belum ada barang.');
  if(typeof JSZip==='undefined')return alert('Library ZIP gagal dimuat. Cek koneksi internet.');
  const b=$('#qrall');b.disabled=true;b.textContent='Menyiapkan...';
  try{
    const z=new JSZip();
    for(const i of items)z.file(i.code+'-'+slug(i.name)+'.png',await toBlob(qrCanvas(i)));
    saveBlob(await z.generateAsync({type:'blob'}),'qr-semua-barang.zip');
  }catch(e){alert('Gagal membuat ZIP.')}
  b.disabled=false;b.textContent='Unduh QR';
}
let pendingPhoto;
const okPh=p=>typeof p==='string'&&/^data:image\/jpeg;base64,/.test(p);
const thumb=i=>okPh(i.photo)?`<img class="th" src="${i.photo}" alt="">`:'<div class="th"></div>';
const photoHtml=p=>okPh(p)?`<img class="th" style="width:76px;height:76px" src="${p}" alt="">`:'<div class="th" style="width:76px;height:76px"></div>';
function pickPhoto(el){
  const f=el.files[0];if(!f)return;
  const img=new Image(),url=URL.createObjectURL(f);
  img.onload=()=>{
    const r=Math.min(1,640/Math.max(img.width,img.height)),c=document.createElement('canvas');
    c.width=Math.round(img.width*r);c.height=Math.round(img.height*r);
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);
    pendingPhoto=c.toDataURL('image/jpeg',.72);$('#pvw').innerHTML=photoHtml(pendingPhoto);
  };
  img.onerror=()=>alert('Gambar tidak bisa dibaca.');
  img.src=url;el.value='';
}
function clearPhoto(){pendingPhoto='';$('#pvw').innerHTML=photoHtml('')}
function itemForm(id){
  pendingPhoto=undefined;
  const i=id?byId(id):{code:'',name:'',category:'',location:'',buyUrl:'',stock:0,min:5,unit:'pcs'};
  openM(`<h1>${id?'Edit':'Tambah'} barang</h1>
  <label>Foto barang</label>
  <div class="row" style="margin:4px 0 12px;flex-wrap:nowrap"><div id="pvw">${photoHtml(i.photo)}</div>
  <div class="row"><label class="btn s" style="margin:0;cursor:pointer;color:var(--tx)">Ambil foto<input type="file" accept="image/*" capture="environment" hidden onchange="pickPhoto(this)"></label>
  <label class="btn s" style="margin:0;cursor:pointer;color:var(--tx)">Upload<input type="file" accept="image/*" hidden onchange="pickPhoto(this)"></label>
  <button type="button" class="btn s d" onclick="clearPhoto()">Hapus</button></div></div>
  <label>Nama barang</label><input id="f_name" value="${esc(i.name)}">
  <label>Kategori</label><input id="f_cat" value="${esc(i.category)}">
  <label>Lokasi penyimpanan</label><input id="f_loc" value="${esc(i.location)}">
  <label>Link pembelian / toko</label><input id="f_url" value="${esc(i.buyUrl)}" placeholder="https://...">
  <div class="row"><div style="flex:1"><label>Stok${id?'':' awal'}</label><input id="f_stock" type="number" min="0" value="${i.stock}" ${id?'disabled':''}></div>
  <div style="flex:1"><label>Batas peringatan</label><input id="f_min" type="number" min="0" value="${i.min}"></div>
  <div style="flex:1"><label>Satuan</label><input id="f_unit" value="${esc(i.unit)}"></div></div>
  <label>Kode barcode/QR (kosong = otomatis)</label><input id="f_code" value="${esc(i.code)}">
  <div class="row"><button class="btn p" onclick="saveItem('${id||''}')">Simpan</button><button class="btn" onclick="closeM()">Batal</button></div>`);
}
function saveItem(id){
  const name=$('#f_name').value.trim();if(!name)return alert('Nama barang wajib diisi.');
  const code=$('#f_code').value.trim()||nextCode(),dup=byCode(code);
  if(dup&&dup.id!==id)return alert('Kode sudah dipakai barang "'+dup.name+'".');
  const d={name,category:$('#f_cat').value.trim(),location:$('#f_loc').value.trim(),buyUrl:$('#f_url').value.trim(),min:+$('#f_min').value||0,unit:$('#f_unit').value.trim()||'pcs',code};
  if(pendingPhoto!==undefined)d.photo=pendingPhoto;
  (id?fs.doc('items/'+id).update(d):fs.collection('items').add({...d,stock:Math.max(0,+$('#f_stock').value||0)})).then(closeM).catch(err);
}
function detail(id){
  const i=byId(id);if(!i)return;const u=safeUrl(i.buyUrl);
  openM(`<div class="row sp"><h1>${esc(i.name)}</h1><button class="btn s" onclick="closeM()">Tutup</button></div>
  ${okPh(i.photo)?`<img class="ph" src="${i.photo}" alt="">`:''}
  <div class="card"><div class="row sp"><span>Stok</span><span class="bd ${isLow(i)?'low':''}">${i.stock} ${esc(i.unit)}${isLow(i)?' · hampir habis':''}</span></div>
  <p class="mt" style="margin:8px 0 0">Kategori: <b>${esc(i.category||'-')}</b><br>Lokasi: <b>${esc(i.location||'-')}</b><br>Batas peringatan: ${i.min} ${esc(i.unit)}<br>Beli di: ${u?`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u.replace(/^https?:\/\//,'').slice(0,50))}</a>`:esc(i.buyUrl||'-')}</p></div>
  <div class="card" style="text-align:center"><div id="qr"></div><div class="mt">Kode: <b>${esc(i.code)}</b></div><button class="btn s" style="margin-top:8px" onclick="dlQr('${i.id}')">Unduh QR (PNG)</button></div>
  <div class="row">${isMember()?`<button class="btn p" onclick="txForm('${i.id}','out')">Keluar</button><button class="btn p" onclick="txForm('${i.id}','in')">Masuk</button>`:''}
  ${isStaff()?`<button class="btn" onclick="itemForm('${i.id}')">Edit</button><button class="btn d" onclick="delItem('${i.id}')">Hapus</button>`:''}</div>`);
  try{new QRCode($('#qr'),{text:i.code,width:180,height:180})}catch(e){$('#qr').textContent='QR gagal dimuat.'}
}
function delItem(id){if(confirm('Hapus barang ini?'))fs.doc('items/'+id).delete().then(closeM).catch(err)}

/* ---------- TRANSAKSI ---------- */
function txForm(id,type){
  const i=byId(id);if(!i)return;
  openM(`<h1>${type==='out'?'Barang keluar':'Barang masuk'}</h1>
  <div class="card row" style="flex-wrap:nowrap">${thumb(i)}<div><b>${esc(i.name)}</b><div class="mt">Stok: ${i.stock} ${esc(i.unit)} · ${esc(i.location||'lokasi belum diisi')}</div></div></div>
  <label>Jumlah (${esc(i.unit)})</label><input id="t_qty" type="number" min="1" value="1" inputmode="numeric">
  <label>${type==='out'?'Dibawa oleh / keperluan':'Catatan (opsional)'}</label><input id="t_who">
  ${type==='out'?'<label class="row" style="color:var(--tx)"><input id="t_ret" type="checkbox" style="width:22px;margin:0" checked> Akan dikembalikan (masuk checklist)</label><br>':''}
  <div class="row"><button class="btn p" onclick="saveTx('${id}','${type}')">Simpan</button><button class="btn" onclick="closeM()">Batal</button></div>`);
  setTimeout(()=>{const e=$('#t_qty');e&&e.select()},50);
}
function saveTx(id,type){
  const n=Math.floor(+$('#t_qty').value);if(!n||n<1)return alert('Isi jumlah minimal 1.');
  const who=$('#t_who').value.trim(),ret=type==='out'&&$('#t_ret').checked,ref=fs.doc('items/'+id);let after=0,nm='',mn=0;
  fs.runTransaction(async t=>{
    const s=await t.get(ref),i=s.data();nm=i.name;mn=i.min;
    if(type==='out'&&n>i.stock)throw new Error('Stok tidak cukup. Sisa '+i.stock+' '+i.unit+'.');
    after=i.stock+(type==='in'?n:-n);t.update(ref,{stock:after});
    t.set(fs.collection('tx').doc(),{itemId:id,itemName:i.name,unit:i.unit,type,qty:n,who,by:me.id,returnable:ret,returned:false,at:Date.now()});
  }).then(()=>{closeM();if(type==='out'&&after<=mn)alert('Peringatan: stok '+nm+' tinggal '+after+'.')}).catch(err);
}

/* ---------- SCAN ---------- */
function vScan(){
  $('#app').innerHTML=`<h1>Scan barcode / QR</h1>
  <div class="seg">${[['info','Lihat data'],['out','Keluar'],['in','Masuk']].filter(x=>isMember()||x[0]==='info').map(([k,l])=>`<button class="btn ${scanMode===k?'on':''}" onclick="scanMode='${k}';vScan()">${l}</button>`).join('')}</div>
  <div id="reader"></div><div class="row"><button class="btn p" id="cam" onclick="startScan()">Buka kamera</button></div>
  <div id="serr" class="mt" style="margin-top:8px">Kamera butuh HTTPS. Atau ketik kode manual:</div>
  <div class="row" style="margin-top:6px"><input id="man" placeholder="mis. BRG-0001" style="flex:1;margin:0"><button class="btn" onclick="found($('#man').value)">Cari</button></div>`;
}
function startScan(){
  if(typeof Html5Qrcode==='undefined')return $('#serr').textContent='Library scanner gagal dimuat.';
  scanner=new Html5Qrcode('reader');
  scanner.start({facingMode:'environment'},{fps:10,qrbox:{width:240,height:240}},t=>{stopScan();found(t)},()=>{})
   .then(()=>{$('#cam').textContent='Matikan kamera';$('#cam').onclick=()=>{stopScan();vScan()}})
   .catch(()=>{scanner=null;$('#serr').textContent='Kamera tidak bisa dibuka. Izinkan akses kamera (HTTPS), atau ketik kode manual.'});
}
function stopScan(){if(scanner){const s=scanner;scanner=null;s.stop().then(()=>s.clear()).catch(()=>{})}}
function found(code){
  const i=byCode(code);
  if(!i){if(isStaff()&&confirm('Kode "'+code+'" belum terdaftar. Tambah sebagai barang baru?')){itemForm();setTimeout(()=>{$('#f_code').value=String(code).trim()},0)}else if(!isStaff())alert('Kode belum terdaftar.');return}
  scanMode==='info'||!isMember()?detail(i.id):txForm(i.id,scanMode);
}

/* ---------- DIPINJAM ---------- */
function vPinjam(){
  const L=txs.filter(t=>t.type==='out'&&t.returnable),p=L.filter(t=>!t.returned),d=L.filter(t=>t.returned);
  const row=t=>`<label class="card chk ${t.returned?'done':''}"><input type="checkbox" ${t.returned?'checked':''} onchange="toggleRet('${t.id}')"><div><b>${esc(t.itemName)}</b> × ${t.qty} ${esc(t.unit)}<div class="mt">${esc(t.who||'Tanpa keterangan')} · dicatat ${esc(uname(t.by))}, ${fmt(t.at)}${t.returned?' · kembali '+fmt(t.retAt):''}</div></div></label>`;
  $('#app').innerHTML=`<h1>Checklist pengembalian</h1><p class="mt">Centang saat barang sudah kembali. Stok otomatis bertambah.</p>
  <h2>Belum kembali (${p.length})</h2>${p.map(row).join('')||'<div class="card mt">Semua barang sudah kembali.</div>'}
  ${d.length?`<h2>Sudah kembali (${d.length})</h2>${d.map(row).join('')}`:''}`;
}
function toggleRet(id){
  const t=txs.find(x=>x.id===id),b=fs.batch(),back=!t.returned;
  if(!back&&(byId(t.itemId)||{stock:0}).stock<t.qty){alert('Tidak bisa dibatalkan: stok kurang.');return render()}
  b.update(fs.doc('tx/'+id),{returned:back,retAt:back?Date.now():null});
  b.update(fs.doc('items/'+t.itemId),{stock:firebase.firestore.FieldValue.increment(back?t.qty:-t.qty)});
  b.commit().catch(e=>{err(e);render()});
}

/* ---------- PEMBELIAN ---------- */
const ub=u=>`<span class="bd ${u==='high'?'low':u==='normal'?'md':''}">${URG[u]}</span>`;
function vBeli(){
  const pend=reqs.filter(r=>r.status==='pending').length;
  $('#app').innerHTML=`<div class="row sp"><h1>Pembelian</h1><button class="btn p" onclick="reqForm()">+ Permohonan</button></div>
  <div class="seg"><button class="btn ${pTab==='req'?'on':''}" onclick="pTab='req';vBeli()">Permohonan${pend?` (${pend})`:''}</button><button class="btn ${pTab==='shop'?'on':''}" onclick="pTab='shop';vBeli()">List belanja</button></div>
  <div id="pb"></div>`;
  const pb=$('#pb');
  if(pTab==='req'){
    const L=[...reqs].sort((a,b)=>(a.status==='pending'?0:1)-(b.status==='pending'?0:1)||URGO[a.urgency]-URGO[b.urgency]||b.at-a.at);
    pb.innerHTML=L.map(r=>{const u=safeUrl(r.link);return`<div class="card"><div class="row sp"><b>${esc(r.name)} × ${r.qty}</b>${ub(r.urgency)}</div>
    <div class="mt">Oleh ${esc(uname(r.by))} · ${fmt(r.at)}${r.note?'<br>'+esc(r.note):''}${u?`<br><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">Link referensi</a>`:''}</div>
    <div class="row" style="margin-top:8px">${r.status==='pending'?(isBoss()?`<button class="btn p s" onclick="decide('${r.id}',true)">Setujui</button><button class="btn d s" onclick="decide('${r.id}',false)">Tolak</button>`:'<span class="mt">Menunggu persetujuan PPBK</span>'):`<span class="bd ${r.status==='approved'?'':'low'}">${r.status==='approved'?'Disetujui':'Ditolak'}</span>`}</div></div>`}).join('')||'<div class="card mt">Belum ada permohonan.</div>';
  }else{
    const L=[...shop].sort((a,b)=>a.bought-b.bought||URGO[a.urgency]-URGO[b.urgency]||b.at-a.at);
    pb.innerHTML=L.map(s=>{const u=safeUrl(s.link);return`<label class="card chk ${s.bought?'done':''}"><input type="checkbox" ${s.bought?'checked':''} ${isStaff()?'':'disabled'} onchange="fs.doc('shopping/${s.id}').update({bought:this.checked}).catch(err)"><div><b>${esc(s.name)}</b> × ${s.qty} ${ub(s.urgency)}<div class="mt">Diminta ${esc(uname(s.by))}${u?` · <a href="${esc(u)}" target="_blank" rel="noopener noreferrer">link</a>`:''}</div></div></label>`}).join('')||'<div class="card mt">List belanja kosong. Permohonan yang disetujui masuk ke sini.</div>';
  }
}
function reqForm(){
  openM(`<h1>Permohonan pembelian</h1>
  <label>Nama alat / barang</label><input id="r_name"><label>Jumlah</label><input id="r_qty" type="number" min="1" value="1">
  <label>Urgensi</label><select id="r_urg"><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select>
  <label>Link referensi (opsional)</label><input id="r_link" placeholder="https://..."><label>Catatan / alasan</label><textarea id="r_note" rows="2"></textarea>
  <div class="row"><button class="btn p" onclick="saveReq()">Kirim</button><button class="btn" onclick="closeM()">Batal</button></div>`);
}
function saveReq(){
  const name=$('#r_name').value.trim(),qty=Math.floor(+$('#r_qty').value);if(!name||qty<1)return alert('Isi nama barang dan jumlah.');
  const urg=$('#r_urg').value,b=fs.batch();
  b.set(fs.collection('requests').doc(),{name,qty,urgency:urg,link:$('#r_link').value.trim(),note:$('#r_note').value.trim(),by:me.id,status:'pending',at:Date.now()});
  nfy(b,usersWith('ppbk'),`Permohonan baru (${URG[urg]}): ${name} × ${qty} dari ${me.name}`);
  b.commit().then(()=>{closeM();pTab='req';render()}).catch(err);
}
function decide(id,ok){
  const r=reqs.find(x=>x.id===id),b=fs.batch();
  b.update(fs.doc('requests/'+id),{status:ok?'approved':'rejected',decidedBy:me.id});
  if(ok){
    b.set(fs.collection('shopping').doc(),{name:r.name,qty:r.qty,urgency:r.urgency,link:r.link,by:r.by,reqId:id,bought:false,at:Date.now()});
    nfy(b,usersWith('capten','asisten'),`Disetujui & masuk list belanja: ${r.name} × ${r.qty} (${URG[r.urgency]})`);
  }
  if(r.by!==me.id)nfy(b,[r.by],`Permohonanmu "${r.name}" ${ok?'disetujui':'ditolak'}`);
  b.commit().catch(err);
}

/* ---------- LAINNYA: RIWAYAT & PENGGUNA ---------- */
function vRiwayat(){
  $('#app').innerHTML='<h1>Riwayat</h1>'+(txs.slice(0,100).map(t=>`<div class="card"><div class="row sp"><b>${esc(t.itemName)}</b><span class="bd ${t.type==='out'?'low':''}">${t.type==='out'?'−':'+'}${t.qty} ${esc(t.unit)}</span></div><div class="mt">${t.type==='out'?'Keluar':'Masuk'} · ${fmt(t.at)} · ${esc(uname(t.by))}${t.who?' · '+esc(t.who):''}${t.returned?' · sudah kembali':''}</div></div>`).join('')||'<div class="card mt">Belum ada transaksi.</div>');
}
function vUser(){
  $('#app').innerHTML='<h1>Pengguna</h1>'+users.map(u=>{
    const can=isBoss()||(isStaff()&&MID.includes(u.role)),opts=isBoss()?Object.keys(ROLES):MID;
    return`<div class="card row sp"><div><b>${esc(u.name)}</b><div class="mt">@${esc(u.username)}</div></div>${can?`<select style="width:auto;margin:0" onchange="setRole('${u.id}',this.value)">${opts.map(r=>`<option value="${r}" ${u.role===r?'selected':''}>${ROLES[r]}</option>`).join('')}</select>`:`<span class="bd">${esc(ROLES[u.role]||u.role)}</span>`}</div>`}).join('');
}
function setRole(id,r){fs.doc('users/'+id).update({role:r}).catch(e=>{err(e);render()})}
try{
  if(typeof firebase==='undefined')throw new Error('Library Firebase gagal dimuat. Cek koneksi internet / matikan Shields Brave untuk situs ini.');
  boot();
}catch(e){$('#app').innerHTML='<div class="card"><b>Error:</b> '+esc(e.message)+'</div>'}
