import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function readProjectFile(filePath: string) {
  return readFileSync(path.resolve(filePath), "utf8");
}

test("renders the persisted session avatar in both header variants", () => {
  const source = readProjectFile("src/components/site-header.tsx");

  assert.match(source, /AvatarImage/);
  assert.match(source, /session(?:\?\.|\.)user(?:\?\.|\.)image/);
  assert.match(source, /<AvatarImage[\s\S]*session(?:\?\.|\.)user(?:\?\.|\.)image/);
});

test("loads and renders the persisted review author avatar", () => {
  const querySource = readProjectFile("src/lib/servers/reviews.ts");
  const cardSource = readProjectFile("src/components/review-card.tsx");

  assert.match(querySource, /authorImage: user\.image/);
  assert.match(querySource, /authorImage: row\.authorImage/);
  assert.match(cardSource, /AvatarImage/);
  assert.match(cardSource, /review\.authorImage/);
});

test("invalidates cached review avatars after profile avatar changes", () => {
  const cachedReviewsSource = readProjectFile("src/lib/servers/cached-queries.ts");
  const avatarRouteSource = readProjectFile("src/app/api/account/avatar/route.ts");

  assert.match(cachedReviewsSource, /userAvatarsTag\(\)/);
  assert.match(avatarRouteSource, /revalidateTag\(userAvatarsTag\(\), "max"\)/);
});
