import { NextResponse } from "next/server";
import { getUserFromAuthHeader } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase/server";

type CreateResourcePayload = {
  resource_name: string;
  resource_description: string;
  links: string[];
};

export async function GET(request: Request) {
  const { user, error } = await getUserFromAuthHeader(request.headers.get("authorization"));
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error: fetchError } = await supabaseServer
    .from("resources")
    .select("*")
    .order("created_at", { ascending: false });

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 400 });
  }

  return NextResponse.json({ resources: data ?? [] });
}

export async function POST(request: Request) {
  const { user, error } = await getUserFromAuthHeader(request.headers.get("authorization"));
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as CreateResourcePayload | null;
  if (
    !payload ||
    typeof payload.resource_name !== "string" ||
    typeof payload.resource_description !== "string" ||
    !Array.isArray(payload.links)
  ) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const resourceName = payload.resource_name.trim();
  const resourceDescription = payload.resource_description.trim();
  const links = payload.links
    .map((link) => (typeof link === "string" ? link.trim() : ""))
    .filter((link) => link.length > 0);

  if (!resourceName || !resourceDescription || links.length === 0) {
    return NextResponse.json(
      { error: "Resource name, description, and at least one link are required." },
      { status: 400 },
    );
  }

  const { data, error: insertError } = await supabaseServer
    .from("resources")
    .insert({
      resource_name: resourceName,
      resource_description: resourceDescription,
      links,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  return NextResponse.json({ resource: data });
}
