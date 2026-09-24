export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  try {
    const { ensureCursorAutoSetup } = await import("@/lib/auto-setup");
    const result = ensureCursorAutoSetup();
    if (result.changed) {
      console.log(`[evalos] ${result.message}`);
    }
  } catch (error) {
    console.warn("[evalos] auto-setup skipped:", error instanceof Error ? error.message : error);
  }
}
