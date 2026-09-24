import { describe, expect, it } from "vitest";
import { removeQueryParam } from "./routeState";

describe("removeQueryParam", () => {
  it("preserves unrelated query state when removing a token", () => {
    expect(removeQueryParam("?token=secret&preview=client&utm_source=agency", "token")).toBe("?preview=client&utm_source=agency");
  });

  it("returns an empty string when the query is fully removed", () => {
    expect(removeQueryParam("?token=secret", "token")).toBe("");
  });
});
