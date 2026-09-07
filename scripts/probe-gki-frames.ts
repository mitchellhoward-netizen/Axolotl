import 'dotenv/config';
import { Stagehand, browserbase } from '@browserbasehq/stagehand';

async function main() {
  const browser = await browserbase.launch({ apiKey: process.env.BROWSERBASE_API_KEY });
  const stagehand = await Stagehand.create({ browser } as never);
  try {
    const pages = await stagehand.browser.context.pages();
    const page = pages[0]!;
    await page.goto('https://app.mycareconnect.io/carewait/gki', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(9000);
    await page.evaluate(() => {
      const els = [...document.querySelectorAll('button, a, [role="button"]')] as HTMLElement[];
      const el = els.find((e) => (e.textContent || '').trim() === 'Returning Families');
      if (el) el.click();
    });
    await page.waitForTimeout(7000);
    const data = await page.evaluate(() => {
      // login fill (best-effort)
      const inputs = [...document.querySelectorAll('input')] as HTMLInputElement[];
      const email = inputs.find((e) => (e.getAttribute('placeholder') || '').includes('Email'));
      const pw = inputs.find((e) => e.type === 'password');
      if (email) { email.value = 'mitchgrom16@gmail.com'; email.dispatchEvent(new Event('input', { bubbles: true })); }
      if (pw) { pw.value = 'AxolotlGKI2026!'; pw.dispatchEvent(new Event('input', { bubbles: true })); }
      const btns = [...document.querySelectorAll('button')] as HTMLElement[];
      const login = btns.find((b) => (b.textContent || '').trim() === 'Log In');
      if (login) login.click();
      return 'login attempted';
    });
    console.log(data);
    await page.waitForTimeout(10000);
    await page.goto('https://app.mycareconnect.io/carewait/gki/application/create-traditional', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(12000);
    const info = await page.evaluate(() => {
      const iframes = [...document.querySelectorAll('iframe')].map((f) => ({ src: f.src, id: f.id, name: f.name }));
      const shadowHosts = [...document.querySelectorAll('*')].filter((el) => el.shadowRoot).map((el) => el.tagName.toLowerCase());
      const inShadow = [...document.querySelectorAll('*')].reduce((n, el) => n + (el.shadowRoot ? el.shadowRoot.querySelectorAll('input, select, [role="radio"], [role="checkbox"]').length : 0), 0);
      const mainInputs = document.querySelectorAll('input, select, [role="radio"], [role="checkbox"]').length;
      return { iframes, shadowHostCount: shadowHosts.length, shadowHostSample: shadowHosts.slice(0, 12), inputsInShadow: inShadow, inputsInMain: mainInputs };
    });
    console.log('FRAME/SHADOW INFO:', JSON.stringify(info, null, 1));
  } finally {
    await stagehand.close().catch(() => {});
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error('ERR', String(e)); process.exit(1); });
