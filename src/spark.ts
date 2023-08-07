import path from "path";
import fs from "fs";
import jexl from "jexl";

interface Checker {
  expressions?: string[];
  prefix: string;
  value: string;
}

const CHECKCONF = {
  bukkit: JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "analysis_config", "bukkit.json"),
      "utf8",
    ),
  ),
  spigot: JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "analysis_config", "spigot.json"),
      "utf8",
    ),
  ),
  server_properties: JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "analysis_config", "server.properties.json"),
      "utf8",
    ),
  ),
  purpur: JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "analysis_config", "purpur.json"),
      "utf8",
    ),
  ),
  paper: JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "analysis_config", "paper.json"),
      "utf8",
    ),
  ),
};
export async function confChecker(configs) {
  const fields: { name: string; value: string }[] = [];

  let variablesMap = {};

  const configKeys = [
    ["server.properties", "server_properties"],
    ["bukkit.yml", "bukkit"],
    ["spigot.yml", "spigot"],
    ["paper/", "paper"],
    ["purpur.yml", "purpur"],
  ];

  configKeys.forEach(([key, varName]) => {
    if (configs[key]) {
      variablesMap[varName] = JSON.parse(configs[key]);
    }
  });

  for (const name in variablesMap) {
    const configName = `config.${name}`;
    const configObj: any = await CHECKCONF[name];
    if (!configObj) continue;
    for (const nodePath in configObj) {
      const checkArray: Checker[] = configObj[nodePath];
      for (let i = 0; i < checkArray.length; i++) {
        let expressions = checkArray[i].expressions;
        // @ts-ignore
        const allExpressionsTrue = expressions.every(async (expressionStr) => {
          try {
            const result = await jexl.eval(expressionStr, variablesMap);
            return !!result;
          } catch (error) {
            fields.push(errorField(nodePath, error));
            return false;
          }
        });
        if (allExpressionsTrue)
          fields.push(createField(nodePath, checkArray[i]));
      }
    }
  }

  return fields;
}

export async function gcChecker(
  jvmFlagsString: string,
  isServer: boolean,
  jvmVersion: number,
) {
  function extractMemoryAndGcType(
    jvmFlagString: string,
  ): [number | null, string | null] {
    const regex = /-Xm[sx]([0-9]+[kmg])\b.*?(-XX:\+Use(\w+)GC)\b/gi;
    const matches = regex.exec(jvmFlagString);
    if (matches && matches.length > 3) {
      const memorySizeStr = matches[1];
      const gcType = matches[3];

      const memorySize = parseMemorySize(memorySizeStr);

      return [memorySize, gcType];
    }

    return [null, null];
  }
  function parseMemorySize(memorySizeStr: string): number | null {
    const size = parseInt(memorySizeStr, 10);
    if (!isNaN(size)) {
      if (memorySizeStr.endsWith("g")) {
        return size * 1024; // GB 转换为 MB
      } else if (memorySizeStr.endsWith("k")) {
        return size / 1024; // KB 转换为 MB
      } else {
        return size; // MB
      }
    }
    return null;
  }
  const [memorySize, gcType] = extractMemoryAndGcType(jvmFlagsString);
  if (memorySize == null || gcType == null)
    return {
      name: "⚠️ 标签",
      value: "我们无法对你的启动标签进行扫描。",
    };
  if (gcType == "Z" && memorySize <= 20480) {
    return {
      name: "❗ ZGC",
      value: `ZGC 应仅在分配 20GB+ 内存时使用，但你只分配 ${memorySize}MB。`,
    };
  }
  if (gcType == "Shenandoah" && isServer) {
    return {
      name: "❗ Shenandoah",
      value: `ShenandoahGC 在服务端上表现欠佳，推荐仅在客户端使用`,
    };
  }
  if (gcType == "G1") {
    if (memorySize >= 20480 && jvmVersion >= 16) {
      return {
        name: "❗ G1 to ZGC",
        value: `你在 Java${jvmVersion} 上分配了 20GB+ 的内存，因此 ZGC 是个不错的选择，请考虑更换。`,
      };
    }
    if (
      memorySize >= 12088 &&
      jvmFlagsString.includes("-XX:G1NewSizePercent=30")
    )
      return {
        name: "❗ G1 改进",
        value: `当你分配 12GB+ 内存并使用 G1GC，你可以更改一些值来增进性能。`,
      };
  }
  return {
    name: `✅ ${gcType}GC`,
    value: "好样的，你的启动标签在自动扫描中没有任何问题。",
  };
}

function createField(node: string, option: Checker) {
  const field = { name: node, value: option.value };
  if (option.prefix) field.name = option.prefix + " " + field.name;
  return field;
}

function errorField(node: string, error: unknown) {
  return { name: "⚠️" + node, value: String(error) };
}
