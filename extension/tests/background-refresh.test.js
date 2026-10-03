const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..", "..");
const workerSource = fs.readFileSync(
  path.join(root, "extension", "src", "background.js"),
  "utf8",
);
const debugSource = fs.readFileSync(
  path.join(root, "extension", "options", "debug.js"),
  "utf8",
);

const courses = {
  Items: [
    {
      OrgUnit: {
        Id: 101,
        Name: "Private course name one",
        Code: "TEST 1010",
        Type: { Code: "Course Offering" },
      },
    },
    {
      OrgUnit: {
        Id: 202,
        Name: "Private course name two",
        Code: "TEST 2020",
        Type: { Code: "Course Offering" },
      },
    },
  ],
};

function response(status, body = null) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() {
      if (body instanceof Error) throw body;
      return body;
    },
  };
}

function createWorker(dropboxStatus, enrollmentStatus = 200, calendarStatus = 200) {
  const stored = {};
  const listeners = {};
  const context = vm.createContext({
    console,
    URL,
    URLSearchParams,
    Date,
    Set,
    Map,
    Promise,
    Array,
    Object,
    Number,
    String,
    Error,
    encodeURIComponent,
    fetch: async (url) => {
      const request = new URL(url);
      const pathname = request.pathname;
      if (pathname === "/d2l/api/versions/") {
        return response(200, [
          { ProductCode: "lp", LatestVersion: "1.63" },
          { ProductCode: "le", LatestVersion: "1.99" },
        ]);
      }
      if (pathname.endsWith("/enrollments/myenrollments/")) {
        return response(enrollmentStatus, enrollmentStatus === 200 ? courses : null);
      }
      if (pathname.endsWith("/dropbox/folders/")) {
        if (pathname.includes("/101/")) return response(dropboxStatus, null);
        return response(200, [
          {
            Id: 22,
            Name: "Visible assignment",
            DueDate: "2030-01-01T17:00:00.000Z",
          },
        ]);
      }
      if (pathname.endsWith("/quizzes/") || pathname.endsWith("/discussions/")) {
        return response(200, []);
      }
      if (pathname.endsWith("/calendar/events/myEvents/")) {
        return response(calendarStatus, { Objects: [], Next: null });
      }
      throw new Error(`Unexpected request: ${pathname}`);
    },
    chrome: {
      runtime: {
        getManifest: () => ({ version: "1.0.0" }),
        getURL: (value) => value,
        onInstalled: { addListener: (listener) => { listeners.installed = listener; } },
        onStartup: { addListener: (listener) => { listeners.startup = listener; } },
        onMessage: { addListener: (listener) => { listeners.message = listener; } },
      },
      storage: {
        local: {
          async get(keys) {
            if (typeof keys === "string") return { [keys]: stored[keys] };
            return Object.fromEntries((keys || []).map((key) => [key, stored[key]]));
          },
          async set(values) {
            Object.assign(stored, values);
          },
        },
      },
      alarms: {
        create() {},
        onAlarm: { addListener: (listener) => { listeners.alarm = listener; } },
      },
      notifications: { create: async () => {} },
      sidePanel: { open: async () => {} },
      action: { onClicked: { addListener: (listener) => { listeners.action = listener; } } },
    },
  });
  vm.runInContext(workerSource, context, { filename: "background.js" });
  vm.runInContext("globalThis.__refreshSafely = refreshSafely;", context);
  return { stored, refresh: context.__refreshSafely };
}

async function expectCourseFailure(status) {
  const worker = createWorker(status);
  const result = await worker.refresh();
  assert.equal(result.outcome, "partial");
  assert.equal(worker.stored.lastError, null);
  assert.equal(worker.stored.deadlines.length, 1);
  assert.equal(worker.stored.deadlines[0].title, "Visible assignment");
  assert.equal(worker.stored.liveDebug.outcome, "partial");
  assert.equal(worker.stored.liveDebug.failedRequests, 1);
  assert.match(worker.stored.liveDebug.lastLiveRead.message, /Some course tools/);
  assert.ok(
    worker.stored.liveDebug.requests.every(
      (request) => !String(request.endpoint).includes("101"),
    ),
  );
}

async function expectSignedOutFromCourse401() {
  const worker = createWorker(401);
  const result = await worker.refresh();
  assert.equal(result.outcome, "not-signed-in");
  assert.equal(worker.stored.lastError, "not-signed-in");
  assert.equal(worker.stored.deadlines, undefined);
}

async function expectSignedOutBeforeCourses(status) {
  const worker = createWorker(200, status);
  const result = await worker.refresh();
  assert.equal(result.outcome, "not-signed-in");
  assert.equal(worker.stored.lastError, "not-signed-in");
}

async function expectCalendarFailure() {
  const worker = createWorker(200, 200, 403);
  const result = await worker.refresh();
  assert.equal(result.outcome, "partial");
  assert.equal(worker.stored.lastError, null);
  assert.equal(worker.stored.deadlines.length, 1);
}

function testPartialDebugSerialization() {
  const elements = new Map(
    ["debugOutput", "lastLiveRead", "copyDebugBtn", "copyStatus"].map((id) => [
      id,
      { textContent: "", addEventListener() {} },
    ]),
  );
  const context = vm.createContext({
    chrome: {
      runtime: { getManifest: () => ({ version: "1.0.0" }) },
      storage: { local: { get: async () => ({}) } },
    },
    document: { getElementById: (id) => elements.get(id) },
    navigator: { clipboard: { writeText: async () => {} } },
    Date,
    Number,
    Array,
    Set,
    Object,
    JSON,
  });
  vm.runInContext(debugSource, context, { filename: "debug.js" });
  vm.runInContext("globalThis.__safeReport = safeReport;", context);
  const report = context.__safeReport({
    outcome: "partial",
    counts: { courses: 2, deadlines: 1 },
    requests: [
      {
        endpoint: "/d2l/api/le/{v}/{orgUnitId}/dropbox/folders/",
        status: 403,
        ms: 7,
        courseId: "101",
        title: "Private assignment",
        cookie: "never-copy-this",
      },
    ],
    courseName: "Private course name",
    responseBody: "secret data",
  });
  const serialized = JSON.stringify(report);
  assert.equal(report.outcome, "partial");
  assert.equal(report.requests.length, 1);
  assert.ok(!serialized.includes("Private"));
  assert.ok(!serialized.includes("never-copy-this"));
  assert.ok(!serialized.includes("101"));
}

async function main() {
  await expectCourseFailure(403);
  await expectCourseFailure(404);
  await expectCourseFailure(500);
  await expectSignedOutFromCourse401();
  await expectSignedOutBeforeCourses(401);
  await expectSignedOutBeforeCourses(403);
  await expectCalendarFailure();
  testPartialDebugSerialization();
  console.log("background refresh classification tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
