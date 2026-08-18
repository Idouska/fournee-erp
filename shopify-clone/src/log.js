const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (color, text) => (useColor ? `${COLORS[color]}${text}${COLORS.reset}` : text);

export const warnings = [];
export const errors = [];

let currentStep = '';

export function setStep(name) {
  currentStep = name;
}

export function step(name) {
  currentStep = name;
  console.log('');
  console.log(paint('cyan', `━━ ${name} ${'━'.repeat(Math.max(0, 60 - name.length))}`));
}

export function info(message) {
  console.log(`   ${message}`);
}

export function detail(message) {
  console.log(paint('dim', `   ${message}`));
}

export function ok(message) {
  console.log(`   ${paint('green', '✓')} ${message}`);
}

export function warn(message) {
  warnings.push({ step: currentStep, message });
  console.log(`   ${paint('yellow', '!')} ${message}`);
}

export function fail(message) {
  errors.push({ step: currentStep, message });
  console.log(`   ${paint('red', '✗')} ${message}`);
}

export function progress(done, total, label) {
  if (!process.stdout.isTTY) return;
  const text = `   ${label} ${done}/${total}`;
  process.stdout.write(`\r${text.padEnd(70)}`);
  if (done === total) process.stdout.write('\r'.padEnd(72) + '\r');
}
