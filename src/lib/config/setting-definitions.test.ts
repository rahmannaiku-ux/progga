import { describe, it, expect } from "vitest";
import { SETTING_DEFINITIONS, settingDefinitionForClient, type SettingDefinition } from "./setting-definitions";

const hasFunction = (value: object) => Object.values(value).some((v) => typeof v === "function");

describe("settingDefinitionForClient", () => {
  it("drops validate, which React can't send to a client component", () => {
    const withValidate = Object.values(SETTING_DEFINITIONS).filter((d) => "validate" in d);
    expect(withValidate.length).toBeGreaterThan(0);
    for (const def of withValidate) {
      const plain = settingDefinitionForClient(def as SettingDefinition);
      expect("validate" in plain).toBe(false);
      expect(plain.key).toBe(def.key);
    }
  });

  it("leaves every definition free of functions", () => {
    for (const def of Object.values(SETTING_DEFINITIONS)) {
      expect(hasFunction(settingDefinitionForClient(def as SettingDefinition))).toBe(false);
    }
  });

  it("doesn't change the shared definition", () => {
    const def = SETTING_DEFINITIONS["apps.minVersionAndroid"];
    settingDefinitionForClient(def as SettingDefinition);
    expect(typeof def.validate).toBe("function");
  });
});
