import { NextResponse } from "next/server";
import { getUserFromAuthHeader } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase/server";

const BUCKET_NAME = "proofs";

function isUploadFile(value: FormDataEntryValue | null): value is File {
  return Boolean(value && typeof value !== "string" && "arrayBuffer" in value);
}

export async function POST(request: Request) {
  const { user, error: authError } = await getUserFromAuthHeader(
    request.headers.get("authorization"),
  );
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!isUploadFile(file)) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    const fileName = typeof file.name === "string" ? file.name : "upload.jpg";
    const extension = fileName.includes(".") ? fileName.split(".").pop() : "jpg";
    const filePath = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;

    const { error: uploadError } = await supabaseServer.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, { upsert: false, contentType: file.type });
    if (uploadError) {
      const message = uploadError.message.toLowerCase().includes("bucket")
        ? `Storage bucket '${BUCKET_NAME}' is missing. Create it once in Supabase Storage and retry.`
        : uploadError.message;
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { data } = supabaseServer.storage.from(BUCKET_NAME).getPublicUrl(filePath);
    return NextResponse.json({ url: data.publicUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 },
    );
  }
}
