import { describe, expect, it } from "vitest";

import { resolveArrivalTime } from "../server/daycloser/reply-time.js";

const demoDate = "2026-11-12";
const afternoon = {
  startAt: "2026-11-12T22:00:00.000Z",
  endAt: "2026-11-12T23:30:00.000Z",
};
const morning = {
  startAt: "2026-11-12T17:00:00.000Z",
  endAt: "2026-11-12T19:00:00.000Z",
};

describe("customer arrival times", () => {
  it("uses an unambiguous arrival clock from the reply within the afternoon opening", () => {
    expect(
      resolveArrivalTime(
        "I can't get there until 2:30.",
        null,
        demoDate,
        afternoon,
      ),
    ).toBe("2026-11-12T22:30:00.000Z");
    expect(
      resolveArrivalTime("I can arrive at 10:15.", "10:15", demoDate, morning),
    ).toBe("2026-11-12T18:15:00.000Z");
  });

  it("honors explicit meridiem and supports a model-normalized time", () => {
    expect(
      resolveArrivalTime("Only after 2:30 a.m.", "2:30", demoDate, afternoon),
    ).toBe("2026-11-12T10:30:00.000Z");
    expect(
      resolveArrivalTime(
        "I could make it half past three.",
        "15:30",
        demoDate,
        afternoon,
      ),
    ).toBe("2026-11-12T23:30:00.000Z");
    expect(
      resolveArrivalTime("What are my options?", null, demoDate, afternoon),
    ).toBeUndefined();
  });
});
