import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import { signOAuthState, verifyOAuthState } from "../src/lib/metaOAuthState.js";
import { env } from "../src/lib/env.js";

describe("Meta OAuth state signing", () => {
  it("يُنتج ويتحقق من state صالح يحمل workspaceId وuserId الصحيحين", () => {
    const state = signOAuthState("ws-1", "user-1");
    const claims = verifyOAuthState(state);
    expect(claims.workspaceId).toBe("ws-1");
    expect(claims.userId).toBe("user-1");
    expect(claims.typ).toBe("meta_oauth_state");
  });

  it("يرفض state مزيّفًا أو تالفًا", () => {
    expect(() => verifyOAuthState("not-a-real-token")).toThrow();
  });

  it("يرفض توكن JWT صالحًا لكن بنوع مختلف (typ) لمنع إعادة استخدام توكنات أخرى", () => {
    const fakeState = jwt.sign({ typ: "user", workspaceId: "ws-1", userId: "user-1" }, env.jwtSecret);
    expect(() => verifyOAuthState(fakeState)).toThrow();
  });
});
