/**
 * Hooks the two views expose to each other and to the session runner.
 * Each view fills these in when it mounts.
 */
export const deskApi = {
  stop() {},
  showFretboard(_next) {},
  /** Set up a jam: fretboard scale/root/box, tempo, and a status line. */
  jam(_next) {},
  /** Load a drum pattern and tempo. */
  loadPattern(_next) {},
};

export const riffApi = {
  showView(_view) {},
  /** The riff open in the Riff Room, or null. */
  current() { return null; },
  /** Send the open riff's scale and practice tempo to the Desk. False if nothing to send. */
  jam() { return false; },
  pause() {},
};
