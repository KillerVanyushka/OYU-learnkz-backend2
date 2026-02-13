module.exports = function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.role) return res.status(401).json({ message: 'Not authenticated' })

    if (!allowedRoles.includes(req.role)) {
      return res.status(403).json({ message: 'Forbidden' })
    }

    next()
  }
}
