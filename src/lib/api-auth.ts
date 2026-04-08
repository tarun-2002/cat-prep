import { supabaseServer } from "@/lib/supabase/server";

export async function getUserFromAuthHeader(authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) {
    return { user: null, error: "Missing bearer token" };
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return { user: null, error: "Missing bearer token" };
  }

  const { data, error } = await supabaseServer.auth.getUser(token);
  if (error || !data.user) {
    return { user: null, error: "Invalid token" };
  }

  return { user: data.user, error: null };
}
