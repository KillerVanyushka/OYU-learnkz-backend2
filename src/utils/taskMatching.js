function normalizeMatchEntry(entry, index) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return null
  }

  const idSource =
    entry.id ??
    entry.key ??
    entry.leftId ??
    entry.rightId ??
    `pair-${index + 1}`

  const leftSource = entry.left ?? entry.leftText ?? entry.ru ?? entry.promptText
  const rightSource = entry.right ?? entry.rightText ?? entry.kz ?? entry.targetText

  const id = String(idSource).trim()
  const left = String(leftSource ?? '').trim()
  const right = String(rightSource ?? '').trim()

  if (!id || !left || !right) {
    return null
  }

  return { id, left, right }
}

function normalizeMatchPairs(value) {
  if (!Array.isArray(value)) {
    return null
  }

  const pairs = value
    .map((entry, index) => normalizeMatchEntry(entry, index))
    .filter(Boolean)

  if (pairs.length !== value.length) {
    return null
  }

  const ids = new Set()
  for (const pair of pairs) {
    if (ids.has(pair.id)) {
      return null
    }
    ids.add(pair.id)
  }

  return pairs
}

function buildMatchingOptions(value) {
  const pairs = normalizeMatchPairs(value)
  if (!pairs) {
    return null
  }

  return {
    leftWords: pairs.map((pair) => ({ id: pair.id, text: pair.left })),
    rightWords: pairs.map((pair) => ({ id: pair.id, text: pair.right })),
  }
}

function normalizeAnswerPairs(value) {
  if (!Array.isArray(value)) {
    return null
  }

  const pairs = []

  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return null
    }

    const leftId = String(entry.leftId ?? '').trim()
    const rightId = String(entry.rightId ?? '').trim()

    if (!leftId || !rightId) {
      return null
    }

    pairs.push({ leftId, rightId })
  }

  return pairs
}

function evaluateWordMatch(answerPairs, storedPairs) {
  const normalizedStoredPairs = normalizeMatchPairs(storedPairs)
  const normalizedAnswerPairs = normalizeAnswerPairs(answerPairs)

  if (!normalizedStoredPairs) {
    return { error: 'Task has invalid matching pairs' }
  }

  if (!normalizedAnswerPairs || normalizedAnswerPairs.length === 0) {
    return { error: 'answerPairs must be a non-empty array' }
  }

  const leftIds = new Set(normalizedStoredPairs.map((pair) => pair.id))
  const rightIds = new Set(leftIds)
  const answerByLeftId = new Map()
  const usedRightIds = new Set()
  let hasDuplicateLeft = false
  let hasDuplicateRight = false
  let hasUnknownIds = false

  for (const pair of normalizedAnswerPairs) {
    if (!leftIds.has(pair.leftId) || !rightIds.has(pair.rightId)) {
      hasUnknownIds = true
    }
    if (answerByLeftId.has(pair.leftId)) {
      hasDuplicateLeft = true
    }
    if (usedRightIds.has(pair.rightId)) {
      hasDuplicateRight = true
    }

    answerByLeftId.set(pair.leftId, pair.rightId)
    usedRightIds.add(pair.rightId)
  }

  const pairResults = normalizedStoredPairs.map((pair) => {
    const selectedRightId = answerByLeftId.get(pair.id) ?? null
    return {
      leftId: pair.id,
      rightId: selectedRightId,
      expectedRightId: pair.id,
      isCorrect: selectedRightId === pair.id,
    }
  })

  const isCorrect =
    !hasDuplicateLeft &&
    !hasDuplicateRight &&
    !hasUnknownIds &&
    normalizedAnswerPairs.length === normalizedStoredPairs.length &&
    pairResults.every((pair) => pair.isCorrect)

  return {
    isCorrect,
    pairResults,
  }
}

module.exports = {
  buildMatchingOptions,
  evaluateWordMatch,
  normalizeMatchPairs,
}
