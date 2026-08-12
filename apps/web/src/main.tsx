import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import './styles.css';

const root = document.querySelector<HTMLDivElement>('#root');

if (root === null) {
  throw new Error('VSIX Scout Web root element was not found.');
}

createRoot(root).render(<App />);
