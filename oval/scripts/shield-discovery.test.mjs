import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/lib/shield-discovery.ts", import.meta.url),
  "utf8",
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const shield = await import(
  `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`
);

test("canonical URLs deduplicate tracking variants", () => {
  const first = shield.canonicalizeUrl(
    "HTTPS://Example.COM:443/path?utm_source=x&id=7#frag",
  );
  const second = shield.canonicalizeUrl("https://example.com/path?id=7");
  assert.equal(first.canonicalUrl, second.canonicalUrl);
  assert.equal(first.canonicalUrlHash, second.canonicalUrlHash);
});

test("IDN hostnames retain both safe and display forms", () => {
  const result = shield.canonicalizeUrl("https://फिजिक्सवाला.example/path");
  assert.match(result.asciiDomain, /^xn--/);
  assert.ok(result.unicodeDomain.includes("फिजिक्सवाला"));
});

test("official domains include subdomains but reject suffix tricks", () => {
  const rows = [{ domain: "pw.live", allow_subdomains: true }];
  assert.equal(shield.isAuthorisedDomain("learn.pw.live", rows), true);
  assert.equal(shield.isAuthorisedDomain("pw.live.evil.example", rows), false);
});

test("ambiguous PW requires education context", () => {
  assert.equal(
    shield.hasPwContext("PW announced quarterly industrial output"),
    false,
  );
  assert.equal(shield.hasPwContext("PW JEE batch free lecture"), true);
  assert.equal(shield.hasPwContext("Physics Wallah course"), true);
});

test("private destinations and DNS rebinding are rejected", () => {
  for (const ip of ["127.0.0.1", "10.0.0.1", "169.254.1.1", "::1", "fc00::1"])
    assert.equal(shield.isPrivateOrReservedIp(ip), true);
  assert.throws(() =>
    shield.assertStablePublicResolution(["93.184.216.34"], ["10.0.0.1"]),
  );
  assert.throws(() =>
    shield.assertStablePublicResolution(["93.184.216.34"], ["1.1.1.1"]),
  );
});

test("priority score and handling bands follow the documented formula", () => {
  const urgent = shield.calculateThreatScore({
    brandMatch: 95,
    infringementConfidence: 95,
    harm: 100,
    reach: 80,
    velocity: 90,
    classificationConfidence: 90,
    recurrence: 90,
  });
  assert.equal(urgent.priority, 91);
  assert.equal(urgent.handlingBand, "urgent");
  assert.equal(
    shield.calculateThreatScore({
      brandMatch: 20,
      infringementConfidence: 10,
      harm: 10,
      reach: 10,
      velocity: 10,
      classificationConfidence: 10,
      recurrence: 10,
    }).handlingBand,
    "monitor",
  );
});

test("Cloudflare signals distinguish proxy from hosting", () => {
  assert.equal(
    shield.classifyCloudflareRelationship({
      nameservers: ["aria.ns.cloudflare.com"],
    }),
    "reverse_proxy_likely",
  );
  assert.equal(
    shield.classifyCloudflareRelationship({
      registrar: "Cloudflare Registrar",
    }),
    "registrar_confirmed",
  );
});

test("RDAP, evidence hashing and reappearance scores are deterministic", () => {
  const rdap = shield.parseRdapResponse({
    events: [
      { eventAction: "registration", eventDate: "2026-01-01T00:00:00Z" },
    ],
    status: ["active"],
    nameservers: [{ ldhName: "ns1.example" }],
  });
  assert.equal(rdap.registrationDate, "2026-01-01T00:00:00Z");
  assert.deepEqual(
    shield.evidenceManifest({ a: 1 }),
    shield.evidenceManifest({ a: 1 }),
  );
  assert.ok(
    shield.reappearanceScore({
      domainSimilarity: 90,
      contentHashMatch: true,
      textSimilarity: 80,
      faviconSimilarity: 70,
      infrastructureSimilarity: 60,
    }) >= 80,
  );
});

test("Shield RBAC separates legal and configuration privileges", () => {
  assert.equal(shield.shieldRoleCan("viewer", "submit"), false);
  assert.equal(shield.shieldRoleCan("brand_analyst", "search"), true);
  assert.equal(shield.shieldRoleCan("legal_reviewer", "legal"), true);
  assert.equal(shield.shieldRoleCan("administrator", "configure"), true);
});
