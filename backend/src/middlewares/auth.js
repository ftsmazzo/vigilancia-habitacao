import jwt from "jsonwebtoken";

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: true,
      message: "Token ausente",
      code: "AUTH_TOKEN_MISSING"
    });
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    req.user = decoded;
    return next();
  } catch (_error) {
    return res.status(401).json({
      error: true,
      message: "Token invalido",
      code: "AUTH_TOKEN_INVALID"
    });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: true,
        message: "Acesso negado",
        code: "AUTH_FORBIDDEN"
      });
    }
    return next();
  };
}
