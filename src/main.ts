import './ui/styles.css';
import { App } from './app/App';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app element');

new App(root).start().catch((error) => {
  console.error('[earth-lab] failed to start', error);
  const message = document.querySelector('#splash p');
  if (message) message.textContent = 'Something went wrong while starting Earth Lab.';
});
