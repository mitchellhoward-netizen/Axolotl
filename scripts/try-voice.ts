import 'dotenv/config';
import { generateVoiceReply } from '../src/voice/brain.js';

async function main(): Promise<void> {
  const reply = await generateVoiceReply({
    transcript: [{ role: 'user', content: 'my kid needs a bus' }],
    variables: {
      parent_name: 'Maria',
      student: 'Sophie',
      grade: '3',
      school: 'Soquel Elementary School',
      district: 'Soquel Union Elementary School District',
      issue: 'transportation',
      what_we_know: "they're staying at a motel right now",
    },
  });
  console.log('VOICE REPLY:', reply);
}

main().catch((e) => {
  console.error('FAILED:', (e as Error)?.message ?? e);
  process.exit(1);
});
