import { createRoot } from 'react-dom/client';
import { UploadController } from '../../lib/controller';
import { App } from './App';
import '../../styles/main.css';

const root = document.getElementById('root');
if (!root) throw new Error('Ariso upload root is missing');
createRoot(root).render(<App controller={new UploadController()} />);
