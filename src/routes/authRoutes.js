const router = require('express').Router()
const authController = require('../controllers/authController')
const googleAuth = require('../controllers/googleAuth')

// Email/password регистрация и логин
router.post('/register', authController.register)
router.post('/login', authController.login)
router.post('/confirm-email', authController.confirmEmail)
router.post('/forgot-password', authController.forgotPassword)
router.post('/reset-password', authController.resetPassword)

// Google login
router.post('/google-login', googleAuth.googleLogin)

module.exports = router