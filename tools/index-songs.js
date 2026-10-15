/* Rebuild the file:// fallback from the same directory used by the server. */
const fs = require('node:fs');
const path = require('node:path');
const lyrics = require('../js/lyrics');
const root = path.resolve(__dirname, '..');
function discoverSongs() {
  const dir = path.join(root, 'media', 'songs');
  const names = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes:true }).filter(e => e.isFile()).map(e => e.name) : [];
  return names.filter(n => /\.(mp3|m4a|wav|ogg)$/i.test(n)).sort((a,b)=>a.localeCompare(b,'zh-Hans')).map(file => {
    const name = file.replace(/\.[^.]+$/, '');
    const sidecar = ['.lrc','.txt'].map(ext => names.find(n => n.toLowerCase() === (name + ext).toLowerCase())).find(Boolean);
    return { name, id:file, url:'media/songs/' + encodeURIComponent(file),
      lyrics:sidecar ? 'media/songs/' + encodeURIComponent(sidecar) : null,
      text:sidecar ? lyrics.decode(fs.readFileSync(path.join(dir,sidecar))) : null,
    };
  });
}
function indexSongs() {
  const songs = discoverSongs();
  fs.writeFileSync(path.join(root,'js/local-songs.js'), '/* Generated from media/songs; node tools/index-songs.js refreshes file-mode discovery. */\nconst LOCAL_SONGS = ' + JSON.stringify(songs) + ';\n');
  return songs;
}
if (require.main === module) console.log('Indexed', indexSongs().length, 'local songs.');
module.exports = { discoverSongs, indexSongs };
