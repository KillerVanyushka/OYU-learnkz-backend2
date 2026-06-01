const prisma = require('../prisma/client');

exports.saveScenario = async (req, res) => {
    try {
        const userId = req.user.userId; // из authMiddleware
        const { scenarioTitle } = req.body;

        if (!scenarioTitle) {
            return res.status(400).json({ error: 'scenarioTitle is required' });
        }

        const updated = await prisma.userOnboardingAnswer.upsert({
            where: { userId },
            update: { selectedScenario: scenarioTitle },
            create: {
                userId,
                goal: 'not_set',
                studyMinutesDaily: 0,
                currentLevel: 'A0',
                learningStyle: 'not_set',
                focusArea: 'not_set',
                preferredPace: 'not_set',
                selectedScenario: scenarioTitle,
            },
        });

        res.json({ success: true, data: updated });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
};