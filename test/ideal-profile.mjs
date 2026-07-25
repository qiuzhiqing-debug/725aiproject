import test from "node:test";
import assert from "node:assert/strict";
import {
  ARCHETYPES,
  MBTI_STYLES,
  buildIdealProfile,
  buildPortraitPrompt,
  buildRemotePortraitUrl,
} from "../public/ideal-profile.js";

const RECORDS = [
  { question: { id: "q001", tags: ["纯爱", "温柔"] }, score: 9 },
  { question: { id: "q136", tags: ["AI", "抽象"] }, score: 8 },
  { question: { id: "q017", tags: ["控制", "职场"] }, score: 2 },
];

test("same public answer data produces a stable profile", () => {
  const first = buildIdealProfile({ records: RECORDS, genderPreference: "any", seed: "room-summary-1" });
  const second = buildIdealProfile({ records: RECORDS, genderPreference: "any", seed: "room-summary-1" });
  assert.deepEqual(first, second);
});

test("all six archetypes can produce the three-stage payload", () => {
  assert.equal(Object.keys(ARCHETYPES).length, 6);
  for (const archetypeHint of Object.keys(ARCHETYPES)) {
    const result = buildIdealProfile({ records: RECORDS, archetypeHint, genderPreference: "中性", seed: archetypeHint });
    assert.equal(result.portrait.archetypeId, archetypeHint);
    assert.deepEqual(result.stages.map((stage) => stage.id), ["portrait", "profile", "relationship"]);
    assert.equal(result.matchCard.fictional, true);
    assert.match(result.matchCard.birthDate, /^(?:19|20)\d{2}-\d{2}-\d{2}$/);
    assert.ok(result.relationship.details.length >= 3);
  }
});

test("MBTI controls a high-contrast outfit color in the prompt", () => {
  assert.equal(Object.keys(MBTI_STYLES).length, 16);
  const result = buildIdealProfile({ records: RECORDS, mbtiHint: "ENTP", genderPreference: "f", seed: 7 });
  assert.equal(result.matchCard.mbti, "ENTP");
  assert.equal(result.portrait.palette.primary, MBTI_STYLES.ENTP.primary);
  assert.ok(result.portrait.prompt.includes(MBTI_STYLES.ENTP.outfit));
  assert.ok(result.portrait.prompt.includes("very high visual contrast"));
});

test("sensitive or free-form user fields never enter output or remote prompt", () => {
  const secretValues = ["Kim-Real-Name", "13800138000", "kim@example.com", "private confession"];
  const result = buildIdealProfile({
    records: RECORDS,
    subjectName: secretValues[0],
    phone: secretValues[1],
    email: secretValues[2],
    freeText: secretValues[3],
    genderPreference: "m",
    seed: "safe-public-seed",
  });
  const serialized = JSON.stringify(result);
  for (const secret of secretValues) assert.equal(serialized.includes(secret), false);
});

test("unknown custom tags do not leak into generated copy", () => {
  const result = buildIdealProfile({
    records: [{ question: { id: "custom", tags: ["身份证号-440000000000000000"] }, score: 10 }],
    seed: "custom-safe",
  });
  assert.equal(JSON.stringify(result).includes("440000000000000000"), false);
});

test("remote fallback URL is deterministic and bounded", () => {
  const prompt = buildPortraitPrompt({ archetype: "power-ceo", presentation: "masc", mbti: "ENTJ" });
  const url = buildRemotePortraitUrl(prompt, { seed: 42, width: 99999, height: 1 });
  assert.equal(url, buildRemotePortraitUrl(prompt, { seed: 42, width: 99999, height: 1 }));
  assert.ok(url.startsWith("https://image.pollinations.ai/prompt/"));
  assert.ok(url.includes("width=1536"));
  assert.ok(url.includes("height=768"));
  assert.ok(url.includes("seed=42"));
});

test("unsupported gender stays inclusive and deterministic", () => {
  const first = buildIdealProfile({ records: RECORDS, genderPreference: "无所谓", seed: "inclusive" });
  const second = buildIdealProfile({ records: RECORDS, genderPreference: "无所谓", seed: "inclusive" });
  assert.equal(first.matchCard.presentation, second.matchCard.presentation);
  assert.ok(["男性呈现", "女性呈现", "中性呈现"].includes(first.matchCard.presentation));
});
