import { NextResponse } from "next/server";
import { browseDatabase } from "@/lib/db-browser";
import { ensureCursorAutoSetup } from "@/lib/auto-setup";
import { fromUnknownError } from "@/lib/validation/errors";

export async function GET() {
  try {
    ensureCursorAutoSetup();
    return NextResponse.json(browseDatabase());
  } catch (error) {
    return fromUnknownError(error);
  }
}
