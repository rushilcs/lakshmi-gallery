import test from "node:test";
import assert from "node:assert/strict";
import { buildCloudfrontResourceUrl, encodeCloudfrontPathFromS3Key } from "../src/cloudfrontPath.js";

test("encodeCloudfrontPathFromS3Key encodes spaces and parentheses per segment", () => {
  const key =
    "galleries/0db17899-efd4-4bf9-a8cc-819766da40af/original/1770000000000_photo (3)_thumb.jpg";
  const encoded = encodeCloudfrontPathFromS3Key(key);
  assert.equal(
    encoded,
    "galleries/0db17899-efd4-4bf9-a8cc-819766da40af/original/1770000000000_photo%20(3)_thumb.jpg",
  );
  assert.ok(encoded.includes("%20"));
  assert.ok(!encoded.includes(" "));
});

test("buildCloudfrontResourceUrl signs exact encoded resource URL", () => {
  const key =
    "galleries/0db17899-efd4-4bf9-a8cc-819766da40af/original/1770000000000_photo (3)_thumb.jpg";
  const url = buildCloudfrontResourceUrl("d123.cloudfront.net", key);
  assert.equal(
    url,
    "https://d123.cloudfront.net/galleries/0db17899-efd4-4bf9-a8cc-819766da40af/original/1770000000000_photo%20(3)_thumb.jpg",
  );
});
