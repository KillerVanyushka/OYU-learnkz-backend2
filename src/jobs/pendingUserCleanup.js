const prisma = require('../utils/prisma')

const CLEANUP_INTERVAL_MS = 30 * 1000

async function deleteExpiredUnconfirmedUsers() {
  try {
    const result = await prisma.user.deleteMany({
      where: {
        emailConfirmed: false,
        emailConfirmationExpiry: {
          lte: new Date(),
        },
      },
    })

    if (result.count > 0) {
      console.log(`[auth-cleanup] deleted ${result.count} expired unconfirmed user(s)`)
    }
  } catch (error) {
    console.error('[auth-cleanup] failed to delete expired unconfirmed users', error)
  }
}

function startPendingUserCleanup() {
  deleteExpiredUnconfirmedUsers()

  const timer = setInterval(deleteExpiredUnconfirmedUsers, CLEANUP_INTERVAL_MS)
  if (typeof timer.unref === 'function') {
    timer.unref()
  }

  return timer
}

module.exports = {
  deleteExpiredUnconfirmedUsers,
  startPendingUserCleanup,
}
