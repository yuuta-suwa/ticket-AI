"use client";
import {useEffect,useRef} from "react";
import type { ReactNode,ButtonHTMLAttributes,InputHTMLAttributes,SelectHTMLAttributes,TextareaHTMLAttributes } from "react";
import { X, ArrowUpRight } from "lucide-react";
export function Button({children,variant="primary",className="",...props}:ButtonHTMLAttributes<HTMLButtonElement>&{variant?:"primary"|"secondary"|"ghost"|"danger"}){return <button className={`btn ${variant} ${className}`} {...props}>{children}</button>;}
export function Pill({children,tone="gray"}:{children:ReactNode;tone?:string}){return <span className={`pill ${tone}`}>{children}</span>;}
export function Panel({children,className=""}:{children:ReactNode;className?:string}){return <section className={`panel ${className}`}>{children}</section>;}
export function Empty({icon, title,children,action}:{icon?:ReactNode;title:string;children?:ReactNode;action?:ReactNode}){return <div className="empty">{icon&&<div className="empty-icon">{icon}</div>}<h3>{title}</h3><p>{children}</p>{action}</div>;}
export function Field({label,hint,children}:{label:string;hint?:string;children:ReactNode}){return <label className="field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>;}
export function Input(props:InputHTMLAttributes<HTMLInputElement>){return <input {...props} />;}
export function Textarea(props:TextareaHTMLAttributes<HTMLTextAreaElement>){return <textarea rows={4} {...props} />;}
export function Select(props:SelectHTMLAttributes<HTMLSelectElement>){return <select {...props}/>;}
export function safeHref(value:string){try{const u=new URL(value);return ["http:","https:"].includes(u.protocol)?u.href:"";}catch{return "";}}
export function External({href,children}:{href:string;children:ReactNode}){const safe=safeHref(href);return safe?<a className="external-link" href={safe} target="_blank" rel="noopener noreferrer">{children}<ArrowUpRight size={14}/></a>:<span>{children}</span>;}
export function Dialog({title,description,children,onClose,wide=false}:{title:string;description?:string;children:ReactNode;onClose:()=>void;wide?:boolean}){
 const root=useRef<HTMLElement>(null);
 useEffect(()=>{const prior=document.activeElement as HTMLElement|null;const overflow=document.body.style.overflow;document.body.style.overflow="hidden";root.current?.querySelector<HTMLElement>("button")?.focus();return()=>{document.body.style.overflow=overflow;prior?.focus();};},[]);
 return <div className="modal-shade" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={root} className={`modal ${wide?"wide":""}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title" onKeyDown={e=>{if(e.key==="Escape")onClose();if(e.key==="Tab"){const focusable=Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')||[]).filter(el=>el.offsetParent!==null);const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}><header className="modal-header"><div><h2 id="dialog-title">{title}</h2>{description&&<p>{description}</p>}</div><button aria-label="閉じる" className="icon-btn" onClick={onClose}><X size={21}/></button></header>{children}</section></div>;
}
export function download(name:string,text:string,type="application/json"){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export async function copyText(text:string){if(navigator.clipboard){try{await navigator.clipboard.writeText(text);return;}catch{}}const t=document.createElement("textarea");t.value=text;t.style.position="fixed";t.style.opacity="0";document.body.appendChild(t);t.select();const success=document.execCommand("copy");t.remove();if(!success)throw new Error("コピーできませんでした。テキストを選択してコピーしてください。");}
