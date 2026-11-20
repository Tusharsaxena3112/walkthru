import { type Box, buildBlurFilter } from "../domain/redact.js";
import type { MediaTool } from "../ports/media.js";

export async function redact(
  deps: { media: MediaTool },
  args: { input: string; output: string; boxes: Box[]; strength: number },
): Promise<void> {
  await deps.media.blur(args.input, buildBlurFilter(args.boxes, args.strength), args.output);
}
