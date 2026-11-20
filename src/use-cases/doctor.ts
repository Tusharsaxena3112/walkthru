import type { Shell } from "../ports/shell.js";

export interface ToolCheck {
  tool: string;
  required: boolean;
  ok: boolean;
  install: string;
}

const TOOLS: { tool: string; required: boolean; install: string }[] = [
  { tool: "ffmpeg", required: true, install: "sudo apt install ffmpeg" },
  { tool: "ffprobe", required: true, install: "sudo apt install ffmpeg" },
  { tool: "wmctrl", required: false, install: "sudo apt install wmctrl (needed by `record`)" },
  { tool: "xdotool", required: false, install: "sudo apt install xdotool (needed by `record`)" },
  { tool: "tmux", required: false, install: "sudo apt install tmux (needed by `record` type steps)" },
  { tool: "tesseract", required: false, install: "sudo apt install tesseract-ocr (needed for the sensitive-text check)" },
];

export async function doctor(deps: { shell: Shell }): Promise<ToolCheck[]> {
  const out: ToolCheck[] = [];
  for (const t of TOOLS) {
    const r = await deps.shell.run("which", [t.tool]);
    out.push({ ...t, ok: r.code === 0 });
  }
  return out;
}
