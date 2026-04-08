import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const name =
    typeof body?.name === "string" && body.name.trim().length > 0
      ? body.name.trim()
      : "Developer";

  return NextResponse.json({
    message: `Hello, ${name}! Your backend is running.`,
  });
}
