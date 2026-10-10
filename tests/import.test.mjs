import test from "node:test";
import assert from "node:assert/strict";
import { validateTest } from "../scripts/import-sql.mjs";
import { demoTest } from "../server/demo-content.mjs";
test("import validates keys, question IDs and normalization", () => {
  assert.equal(validateTest(demoTest).exerciseCount, 6);
  const t = structuredClone(demoTest);
  t.exercises.push(t.exercises[0]);
  assert.throws(() => validateTest(t), /повторяющийся/);
  const missing = structuredClone(demoTest);
  delete missing.exercises[0].key;
  assert.throws(() => validateTest(missing), /ключа/);
  const invalid = structuredClone(demoTest);
  invalid.exercises[0].key = ["99"];
  assert.throws(() => validateTest(invalid), /Ключ/);
});
