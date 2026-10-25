import { writeFile } from 'node:fs/promises';
import { Resvg } from '../../node_modules/@resvg/resvg-js/index.js';

// Invented account details used only inside editable sample screenshots.
const base = (body, height = 1000) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="${height}" viewBox="0 0 1440 ${height}"><rect width="1440" height="${height}" fill="#f2f5f5"/><g font-family="PingFang SC,Arial" fill="#272343">${body}</g></svg>`;
const header = `<rect width="1440" height="90" fill="white"/><text x="64" y="58" font-size="34" font-weight="600">工作空间</text><text x="1140" y="55" font-size="23" fill="#788589">个人账户</text>`;
const fixtures = {
  'demo-account.png': base(
    `${header}<text x="96" y="179" font-size="40" font-weight="600">账号与安全</text><text x="96" y="221" font-size="22" fill="#77858a">管理你的个人信息和登录方式</text><rect x="96" y="266" width="1248" height="590" rx="20" fill="white"/><circle cx="180" cy="350" r="39" fill="#dcefeb"/><text x="156" y="363" font-size="32">林</text><text x="248" y="343" font-size="28" font-weight="600">林小满</text><text x="248" y="382" font-size="22" fill="#77858a">个人工作空间 · 免费账户</text><path d="M136 430H1304" stroke="#e8eeee"/><text x="144" y="488" font-size="23" fill="#77858a">邮箱地址</text><text x="420" y="488" font-size="26">xiaoman@example.com</text><text x="144" y="568" font-size="23" fill="#77858a">手机号码</text><text x="420" y="568" font-size="26">138 0000 2468</text><text x="144" y="648" font-size="23" fill="#77858a">用户编号</text><text x="420" y="648" font-size="26">USR-2026-0824</text><path d="M136 702H1304" stroke="#e8eeee"/><text x="144" y="770" font-size="23">两步验证</text><rect x="1170" y="738" width="92" height="42" rx="21" fill="#307d70"/><circle cx="1239" cy="759" r="15" fill="white"/><text x="100" y="922" font-size="20" fill="#869195">最近更新：2026年10月25日</text>`,
  ),
  'demo-profile.png': base(
    `${header}<text x="96" y="179" font-size="40" font-weight="600">账号与安全</text><text x="96" y="221" font-size="22" fill="#77858a">团队账户的个人信息</text><rect x="96" y="266" width="1248" height="590" rx="20" fill="white"/><circle cx="180" cy="350" r="39" fill="#fff0cb"/><text x="156" y="363" font-size="32">周</text><text x="248" y="343" font-size="28" font-weight="600">周望舒</text><text x="248" y="382" font-size="22" fill="#77858a">设计工作室 · 团队账户</text><path d="M136 430H1304" stroke="#e8eeee"/><text x="144" y="488" font-size="23" fill="#77858a">邮箱地址</text><text x="420" y="488" font-size="26">wangshu@example.com</text><text x="144" y="568" font-size="23" fill="#77858a">手机号码</text><text x="420" y="568" font-size="26">139 0000 5678</text><text x="144" y="648" font-size="23" fill="#77858a">用户编号</text><text x="420" y="648" font-size="26">USR-2026-1025</text><path d="M136 702H1304" stroke="#e8eeee"/><text x="144" y="770" font-size="23">两步验证</text><rect x="1170" y="738" width="92" height="42" rx="21" fill="#307d70"/><circle cx="1239" cy="759" r="15" fill="white"/>`,
  ),
  'demo-receipt.png': base(
    `${header}<text x="96" y="179" font-size="40" font-weight="600">付款凭证</text><text x="96" y="224" font-size="23" fill="#77858a">订单 #AR20261025028</text><rect x="96" y="270" width="1248" height="610" rx="20" fill="white"/><text x="144" y="350" font-size="25">付款成功</text><text x="144" y="432" font-size="60" font-weight="600">¥ 268.00</text><path d="M144 480H1296" stroke="#e8eeee"/><text x="144" y="556" font-size="23" fill="#77858a">付款人</text><text x="530" y="556" font-size="26">林小满</text><text x="144" y="640" font-size="23" fill="#77858a">联系邮箱</text><text x="530" y="640" font-size="26">xiaoman@example.com</text><text x="144" y="724" font-size="23" fill="#77858a">交易编号</text><text x="530" y="724" font-size="26">2026 1025 0000 8824</text><text x="144" y="808" font-size="23" fill="#77858a">付款时间</text><text x="530" y="808" font-size="26">2026-10-25 10:28</text>`,
  ),
  'demo-logo.png': `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="130"><rect width="400" height="130" rx="28" fill="#ffd807"/><text x="200" y="88" font-family="Arial" font-size="84" font-style="italic" text-anchor="middle" fill="#272343">Ariso</text></svg>`,
};
for (const [name, svg] of Object.entries(fixtures)) {
  await writeFile(
    new URL(`./public/${name}`, import.meta.url),
    new Resvg(svg).render().asPng(),
  );
  console.log(name);
}
