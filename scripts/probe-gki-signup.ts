import 'dotenv/config';
import {
  browserOpen,
  browserWait,
  browserState,
  browserClickByText,
  browserFields,
  browserClose,
} from '../src/integrations/browser.js';

// READ-ONLY: drive the real Go Kids waitlist flow up to (but NOT past) the
// signup form. No account is created. Validates the browser hand against the
// live SPA and discovers the account-creation fields.

const URL = 'https://app.mycareconnect.io/carewait/gki';

async function main(): Promise<void> {
  process.env.BROWSER_BACKEND = 'stagehand';

  const dump = async (label: string) => {
    const s = await browserState();
    const f = await browserFields();
    console.log(`\n=== ${label} ===`);
    if (s.ok) {
      console.log(
        `state: url=${s.data.url} title="${s.data.title}" codePrompt=${s.data.hasCodePrompt} loggedIn=${s.data.isLoggedIn} loginForm=${s.data.hasLoginForm}`,
      );
      console.log(`text: ${s.data.text.slice(0, 500).replace(/\n/g, ' | ')}`);
    } else {
      console.log('state err:', s.reason);
    }
    if (f.ok) {
      console.log('fields:', JSON.stringify(f.data.fields));
      console.log('optionGroups:', JSON.stringify(f.data.optionGroups));
    } else {
      console.log('fields err:', f.reason);
    }
  };

  await browserOpen(URL);
  await browserWait(9000);
  await dump('LANDING');

  console.log('\nclick Apply →', JSON.stringify(await browserClickByText('Apply')));
  await browserWait(7000);
  await dump('AFTER APPLY');

  console.log('\nclick Sign Up →', JSON.stringify(await browserClickByText('Sign Up')));
  await browserWait(9000);
  await dump('AFTER SIGN UP');

  await browserClose();
}

main().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});
