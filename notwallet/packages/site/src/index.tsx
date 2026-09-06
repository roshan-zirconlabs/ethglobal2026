import { createRoot } from 'react-dom/client';

import { App } from './App';
import { PhoneSigner } from './PhoneSigner';
import { Root } from './Root';

// eslint-disable-next-line import/no-unassigned-import
import 'bootstrap/dist/css/bootstrap.min.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found.');
}

// `?role=phone` boots the standalone offline signer (no MetaMask needed);
// otherwise the normal desktop companion dapp.
const isPhone = (() => {
  try {
    return new URLSearchParams(window.location.search).get('role') === 'phone';
  } catch {
    return false;
  }
})();

createRoot(rootElement).render(
  isPhone ? (
    <PhoneSigner />
  ) : (
    <Root>
      <App />
    </Root>
  ),
);
