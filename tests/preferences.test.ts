import { describe, expect, it } from "vitest";
import { decodeSave } from "../src/storage/preferences";

describe("preferences storage", () => {
  it("空值和损坏数据回退安全默认值", () => {
    expect(decodeSave(null)).toEqual({ version: 2, bestScore: 0, muted: true });
    expect(decodeSave("not-json")).toEqual({ version: 2, bestScore: 0, muted: true });
    expect(decodeSave('{"version":2,"bestScore":-1,"muted":true}')).toEqual({
      version: 2,
      bestScore: 0,
      muted: true,
    });
  });

  it("读取当前版本并规范化最高分", () => {
    expect(decodeSave('{"version":2,"bestScore":42.8,"muted":true}')).toEqual({
      version: 2,
      bestScore: 42,
      muted: true,
    });
  });

  it("保留用户已保存的开启声音偏好", () => {
    expect(decodeSave('{"version":2,"bestScore":42,"muted":false}')).toEqual({
      version: 2, bestScore: 42, muted: false,
    });
  });

  it("从版本 1 迁移最高分且默认静音", () => {
    expect(decodeSave('{"version":1,"bestScore":327}')).toEqual({
      version: 2,
      bestScore: 327,
      muted: true,
    });
  });
});
