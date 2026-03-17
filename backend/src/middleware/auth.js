export function requireAuth(req, res, next) {
  // Demo bypass - remove in production
  req.user = { id: 'demo', username: 'guest' };
  next();
}

export function optionalAuth(req, res, next) {
  next();
}

