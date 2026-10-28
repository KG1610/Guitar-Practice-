import { boot } from './glory-app.js';
import { mountRiffRoom } from './riff-room.js';

boot();
mountRiffRoom(document.getElementById('riff-room'));
