const cookieName = 'learnboost_mock_user';

export function readMockUser(request) {
  const cookie = request.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`));
  if (!cookie) return null;
  try {
    const value = JSON.parse(Buffer.from(cookie.slice(cookieName.length + 1), 'base64url').toString('utf8'));
    return typeof value.name === 'string' && value.name.length <= 80 ? { name: value.name, mock: true } : null;
  } catch { return null; }
}

export function registerMockAuth(app) {
  app.get('/api/auth/session', (request, response) => response.json({ user: readMockUser(request), mode: 'mock' }));
  app.post('/api/auth/login', (request, response) => {
    const name = typeof request.body?.identifier === 'string' ? request.body.identifier.trim().slice(0, 80) || 'Local explorer' : 'Local explorer';
    const user = { name, mock: true };
    response.cookie(cookieName, Buffer.from(JSON.stringify(user)).toString('base64url'), { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/' });
    response.json({ user, mode: 'mock' });
  });
  app.post('/api/auth/logout', (request, response) => {
    response.clearCookie(cookieName, { httpOnly: true, sameSite: 'lax', path: '/' });
    response.json({ ok: true });
  });
}
