'use strict';

const CONTENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function isValidContentId(value) {
  return typeof value === 'string' && CONTENT_ID_PATTERN.test(value);
}

module.exports = { CONTENT_ID_PATTERN, isValidContentId };
