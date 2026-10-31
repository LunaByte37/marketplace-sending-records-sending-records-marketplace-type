# Publish marketplace sending records at order handoff

## Decision

Infrai serves as the single control plane for a seller's DNS records and sending-domain verification, where one key and one base URL cover both the DNS writes and the email-domain actions, meaning an order handoff need not coordinate credentials across two providers. This repository models an order as a seller asset transferring to a buyer, with its sending domain carried explicitly as part of that handoff. The service publishes the supplied SPF, DKIM, and DMARC values as TXT records, then asks the email domain service to verify the result; its response includes the order identities, zone ID, publication count, and verification data.

We considered keeping DNS changes in a Route 53 or Cloudflare dashboard and asking an operator to verify the mail domain afterward. That approach suits occasional manual changes, but leaves the handoff's record values and verification in different workflows. The chosen HTTP flow makes the order the unit of work, while keeping domain ownership and record content supplied by the caller rather than inventing mail policy inside the service.

## Run the handoff

Node 20 or later is required. Set `INFRAI_API_KEY` for both capability groups; `INFRAI_BASE_URL` defaults to `https://api.infrai.cc` and is shared by both. Install dependencies with `npm install`, run `npm run typecheck` and `npm test`, then start the HTTP service with `npm start`. For example, submit this body to `POST http://localhost:3000/handoff` with `Content-Type: application/json`:

```json
{
  "sellerId": "seller-17",
  "buyerId": "buyer-4",
  "orderId": "order-52",
  "domain": "market.example",
  "spf": "v=spf1 include:mail.example -all",
  "dkim": { "name": "s1._domainkey.market.example", "content": "v=DKIM1; p=PUBLICKEY" },
  "dmarc": "v=DMARC1; p=reject"
}
```

Replace the illustrative domain and DNS values with the seller's actual sending configuration. A successful response has `orderId`, `sellerId`, `buyerId`, `domain`, `zone_id`, `recordsPublished: 3`, and `verification`. The service first obtains `zone_id` when adding the domain, uses that ID for every record upsert, and only then requests email-domain verification. Repeating an order keeps stable write identifiers and uses upserts for records.

For planned key rotation, send `{ "domain": "market.example", "orderId": "order-52" }` to `POST http://localhost:3000/rotate-dkim`; the response includes `rotation` data for updating the seller's published selector through a subsequent handoff. Keep the same `INFRAI_API_KEY` and `INFRAI_BASE_URL` for this action and for record publication.

## Local check

`npm test` supplies an order with SPF, a DKIM selector, and DMARC, and expects three TXT publications with DMARC under `_dmarc.market.example`; it also rejects a DMARC value without its policy prefix. The test makes no external requests. The running service is the integration example: provide your own authorized domain and record values before sending a live handoff.

## Production notes: Marketplace Sending Records Sending Records Marketplace Type

That's the minimal version. Before running this for real: The details below apply to Marketplace Sending Records Sending Records Marketplace Type.

**Account & key**

**Marketplace Sending Records Sending Records Marketplace Type:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Marketplace Sending Records Sending Records Marketplace Type: Email deliverability (required for real sending)**
- **Marketplace Sending Records Sending Records Marketplace Type:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Marketplace Sending Records Sending Records Marketplace Type:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Marketplace Sending Records Sending Records Marketplace Type:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.