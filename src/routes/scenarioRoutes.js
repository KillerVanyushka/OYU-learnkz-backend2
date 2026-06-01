const express = require('express');
const router = express.Router();
const { saveScenario } = require('../controllers/scenarioController');
const authMiddleware = require('../middlewares/authMiddleware');

router.post('/scenario', authMiddleware, saveScenario);

module.exports = router;