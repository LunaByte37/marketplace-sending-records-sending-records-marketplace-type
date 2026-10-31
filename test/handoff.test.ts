import assert from "node:assert/strict";
import test from "node:test";
import { handoff, recordsFor } from "../src/sending_records.js";

test("one order publishes SPF and DMARC as TXT alongside the seller's DKIM selector", () => {
  const input = handoff.parse({
    sellerId: "seller-17", buyerId: "buyer-4", orderId: "order-52",
    domain: "market.example", spf: "v=spf1 include:mail.example -all",
    dkim: { name: "s1._domainkey.market.example", content: "v=DKIM1; p=PUBLICKEY" },
    dmarc: "v=DMARC1; p=reject",
  });
  assert.deepEqual(recordsFor(input), [
    { record_type: "TXT", name: "market.example", content: input.spf },
    { record_type: "TXT", name: "s1._domainkey.market.example", content: input.dkim.content },
    { record_type: "TXT", name: "_dmarc.market.example", content: input.dmarc },
  ]);
  assert.equal(handoff.safeParse({ ...input, dmarc: "reject" }).success, false);
});
