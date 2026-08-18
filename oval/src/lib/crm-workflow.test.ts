import assert from "node:assert/strict";
import test from "node:test";
import { assertTransition, calculateSla, issueIsOverdue } from "./crm-workflow";

test("critical and high SLA deadlines use elapsed hours", () => {
  const start = new Date("2026-08-03T10:00:00.000Z");
  assert.equal(calculateSla("critical", start), "2026-08-03T14:00:00.000Z");
  assert.equal(calculateSla("high", start), "2026-08-04T10:00:00.000Z");
});

test("medium and low SLA deadlines skip weekends", () => {
  const friday = new Date("2026-08-07T10:00:00.000Z");
  assert.equal(calculateSla("medium", friday), "2026-08-12T10:00:00.000Z");
  assert.equal(calculateSla("low", friday), "2026-08-18T10:00:00.000Z");
});

test("business-day SLA uses the Asia/Kolkata calendar", () => {
  // Monday evening UTC is already Tuesday in India, so three business days
  // reaches Friday in India (Thursday evening UTC).
  const tuesdayInIndia = new Date("2026-08-03T20:00:00.000Z");
  assert.equal(calculateSla("medium", tuesdayInIndia), "2026-08-06T20:00:00.000Z");
});

test("assignment requires a manager, owner, and team", () => {
  assert.throws(() => assertTransition({ from: "triaged", to: "assigned", role: "member", isOwner: false, ownerId: "owner", teamId: "team" }), /Manager/);
  assert.throws(() => assertTransition({ from: "triaged", to: "assigned", role: "manager", isOwner: false }), /Owner and team/);
  assert.doesNotThrow(() => assertTransition({ from: "triaged", to: "assigned", role: "manager", isOwner: false, ownerId: "owner", teamId: "team" }));
});

test("resolution and reopening require context", () => {
  assert.throws(() => assertTransition({ from: "in_progress", to: "resolved", role: "member", isOwner: true }), /resolution note/);
  assert.throws(() => assertTransition({ from: "closed", to: "in_progress", role: "manager", isOwner: false }), /reopen reason/);
  assert.throws(() => assertTransition({ from: "resolved", to: "in_progress", role: "member", isOwner: true, reason: "Regression" }), /Manager/);
});

test("overdue excludes resolved and closed issues", () => {
  const now = new Date("2026-08-04T12:00:00.000Z");
  assert.equal(issueIsOverdue({ due_at: "2026-08-04T10:00:00.000Z", status: "in_progress" }, now), true);
  assert.equal(issueIsOverdue({ due_at: "2026-08-04T10:00:00.000Z", status: "closed" }, now), false);
});
