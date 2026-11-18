import './styles/base.css';
import './styles/desk.css';
import './styles/composer.css';
import './styles/riff-room.css';
import './styles/theory.css';
import { boot } from './desk/app.js';
import { mountRiffRoom } from './riff/room.js';

boot();
mountRiffRoom(document.getElementById('riff-room'));
