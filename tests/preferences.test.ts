import { describe, expect, it } from "vitest";
import { decodeSave } from "../src/storage/preferences";

describe("preferences storage", () => {
  it("空值和损坏数据回退安全默认值", () => {
    expect(decodeSave(null)).toEqual({ version: 2, bestScore: 0, muted: false });
    expect(decodeSave("not-json")).toEqual({ version: 2, bestScore: 0, muted: false });
    expect(decodeSave('{"version":2,"bestScore":-1,"muted":true}')).toEqual({
      version: 2,
      bestScore: 0,
      muted: false,
    });
  });

  it("读取当前版本并规范化最高分", () => {
    expect(decodeSave('{"version":2,"bestScore":42.8,"muted":true}')).toEqual({
      version: 2,
      bestScore: 42,
      muted: true,
    });
  });

  it("从版本 1 迁移最高分且默认开启声音", () => {
    expect(decodeSave('{"version":1,"bestScore":327}')).toEqual({
      version: 2,
      bestScore: 327,
      muted: false,
    });
  });
});
