// server.js
const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');

// **Import di Vercel Blob**
const { put } = require('@vercel/blob');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Configura EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Variabili d’ambiente
const redirect_uri = process.env.REDIRECT_URI;
const client_id    = process.env.CLIENT_ID;
const client_secret= process.env.CLIENT_SECRET;
const album_id     = process.env.ALBUM_ID;

// Home: sempre renderizza index.ejs
app.get('/', (req, res) => {
  res.render('index', { success: false });
});

app.get('/login', (req, res) => {
  const scope = 'user-library-modify user-read-email user-read-private';
  const auth_url = 'https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id,
      scope,
      redirect_uri,
    });
  res.redirect(auth_url);
});

app.get('/callback', async (req, res) => {
  const code = req.query.code || null;
  try {
    // Scambio code → access token
    const tokenRes = await axios.post('https://accounts.spotify.com/api/token',
      querystring.stringify({
        code,
        redirect_uri,
        grant_type: 'authorization_code',
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' +
            Buffer.from(`${client_id}:${client_secret}`).toString('base64'),
        }
      });
    const access_token = tokenRes.data.access_token;

    // Ottieni profilo utente
    const userRes = await axios.get('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    const user = userRes.data;

    // Pre-save
    await axios.put(
      `https://api.spotify.com/v1/me/albums?ids=${album_id}`, 
      null,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );

    // **Scrivi su Vercel Blob invece che su filesystem**
    const record = {
      timestamp: new Date().toISOString(),
      id: user.id,
      email: user.email,
      display_name: user.display_name || ''
    };
    // Chiave univoca per ogni record
    const key = `presaves/${user.id}-${Date.now()}.json`;
    await put(key, JSON.stringify(record), { access: 'private' });

    // Render della pagina con preview
    res.render('index', { success: true });

  } catch (error) {
    console.error('Errore nel pre-save:', error.response?.data || error.message);
    res.send('<h2>❌ Si è verificato un errore. Riprova più tardi.</h2>');
  }
});

app.listen(port, () => {
  console.log(`✅ Server attivo su http://127.0.0.1:${port}`);
});
