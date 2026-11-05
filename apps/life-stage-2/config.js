// 公開設定（ブラウザに公開される値のみ。service_role キーや AI キーは絶対に書かない）
// supabaseUrl / supabaseAnonKey が空の場合は「ローカル試用モード」（ログインなし・コアタブ非表示）で動作。
window.LS_CONFIG = {
  supabaseUrl: "https://xltholkcsbfkbqhnthrr.supabase.co",
  supabaseAnonKey: "sb_publishable_rWMrhkrRPOGFIfvqtH5fRQ_5ebXw6D3",
  aiEnabled: false, // Edge Function ls-ai をデプロイし ANTHROPIC_API_KEY を設定したら true
};
