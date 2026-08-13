import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/data/shield-demo-data.ts", import.meta.url),
  "utf8",
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { SHIELD_PROTOTYPE_CASES: cases } = await import(
  `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`
);

const realSource = await readFile(
  new URL("../src/data/shield-real-data.ts", import.meta.url),
  "utf8",
);
const realOutput = ts.transpileModule(realSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { SHIELD_REAL_CASES: realCases } = await import(
  `data:text/javascript;base64,${Buffer.from(realOutput).toString("base64")}`
);

test("prototype includes the required breadth of threat cases", () => {
  assert.ok(cases.length >= 10);
  const categories = new Set(cases.map((item) => item.category));
  for (const category of [
    "Pirated Lecture",
    "Pirated PDF or Module",
    "Batch Resale",
    "Lookalike Login",
    "Fake Application",
    "Teacher Impersonation",
    "Coordinated Narrative",
    "Genuine Critical Feedback",
  ])
    assert.ok(categories.has(category), category);
});

test("all prototype source domains are reserved .example domains", () => {
  for (const item of cases)
    assert.ok(
      new URL(item.sourceUrl).hostname.endsWith(".example"),
      `${item.id} must use a .example source`,
    );
});

test("every case carries typed operational and evidence fields", () => {
  for (const item of cases) {
    assert.ok(
      item.owner &&
        item.supportingTeam &&
        item.sla &&
        item.dueAt &&
        item.nextAction,
    );
    assert.ok(item.evidence.length > 0);
    assert.ok(
      item.evidence.every(
        (evidence) =>
          evidence.exactUrl &&
          evidence.contentHash &&
          evidence.captureTimestamp,
      ),
    );
    assert.ok(item.auditTrail.length > 0);
  }
});

test("genuine criticism is routed to operations rather than enforcement", () => {
  const feedback = cases.find(
    (item) => item.category === "Genuine Critical Feedback",
  );
  assert.ok(feedback);
  assert.equal(feedback.recommendedActions[0], "Route to Product or Support");
  assert.equal(feedback.legalReviewStatus, "Not Required");
});

test("proxy detection does not treat Cloudflare as the guaranteed host", () => {
  const proxied = cases.find(
    (item) => item.cloudflareRelationship === "Reverse proxy only",
  );
  assert.ok(proxied);
  assert.notEqual(proxied.hostingProvider, "Cloudflare");
  assert.ok(
    proxied.recommendedActions.includes("Report to Actual Hosting Provider"),
  );
});

test("reappearance links to the original case and preserves immutable evidence", () => {
  const repeat = cases.find((item) => item.status === "Reappeared");
  assert.ok(repeat);
  assert.ok(repeat.relatedCaseIds.length > 0);
  assert.ok(repeat.reappearanceCount > 0);
  assert.ok(repeat.evidence.some((evidence) => evidence.immutable));
});

test("live Shield uses real public URLs with explicit provenance", () => {
  assert.ok(realCases.length >= 12);
  for (const item of realCases) {
    assert.ok(!new URL(item.sourceUrl).hostname.endsWith(".example"));
    assert.ok(item.dataOrigin && item.verifiedAt && item.verificationState);
    assert.ok(item.sourceExcerpt && item.evidence.length > 0);
  }
});

test("discovery signals are not silently promoted to legally verified threats", () => {
  assert.ok(realCases.some((item) => item.verificationState === "Suspected"));
  assert.ok(realCases.some((item) => item.verificationState === "Unavailable"));
  assert.equal(
    realCases.filter((item) => item.verificationState === "Verified").length,
    0,
  );
});

test("unavailable or changed sources stay in monitoring lanes", () => {
  const unavailable = realCases.filter(
    (item) => item.verificationState === "Unavailable",
  );
  assert.ok(unavailable.length >= 2);
  assert.ok(
    unavailable.every((item) =>
      ["Monitoring", "Removed"].includes(item.status),
    ),
  );
});
