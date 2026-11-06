import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error('Node.js 22.13 이상이 필요해요. Node.js를 업데이트한 뒤 npm start를 다시 실행해 주세요.');
  process.exit(1);
}

let activeProcess;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    activeProcess?.kill(signal);
    process.exit(signal === 'SIGINT' ? 130 : 143);
  });
}

function runNode(args) {
  return new Promise((resolve, reject) => {
    activeProcess = spawn(process.execPath, args, { cwd: root, stdio: 'inherit' });
    activeProcess.once('error', reject);
    activeProcess.once('exit', (code, signal) => {
      activeProcess = null;
      if (code === 0) resolve();
      else reject(new Error(signal ? '실행을 중지했어요.' : '실행 단계에서 오류가 발생했어요. 위의 오류 내용을 확인해 주세요.'));
    });
  });
}

try {
  const lockfile = await readFile(path.join(root, 'package-lock.json'));
  const fingerprint = createHash('sha256')
    .update(lockfile)
    .update(process.versions.node + process.platform + process.arch)
    .digest('hex');
  const stampPath = path.join(root, 'node_modules', '.learnboost-installed');
  let installed = false;
  try {
    installed = (await readFile(stampPath, 'utf8')) === fingerprint;
    await access(path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'));
  } catch {
    installed = false;
  }

  if (!installed) {
    const npmCli = process.env.npm_execpath;
    if (!npmCli) throw new Error('프로젝트 폴더에서 npm start로 실행해 주세요.');
    console.log('처음 실행에 필요한 패키지를 설치하고 있어요…');
    await runNode([npmCli, 'ci', '--no-fund', '--no-audit']);
    await writeFile(stampPath, fingerprint);
  }

  console.log('앱 화면을 준비하고 있어요…');
  await runNode([path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build']);
  console.log('준비됐어요. 아래 작업 공간 주소를 브라우저에서 열어 주세요.');
  await runNode([path.join(root, 'index.js'), '--production']);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
