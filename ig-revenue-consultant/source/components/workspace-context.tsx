"use client";
import {createContext,useContext} from "react";
import type {State} from "@/lib/model";
export type View="overview"|"sources"|"research"|"experiments"|"content"|"ledger"|"ai"|"settings";
export type Modal={type:"source"|"evidence"|"experiment"|"content"|"ledger"|"metric"|"import"|"publish"|"connect"|"review";id?:string;kind?:string;seed?:Record<string,unknown>;provider?:string};
export type Connection={provider:string;metadata:{id?:string;username?:string;models?:{id:string;name:string}[];lastSyncedAt?:string;capabilities?:string[]};updatedAt:string};
export type Connections={connections:Connection[];encryptionReady:boolean;error?:string};
export type ActionResult={state?:State;revision?:number;savedAt?:string;message?:string;error?:string;publish?:{status:string;message:string};sync?:{posts:number;metrics:number;issues:string[]};autoAnalysis?:{status:string;message:string}};
export type WorkspaceResponse={state:State;revision:number;savedAt?:string;readOnly:boolean;user?:{name:string};error?:string;autoAnalysis?:{status:string;message:string}};
export type WorkspaceContext={consultRequest:string;consultTask:"analysis"|"strategy"|"content";consult:(request:string,task?:"analysis"|"strategy"|"content")=>void;state:State;revision:number;busy:boolean;readOnly:boolean;demo:boolean;view:View;userName:string;connections:Connections;setView:(view:View)=>void;open:(modal:Modal)=>void;close:()=>void;save:(fn:(s:State)=>void)=>Promise<boolean>;action:(path:string,body:Record<string,unknown>)=>Promise<ActionResult|null>;setConnections:(data:Connections)=>void;reload:()=>Promise<void>;runAI:(mode:"rules"|"model"|"import",task:"analysis"|"strategy"|"content",request:string,web:boolean,result?:string)=>Promise<boolean>};
export const Workspace=createContext<WorkspaceContext|null>(null);
export function useWorkspace(){const c=useContext(Workspace);if(!c)throw new Error("Workspace missing");return c;}
