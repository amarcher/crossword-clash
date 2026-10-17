import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { User } from "@supabase/supabase-js";

export function useSupabase() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    const client = supabase;

    // Check existing session
    client.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        setLoading(false);
      } else {
        // Sign in anonymously
        client.auth.signInAnonymously().then(({ data, error }) => {
          if (error) {
            console.error("Anonymous sign-in failed:", error);
          } else {
            setUser(data.user);
          }
          setLoading(false);
        });
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = client.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        // Signing out of an account (src/lib/account.ts) ends the session the
        // app runs on, so start a fresh anonymous one: play never needs an
        // account, and nothing should wait for one.
        if (event === "SIGNED_OUT") {
          client.auth.signInAnonymously().then(({ error }) => {
            if (error) console.error("Anonymous sign-in failed:", error);
          });
        }
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  return { user, loading, supabase };
}
