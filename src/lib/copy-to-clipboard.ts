/**
 * Copies text and reports whether it worked. `navigator.clipboard` is
 * missing or rejects on some iPhone/Android in-app browsers and non-HTTPS
 * contexts, so this falls back to a hidden textarea + execCommand("copy"),
 * which iOS Safari supports when called from a tap.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    // 16px stops iOS zooming; off-screen keeps it invisible.
    area.style.cssText = "position:fixed;top:0;left:-9999px;font-size:16px;opacity:0";
    document.body.appendChild(area);
    area.focus();
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
