import { Context, Schema } from "koishi";
import { confChecker, gcChecker } from "./spark";
import fs from "fs";
import path from "path";

export const name = "mcdev";
export const using = ["puppeteer"];
export interface Config {}

export const Config: Schema<Config> = Schema.object({});

export function apply(ctx: Context) {
  const chotaStyles = fs.readFileSync(
    path.join(__dirname, "chota.min.css"),
    "utf-8",
  );

  ctx.command("spark <url:strings>").action(async ({ session }, url) => {
    if (!url) return "请输入网址。";
    if (!url.startsWith("https://spark")) return "不是 spark 报告的网址。";
    const response_raw = await fetch(url + "?raw=1");
    const sampler: any = await response_raw.json().catch(() => undefined);
    if (!sampler) return "获取数据失败，请检查是不是 spark 报告的链接。";

    const cards: { name: string; value: string }[] = [];

    const configs = sampler.metadata.serverConfigurations;
    let isServer: boolean = true;
    if (!configs) isServer = false;
    const flags = sampler.metadata.systemStatistics.java.vmArgs;
    const versionString = sampler.metadata.systemStatistics.java.vendorVersion;
    const majorVersion = parseInt(versionString.split(".")[0], 10);

    let cardHTML = "";
    await Promise.all([
      confChecker(configs).then((fields) => cards.push(...fields)),
      gcChecker(flags, isServer, majorVersion).then((field) =>
        cards.unshift(field),
      ),
    ]).then(() => {
      for (const card of cards) {
        cardHTML += `
      <div class="col-4">
        <div class="card">
          <h2>${card.name}</h2>
          <p>${card.value}</p>
        </div>
      </div>
    `;
      }
    });

    return `<html>
    <head>
      <style>
        ${chotaStyles}
        body {
          background: linear-gradient(to right, #e9f1fc, #c0cfe3);
        }
        .card {
          box-shadow: 0 0.5em 1em -0.125em rgb(10 10 10 / 10%), 0 0 0 1px rgb(10 10 10 / 2%);
          border-radius: 15px;
        }
        .card h2 {
          color: #333;
          text-shadow: 1px 1px 1px rgba(0,0,0,0.1);
          margin-bottom: 0.25rem;
          font-size: 1.25rem;
        }
        .card p {
          color: #333;
          text-shadow: 1px 1px 1px rgba(0,0,0,0.1);
          margin-bottom: 1rem;
          font-size: 1.5rem;
        }
        .card .tag {
          color: #777;
          font-size: 0.8rem;
        }
      </style>
    </head>
    <body>
      <div class="col-12">
         <div class="card">
            <h2>Spark - ${url.substring(url.lastIndexOf("/") + 1)}</h2>
            <p>本项目开源于 GitHub ahdg6/koishi-plugin-mcdev，Discord 版本请搜索 CraftyAssistant</p>
            <div class="tag">平台：${sampler.metadata.platform.version}</div>
            <div class="tag">上传用户：${sampler.metadata.user.name}</div>
         </div>
      </div>
      <div class="container">
        <div class="row">
          ${cardHTML}
        </div>
      </div>
    </body>
    </html>`;
  });
}
