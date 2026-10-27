import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchDesktop } from '../../desktop-runtime.mjs';

const directory = process.argv[2];
const app = process.argv[3];
const timer = setInterval(async () => {
  if (!existsSync(join(directory, 'go'))) return;
  clearInterval(timer);
  try {
    const control = spawn(app, [], {
      env: { ...process.env, DSH_TEST_OUTPUT: join(directory, 'control.json') },
      stdio: 'ignore', windowsHide: true,
    });
    control.on('error', error => writeFileSync(join(directory, 'error'), String(error)));
    process.env.DSH_TEST_OUTPUT = join(directory, 'desktop.json');
    process.env.DSH_TEST_VALUE = '中文 path with spaces';
    process.env.ELECTRON_RUN_AS_NODE = '1';
    await launchDesktop(app);
  } catch (error) {
    writeFileSync(join(directory, 'error'), String(error));
  }
}, 50);
setTimeout(() => process.exit(2), 60000).unref();
setInterval(() => {}, 1000);

