import { describe, expect, it } from "vitest";
import { GameStateMachine } from "../src/game/state-machine";

describe("GameStateMachine", () => {
  it("只允许定义过的状态转换", () => {
    const machine = new GameStateMachine();

    expect(machine.send("pause")).toBe(false);
    expect(machine.state).toBe("ready");
    expect(machine.send("start")).toBe(true);
    expect(machine.state).toBe("playing");
    expect(machine.send("start")).toBe(false);
    expect(machine.send("pause")).toBe(true);
    expect(machine.state).toBe("paused");
    expect(machine.send("resume")).toBe(true);
    expect(machine.send("lose")).toBe(true);
    expect(machine.state).toBe("gameOver");
  });

  it("可从暂停或结束状态干净重开", () => {
    const machine = new GameStateMachine();
    machine.send("start");
    machine.send("pause");
    expect(machine.send("restart")).toBe(true);
    expect(machine.state).toBe("playing");
    machine.send("lose");
    expect(machine.send("restart")).toBe(true);
    expect(machine.state).toBe("playing");
  });
});
