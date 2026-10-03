const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const listeners = {};
const context = {
  URL,
  URLSearchParams,
  Date,
  Promise,
  Set,
  Map,
  structuredClone,
  console,
  chrome: {
    runtime: {
      getManifest: () => ({ version: "test" }),
      getURL: (value) => value,
      onInstalled: { addListener: (listener) => { listeners.installed = listener; } },
      onStartup: { addListener: (listener) => { listeners.startup = listener; } },
      onMessage: { addListener: (listener) => { listeners.message = listener; } },
    },
    alarms: { create: () => {}, onAlarm: { addListener: () => {} } },
    action: { onClicked: { addListener: () => {} } },
    commands: {
      getAll: async () => [],
      onCommand: { addListener: (listener) => { listeners.command = listener; } },
    },
    tabs: { create: async () => {}, sendMessage: async () => {} },
    sidePanel: { open: async () => {} },
    storage: { local: { get: async () => ({}), set: async () => {} } },
    notifications: { create: async () => {} },
  },
  fetch: async (url) => {
    const value = String(url);
    if (value.includes("page=2")) {
      return { ok: true, status: 200, json: async () => ({ Objects: [{ QuizId: 2, Name: "Second quiz" }] }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        Objects: [{ QuizId: 1, Name: "First quiz" }],
        Next: "/d2l/api/le/1.99/42/quizzes/?page=2",
      }),
    };
  },
};

const source = fs.readFileSync("extension/src/background.js", "utf8") + `
  globalThis.__searchTest = { safeSearchUrl, searchEntry, flattenContentTopics, getAllSearchPages };
`;
vm.createContext(context);
vm.runInContext(source, context);

const helpers = context.__searchTest;
assert.equal(helpers.safeSearchUrl("https://example.com/item"), null);
assert.equal(
  helpers.safeSearchUrl("/d2l/le/content/42/viewContent/7/View"),
  "https://dal.brightspace.com/d2l/le/content/42/viewContent/7/View",
);
assert.equal(
  helpers.searchEntry({
    id: "content-42-7",
    title: "Week one",
    type: "content",
    url: "https://dal.brightspace.com/d2l/le/content/42/viewContent/7/View",
    course: { orgUnitId: 42, name: "Intro to Testing", code: "TEST 1000" },
  }).orgUnitId,
  42,
);

const topics = helpers.flattenContentTopics([
  { Topics: [{ TopicId: 1 }], Modules: [{ Topics: [{ TopicId: 2 }] }] },
]);
assert.deepEqual(Array.from(topics, (topic) => topic.TopicId), [1, 2]);

(async () => {
  const quizzes = await helpers.getAllSearchPages(42, "1.99", "quizzes");
  assert.deepEqual(Array.from(quizzes, (quiz) => quiz.QuizId), [1, 2]);
  console.log("universal-search tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
