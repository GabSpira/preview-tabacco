const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const dotenv = require('dotenv');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

dotenv.config();

const app = express();
const port = 3000;

// Configura EJS come motore di template
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, 'public'))); // serve HTML, CSS, JS, audio

// ENV variables
const redirect_uri = process.env.REDIRECT_URI;
const client_id = process.env.CLIENT_ID;
const client_secret = process.env.CLIENT_SECRET;
const album_id = process.env.ALBUM_ID;

// Home page (index.ejs)
app.get('/', (req, res) => {
  res.render('index', { success: false });
});

// Login route → Spotify Auth
app.get('/login', (req, res) => {
  const scope = 'user-library-modify user-read-email user-read-private';
  const auth_url = 'https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
    });
  res.redirect(auth_url);
});

// Callback route → Spotify redirects here
app.get('/callback', async (req, res) => {
  const code = req.query.code || null;

  try {
    // Exchange code for access token
    const tokenResponse = await axios.post('https://accounts.spotify.com/api/token',
      querystring.stringify({
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code',
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(client_id + ':' + client_secret).toString('base64'),
        }
      });

    const access_token = tokenResponse.data.access_token;

    // Get user profile
    const userResponse = await axios.get('https://api.spotify.com/v1/me', {
      headers: { 'Authorization': 'Bearer ' + access_token }
    });

    const user = userResponse.data;
    console.log(`🎧 Pre-save da: ${user.display_name} ${user.email} (${user.id})`);

    // Pre-save: add album to library
    await axios.put(`https://api.spotify.com/v1/me/albums?ids=${album_id}`, null, {
      headers: { 'Authorization': 'Bearer ' + access_token }
    });

    // Log email & ID
    const log = `${new Date().toISOString()},${user.id},${user.email},${user.display_name || ''}\n`;
    fs.appendFileSync('presave_log.csv', log);

    // Render the index page with success flag
    res.render('index', { success: true });

  } catch (error) {
    // Se è un errore HTTP da Spotify
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Errore non HTTP:', error.message);
    }
    // Risposta all’utente
    res.send('<h2>❌ Si è verificato un errore. Riprova più tardi.</h2>');
  }
});

app.listen(port, () => {
  console.log(`✅ Server attivo su http://127.0.0.1:${port}`);
});
