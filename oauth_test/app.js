require('dotenv').config();

const express = require('express');
const passport = require('passport');
const session = require('express-session');
const crypto = require('crypto');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

// Escape text from external APIs so it can't inject HTML into a page.
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Create the Express app that handles HTTP requests.
const app = express();

// Keep login state between requests using a server-side session.
// Use SESSION_SECRET if set; otherwise generate a random one each time the server starts.
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
app.use(session({ secret: sessionSecret, resave: false, saveUninitialized: true }));
// Attach Passport to requests and restore the logged-in user from the session.
app.use(passport.initialize());
app.use(passport.session());

// Configure Google OAuth; the callback receives the authenticated Google profile.
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: 'http://localhost:3000/auth/google/callback'
  },
  (accessToken, refreshToken, profile, done) => {
    // Keep the access token with the profile so later requests can call Google APIs.
    profile.accessToken = accessToken;
    // Return the profile so Passport can store it in the login session.
    return done(null, profile);
  }
));

// Save and restore the user object as Passport creates and resumes sessions.
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// Show a sign-in link on the home page.
app.get('/', (req, res) => {
  res.send('<h1>Home</h1><a href="/auth/google">Sign In with Google</a><br><a href="/auth/slack">Integrate with Slack</a><br><a href="/auth/box">Integrate with Box</a><br><a href="/auth/groupme">Integrate with GroupMe</a>');
});

// Send the user to GroupMe to log in; GroupMe redirects back to the callback URL set on the app.
app.get('/auth/groupme', (req, res) => {
  const params = new URLSearchParams({ client_id: process.env.GROUPME_CLIENT_ID });
  res.redirect(`https://oauth.groupme.com/oauth/authorize?${params}`);
});

// GroupMe sends the access token directly in the query string (no code exchange or client secret).
// GroupMe has no state parameter, so this callback can't verify the login started in this browser.
app.get('/auth/groupme/callback', (req, res) => {
  const { access_token } = req.query;
  if (!access_token) {
    return res.status(400).send('GroupMe did not return an access token.');
  }
  req.session.groupme = { accessToken: access_token };
  // Redirect right away so the token doesn't stay in the address bar or browser history.
  res.redirect('/groupme');
});

// List the groups the connected GroupMe user belongs to.
app.get('/groupme', async (req, res, next) => {
  if (!req.session.groupme) {
    return res.status(401).send('GroupMe is not connected. <a href="/auth/groupme">Integrate with GroupMe</a>');
  }
  try {
    const response = await fetch('https://api.groupme.com/v3/groups?per_page=20', {
      headers: { 'X-Access-Token': req.session.groupme.accessToken }
    });
    if (!response.ok) {
      return res.status(response.status).send(`GroupMe API error: ${escapeHtml(await response.text())}`);
    }
    const { response: groups } = await response.json();
    const items = groups.map((g) => `<li>${escapeHtml(g.name)} <small>(${g.members?.length ?? 0} members)</small></li>`).join('');
    res.send(`<h1>Your GroupMe groups</h1><ul>${items || '<li>No groups found.</li>'}</ul><a href="/">Home</a>`);
  } catch (err) {
    next(err);
  }
});

// Send the user to Box to approve access to their files.
app.get('/auth/box', (req, res) => {
  // A random state value ties Box's callback to this browser session, blocking forged callbacks.
  const state = crypto.randomBytes(16).toString('hex');
  req.session.boxState = state;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.BOX_CLIENT_ID,
    redirect_uri: process.env.BOX_REDIRECT_URI,
    state
  });
  res.redirect(`https://account.box.com/api/oauth2/authorize?${params}`);
});

// Handle Box's response: check the state, then trade the one-time code for an access token.
app.get('/auth/box/callback', async (req, res, next) => {
  const { code, state, error } = req.query;
  if (error) {
    return res.status(400).send(`Box authorization failed: ${escapeHtml(error)}`);
  }
  if (!state || state !== req.session.boxState) {
    return res.status(400).send('Invalid state. Please try again.');
  }
  delete req.session.boxState;
  try {
    const response = await fetch('https://api.box.com/oauth2/token', {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.BOX_CLIENT_ID,
        client_secret: process.env.BOX_CLIENT_SECRET
      })
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(400).send(`Box token exchange failed: ${escapeHtml(data.error_description || data.error)}`);
    }
    // Keep the access token in the session for later Box API calls.
    req.session.box = { accessToken: data.access_token };
    res.redirect('/box');
  } catch (err) {
    next(err);
  }
});

// List the items in the user's top-level Box folder.
app.get('/box', async (req, res, next) => {
  if (!req.session.box) {
    return res.status(401).send('Box is not connected. <a href="/auth/box">Integrate with Box</a>');
  }
  try {
    // Folder "0" is always the root "All Files" folder in Box.
    const response = await fetch('https://api.box.com/2.0/folders/0/items?limit=20', {
      headers: { Authorization: `Bearer ${req.session.box.accessToken}` }
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).send(`Box API error: ${escapeHtml(data.message || data.code)}`);
    }
    const items = data.entries.map((e) => `<li>${escapeHtml(e.name)} <small>(${escapeHtml(e.type)})</small></li>`).join('');
    res.send(`<h1>Your Box files</h1><ul>${items || '<li>No files found.</li>'}</ul><a href="/">Home</a>`);
  } catch (err) {
    next(err);
  }
});

// Send the user to Slack to install the app into their workspace.
app.get('/auth/slack', (req, res) => {
  // A random state value ties Slack's callback to this browser session, blocking forged callbacks.
  const state = crypto.randomBytes(16).toString('hex');
  req.session.slackState = state;
  const params = new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID,
    scope: 'channels:read,chat:write',
    redirect_uri: process.env.SLACK_REDIRECT_URI,
    state
  });
  res.redirect(`https://slack.com/oauth/v2/authorize?${params}`);
});

// Handle Slack's response: check the state, then trade the one-time code for a bot token.
app.get('/auth/slack/callback', async (req, res, next) => {
  const { code, state, error } = req.query;
  if (error) {
    return res.status(400).send(`Slack authorization failed: ${error}`);
  }
  if (!state || state !== req.session.slackState) {
    return res.status(400).send('Invalid state. Please try again.');
  }
  delete req.session.slackState;
  try {
    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: process.env.SLACK_CLIENT_ID,
        client_secret: process.env.SLACK_CLIENT_SECRET,
        code,
        redirect_uri: process.env.SLACK_REDIRECT_URI
      })
    });
    const data = await response.json();
    if (!data.ok) {
      return res.status(400).send(`Slack token exchange failed: ${data.error}`);
    }
    // Keep the bot token and workspace name in the session for later Slack API calls.
    req.session.slack = { accessToken: data.access_token, teamName: data.team.name };
    res.redirect('/slack');
  } catch (err) {
    next(err);
  }
});

// List public channels in the connected Slack workspace.
app.get('/slack', async (req, res, next) => {
  if (!req.session.slack) {
    return res.status(401).send('Slack is not connected. <a href="/auth/slack">Integrate with Slack</a>');
  }
  try {
    const response = await fetch('https://slack.com/api/conversations.list?limit=20&exclude_archived=true', {
      headers: { Authorization: `Bearer ${req.session.slack.accessToken}` }
    });
    const data = await response.json();
    if (!data.ok) {
      return res.status(400).send(`Slack API error: ${data.error}`);
    }
    const items = data.channels.map((c) => `<li>#${escapeHtml(c.name)}</li>`).join('');
    res.send(`<h1>Connected to ${escapeHtml(req.session.slack.teamName)}</h1><ul>${items || '<li>No channels found.</li>'}</ul><a href="/">Home</a>`);
  } catch (err) {
    next(err);
  }
});

// Redirect the user to Google and request profile, email, and read-only Drive access.
app.get('/auth/google',
  passport.authenticate('google', {
    scope: ['profile', 'email', 'https://www.googleapis.com/auth/drive.readonly']
  })
);

// Handle Google's response and send successfully signed-in users to the dashboard.
app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect('/dashboard');
  }
);

// Show the user's name only when Passport confirms an active login.
app.get('/dashboard', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).send('Unauthorized. Please log in.');
  }
  res.send(`<h1>Welcome, ${req.user.displayName}!</h1><a href="/drive">My Drive files</a> | <a href="/logout">Logout</a>`);
});

// List the signed-in user's 10 most recently modified Drive files.
app.get('/drive', async (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).send('Unauthorized. Please log in.');
  }
  try {
    const url = 'https://www.googleapis.com/drive/v3/files?pageSize=10&orderBy=modifiedTime desc&fields=files(id,name,mimeType)';
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${req.user.accessToken}` }
    });
    if (!response.ok) {
      return res.status(response.status).send(`Drive API error: ${await response.text()}`);
    }
    const { files } = await response.json();
    const items = files.map((f) => `<li>${escapeHtml(f.name)} <small>(${escapeHtml(f.mimeType)})</small></li>`).join('');
    res.send(`<h1>Your Drive files</h1><ul>${items || '<li>No files found.</li>'}</ul><a href="/dashboard">Back</a>`);
  } catch (err) {
    next(err);
  }
});

// End the Passport login session and return to the home page.
app.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect('/');
  });
});

// Start the local web server on port 3000.
app.listen(3000, () => console.log('App running on http://localhost:3000'));

