import test from "node:test";
import assert from "node:assert/strict";
import { formatReviewAnswer } from "../src/review-answer.ts";

const options = [
  { id: "word-a", text: "Первый вариант" },
  { id: "word-b", text: "Второй вариант" },
  { id: "word-c", text: "Третий вариант" },
];

test("choice answers use display numbers in option order without altering saved IDs", () => {
  const answer = ["word-c", "word-a"];
  assert.equal(formatReviewAnswer({ type: "multiple", options }, answer), "13");
  assert.deepEqual(answer, ["word-c", "word-a"]);
  assert.equal(formatReviewAnswer({ type: "single", options }, "word-b"), "2");
  assert.equal(
    formatReviewAnswer({ type: "single", options }, ["word-b"]),
    "2",
  );
});

test("skipped choices and absent keys are explicitly labelled", () => {
  for (const answer of [undefined, null, "", []]) {
    assert.equal(
      formatReviewAnswer({ type: "multiple", options }, answer),
      "Нет ответа",
    );
  }
  assert.equal(
    formatReviewAnswer({ type: "single", options }, undefined, "Не указаны"),
    "Не указаны",
  );
});

test("text answers and keys stay textual and preserve original input", () => {
  assert.equal(formatReviewAnswer({ type: "text" }, " ЁЛКА "), " ЁЛКА ");
  assert.equal(
    formatReviewAnswer({ type: "text" }, ["ёлка", "сосна"]),
    "ёлка, сосна",
  );
  assert.equal(formatReviewAnswer({ type: "text" }, "14"), "14");
  assert.equal(formatReviewAnswer({ type: "text" }, ""), "Нет ответа");
});
