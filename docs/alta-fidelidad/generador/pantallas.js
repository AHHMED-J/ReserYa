// Pantallas clave de alta fidelidad · Opción A (sin degradados). Usa las piezas de generador.html.
Object.assign(IC,{
 chevL:'<path d="m15 18-6-6 6-6"/>',
 chevD:'<path d="m6 9 6 6 6-6"/>',
 check:'<path d="M20 6 9 17l-5-5"/>',
 lock:'<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
 mail:'<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
 clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
 pin:'<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
 info:'<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
 users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
 inbox:'<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
 list:'<path d="M3 12h.01M3 18h.01M3 6h.01M8 12h13M8 18h13M8 6h13"/>',
 chart:'<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
 dollar:'<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
 link:'<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
 card:'<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>',
 store:'<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/>',
 key:'<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>',
 dash:'<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
 eye:'<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
 trend:'<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
 plus:'<path d="M5 12h14M12 5v14"/>',
 tv:'<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8M12 17v4"/>',
 image:'<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>'
});
const K={p:'#0A7DB2',soft:'#EAF5FB',softL:'#D9EBF4',t:'#0E1A26',m:'#5D6B79',d:'#9AA6B2',l:'#E3E9EF',f:'#D5DDE5',sf:'#F4F7FA',ok:'#0B7A55',okS:'#E2F6EE',w:'#A35F00',wS:'#FFF4DC',e:'#C23A3A',eS:'#FDECEC'};
const GG='<path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/>';

// ---------- piezas ----------
const T_=(s,x,top,str,size,w,fill,o={})=>s.text(x,top,str,{size,w,fill,...o});
const M_=(s,x,cy,str,size,w,fill,o={})=>s.mid(x,cy,str,{size,w,fill,...o});
const R_=(s,xr,top,str,size,w,fill)=>s.text(xr-s.tw(str,{size,w}),top,str,{size,w,fill});
const RM=(s,xr,cy,str,size,w,fill)=>s.mid(xr-s.tw(str,{size,w}),cy,str,{size,w,fill});
const C_=(s,cx,cy,str,size,w,fill)=>s.center(cx,cy,str,{size,w,fill});
const LAB=(s,x,top,str)=>s.text(x,top,str,{size:11,w:800,fill:K.m,upper:true,ls:0.8});
function google(s,x,y,sz){s.b.push(`<g id="${s.uid('Logo Google')}" transform="translate(${r2(x)} ${r2(y)}) scale(${r2(sz/24)})">${GG}</g>`);}
function dashRect(s,x,y,w,h,o={}){s.b.push(`<rect id="${s.uid(o.name||'Bloque')}" x="${r2(x+.5)}" y="${r2(y+.5)}" width="${r2(w-1)}" height="${r2(h-1)}" rx="${o.rx||8}" fill="${o.fill||'#FFFFFF'}" stroke="${o.stroke||K.d}" stroke-dasharray="4 3"/>`);}
function bg(s){s.rect(0,0,s.w,s.h,{fill:'#FFFFFF',name:'Fondo'});}
function bigBtn(s,x,y,w,label,o={}){const h=o.h||48,sz=o.size||15,isz=o.isz||18;const col=o.color||'#FFFFFF';
 s.g('Boton '+label);s.rect(x,y,w,h,{fill:o.fill||K.p,rx:o.rx||12,stroke:o.stroke,name:'Fondo'});
 const tw=s.tw(label,{size:sz,w:700});const iw=(o.icon||o.google)?isz+10:0;let x0=x+(w-tw-iw)/2;
 if(o.google){google(s,x0,y+(h-isz)/2,isz);x0+=isz+10;}else if(o.icon){s.icon(o.icon,x0,y+(h-isz)/2,isz,o.icolor||col,2.2);x0+=isz+10;}
 s.mid(x0,y+h/2,label,{size:sz,w:700,fill:col});s.end();}
const SEC={fill:'#FFFFFF',color:K.t,stroke:K.f};
function btnW(s,label,o){return (o.px||18)*2+s.tw(label,{size:o.size,w:700})+(o.icon?(o.isz||18)+8:0);}
function btnR(s,xr,y,label,o){const w=btnW(s,label,o);btn(s,xr-w,y,label,o);return xr-w;}
function inp(s,x,y,w,label,val,o={}){s.g('Campo '+label);T_(s,x,y,label,13,700,K.t);const by=y+22;
 s.rect(x,by,w,48,{fill:'#FFFFFF',rx:12,stroke:o.focus?K.p:K.f,sw:o.focus?2:1,name:'Caja'});let tx=x+16;
 if(o.icon){s.icon(o.icon,x+14,by+14,20,K.m,1.8);tx=x+44;}
 M_(s,tx,by+24,val,15,500,o.ph?K.d:K.t,o.ls?{ls:o.ls}:{});if(o.right)s.icon(o.right,x+w-14-20,by+14,20,K.m,1.8);s.end();}
function note(s,x,y,w,txt,kind='info',ic){const [bgc,fg,icn,tc]={info:[K.sf,K.m,'info',K.m],blue:[K.soft,K.p,'info',K.t],warn:[K.wS,K.w,'info',K.t],ok:[K.okS,K.ok,'check',K.t]}[kind];
 const lines=s.wrap(txt,w-58,{size:13,w:500});const h=lines.length*19+26;s.g('Aviso');s.rect(x,y,w,h,{fill:bgc,rx:12,name:'Fondo'});
 s.icon(ic||icn,x+14,y+13,18,fg,2);lines.forEach((l,i)=>T_(s,x+44,y+17+i*19,l,13,500,tc));s.end();return h;}
function dateBox(s,x,y,w,h,mon,day,o={}){s.g('Fecha '+day+' '+mon);s.rect(x,y,w,h,{fill:o.fill||K.soft,rx:12,stroke:o.stroke,name:'Fondo'});
 s.center(x+w/2,y+h/2-12,mon,{size:11,w:800,fill:K.p});C_(s,x+w/2,y+h/2+10,day,22,800,K.t);s.end();}
const sc=(s,x,cy,st,sz=12,h=24)=>{const [b,f]=STATE[st];return chip2(s,x,cy,st,b,f,sz,h);};
const scR=(s,xr,cy,st,sz=12,h=24)=>sc(s,xr-s.tw(st,{size:sz,w:700})-20,cy,st,sz,h);
function fchip(s,x,y,label,on,close){const tw=s.tw(label,{size:13,w:700});const w=tw+28+(close?20:0);s.g('Filtro '+label);
 s.rect(x,y,w,34,{fill:on?K.soft:'#FFFFFF',rx:17,stroke:on?K.p:K.f,name:'Fondo'});M_(s,x+14,y+17,label,13,700,on?K.p:K.t);
 if(close)s.icon('x',x+14+tw+6,y+10,14,K.p,2.4);s.end();return w;}
function kv(s,x,y,w,k,v,o={}){T_(s,x,y,k,13,500,K.m);R_(s,x+w,y,v,13,o.w||700,o.c||K.t);}
function line(s,x,y,w){s.rect(x,y,w,1,{fill:K.l,name:'Linea'});}

// celular
function mHeader(s,title){s.g('Encabezado');s.icon('chevL',12,18,24,K.t,2.2);M_(s,46,30,title,18,800,K.t);s.end();}
function steps(s,y,cur,n=4){s.g('Progreso');const w=(328-(n-1)*6)/n;for(let i=0;i<n;i++)s.rect(16+i*(w+6),y,w,4,{fill:i<cur?K.p:K.l,rx:2,name:'Paso '+(i+1)});s.end();}
function navBar(s,act){s.g('Barra inferior');s.rect(0,722,360,78,{fill:'#FFFFFF',name:'Fondo'});line(s,0,722,360);
 [['home','Inicio',40],['search','Buscar',110],['cal','Reservas',250],['user','Perfil',320]].forEach(([ic,l,cx])=>{const a=l===act;const c=a?K.p:K.m;s.g('Tab '+l);s.icon(ic,cx-11,736,22,c,a?2.2:1.8);s.center(cx,770,l,{size:11,w:a?800:600,fill:c});s.end();});
 s.g('Volver a agendar');s.rect(152,706,56,56,{fill:K.p,rx:28,sh:{c:'#0A4A6B',a:0.25,y:6,r:14},name:'Fondo'});s.icon('rotate',168,722,24,'#FFFFFF',2.2);s.end();s.end();}
function bottomBar(s,y){s.g('Barra de accion');s.rect(0,y,360,800-y,{fill:'#FFFFFF',name:'Fondo'});line(s,0,y,360);s.end();}

// ---------- 01 iniciar sesión ----------
function mLogin(){const s=new S(360,800,'01 Iniciar sesion · celular',A);bg(s);
 s.g('Marca');s.image(16,48,44,44,LOGO,'Logo');M_(s,70,70,'ReserYa',22,800,K.t);s.end();
 s.g('Titulo');T_(s,16,124,'Inicia sesión',28,800,K.t);s.wrap('Reserva en barberías, canchas, consultorios y mucho más.',328,{size:15}).forEach((l,i)=>T_(s,16,166+i*22,l,15,400,K.m));s.end();
 bigBtn(s,16,226,328,'Continuar con Google',{...SEC,google:true,h:52});
 s.g('Separador');line(s,16,298,144);line(s,200,298,144);C_(s,180,298,'o',13,600,K.m);s.end();
 inp(s,16,322,328,'Correo','ana.lopez@correo.com',{icon:'mail'});
 inp(s,16,408,328,'Contraseña','••••••••••',{icon:'lock',right:'eye',focus:true});
 R_(s,344,496,'¿Olvidaste tu contraseña?',13,700,K.p);
 bigBtn(s,16,526,328,'Iniciar sesión',{h:52});
 s.g('Registro');const a='¿No tienes cuenta? ',b='Regístrate';const wa=s.tw(a,{size:14,w:500}),wb=s.tw(b,{size:14,w:800});const x=180-(wa+wb)/2;M_(s,x,612,a,14,500,K.m);M_(s,x+wa,612,b,14,800,K.p);s.end();
 s.g('Legal');s.wrap('Al continuar aceptas los Términos y condiciones y el Aviso de privacidad.',300,{size:12}).forEach((l,i)=>C_(s,180,742+i*18,l,12,400,K.m));s.end();
 return s.out();}

// ---------- 03 resultados ----------
const RS=[{n:'Barbería El Patrón',r:'4.8',c:'120',cat:'Barbería',p:'Desde $200',av:'Hoy 16:00',ok:true,k:'bar'},{n:'The Barber Club',r:'4.6',c:'64',cat:'Barbería',p:'Desde $180',av:'Hoy 17:30',ok:true,k:'bar'},
 {n:'Estética Lupita',r:'4.5',c:'30',cat:'Estética',p:'Desde $150',av:'Hoy 18:00',ok:true,k:'bar'},{n:'Corte Fino',r:'4.4',c:'22',cat:'Barbería',p:'Desde $220',av:'Hoy 19:00',ok:true,k:'bar'},
 {n:'Barber Shop 646',r:'4.3',c:'18',cat:'Barbería',p:'Desde $200',av:'Mañana',ok:false,k:'bar'},{n:'Navaja Libre',r:'4.2',c:'11',cat:'Barbería',p:'Desde $160',av:'Mañana',ok:false,k:'bar'}];
function mResultados(){const s=new S(360,800,'03 Resultados · celular',A);bg(s);
 s.g('Encabezado');s.icon('chevL',10,26,24,K.t,2.2);search(s,40,12,304,52,40,'corte de cabello');s.end();
 s.g('Filtros activos');let x=16;[['Hoy'],['Barberías y estéticas'],['4+ ★']].forEach(([l])=>{x+=fchip(s,x,78,l,true,true)+8;});s.end();
 s.g('Conteo');T_(s,16,130,'12 resultados',14,800,K.t);const ow=s.tw('Mejor calificados',{size:13,w:700});s.icon('chevD',344-16,128,16,K.p,2.4);T_(s,344-20-ow,131,'Mejor calificados',13,700,K.p);s.end();
 s.g('Resultados');RS.forEach((d,i)=>listCard(s,16,158+i*102,328,92,d,{img:68,ns:15,ms:12,chev:true}));s.end();
 navBar(s,'Buscar');return s.out();}

// ---------- 04 perfil del negocio (celular) ----------
const SV=[['Corte de cabello','40 min','$200'],['Barba','20 min','$120'],['Corte + barba','60 min','$300'],['Lavado y peinado','30 min','$150']];
function mPerfil(){const s=new S(360,800,'04 Perfil del negocio · celular',A);bg(s);
 photo(s,0,0,360,236,'bar',0);
 s.g('Sobre la foto');s.rect(16,16,40,40,{fill:'#FFFFFF',rx:20,name:'Atras'});s.icon('chevL',26,26,20,K.t,2.2);
 s.rect(296,180,48,24,{fill:'#0E1A26',rx:12,name:'Contador fotos'});C_(s,320,192,'1 / 6',11,700,'#FFFFFF');s.end();
 s.rect(0,216,360,640,{fill:'#FFFFFF',rx:20,name:'Hoja'});
 s.g('Informacion');T_(s,16,240,'Barbería El Patrón',24,800,K.t);meta(s,16,278,'4.8','120 reseñas','Barberías y estéticas',13);
 s.icon('pin',16,300,16,K.m,2);T_(s,38,304,'Av. Reforma 123, Zona Centro, Ensenada',13,500,K.m);
 s.icon('clock',16,324,16,K.ok,2);const aw=T_(s,38,328,'Abierto',13,800,K.ok);T_(s,38+aw,328,' · hoy de 9:00 a 20:00',13,500,K.m);s.end();
 s.g('Pestanas');let x=16;['Servicios','Equipo','Horario','Reseñas'].forEach((l,i)=>{const a=i===0;const w=M_(s,x,370,l,14,a?800:600,a?K.p:K.m);if(a)s.rect(x,386,w,3,{fill:K.p,rx:1.5,name:'Activa'});x+=w+26;});line(s,0,389,360);s.end();
 s.g('Servicios');SV.forEach(([n,d,p],i)=>{const y=402+i*58;s.g('Servicio '+n);T_(s,16,y+12,n,15,800,K.t);s.icon('clock',16,y+33,14,K.m,2);T_(s,36,y+36,d,12,500,K.m);
  R_(s,316,y+12,p,15,800,K.t);s.icon('chev',324,y+12,18,K.d,2);if(i<3)line(s,16,y+57,328);s.end();});s.end();
 note(s,16,644,328,'Puedes cancelar hasta 12 h antes de tu cita y recibir el 100% de reembolso.','info');
 bottomBar(s,716);s.g('Precio');T_(s,16,734,'Desde $120',18,800,K.t);T_(s,16,762,'Siguiente libre: hoy 16:00',12,700,K.ok);s.end();
 bigBtn(s,196,732,148,'Reservar',{h:50});
 return s.out();}

// ---------- 05 fecha y hora ----------
function summaryCard(s,y){s.g('Resumen del servicio');card(s,16,y,328,64);photo(s,28,y+12,40,40,'bar',10);T_(s,80,y+16,'Corte de cabello',15,800,K.t);T_(s,80,y+38,'Barbería El Patrón · con Juan',12,500,K.m);
 R_(s,332,y+16,'$200',15,800,K.t);R_(s,332,y+38,'40 min',12,500,K.m);s.end();}
function slot(s,x,y,w,t,sel){s.g('Horario '+t);s.rect(x,y,w,42,{fill:sel?K.p:'#FFFFFF',rx:12,stroke:sel?null:K.f,name:'Fondo'});C_(s,x+w/2,y+21,t,14,700,sel?'#FFFFFF':K.t);s.end();}
function mFecha(){const s=new S(360,800,'05 Reservar fecha y hora · celular',A);bg(s);
 mHeader(s,'Elige fecha y hora');steps(s,62,3);T_(s,16,78,'Paso 3 de 4',12,700,K.m);summaryCard(s,100);
 s.g('Mes');s.rect(16,182,32,32,{fill:'#FFFFFF',rx:10,stroke:K.f,name:'Anterior'});s.icon('chevL',23,189,18,K.t,2.2);C_(s,180,198,'Noviembre 2026',16,800,K.t);
 s.rect(312,182,32,32,{fill:'#FFFFFF',rx:10,stroke:K.f,name:'Siguiente'});s.icon('chev',319,189,18,K.t,2.2);s.end();
 s.g('Dias');const dw=(328-36)/7;[['Lun','16','off'],['Mar','17'],['Mié','18','sel'],['Jue','19'],['Vie','20'],['Sáb','21'],['Dom','22','off']].forEach(([d,n,st],i)=>{const x=16+i*(dw+6),y=226;
  s.g('Dia '+d);s.rect(x,y,dw,64,{fill:st==='sel'?K.p:st==='off'?K.sf:'#FFFFFF',rx:12,stroke:st?null:K.f,name:'Fondo'});const fg=st==='sel'?'#FFFFFF':st==='off'?K.d:K.t;
  C_(s,x+dw/2,y+20,d,11,700,st==='sel'?'#FFFFFF':st==='off'?K.d:K.m);C_(s,x+dw/2,y+43,n,18,800,fg);s.end();});s.end();
 s.g('Horarios');T_(s,16,314,'Horarios disponibles',16,800,K.t);R_(s,344,317,'Mié 18 nov',13,600,K.m);
 const sw=(328-30)/4;LAB(s,16,346,'Mañana');['09:00','09:40','10:20','11:00'].forEach((t,i)=>slot(s,16+i*(sw+10),364,sw,t));
 LAB(s,16,424,'Tarde');['12:20','13:00','16:00','16:40'].forEach((t,i)=>slot(s,16+i*(sw+10),442,sw,t,t==='16:00'));['17:20','18:00'].forEach((t,i)=>slot(s,16+i*(sw+10),494,sw,t));s.end();
 note(s,16,560,328,'Puedes reservar desde 1 h antes y hasta 30 días adelante.','info');
 bottomBar(s,716);s.g('Eleccion');T_(s,16,734,'Mié 18 nov · 16:00',16,800,K.t);T_(s,16,760,'Termina a las 16:40',12,500,K.m);s.end();bigBtn(s,196,732,148,'Continuar',{h:50});
 return s.out();}

// ---------- 06 resumen y pago ----------
function mPago(){const s=new S(360,800,'06 Reservar resumen y pago · celular',A);bg(s);
 mHeader(s,'Confirma y paga');steps(s,62,4);T_(s,16,78,'Paso 4 de 4',12,700,K.m);
 s.g('Resumen');card(s,16,100,328,218);photo(s,28,114,44,44,'bar',10);T_(s,84,118,'Barbería El Patrón',15,800,K.t);T_(s,84,140,'Av. Reforma 123, Ensenada',12,500,K.m);
 line(s,28,172,304);kv(s,28,188,304,'Servicio','Corte de cabello');kv(s,28,212,304,'Con','Juan');kv(s,28,236,304,'Fecha','Mié 18 nov · 16:00 a 16:40');line(s,28,262,304);
 T_(s,28,282,'Total',15,800,K.t);R_(s,332,280,'$200 MXN',18,800,K.t);s.end();
 note(s,16,330,328,'Cancelación gratis hasta el mié 18 nov a las 4:00 (12 h antes de tu cita).','blue');
 T_(s,16,410,'Pago con tarjeta',16,800,K.t);
 inp(s,16,436,328,'Número de tarjeta','4242 4242 4242 4242',{icon:'card'});
 inp(s,16,522,156,'Vencimiento','12 / 28');inp(s,188,522,156,'CVC','123',{right:'lock'});
 s.g('Cobro');s.icon('lock',16,612,16,K.m,2);s.wrap('Todavía no se te cobra: solo apartamos el monto. Se cobra cuando el negocio acepte; si no responde en 12 h, se libera.',304,{size:12,w:500}).forEach((l,i)=>T_(s,40,615+i*18,l,12,500,K.m));s.end();
 bigBtn(s,16,712,328,'Enviar solicitud · $200',{h:52});C_(s,180,782,'Pagos procesados de forma segura por Stripe',11,500,K.m);
 return s.out();}

// ---------- 07 mis reservas ----------
function bCard(s,y,mon,day,n,l,t,st){s.g('Reserva '+n);card(s,16,y,328,96);dateBox(s,28,y+12,56,72,mon,day);
 T_(s,98,y+18,n,15,800,K.t);T_(s,98,y+40,l,12,500,K.m);s.icon('clock',98,y+60,14,K.m,2);T_(s,118,y+63,t,12,700,K.t);scR(s,332,y+25,st,11,22);s.end();}
function mReservas(){const s=new S(360,800,'07 Mis reservas · celular',A);bg(s);
 T_(s,16,28,'Mis reservas',26,800,K.t);
 s.g('Pestanas');let x=16;[['Próximas',1],['Pendientes · 1'],['Pasadas'],['Canceladas']].forEach(([l,a])=>{x+=fchip(s,x,74,l,!!a)+8;});s.end();
 s.g('Proxima cita');s.rect(16,126,328,178,{fill:K.soft,rx:16,stroke:K.softL,name:'Fondo'});T_(s,30,144,'Tu próxima cita',11,800,K.p,{upper:true,ls:0.6});scR(s,330,149,'Confirmada',11,22);
 dateBox(s,30,168,60,66,'NOV','18',{fill:'#FFFFFF'});T_(s,104,172,'Barbería El Patrón',17,800,K.t);T_(s,104,196,'Corte de cabello · con Juan',13,500,K.m);
 s.icon('clock',104,214,15,K.m,2);T_(s,124,217,'Mié · 16:00 a 16:40',13,700,K.t);
 bigBtn(s,30,248,145,'Cómo llegar',{h:42,size:14,...SEC,icon:'pin',icolor:K.p,isz:16});bigBtn(s,185,248,145,'Ver detalle',{h:42,size:14});s.end();
 T_(s,16,328,'Más adelante',16,800,K.t);
 bCard(s,354,'NOV','21','Cancha La 10','Renta 1 h · Cancha 1','Sáb · 19:00 a 20:00','Confirmada');
 bCard(s,462,'NOV','25','Dental Sonrisa','Limpieza · con Dra. Ruiz','Mar · 10:00 a 10:45','Confirmada');
 bCard(s,570,'DIC','02','Spa Brisa','Masaje relajante · con Sofía','Mié · 18:00 a 19:00','Confirmada');
 navBar(s,'Reservas');return s.out();}

// ---------- computadora: encabezado cliente ----------
function dHeader(s,act){const T=A;s.g('Encabezado');s.rect(0,0,1280,72,{fill:'#FFFFFF',name:'Fondo'});line(s,0,71,1280);
 s.image(48,18,36,36,LOGO,'Logo');s.mid(94,36,'ReserYa',{size:22,w:800,fill:T.brand});search(s,232,13,440,46,34);
 s.g('Avatar');s.rect(1190,15,42,42,{fill:T.pill,rx:21,name:'Fondo'});s.center(1211,36,'A',{size:16,w:800,fill:T.primary});s.end();iconBtn(s,1136,15,42,'bell');
 const bl='Volver a agendar';const bw=18*2+s.tw(bl,{size:14,w:700})+18+8;const bx=1136-12-bw;btn(s,bx,15,bl,{h:42,size:14,icon:'rotate'});
 const l2='Mis reservas',l1='Inicio';const w2=s.tw(l2,{size:15,w:600})+28,w1=s.tw(l1,{size:15,w:600})+28;const x2=bx-14-w2,x1=x2-4-w1;
 s.g('Menu');[[x1,w1,l1],[x2,w2,l2]].forEach(([x,w,l])=>{const a=l===act;if(a)s.rect(x,18,w,36,{fill:T.pill,rx:10,name:'Activo'});s.mid(x+14,36,l,{size:15,w:a?800:600,fill:a?T.primary:T.linkT});});s.end();s.end();}

// ---------- 04 perfil del negocio (computadora) ----------
function dPerfil(){const s=new S(1280,800,'04 Perfil del negocio · computadora',A);bg(s);dHeader(s,null);
 s.g('Volver');s.icon('chevL',44,92,16,K.m,2.4);M_(s,64,100,'Volver a resultados',13,700,K.m);s.end();
 s.g('Fotos');photo(s,48,120,780,300,'bar',16);photo(s,840,120,392,144,'bar',16);photo(s,840,276,392,144,'bar',16);
 s.rect(1078,372,138,34,{fill:'#FFFFFF',rx:10,stroke:K.f,name:'Ver fotos'});s.icon('image',1090,381,16,K.t,2);M_(s,1114,389,'Ver las 6 fotos',13,700,K.t);s.end();
 s.g('Informacion');T_(s,48,446,'Barbería El Patrón',30,800,K.t);meta(s,48,490,'4.8','120 reseñas','Barberías y estéticas',14);
 s.icon('pin',48,514,16,K.m,2);const w1=T_(s,70,518,'Av. Reforma 123, Zona Centro, Ensenada',14,500,K.m);const cx=70+w1+22;s.icon('clock',cx,514,16,K.ok,2);
 const aw=T_(s,cx+22,518,'Abierto',14,800,K.ok);T_(s,cx+22+aw,518,' · hoy de 9:00 a 20:00',14,500,K.m);s.end();
 s.g('Pestanas');let x=48;['Servicios','Equipo','Horario','Reseñas (120)'].forEach((l,i)=>{const a=i===0;const w=M_(s,x,562,l,15,a?800:600,a?K.p:K.m);if(a)s.rect(x,580,w,3,{fill:K.p,rx:1.5,name:'Activa'});x+=w+30;});line(s,48,583,780);s.end();
 s.g('Servicios');SV.slice(0,3).forEach(([n,d,p],i)=>{const y=596+i*64;s.g('Servicio '+n);T_(s,48,y+14,n,16,800,K.t);s.icon('clock',48,y+36,14,K.m,2);T_(s,68,y+39,d,13,500,K.m);
  const ex=btnR(s,828,y+14,'Elegir',{h:36,size:13,px:16,...SEC});RM(s,ex-24,y+32,p,16,800,K.t);if(i<2)line(s,48,y+63,780);s.end();});s.end();
 s.g('Reservar');card(s,840,440,392,316);T_(s,864,464,'Desde',13,500,K.m);T_(s,864,484,'$120 MXN',28,800,K.t);
 const lw=T_(s,864,534,'Siguiente horario libre',13,500,K.m);chip(s,864+lw+10,539,'Hoy 16:00',true,12,24);
 bigBtn(s,864,566,344,'Reservar',{h:52});note(s,864,634,344,'Puedes cancelar hasta 12 h antes y recibir el 100% de reembolso.','info');
 s.icon('check',864,716,16,K.ok,2.4);T_(s,888,719,'El negocio confirma en menos de 12 h',13,600,K.m);s.end();
 return s.out();}

// ---------- negocio: menú lateral ----------
function sideItem(s,y,ic,l,act,o={}){const a=l===act;s.g('Opcion '+l);if(a)s.rect(12,y,224,38,{fill:K.soft,rx:10,name:'Activo'});
 if(ic==='google')google(s,26,y+11,16);else s.icon(ic,26,y+10,18,a?K.p:K.m,a?2.2:1.8);M_(s,54,y+19,l,14,a?800:600,a?K.p:K.t);
 if(o.count){s.rect(236-34,y+9,22,20,{fill:K.p,rx:10,name:'Contador'});C_(s,236-23,y+19,o.count,11,800,'#FFFFFF');}s.end();}
function sideTop(s,tag){s.rect(0,0,248,800,{fill:K.sf,name:'Fondo'});s.rect(247,0,1,800,{fill:K.l,name:'Linea'});
 s.image(20,20,32,32,LOGO,'Logo');const tw=M_(s,60,36,'ReserYa',18,800,K.t);chip2(s,60+tw+8,36,tag,K.soft,K.p,11,20);}
function sideFoot(s,ic,n,sub){s.g('Cuenta');line(s,12,728,224);s.rect(20,744,36,36,{fill:'#FFFFFF',rx:10,stroke:K.l,name:'Icono'});s.icon(ic,29,753,18,K.p,2);T_(s,66,748,n,13,800,K.t);
 s.icon('logout',66,764,13,K.m,2);T_(s,84,768,sub,12,600,K.m);s.end();}
IC.logout='<path d="m16 17 5-5-5-5M21 12H9M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>';
function bizSide(s,act,owner){s.g('Menu lateral');sideTop(s,'negocios');
 LAB(s,20,84,'Recepción');[['inbox','Solicitudes',{count:'3'}],['cal','Agenda'],['list','Reservas']].forEach(([ic,l,o],i)=>sideItem(s,100+i*40,ic,l,act,o));
 s.g('Modo dueno');s.icon(owner?'key':'lock',20,232,13,K.m,2.2);LAB(s,40,234,'Modo dueño');if(!owner)T_(s,236-s.tw('Con PIN',{size:11,w:600})-12,234,'Con PIN',11,600,K.d);s.end();
 [['dash','Panel'],['chart','Estadísticas'],['dollar','Pagos y reembolsos'],['scissors','Servicios'],['users','Equipo y espacios'],['sliders','Reglas de reserva'],['store','Perfil público'],['google','Google Calendar'],['link','Link en vivo']].forEach(([ic,l],i)=>sideItem(s,252+i*40,ic,l,act));
 sideFoot(s,'store','Barbería El Patrón','Cerrar sesión');s.end();}
function pageHead(s,title,sub){s.g('Titulo');T_(s,288,34,title,26,800,K.t);if(sub)T_(s,288,72,sub,14,500,K.m);s.end();}

// ---------- 08 solicitudes ----------
function reqItem(s,x,y,w,d){const sel=d.sel;s.g('Solicitud '+d.n);s.rect(x,y,w,76,{fill:sel?K.soft:'#FFFFFF',rx:12,stroke:sel?K.p:K.l,sw:sel?2:1,name:'Fondo'});
 T_(s,x+16,y+15,d.n,15,800,K.t);R_(s,x+w-16,y+15,d.p,15,800,K.t);T_(s,x+16,y+37,d.l,12,500,K.m);
 if(d.tag)chip2(s,x+16,y+60,d.tag[0],d.tag[1],d.tag[2],11,20);s.end();}
function reqGroup(s,x,y,w,title,exp,items){const h=56+items.length*84;s.g('Horario '+title);card(s,x,y,w,h);T_(s,x+16,y+20,title,15,800,K.t);
 const ew=s.tw(exp,{size:12,w:700});s.icon('clock',x+w-16-ew-20,y+18,14,K.w,2.2);T_(s,x+w-16-ew,y+21,exp,12,700,K.w);items.forEach((d,i)=>reqItem(s,x+12,y+48+i*84,w-24,d));s.end();return h;}
function dSolicitudes(){const s=new S(1280,800,'08 Negocio solicitudes · computadora',A);bg(s);bizSide(s,'Solicitudes');
 pageHead(s,'Solicitudes','Agrupadas por horario. La primera en llegar va arriba.');R_(s,1240,40,'Miércoles 18 de noviembre · 10:58',13,600,K.m);
 s.g('Cola');let y=108;y+=reqGroup(s,288,y,440,'Hoy · 16:00','Vence en 4 h 02 min',[{n:'Carlos M.',p:'$200',l:'Corte de cabello · con Juan · 16:00 a 16:40',sel:1,tag:['Primera en llegar','#FFFFFF',K.p]},{n:'Ana P.',p:'$120',l:'Barba · con Juan · 16:20 a 16:40',tag:['Se encima con Carlos M.',K.wS,K.w]}])+16;
 y+=reqGroup(s,288,y,440,'Hoy · 18:00','Vence en 6 h 02 min',[{n:'Luis R.',p:'$300',l:'Corte + barba · con Pedro · 18:00 a 19:00',tag:['Primera en llegar',K.soft,K.p]}])+16;
 reqGroup(s,288,y,440,'Jue 19 nov · 10:00','Vence en 11 h 40 min',[{n:'Rosa T.',p:'$150',l:'Lavado y peinado · cualquiera disponible',tag:['Primera en llegar',K.soft,K.p]}]);s.end();
 s.g('Detalle');const X=748,W=492;card(s,X,108,W,592);T_(s,X+24,130,'Solicitud de Carlos M.',20,800,K.t);scR(s,X+W-24,138,'Pendiente');
 [['Teléfono','646 555 0101'],['Correo','carlos.m@correo.com'],['Servicio','Corte de cabello'],['Con','Juan'],['Fecha','Hoy · 16:00 a 16:40'],['Recibida','Hoy · 10:42']].forEach(([k,v],i)=>kv(s,X+24,180+i*30,W-48,k,v));
 kv(s,X+24,360,W-48,'Vence','Hoy · 15:00',{c:K.w});line(s,X+24,392,W-48);T_(s,X+24,412,'Monto apartado',15,800,K.t);R_(s,X+W-24,410,'$200 MXN',20,800,K.t);
 let ny=452;ny+=note(s,X+24,ny,W-48,'Hay otra solicitud que se encima en este horario (Ana P.). Si aceptas esta, la otra se rechaza y se libera su monto.','warn')+12;
 note(s,X+24,ny,W-48,'Al aceptar se cobra el monto y se crea el evento en el calendario de Juan.','info');
 bigBtn(s,X+24,628,(W-60)/2,'Rechazar',{...SEC,color:K.e});bigBtn(s,X+36+(W-60)/2,628,(W-60)/2,'Aceptar solicitud',{icon:'check'});s.end();
 return s.out();}

// ---------- 09 agenda ----------
function dAgenda(){const s=new S(1280,800,'09 Negocio agenda del dia · computadora',A);bg(s);bizSide(s,'Agenda');
 pageHead(s,'Agenda',null);
 s.g('Fecha');s.rect(288,74,32,32,{fill:'#FFFFFF',rx:10,stroke:K.f,name:'Anterior'});s.icon('chevL',295,81,18,K.t,2.2);M_(s,332,90,'Miércoles 18 de noviembre',16,800,K.t);
 const dw=s.tw('Miércoles 18 de noviembre',{size:16,w:800});s.rect(332+dw+12,74,32,32,{fill:'#FFFFFF',rx:10,stroke:K.f,name:'Siguiente'});s.icon('chev',339+dw+12,81,18,K.t,2.2);
 btn(s,332+dw+56,74,'Hoy',{h:32,size:13,px:14,...SEC});s.end();
 s.g('Acciones');const x1=btnR(s,1240,30,'Modo pantalla',{h:40,size:14,icon:'tv',...SEC,color:K.t,isz:16});btnR(s,x1-10,30,'Link en vivo',{h:40,size:14,icon:'link',...SEC,isz:16});s.end();
 const GX=288,GY=120,GW=952,TC=64,CW=(GW-TC)/3,HH=52,RH=58,top=GY+HH;
 s.g('Calendario');card(s,GX,GY,GW,656);
 const RES=[['Juan','Barbero',K.soft,K.p,5],['Pedro','Barbero','#E1F6F0','#1F8F78',4],['Luis','Barbero',K.wS,K.w,4]];
 RES.forEach(([n,r,b,f,c],i)=>{const x=GX+TC+i*CW;s.g('Columna '+n);s.rect(x+16,GY+21,10,10,{fill:f,rx:5,name:'Color'});const nw=M_(s,x+34,GY+26,n,14,800,K.t);M_(s,x+34+nw+6,GY+26,'· '+r+' · '+c+' citas',12,500,K.m);s.rect(x,GY,1,656,{fill:K.l,name:'Separador'});s.end();});
 line(s,GX,top,GW);for(let i=0;i<10;i++){const y=top+i*RH;if(i)s.rect(GX+TC,y,GW-TC,1,{fill:'#EEF2F6',name:'Hora'});R_(s,GX+TC-10,y+6,(9+i)+':00',11,600,K.m);}
 const ev=(ci,a,b,n,sv)=>{const [,,bgc,fg]=RES[ci];const x=GX+TC+ci*CW+6,y=top+(a-9)*RH+2,h=Math.max(24,(b-a)*RH-4);s.g('Cita '+n);s.rect(x,y,CW-12,h,{fill:bgc,rx:8,name:'Fondo'});s.rect(x,y,4,h,{fill:fg,rx:2,name:'Color'});
  if(h<40){M_(s,x+14,y+h/2,n,12,800,K.t);const nw=s.tw(n,{size:12,w:800});M_(s,x+14+nw,y+h/2,' · '+sv,12,500,K.m);}else{T_(s,x+14,y+9,n,12,800,K.t);T_(s,x+14,y+27,sv,11,500,K.m);}s.end();};
 ev(0,9,9+40/60,'Carlos M.','Corte de cabello · 9:00 a 9:40');ev(0,10+20/60,11,'Marta S.','Corte de cabello · 10:20 a 11:00');ev(0,14,15,'Diego A.','Corte + barba · 14:00 a 15:00');ev(0,16,16+40/60,'Iván G.','Corte de cabello · 16:00 a 16:40');ev(0,17,17+40/60,'Raúl M.','Corte de cabello · 17:00 a 17:40');
 s.g('Evento de Google');const gx=GX+TC+6,gy=top+3*RH+2;dashRect(s,gx,gy,CW-12,RH-4,{stroke:K.d});T_(s,gx+14,gy+9,'Comida',12,800,K.m);T_(s,gx+14,gy+27,'Bloqueado desde Google Calendar',11,500,K.m);google(s,gx+CW-12-26,gy+9,14);s.end();
 ev(1,9+40/60,10,'Ana P.','Barba');ev(1,11,12,'Luis R.','Corte + barba · 11:00 a 12:00');ev(1,15,15+40/60,'Jorge L.','Corte de cabello · 15:00 a 15:40');ev(1,18,19,'Tomás V.','Corte + barba · 18:00 a 19:00');
 ev(2,10,10.5,'Rosa T.','Lavado y peinado');ev(2,13+40/60,14+20/60,'Óscar V.','Corte de cabello · 13:40 a 14:20');ev(2,16+20/60,17+20/60,'Toño R.','Corte + barba · 16:20 a 17:20');ev(2,18,18+20/60,'Pepe D.','Barba');
 s.g('Ahora');const ny=top+(13+24/60-9)*RH;s.rect(GX+TC,ny-1,GW-TC,2,{fill:K.e,name:'Linea'});s.rect(GX+TC-5,ny-5,10,10,{fill:K.e,rx:5,name:'Punto'});s.end();
 s.end();return s.out();}

// ---------- 10 panel del dueño ----------
function kpi(s,x,y,w,h,label,val,sub,subc,ic,trend){s.g('Dato '+label);card(s,x,y,w,h);T_(s,x+20,y+20,label,13,600,K.m);s.rect(x+w-20-36,y+14,36,36,{fill:K.soft,rx:10,name:'Icono'});s.icon(ic,x+w-20-27,y+23,18,K.p,2);
 T_(s,x+20,y+50,val,28,800,K.t);let sx=x+20;if(trend){s.icon('trend',sx,y+h-30,14,subc,2.2);sx+=20;}T_(s,sx,y+h-27,sub,12,700,subc);s.end();}
function dPanel(){const s=new S(1280,800,'10 Negocio panel del dueno · computadora',A);bg(s);bizSide(s,'Panel',true);
 pageHead(s,'Panel del dueño','Resumen de noviembre');btnR(s,1240,30,'Salir del modo dueño',{h:40,size:14,icon:'lock',...SEC,isz:16});
 const kw=(952-48)/4;[['Ingresos del mes','$18,400','+12% vs. octubre',K.ok,'dollar',1],['Reservas del mes','92','7 canceladas',K.m,'cal'],['Calificación','4.8','38 reseñas nuevas',K.m,'star'],['Solicitudes','3','Por responder hoy',K.w,'inbox']]
  .forEach(([l,v,sb,c,ic,tr],i)=>kpi(s,288+i*(kw+16),108,kw,120,l,v,sb,c,ic,tr));
 s.g('Reservas por dia');const cx=288,cy=248,cw=588,ch=304;card(s,cx,cy,cw,ch);T_(s,cx+24,cy+22,'Reservas por día',16,800,K.t);T_(s,cx+24,cy+46,'Semana del 16 al 22 de noviembre',12,500,K.m);
 const px=cx+56,pw=cw-80,pb=cy+ch-44,pt=cy+84,ph=pb-pt;[0,10,20,30].forEach(v=>{const y=pb-v/30*ph;s.rect(px,y,pw,1,{fill:v?'#EEF2F6':K.l,name:'Guia '+v});R_(s,px-10,y-5,String(v),11,600,K.m);});
 const vals=[9,14,11,16,21,27,8],days=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];const bwid=pw/7;
 vals.forEach((v,i)=>{const bx=px+i*bwid+(bwid-36)/2,bh=v/30*ph;s.g('Barra '+days[i]);s.rect(bx,pb-bh,36,bh,{fill:i===2?K.p:'#8CC6E0',rx:6,name:'Barra'});C_(s,bx+18,pb-bh-12,String(v),12,700,K.t);C_(s,bx+18,pb+18,days[i],12,i===2?800:600,i===2?K.p:K.m);s.end();});s.end();
 s.g('Proximas citas');const rx=892,rw=348;card(s,rx,cy,rw,ch);T_(s,rx+20,cy+22,'Próximas citas',16,800,K.t);R_(s,rx+rw-20,cy+24,'Ver agenda',13,700,K.p);
 [['14:00','Diego A.','Corte + barba · con Juan'],['15:00','Jorge L.','Corte de cabello · con Pedro'],['16:00','Iván G.','Corte de cabello · con Juan'],['16:20','Toño R.','Corte + barba · con Luis']].forEach(([t,n,l],i)=>{const y=cy+60+i*58;s.g('Cita '+n);
  s.rect(rx+20,y,60,44,{fill:K.soft,rx:10,name:'Hora'});C_(s,rx+50,y+22,t,13,800,K.p);T_(s,rx+94,y+8,n,14,800,K.t);T_(s,rx+94,y+28,l,12,500,K.m);s.end();});s.end();
 s.g('Atajos');T_(s,288,576,'Atajos',16,800,K.t);[['scissors','Servicios','4 servicios activos'],['users','Equipo y espacios','3 barberos'],['sliders','Reglas de reserva','Cancelación: 12 h'],['google','Google Calendar','Conectado']].forEach(([ic,l,sb],i)=>{const x=288+i*(kw+16),y=602;
  s.g('Atajo '+l);card(s,x,y,kw,76);s.rect(x+16,y+18,40,40,{fill:ic==='google'?'#FFFFFF':K.soft,rx:10,stroke:ic==='google'?K.l:null,name:'Icono'});if(ic==='google')google(s,x+26,y+28,20);else s.icon(ic,x+26,y+28,20,K.p,2);
  T_(s,x+68,y+22,l,14,800,K.t);T_(s,x+68,y+44,sb,12,ic==='google'?700:500,ic==='google'?K.ok:K.m);s.icon('chev',x+kw-34,y+29,18,K.d,2);s.end();});s.end();
 note(s,288,702,952,'Google Calendar está conectado. Última sincronización hace 2 minutos.','ok');
 return s.out();}

// ---------- 11 admin · negocios pendientes ----------
function dAdmin(){const s=new S(1280,800,'11 Admin negocios pendientes · computadora',A);bg(s);
 s.g('Menu lateral');sideTop(s,'admin');LAB(s,20,84,'Administración');[['clock','Pendientes',{count:'3'}],['store','Negocios'],['key','Claves de registro']].forEach(([ic,l,o],i)=>sideItem(s,100+i*40,ic,l,'Pendientes',o));
 sideFoot(s,'user','Administrador','Cerrar sesión');s.end();
 pageHead(s,'Negocios pendientes','Negocios que se registraron con una clave y esperan tu aprobación.');btnR(s,1240,30,'Generar clave',{h:40,size:14,icon:'plus',...SEC,isz:16});
 const kw=(952-32)/3;[['Por revisar','3','El más antiguo, hace 3 días',K.w,'clock'],['Negocios activos','18','1 suspendido',K.m,'store'],['Claves sin usar','4','Generadas este mes',K.m,'key']].forEach(([l,v,sb,c,ic],i)=>kpi(s,288+i*(kw+16),108,kw,112,l,v,sb,c,ic));
 s.g('Tabla');const ty=240,cols=[['Negocio',312],['Categoría',556],['Contacto',716],['Clave usada',926],['Recibido',1046]];card(s,288,ty,952,48+3*80);
 cols.forEach(([c,x])=>LAB(s,x,ty+19,c));line(s,289,ty+48,950);
 [['Barbería El Patrón','bar','Barbería','patron@correo.com','646 123 4567','ABCD-1234','Hace 2 h'],['Uñas Lupita','una','Salón de uñas','lupita@correo.com','646 222 8810','QK7N-83LP','Ayer'],['Futbolito Norte','can','Canchas de fútbol','norte@correo.com','646 310 4477','M3TN-55VA','Hace 3 días']]
  .forEach(([n,k,c,m,ph,key,t],i)=>{const y=ty+48+i*80;s.g('Fila '+n);if(i)line(s,289,y,950);photo(s,312,y+18,44,44,k,10);T_(s,368,y+24,n,14,800,K.t);T_(s,368,y+46,'Ensenada',12,500,K.m);
   T_(s,556,y+34,c,14,500,K.t);T_(s,716,y+24,m,14,600,K.t);T_(s,716,y+46,ph,12,500,K.m);chip2(s,926,y+40,key,K.sf,K.t,12,26);T_(s,1046,y+34,t,14,500,i===2?K.w:K.t);
   btnR(s,1220,y+22,'Revisar',{h:36,size:13,px:16});s.end();});s.end();
 note(s,288,548,952,'Aprobar es un solo paso y el negocio aparece en las búsquedas cuando termine su configuración. Rechazar pide un motivo que se envía por correo.','info');
 return s.out();}

window.PANTALLAS=()=>({
 '01-iniciar-sesion-celular.svg':mLogin(),
 '02-inicio-celular.svg':mobile(A),
 '02-inicio-computadora.svg':desktop(A),
 '03-resultados-celular.svg':mResultados(),
 '04-perfil-negocio-celular.svg':mPerfil(),
 '04-perfil-negocio-computadora.svg':dPerfil(),
 '05-reservar-fecha-hora-celular.svg':mFecha(),
 '06-reservar-pago-celular.svg':mPago(),
 '07-mis-reservas-celular.svg':mReservas(),
 '08-negocio-solicitudes-computadora.svg':dSolicitudes(),
 '09-negocio-agenda-computadora.svg':dAgenda(),
 '10-negocio-panel-computadora.svg':dPanel(),
 '11-admin-negocios-pendientes-computadora.svg':dAdmin()
});
