import { NextResponse } from "next/server";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: "ok",
    service: "devtools-rts-mk1",
    version: "1.3.0",
    domain: "devtools-rts-mk1.orbital8.cloud",
    isolatedFromGame: true,
    timestamp: new Date().toISOString(),
  });
}
