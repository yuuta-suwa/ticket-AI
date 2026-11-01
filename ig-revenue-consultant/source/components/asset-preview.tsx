"use client";
import {useState} from "react";
import Image from "next/image";
import {safeHref} from "./ui";
export function AssetPreview({url,video=false}:{url:string;video?:boolean}){
 const [failed,setFailed]=useState(false);const safe=safeHref(url);
 if(!safe||!safe.startsWith("https:"))return null;
 return <div className="asset-preview">{failed?<p>素材を表示できません。参照URLで実際の内容を確認してください。</p>:video?<video src={safe} controls preload="metadata" onError={()=>setFailed(true)}/>:<Image src={safe} alt="公開対象の完成素材" unoptimized width={900} height={900} onError={()=>setFailed(true)}/>}</div>;
}
