import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { exportData } from "../../../../lib/api";

// GDPR-style data export: serves the full principal export as a JSON
// attachment. The browser downloads it — no intermediate copy is kept.
export async function GET() {
  const token = (await cookies()).get("sovir_api_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const data = await exportData(token);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="sovir-export-${Date.now()}.json"`,
      "cache-control": "no-store",
    },
  });
}
