// 公開設定
// Desmos API key 依 Desmos 的設計本來就會出現在前端程式碼中（瀏覽器載入 calculator.js 時必須帶上），
// 這組 key 只用在這個網站。
export const DESMOS_API_KEY = '59c1f0d3b267415bb79a8d7e3f642af7';
export const DESMOS_VERSION = '1.11';

// Supabase：URL 與 publishable key 依設計可以公開（資料表全部鎖住，只能透過 RPC 函式存取）
export const SUPABASE_URL = 'https://exftsticfjnmmwjvjjor.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_5Sr1Z2WZauEkThdln8Qipg_LWUeDCsP';
