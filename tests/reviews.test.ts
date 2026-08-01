import assert from "node:assert/strict";
import test from "node:test";

import {
  REVIEW_MAX_LENGTH,
  REVIEW_MIN_LENGTH,
  normalizeReviewContent,
  reviewInputSchema,
  reviewReportInputSchema,
} from "../src/lib/servers/review-validation.ts";
import { canPublishOfficialReply } from "../src/lib/servers/review-permissions.ts";

test("normalizes review whitespace without turning text into HTML", () => {
  assert.equal(normalizeReviewContent("  Buena   comunidad\r\n\r\n\r\n Muy activa  "), "Buena comunidad\n\nMuy activa");
  assert.equal(normalizeReviewContent("<b>Texto</b>"), "<b>Texto</b>");
});

test("validates review rating and content boundaries", () => {
  assert.equal(reviewInputSchema.safeParse({ rating: 1, content: "1234567890" }).success, true);
  assert.equal(reviewInputSchema.safeParse({ rating: 5, content: "x".repeat(REVIEW_MAX_LENGTH) }).success, true);
  assert.equal(reviewInputSchema.safeParse({ rating: 0, content: "1234567890" }).success, false);
  assert.equal(reviewInputSchema.safeParse({ rating: 6, content: "1234567890" }).success, false);
  assert.equal(reviewInputSchema.safeParse({ rating: 3, content: "x".repeat(REVIEW_MIN_LENGTH - 1) }).success, false);
  assert.equal(reviewInputSchema.safeParse({ rating: 3, content: "x".repeat(REVIEW_MAX_LENGTH + 1) }).success, false);
});

test("normalizes report details and accepts only predefined reasons", () => {
  const parsed = reviewReportInputSchema.parse({ reason: "spam", details: "  details  " });
  assert.deepEqual(parsed, { reason: "spam", details: "details" });
  assert.equal(reviewReportInputSchema.safeParse({ reason: "unknown" }).success, false);
  assert.equal(reviewReportInputSchema.parse({ reason: "other", details: "x".repeat(1_200) }).details?.length, 1_000);
});

test("only owners and admins can publish official replies", () => {
  assert.equal(canPublishOfficialReply("owner"), true);
  assert.equal(canPublishOfficialReply("admin"), true);
  assert.equal(canPublishOfficialReply("editor"), false);
  assert.equal(canPublishOfficialReply(null), false);
});
