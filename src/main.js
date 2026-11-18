import './styles/base.css';
import './styles/desk.css';
import './styles/composer.css';
import './styles/riff-room.css';
import './styles/theory.css';
import './styles/session.css';
import { boot } from './desk/app.js';
import { mountRiffRoom } from './riff/room.js';
import { mountSession } from './session/ui.js';

boot();
mountRiffRoom(document.getElementById('riff-room'));
mountSession(document.getElementById('session-root'), document.getElementById('session-toggle'));
