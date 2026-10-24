import { supabase } from "../supabaseClient";
import { narratorUnavailableSentinel } from "../narratorBudget";

/**
 * Headers for the narrator edge functions (narrator-claude, tts, agent-auth,
 * openai-agent-auth). The bearer is the SESSION user's access token, anonymous
 * users included, so the server can tell a Plus subscriber (whose purchase may
 * be attached to an anonymous id) from everyone else; without a session it is
 * the anon key, which names no user and gets the demo path.
 */
export async function narratorHeaders(): Promise<Record<string, string>> {
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session?.access_token ?? key}`,
    apikey: key,
  };
}

/**
 * Turns a 402 from a narrator function into the sentinel error the hook
 * understands (budget / plus / allowance). Returns null for any other status.
 */
export async function narratorRefusal(res: Response): Promise<Error | null> {
  if (res.status !== 402) return null;
  const body = await res.json().catch(() => null);
  return new Error(narratorUnavailableSentinel(body));
}
