import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "cat-prep-api",
    timestamp: new Date().toISOString(),
  });
}
