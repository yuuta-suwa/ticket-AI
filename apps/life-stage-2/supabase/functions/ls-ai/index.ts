// LIFE STAGE 2.0 システムAI分析（任意）。ANTHROPIC_API_KEY 未設定時は 503 を返し、アプリはコピペ方式のみになる。
// secrets: ANTHROPIC_API_KEY（必須） / LS_AI_MODEL / LS_AI_DAILY_LIMIT / LS_ALLOWED_ORIGIN
import { createClient } from "jsr:@supabase/supabase-js@2";

const ORIGIN = Deno.env.get("LS_ALLOWED_ORIGIN") ?? "*";
const CORS = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

const SYSTEM = `あなたは自己成長プログラム「LIFE STAGE 2.0」のコーチです。受講者本人が書いた記録だけを根拠に、日本語で簡潔に助言します。
必ず【事実】【仮説】【未確認】【次の行動】の4見出しで答えてください。記録にない数値や出来事を作らないこと。断定・診断・説教をしないこと。
医療・法律・投資の判断は専門家への相談を勧めること。`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json(503, { error: "システムAIは未設定です" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json(401, { error: "ログインが必要です" });

  let body: { program?: string; prompt?: string };
  try { body = await req.json(); } catch { return json(400, { error: "不正なリクエスト" }); }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt || prompt.length > 12000) return json(400, { error: "依頼文は1〜12000字にしてください" });

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: prof } = await admin.from("ls_profiles").select("role").eq("user_id", user.id).maybeSingle();
  if (body.program === "core" && !["core", "admin"].includes(prof?.role ?? "")) return json(403, { error: "コアメンバー専用です" });

  const limit = Number(Deno.env.get("LS_AI_DAILY_LIMIT") ?? "20");
  const { data: allowed, error: qErr } = await admin.rpc("ls_ai_consume", { uid: user.id, lim: limit });
  if (qErr) return json(500, { error: "利用回数の確認に失敗しました" });
  if (!allowed) return json(429, { error: `本日のシステムAI利用上限（${limit}回）に達しました。コピーして自端末のAIをご利用ください` });

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("LS_AI_MODEL") ?? "claude-sonnet-5-5",
      max_tokens: 1200,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!r.ok) { console.error("anthropic", r.status, await r.text()); return json(502, { error: "AIの応答に失敗しました" }); }
  const j = await r.json();
  const text = (j.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("\n");
  return json(200, { text });
});
