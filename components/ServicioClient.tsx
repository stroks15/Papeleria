'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Capacitor } from '@capacitor/core';
import type { AIServicio } from '@/lib/ai-services';
import { credentialSheet, photosToPdf, compressPdf, restorePhoto } from '@/lib/client/localTools';
import { scanIneToPdf } from '@/lib/client/ineScanner';
import { programarRecordatorio } from '@/lib/client/reminders';

type Artifact = { filename: string; mimeType: string; dataBase64: string; size: number };
const LOCAL_ACTIONS = new Set(['create_pdf_from_photos','scan_to_pdf','compress_pdf','restore_photo','create_id_photos','scan_ine']);
const PDF_ACTIONS = new Set(['create_cheatsheet','create_flashcards','fill_form','research_topic']);

function toArtifact(filename:string,mimeType:string,dataUrl:string,size:number):Artifact {
  return { filename, mimeType, dataBase64:dataUrl.split(',')[1] || '', size };
}
function dataUrl(bytes:Uint8Array,mimeType:string) {
  let binary=''; for(let i=0;i<bytes.length;i+=0x8000) binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length)));
  return 'data:'+mimeType+';base64,'+btoa(binary);
}
function readFile(file:File):Promise<string>{return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(r.error);r.readAsDataURL(file);});}

export default function ServicioClient({ servicio }:{servicio:AIServicio}) {
  const [mensaje,setMensaje]=useState(''); const [respuesta,setRespuesta]=useState(''); const [cargando,setCargando]=useState(false);
  const [archivos,setArchivos]=useState<File[]>([]); const [ineFront,setIneFront]=useState<File|null>(null); const [ineBack,setIneBack]=useState<File|null>(null);
  const [artifact,setArtifact]=useState<Artifact|null>(null); const [fechaRecordatorio,setFechaRecordatorio]=useState('');
  const galleryRef=useRef<HTMLInputElement>(null); const cameraRef=useRef<HTMLInputElement>(null);
  const frontGallery=useRef<HTMLInputElement>(null); const frontCamera=useRef<HTMLInputElement>(null); const backGallery=useRef<HTMLInputElement>(null); const backCamera=useRef<HTMLInputElement>(null);
  const esIne=servicio.action==='scan_ine'; const esOpcional=servicio.input==='optional-images'; const necesitaArchivo=servicio.input!=='text'&&!esOpcional;
  const accept=useMemo(()=>servicio.input==='pdf'?'application/pdf,.pdf':servicio.input==='images' || esOpcional?'image/*':servicio.input==='images-or-pdf'?'image/*,application/pdf,.pdf':undefined,[servicio.input,esOpcional]);

  async function descargar(a:Artifact){
    try{
      if(Capacitor.isNativePlatform()){
        const { guardarArchivoEnAndroid } = await import('@/lib/nativeFiles');
        await guardarArchivoEnAndroid(a.filename,a.mimeType,a.dataBase64);
        setRespuesta('Archivo guardado en Descargas/Papelería Arcoíris.');
        return;
      }
      const el=document.createElement('a');
      el.href='data:'+a.mimeType+';base64,'+a.dataBase64;
      el.download=a.filename;
      document.body.appendChild(el);
      el.click();
      el.remove();
    }catch{
      setRespuesta('No se pudo guardar el archivo. Pulsa Descargar de nuevo.');
    }
  }
  function entregar(a:Artifact){setArtifact(a);if(a.mimeType==='application/pdf')setTimeout(()=>void descargar(a),250);}
  function seleccionar(files:FileList|null){if(!files)return;const list=Array.from(files).filter(f=>servicio.input==='pdf'?(f.type==='application/pdf'||f.name.endsWith('.pdf')):(f.type.startsWith('image/')||f.type==='application/pdf')).slice(0,servicio.input==='images'?20:5);setArchivos(list);setArtifact(null);setRespuesta(list.length?list.length+' archivo(s) seleccionado(s).':'No se seleccionó un archivo compatible.');}
  function seleccionarIne(side:'front'|'back',files:FileList|null){const f=files?.[0];if(!f)return;if(!f.type.startsWith('image/')){setRespuesta('La INE debe ser una fotografía.');return;}side==='front'?setIneFront(f):setIneBack(f);setArtifact(null);setRespuesta(side==='front'?'Frente listo.':'Reverso listo.');}

  async function local(){if(esIne){if(!ineFront||!ineBack)throw new Error('Selecciona frente y reverso de la INE.');const r=await scanIneToPdf(ineFront,ineBack);return toArtifact(r.filename,r.mimeType,r.dataUrl,r.size);}
    if(!archivos.length)throw new Error('Selecciona un archivo.');let r;
    if(servicio.action==='create_pdf_from_photos'||servicio.action==='scan_to_pdf')r=await photosToPdf(archivos);
    else if(servicio.action==='compress_pdf')r=await compressPdf(archivos[0]);
    else if(servicio.action==='restore_photo')r=await restorePhoto(archivos[0]);
    else r=await credentialSheet(archivos[0]);
    return toArtifact(r.filename,r.mimeType,r.dataUrl,r.size);
  }

  async function ai(){
    const urls=await Promise.all(archivos.map(readFile)); const images=archivos.map((f,i)=>f.type.startsWith('image/')?urls[i]:null).filter((x):x is string=>!!x);
    const files=archivos.map((f,i)=>({data:urls[i],mimeType:f.type||'application/octet-stream',name:f.name}));
    const base=process.env.NEXT_PUBLIC_ASSISTANT_API_URL||(Capacitor.isNativePlatform()?'https://papeleria-arcoiris.vercel.app':'');
    const res=await fetch(base+'/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:mensaje.trim()||'Analiza el material seleccionado.',context:{currentModule:servicio.id,currentStep:'inicio',requestedAction:servicio.action},images,files})});
    const data=await res.json(); if(!res.ok||!data.ok)throw new Error(data.error||'No se pudo ejecutar el servicio.');
    if(data.artifact)entregar(data.artifact);
    else if(PDF_ACTIONS.has(servicio.action)){const {PDFDocument,StandardFonts}=await import('pdf-lib');const pdf=await PDFDocument.create();let page=pdf.addPage([595.28,841.89]);const font=await pdf.embedFont(StandardFonts.Helvetica);let y=800;for(const raw of String(data.reply||'Listo.').replace(/\r/g,'').split('\n')){for(let x=0;x<raw.length;x+=85){if(y<45){page=pdf.addPage([595.28,841.89]);y=800;}page.drawText(raw.slice(x,x+85),{x:40,y,size:11,font});y-=16;}y-=5;}const bytes=await pdf.save({useObjectStreams:true,addDefaultPage:false});entregar(toArtifact('resultado-papeleria-arcoiris.pdf','application/pdf',dataUrl(bytes,'application/pdf'),bytes.byteLength));}
    setRespuesta(data.reply||'Listo.');
  }

  async function ejecutar(){setCargando(true);setArtifact(null);try{if(LOCAL_ACTIONS.has(servicio.action)){entregar(await local());setRespuesta(esIne?'INE escaneada: ambas caras fueron recortadas, corregidas y colocadas en un PDF.':'Listo. Procesado en el dispositivo.');}
    else if(servicio.action==='create_reminder'){if(!fechaRecordatorio)throw new Error('Elige fecha y hora.');await programarRecordatorio(mensaje||'Recordatorio de Papelería Arcoíris',mensaje||'Tienes un recordatorio pendiente.',new Date(fechaRecordatorio));setRespuesta('Recordatorio programado correctamente.');}
    else await ai();}catch(e){setRespuesta(e instanceof Error?e.message:'No se pudo completar la herramienta.');}finally{setCargando(false);}}

  return <main className="min-h-screen bg-papel p-4 pb-10 max-w-md mx-auto">
    <Link href="/" className="inline-flex items-center gap-2 rounded-xl bg-carta px-4 py-2 font-bold text-tinta shadow-sm ring-2 ring-tinta/10">← Volver al inicio</Link>
    <section className="mt-4 rounded-3xl bg-carta p-5 shadow-md ring-1 ring-tinta/10">
      <div className="flex items-center gap-4"><span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-papel text-3xl">{servicio.emoji}</span><div><h1 className="text-2xl font-bold text-tinta">{servicio.title}</h1><p className="text-sm text-tinta-suave">{servicio.description}</p></div></div>

      {esIne?<div className="mt-5 space-y-4">
        <p className="text-sm text-tinta-suave">Para cada cara puedes usar cámara o elegir una foto de la galería.</p>
        <div className="rounded-2xl bg-papel p-4">
          <b className="text-tinta">1. Frente de la INE</b>
          <input ref={frontGallery} type="file" accept="image/*" className="sr-only" onChange={e=>seleccionarIne('front',e.target.files)}/>
          <input ref={frontCamera} type="file" accept="image/*" capture="environment" className="sr-only" onChange={e=>seleccionarIne('front',e.target.files)}/>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={()=>frontGallery.current?.click()} className="rounded-xl bg-white p-3 font-bold text-tinta">🖼️ Galería</button>
            <button type="button" onClick={()=>frontCamera.current?.click()} className="rounded-xl bg-white p-3 font-bold text-tinta">📷 Cámara</button>
          </div>
          {ineFront&&<p className="mt-2 truncate text-sm text-tinta">✓ {ineFront.name}</p>}
        </div>
        <div className="rounded-2xl bg-papel p-4">
          <b className="text-tinta">2. Reverso de la INE</b>
          <input ref={backGallery} type="file" accept="image/*" className="sr-only" onChange={e=>seleccionarIne('back',e.target.files)}/>
          <input ref={backCamera} type="file" accept="image/*" capture="environment" className="sr-only" onChange={e=>seleccionarIne('back',e.target.files)}/>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={()=>backGallery.current?.click()} className="rounded-xl bg-white p-3 font-bold text-tinta">🖼️ Galería</button>
            <button type="button" onClick={()=>backCamera.current?.click()} className="rounded-xl bg-white p-3 font-bold text-tinta">📷 Cámara</button>
          </div>
          {ineBack&&<p className="mt-2 truncate text-sm text-tinta">✓ {ineBack.name}</p>}
        </div>
        <p className="rounded-2xl bg-white p-3 text-sm text-tinta">El PDF tendrá una página tamaño carta, con frente y reverso recortados, enderezados y colocados a escala de la plantilla.</p>
      </div>: (necesitaArchivo||esOpcional)&&<div className="mt-5"><input ref={galleryRef} type="file" accept={accept} multiple={servicio.input==='images'||servicio.input==='images-or-pdf'} className="sr-only" onChange={e=>seleccionar(e.target.files)}/><input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={e=>seleccionar(e.target.files)}/>
        <div className="grid grid-cols-2 gap-2"><button type="button" onClick={()=>galleryRef.current?.click()} className="rounded-2xl border-2 border-dashed border-oficial bg-papel p-4 font-bold text-tinta">🖼️ Galería</button>{(servicio.input==='images'||servicio.input==='images-or-pdf'||esOpcional)&&<button type="button" onClick={()=>cameraRef.current?.click()} className="rounded-2xl border-2 border-dashed border-oficial bg-white p-4 font-bold text-tinta">📷 Tomar foto</button>}</div>
        {esOpcional&&<p className="mt-2 text-xs text-tinta-suave">Foto opcional: puedes hacer el anuncio solo con texto.</p>}
        {archivos.length>0&&<p className="mt-3 rounded-2xl bg-papel p-3 text-sm text-tinta">{archivos.length} archivo(s) seleccionado(s).</p>}</div>}

      {servicio.action==='create_reminder'&&<div className="mt-5"><label htmlFor="fecha" className="font-bold text-tinta">Fecha y hora</label><input id="fecha" type="datetime-local" value={fechaRecordatorio} onChange={e=>setFechaRecordatorio(e.target.value)} className="mt-2 w-full rounded-2xl bg-white p-3 text-tinta ring-2 ring-tinta/10"/></div>}
      {servicio.action!=='create_reminder'&&<><label htmlFor="mensaje" className="mt-5 block font-bold text-tinta">Instrucción</label><textarea id="mensaje" value={mensaje} onChange={e=>setMensaje(e.target.value)} placeholder={esIne?'Opcional: nota del escaneo…':esOpcional?'Ej. oferta, precio y datos del producto…':'Cuéntame qué necesitas…'} className="mt-2 min-h-28 w-full rounded-2xl bg-white p-3 text-tinta ring-2 ring-tinta/10"/></>}
      {servicio.action==='fill_form'&&<div className="mt-4 rounded-2xl bg-papel p-4 text-sm text-tinta"><b>Ejemplos:</b><ul className="mt-2 list-disc pl-5"><li>Solicitud de empleo</li><li>Formato escolar</li><li>Solicitud de beca</li><li>Formato de trámite gubernamental</li></ul></div>}
      <button type="button" onClick={()=>void ejecutar()} disabled={cargando||(esIne?(!ineFront||!ineBack):(necesitaArchivo&&!archivos.length))} className="mt-4 w-full rounded-2xl bg-oficial p-4 text-lg font-bold text-carta disabled:opacity-50">{cargando?'Procesando…':esIne?'Escanear INE y generar PDF':LOCAL_ACTIONS.has(servicio.action)?'Procesar en el dispositivo':servicio.action==='create_reminder'?'Programar recordatorio':'Ejecutar'}</button>
      {respuesta&&<div className="mt-4 whitespace-pre-line rounded-2xl bg-white p-4 text-tinta ring-2 ring-tinta/10">{respuesta}</div>}
      {artifact&&<div className="mt-4 rounded-2xl bg-papel p-4"><b className="text-tinta">Archivo listo: {artifact.filename}</b>{artifact.mimeType==='application/pdf'&&<p className="mt-1 text-xs text-tinta-suave">El PDF se descargó automáticamente.</p>}<button type="button" onClick={()=>descargar(artifact)} className="mt-3 w-full rounded-xl bg-oficial p-3 font-bold text-carta">Descargar de nuevo</button></div>}
    </section>
  </main>;
}
