import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';

import type { Database } from './database.types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY が .env に設定されていません'
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// supabase-jsのfunctions.invoke()は、Edge Functionが2xx以外を返すとdataをnullにしてしまい、
// Edge Function側がJSONで返した本来のエラーメッセージ({error: '...'})が読めなくなる
// (実際の中身はerror.contextというResponseオブジェクトの中にあり、別途.json()する必要がある)。
// これに気付かず各画面が「〜に失敗しました」という汎用メッセージにフォールバックしてしまい、
// 実際の原因(Shopify APIエラー・secrets未設定・404等)が画面から分からなくなっていた
// (実機フィードバック: 注文取込が「注文の取得に失敗しました」としか出ず原因不明だった件)。
// 呼び出し側で毎回この処理をするのは煩雑かつ漏れやすいため、共通ヘルパーとして用意する。
export async function invokeEdgeFunction<T = any>(
  name: string,
  options?: Parameters<typeof supabase.functions.invoke>[1]
): Promise<{ data: T | null; errorMessage: string | null }> {
  const { data, error } = await supabase.functions.invoke(name, options);

  if (!error) {
    if (data?.error) return { data: null, errorMessage: data.error as string };
    return { data: data as T, errorMessage: null };
  }

  if (error instanceof FunctionsHttpError || error instanceof FunctionsRelayError) {
    try {
      const body = await error.context.json();
      if (body?.error) return { data: null, errorMessage: body.error as string };
    } catch {
      try {
        const text = await error.context.text();
        if (text) return { data: null, errorMessage: text };
      } catch {
        // 本文が読めない場合は下の汎用メッセージにフォールバックする
      }
    }
  }

  return { data: null, errorMessage: error.message || '通信エラーが発生しました' };
}
