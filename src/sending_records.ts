import { z } from "zod";

export const handoff = z.object({
  sellerId: z.string().min(1),
  buyerId: z.string().min(1),
  orderId: z.string().min(1),
  domain: z.string().min(3),
  spf: z.string().startsWith("v=spf1 "),
  dkim: z.object({ name: z.string().min(1), content: z.string().min(1) }),
  dmarc: z.string().startsWith("v=DMARC1;"),
});
export type Handoff = z.infer<typeof handoff>;

export function recordsFor(input: Handoff) {
  return [
    { record_type: "TXT", name: input.domain, content: input.spf },
    { record_type: "TXT", name: input.dkim.name, content: input.dkim.content },
    { record_type: "TXT", name: `_dmarc.${input.domain}`, content: input.dmarc },
  ] as const;
}
